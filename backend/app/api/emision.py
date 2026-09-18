from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, Dict, Any, List
import json
import logging
import secrets as secrets_module
import hashlib
import shutil
import os
from datetime import datetime, timedelta
import zipfile
import tempfile

from app.db.session import get_global_db
from app.core.dependencies import get_current_active_user, check_project_access
from app.core.config import settings
# ============================================================
# IMPORTACIONES CORRECTAS DE REDIS
# ============================================================
from app.core.redis_client import (
    redis_client,           # ← La instancia del cliente
    push_job,               # ← Función para publicar jobs
    get_queue_length,       # ← Función para obtener longitud de cola
    get_all_queue_jobs,     # ← Función para obtener todos los jobs
    set_job_status,         # ← Función para actualizar estado
    get_job_status,         # ← Función para obtener estado
    set_checkpoint,         # ← Función para guardar checkpoint
    get_checkpoint,         # ← Función para obtener checkpoint
    is_worker_registered,   # ← Función para verificar worker registrado
    get_worker_job,         # ← Función para obtener worker de un job
    set_worker_job,         # ← Función para asignar worker a un job
    remove_worker_job,      # ← Función para remover worker de un job
    clear_job_cache         # ← Función para limpiar cache
)

from app.models.global_models import Usuario, Proyecto, Plantilla, EmisionJob, EmisionDetalle
from app.db.router import get_project_db
from app.services.log_service import registrar_log
from app.services.monitoreo_service import MonitoreoService
from pydantic import BaseModel, Field
from fastapi.responses import FileResponse
from sqlalchemy import func

logger = logging.getLogger(__name__)

router = APIRouter()

# ============================================================
# SCHEMAS (Modelos de datos para la API)
# ============================================================

class PrepararEmisionRequest(BaseModel):
    """Request para preparar una emisión"""
    id_plantilla: int = Field(..., description="ID de la plantilla a usar")
    nombre_job: Optional[str] = Field(None, description="Nombre descriptivo del job")
    modo: str = Field("lotes", description="lotes | paquetes")
    cuentas_por_lote: int = Field(50, ge=1, le=500, description="Cuentas por lote/paquete")
    orden_impresion_inicial: int = Field(1, ge=1, description="Número inicial de orden")
    filtros: Dict[str, Any] = Field(default_factory=dict, description="Filtros para seleccionar cuentas")

class PrepararEmisionResponse(BaseModel):
    """Response al preparar una emisión"""
    success: bool
    job_id: int
    total_registros: int
    message: str

class JobEstadoResponse(BaseModel):
    """Estado de un job"""
    id: int
    status: str
    total_registros: int
    procesados: int
    progreso: float  # 0-100
    ultimo_pk_procesado: Optional[str]
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    ruta_zip: Optional[str]
    error_msg: Optional[str]
    estimado_restante: Optional[str]  # "~30 minutos"

class CancelarEmisionResponse(BaseModel):
    """Response al cancelar una emisión"""
    success: bool
    message: str

class CheckpointData(BaseModel):
    """Estructura de un checkpoint"""
    job_id: int
    procesados: int
    total: int
    ultimo_pk: Optional[str]
    ultimo_orden: Optional[int]
    hash_datos: Optional[str]
    pdfs_generados: int
    fallidos: int
    timestamp: datetime
    errores_recientes: List[str] = []

class RecuperacionResponse(BaseModel):
    """Respuesta de recuperación"""
    success: bool
    puede_recuperar: bool
    checkpoint: Optional[CheckpointData]
    mensaje: str
    archivos_existentes: int
    archivos_esperados: int

class ArchivoInfo(BaseModel):
    """Información de un archivo generado"""
    nombre: str
    ruta: str
    tamaño_bytes: int
    tamaño_kb: float
    fecha_creacion: datetime
    orden: int
    pk: str

class DirectorioInfo(BaseModel):
    """Información de un directorio de job"""
    ruta: str
    total_archivos: int
    tamaño_total_kb: float
    archivos: List[ArchivoInfo] = []
    fecha_creacion: datetime
    ultima_modificacion: datetime

class LimpiezaResultado(BaseModel):
    """Resultado de una operación de limpieza"""
    archivos_eliminados: int
    espacio_liberado_kb: float
    directorios_eliminados: int
    mensaje: str

class ContinuarEmisionResponse(BaseModel):
    success: bool
    total: int
    message: str
    insertados: int = 0
    errores: int = 0

class PrepararTablaTemporalRequest(BaseModel):
    ids: List[Any] = Field(default_factory=list)
    orden_map: Dict[str, int] = Field(default_factory=dict)

class ResolverDuplicadoRequest(BaseModel):
    error_id: int
    accion: str   # 'reemplazar' | 'agregar_sufijo' | 'descartar'
    sufijo: Optional[int] = None

# ============================================================
# FUNCIONES AUXILIARES
# ============================================================

def _calcular_hash_datos(registros: List[Dict]) -> str:
    """
    Calcula un hash de los datos para detectar cambios.
    Permite saber si los datos originales cambiaron desde el checkpoint.
    """
    # Ordenar por PK para consistencia
    sorted_data = sorted(registros, key=lambda x: str(x.get('pk', '')))

    # Crear string con los datos relevantes
    data_str = ""
    for reg in sorted_data:
        # Solo incluir campos clave que afectan el PDF
        fields = ['pk', 'viabilidad', 'programa']
        for field in fields:
            if field in reg:
                data_str += f"{field}:{reg[field]}|"

    return hashlib.sha256(data_str.encode()).hexdigest()

def _verificar_integridad_checkpoint(
    db_proyecto,
    checkpoint: Dict,
    proyecto_slug: str,
    pk: str
) -> bool:
    """
    Verifica que los datos en el checkpoint coincidan con los actuales.
    Retorna True si son consistentes, False si cambiaron.
    """
    from sqlalchemy import text

    if not checkpoint.get('hash_datos'):
        return True  # Si no hay hash, asumir que es válido

    # Obtener los datos actuales para el rango del checkpoint
    ultimo_pk = checkpoint.get('ultimo_pk')
    if not ultimo_pk:
        return True

    query = text(f"""
        SELECT * FROM tabla_analisis
        WHERE `{pk}` <= :ultimo_pk
        ORDER BY `{pk}` ASC
    """)

    result = db_proyecto.execute(query, {"ultimo_pk": ultimo_pk})
    registros = [dict(r._mapping) for r in result]

    # Recalcular hash y comparar
    hash_actual = _calcular_hash_datos(registros)

    return hash_actual == checkpoint.get('hash_datos')

def _get_pk_name(proyecto_slug: str) -> str:
    """Obtiene el nombre de la PK según el proyecto"""
    pks = {
        "apa_tlajomulco": "clave_APA",
        "predial_tlajomulco": "cuenta",
        "licencias_gdl": "licencia",
        "predial_gdl": "cuenta_n",
        "estado": "credito",
        "pensiones": "prestamo",
    }
    return pks.get(proyecto_slug, "id")

def _calcular_tiempo_estimado(procesados: int, total: int, started_at: datetime) -> Optional[str]:
    """Calcula el tiempo estimado restante basado en el progreso actual"""
    if procesados == 0 or total == 0:
        return None

    tiempo_transcurrido = (datetime.now() - started_at).total_seconds()
    velocidad = procesados / tiempo_transcurrido if tiempo_transcurrido > 0 else 0

    if velocidad == 0:
        return None

    tiempo_restante = (total - procesados) / velocidad

    if tiempo_restante < 60:
        return f"~{int(tiempo_restante)} segundos"
    elif tiempo_restante < 3600:
        return f"~{int(tiempo_restante / 60)} minutos"
    else:
        horas = int(tiempo_restante / 3600)
        minutos = int((tiempo_restante % 3600) / 60)
        return f"~{horas}h {minutos}m"

def _get_job_directory(
    proyecto_slug: str,
    job_id: int,
    base_path: Optional[Path] = None
) -> Path:
    """
    Obtiene el directorio para un job.
    Estructura: base_path/proyecto/año/mes/job_{id}/
    """
    if base_path is None:
        from app.core.config import settings
        base_path = Path(settings.EMISIONES_PATH)

    ahora = datetime.now()
    year = ahora.strftime("%Y")
    month = ahora.strftime("%m")

    job_dir = base_path / proyecto_slug / year / month / f"job_{job_id}"
    return job_dir

def _crear_directorio_job(job_dir: Path) -> bool:
    """Crea el directorio del job y sus padres."""
    try:
        job_dir.mkdir(parents=True, exist_ok=True)
        return True
    except Exception as e:
        logger.error(f"Error creando directorio {job_dir}: {e}")
        return False

def _generar_nombre_pdf(orden: int, pk_value: str) -> str:
    """
    Genera el nombre del PDF con formato: 00001 - PK_12345.pdf
    Coincide con el formato del código VB original.
    """
    orden_str = f"{orden:05d}"
    # Limpiar PK para nombre de archivo válido
    pk_clean = str(pk_value).replace('/', '_').replace('\\', '_').replace(':', '_')
    return f"{orden_str} - {pk_clean}.pdf"

def _obtener_manifiesto_job(job_dir: Path) -> Dict:
    """Genera un manifiesto del job con todos los archivos."""
    if not job_dir.exists():
        return {
            "existe": False,
            "total_archivos": 0,
            "tamaño_total_kb": 0,
            "archivos": []
        }

    pdf_files = list(job_dir.glob("*.pdf"))
    manifest = {
        "existe": True,
        "total_archivos": len(pdf_files),
        "tamaño_total_kb": 0,
        "archivos": [],
        "fecha_creacion": None,
        "ultima_modificacion": None
    }

    # Obtener estadísticas
    total_size = 0
    for pdf in sorted(pdf_files):
        stat = pdf.stat()
        total_size += stat.st_size

        # Extraer orden y PK del nombre
        name = pdf.stem
        parts = name.split(" - ", 1)
        orden = int(parts[0]) if parts[0].isdigit() else 0
        pk = parts[1] if len(parts) > 1 else name

        manifest["archivos"].append({
            "nombre": pdf.name,
            "orden": orden,
            "pk": pk,
            "tamaño_bytes": stat.st_size,
            "tamaño_kb": round(stat.st_size / 1024, 2),
            "fecha_creacion": datetime.fromtimestamp(stat.st_ctime).isoformat()
        })

    manifest["tamaño_total_kb"] = round(total_size / 1024, 2)

    # Obtener fechas del directorio
    dir_stat = job_dir.stat()
    manifest["fecha_creacion"] = datetime.fromtimestamp(dir_stat.st_ctime).isoformat()
    manifest["ultima_modificacion"] = datetime.fromtimestamp(dir_stat.st_mtime).isoformat()

    return manifest

def _calcular_espacio_disponible(ruta: Path) -> float:
    """Calcula el espacio disponible en disco en KB."""
    try:
        stat = shutil.disk_usage(ruta)
        return stat.free / 1024  # KB
    except Exception:
        return 0

def _verificar_espacio_suficiente(
    ruta: Path,
    archivos_estimados: int,
    tamaño_promedio_kb: float = 100  # 100 KB por PDF
) -> bool:
    """
    Verifica si hay suficiente espacio en disco.
    Retorna True si hay espacio, False si no.
    """
    espacio_disponible_kb = _calcular_espacio_disponible(ruta)
    espacio_necesario_kb = archivos_estimados * tamaño_promedio_kb

    # Dejar 10% de margen
    espacio_necesario_kb *= 1.1

    return espacio_disponible_kb > espacio_necesario_kb

def _limpiar_archivos_temporales(temp_path: Path, dias_antiguedad: int = 7) -> int:
    """
    Limpia archivos temporales más antiguos que X días.
    Retorna el número de archivos eliminados.
    """
    if not temp_path.exists():
        return 0

    eliminados = 0
    fecha_limite = datetime.now() - timedelta(days=dias_antiguedad)

    for item in temp_path.glob("*"):
        try:
            if item.is_file():
                fecha_mod = datetime.fromtimestamp(item.stat().st_mtime)
                if fecha_mod < fecha_limite:
                    item.unlink()
                    eliminados += 1
            elif item.is_dir():
                # Limpiar recursivamente
                for sub_item in item.glob("*"):
                    if sub_item.is_file():
                        fecha_mod = datetime.fromtimestamp(sub_item.stat().st_mtime)
                        if fecha_mod < fecha_limite:
                            sub_item.unlink()
                            eliminados += 1
                # Si el directorio quedó vacío, eliminarlo
                try:
                    item.rmdir()
                except:
                    pass
        except Exception as e:
            logger.warning(f"Error limpiando {item}: {e}")

    return eliminados

def _worker_esta_registrado(worker_id: str) -> bool:
    """
    Verifica que el worker_id tenga un registro vigente en Redis.
    """
    # Usar la función de conveniencia
    return is_worker_registered(worker_id)

def _requerir_worker_registrado(worker_id: str) -> None:
    """
    Requiere que el worker esté registrado. Lanza excepción si no.
    """
    if not worker_id or not _worker_esta_registrado(worker_id):
        raise HTTPException(
            status_code=403,
            detail=(
                f"El worker '{worker_id}' no está registrado o su registro expiró. "
                "Debe llamar primero a POST /workers/register con un worker_secret válido."
            ),
        )

def _get_columnas_tabla(db_proyecto, tabla: str) -> list:
    from sqlalchemy import text
    rows = db_proyecto.execute(text(f"SHOW COLUMNS FROM `{tabla}`")).fetchall()
    return [r[0] for r in rows]

def _poblar_tabla_temporal(
    db_proyecto,
    clave_origen: str,
    ids_seleccionados: list,
    orden_map: dict = None,
):
    """
    Puebla tabla_temporal desde tabla_dinamica JOIN tabla_analisis.

    Reglas:
    - codebar es PK de tabla_temporal y se genera aquí.
    - La unión con tabla_dinamica/analisis es vía clave_origen.
    - Solo se copian columnas comunes.
    - Colisiones de codebar → tabla_temporal_errores (no abortan).
    """
    from sqlalchemy import text
    from app.services.codebar_service import CodebarService
    from datetime import datetime
    import json

    if not ids_seleccionados:
        db_proyecto.execute(text("DELETE FROM tabla_temporal"))
        db_proyecto.execute(text("DELETE FROM tabla_temporal_errores"))
        db_proyecto.commit()
        return {"insertados": 0, "errores": 0, "total_errores": 0}

    # 1. Columnas comunes (excluir control)
    cols_temp = _get_columnas_tabla(db_proyecto, "tabla_temporal")
    cols_din  = _get_columnas_tabla(db_proyecto, "tabla_dinamica")

    cols_excluir = {"codebar", "orden_impresion", "seleccionada", "id_temporal"}
    cols_comunes = [
        c for c in cols_temp
        if c in cols_din and c not in cols_excluir
    ]

    if clave_origen not in cols_comunes:
        raise HTTPException(
            status_code=500,
            detail=f"La clave '{clave_origen}' no existe en tabla_temporal."
        )

    # 2. Limpiar
    db_proyecto.execute(text("DELETE FROM tabla_temporal"))
    db_proyecto.execute(text("DELETE FROM tabla_temporal_errores"))

    # 3. Traer filas desde dinamica
    placeholders = ", ".join(f":id{i}" for i in range(len(ids_seleccionados)))
    params = {f"id{i}": v for i, v in enumerate(ids_seleccionados)}

    cols_str = ", ".join(f"`{c}`" for c in cols_comunes)
    rows = db_proyecto.execute(text(f"""
        SELECT {cols_str}
        FROM tabla_dinamica
        WHERE `{clave_origen}` IN ({placeholders})
        ORDER BY `{clave_origen}` ASC
    """), params).fetchall()

    if not rows:
        db_proyecto.commit()
        return {"insertados": 0, "errores": 0, "total_errores": 0}

    # 4. Insertar fila por fila
    fecha_emision = datetime.now()
    orden_secuencial = 0
    insertados = 0
    errores = 0

    for row in rows:
        row_dict = dict(row._mapping)
        pk_val = row_dict.get(clave_origen)
        if pk_val is None:
            continue

        # Determinar orden
        if orden_map and str(pk_val) in orden_map:
            orden = int(orden_map[str(pk_val)])
        else:
            orden_secuencial += 1
            orden = orden_secuencial

        # Generar codebar
        try:
            codebar = CodebarService.generar_codebar_completo(
                pk_value=str(pk_val),
                fecha_emision=fecha_emision,
            )
        except Exception as e:
            errores += 1
            db_proyecto.execute(text("""
                INSERT INTO tabla_temporal_errores
                    (clave_origen, codebar_intento, motivo, payload_json)
                VALUES (:c, :cb, :m, :p)
            """), {
                "c": str(pk_val),
                "cb": "",
                "m": f"Error generando codebar: {str(e)[:200]}",
                "p": json.dumps(row_dict, default=str)[:60000],
            })
            continue

        insert_cols = list(cols_comunes) + ["codebar", "orden_impresion"]
        insert_vals = [f":{c}" for c in cols_comunes] + [":codebar", ":orden_impresion"]

        insert_params = {**row_dict}
        insert_params["codebar"] = codebar
        insert_params["orden_impresion"] = orden

        try:
            db_proyecto.execute(text(f"""
                INSERT INTO tabla_temporal
                    ({", ".join(f"`{c}`" for c in insert_cols)})
                VALUES ({", ".join(insert_vals)})
            """), insert_params)
            insertados += 1
        except Exception as e:
            errores += 1
            motivo = str(e)[:200]
            db_proyecto.execute(text("""
                INSERT INTO tabla_temporal_errores
                    (clave_origen, codebar_intento, motivo, payload_json)
                VALUES (:c, :cb, :m, :p)
            """), {
                "c": str(pk_val),
                "cb": codebar,
                "m": motivo,
                "p": json.dumps(row_dict, default=str)[:60000],
            })

    db_proyecto.commit()

    total_err = db_proyecto.execute(text(
        "SELECT COUNT(*) AS c FROM tabla_temporal_errores"
    )).first().c

    return {
        "insertados": insertados,
        "errores": errores,
        "total_errores": total_err,
    }

CAMPO_MONTO_POR_PROYECTO = {
    "apa_tlajomulco":     "total_adeudo",
    "predial_tlajomulco": "total_adeudo",
    "predial_gdl":        "total_adeudo",
    "licencias_gdl":      "total",
    "estado":             "importe_historico_determinado",
    "pensiones":          "liquidacion",
}

def _ensure_tabla_errores_tiene_estatus(db_proyecto):
    """
    Asegura que tabla_temporal_errores tenga las columnas estatus y codebar_original.
    Idempotente: no falla si ya existen.
    """
    from sqlalchemy import text
    columnas = _get_columnas_tabla(db_proyecto, "tabla_temporal_errores")

    if "estatus" not in columnas:
        db_proyecto.execute(text(
            "ALTER TABLE tabla_temporal_errores "
            "ADD COLUMN estatus VARCHAR(20) DEFAULT 'pendiente'"
        ))
    if "codebar_original" not in columnas:
        db_proyecto.execute(text(
            "ALTER TABLE tabla_temporal_errores "
            "ADD COLUMN codebar_original VARCHAR(25) DEFAULT NULL"
        ))
    db_proyecto.commit()

def _traspasar_temporal_a_historica(
    db_proyecto,
    proyecto_slug: str,
    clave_origen: str,
    id_job: int,
    id_usuario: int,
    worker_id: str,
):
    """
    Traspasa tabla_temporal → tabla_historica con validaciones.

    Retorna dict:
      {
        "insertados": int,
        "duplicados_exactos": int,
        "conflictos": int,
        "limpio": bool   # True si todo OK y se puede vaciar temporal
      }
    """
    from sqlalchemy import text
    import json

    _ensure_tabla_errores_tiene_estatus(db_proyecto)

    # Limpiar errores previos de este job
    db_proyecto.execute(text(
        "DELETE FROM tabla_temporal_errores WHERE motivo IS NULL OR motivo NOT LIKE 'job_%'"
    ))
    db_proyecto.commit()

    campo_monto = CAMPO_MONTO_POR_PROYECTO.get(proyecto_slug)

    # Columnas comunes entre temporal e historica
    cols_temp = _get_columnas_tabla(db_proyecto, "tabla_temporal")
    cols_hist = _get_columnas_tabla(db_proyecto, "tabla_historica")

    cols_extra_hist = {
        "fecha_registro", "id_job", "id_usuario", "worker_id",
        "ruta_pdf", "estatus", "observaciones_preparacion"
    }
    cols_comunes = [
        c for c in cols_temp
        if c in cols_hist and c not in cols_extra_hist
    ]

    # Traer todas las filas de temporal
    filas = db_proyecto.execute(text(
        "SELECT * FROM tabla_temporal ORDER BY orden_impresion ASC"
    )).fetchall()

    insertados = 0
    duplicados_exactos = 0
    conflictos = 0

    for fila in filas:
        row_dict = dict(fila._mapping)
        codebar = row_dict.get("codebar")
        clave_val = row_dict.get(clave_origen)

        if not codebar:
            # Sin codebar no se puede traspasar
            conflictos += 1
            _registrar_error_traspaso(
                db_proyecto, clave_val, codebar or "",
                f"job_{id_job}: fila sin codebar",
                "revision", row_dict
            )
            continue

        # Verificar si ya existe en histórico
        existente = db_proyecto.execute(text(
            "SELECT * FROM tabla_historica WHERE codebar = :cb LIMIT 1"
        ), {"cb": codebar}).first()

        if not existente:
            # Caso 1: nuevo → insertar
            _insertar_en_historica(
                db_proyecto, row_dict, cols_comunes,
                id_job, id_usuario, worker_id
            )
            insertados += 1
            continue

        # Existe: comparar
        exist_dict = dict(existente._mapping)

        fecha_temp  = row_dict.get("fecha_emision")
        fecha_hist  = exist_dict.get("fecha_emision")
        orden_temp  = row_dict.get("orden_impresion")
        orden_hist  = exist_dict.get("orden_impresion")
        monto_temp  = row_dict.get(campo_monto) if campo_monto else None
        monto_hist  = exist_dict.get(campo_monto) if campo_monto else None

        # Normalizar para comparar (Decimal vs float, None vs None)
        def _norm_fecha(v):
            if v is None: return None
            return str(v)[:19] if hasattr(v, 'isoformat') else str(v)

        def _norm_monto(v):
            if v is None: return None
            try:
                return round(float(v), 2)
            except (TypeError, ValueError):
                return None

        mismo = (
            _norm_fecha(fecha_temp) == _norm_fecha(fecha_hist) and
            orden_temp == orden_hist and
            _norm_monto(monto_temp) == _norm_monto(monto_hist)
        )

        if mismo:
            # Caso 2: duplicado exacto
            duplicados_exactos += 1
            _registrar_error_traspaso(
                db_proyecto, clave_val, codebar,
                f"job_{id_job}: duplicado exacto (mismo codebar, fecha, orden y monto)",
                "duplicado_exacto", row_dict
            )
        else:
            # Caso 3: conflicto
            conflictos += 1
            _registrar_error_traspaso(
                db_proyecto, clave_val, codebar,
                f"job_{id_job}: conflicto - codebar igual pero datos distintos",
                "revision", row_dict
            )

    db_proyecto.commit()

    limpio = (duplicados_exactos == 0 and conflictos == 0)

    return {
        "insertados": insertados,
        "duplicados_exactos": duplicados_exactos,
        "conflictos": conflictos,
        "limpio": limpio,
    }

def _insertar_en_historica(
    db_proyecto,
    row_dict: dict,
    cols_comunes: list,
    id_job: int,
    id_usuario: int,
    worker_id: str,
):
    """Inserta una fila de temporal en histórica con las columnas extra."""
    from sqlalchemy import text
    from datetime import datetime

    cols_insert = list(cols_comunes) + [
        "id_job", "id_usuario", "worker_id", "estatus", "fecha_registro"
    ]
    vals_insert = [f":{c}" for c in cols_comunes] + [
        ":id_job", ":id_usuario", ":worker_id", ":estatus", ":fecha_registro"
    ]

    params = {c: row_dict.get(c) for c in cols_comunes}
    params.update({
        "id_job": id_job,
        "id_usuario": id_usuario,
        "worker_id": worker_id,
        "estatus": "emitida",
        "fecha_registro": datetime.now(),
    })

    db_proyecto.execute(text(f"""
        INSERT INTO tabla_historica
            ({", ".join(f"`{c}`" for c in cols_insert)})
        VALUES ({", ".join(vals_insert)})
    """), params)

def _registrar_error_traspaso(
    db_proyecto,
    clave_val,
    codebar: str,
    motivo: str,
    estatus: str,
    row_dict: dict,
):
    """Registra una fila problemática en tabla_temporal_errores."""
    from sqlalchemy import text
    import json

    db_proyecto.execute(text("""
        INSERT INTO tabla_temporal_errores
            (clave_origen, codebar_intento, codebar_original, motivo, estatus, payload_json)
        VALUES (:c, :cb, :cbo, :m, :e, :p)
    """), {
        "c": str(clave_val),
        "cb": codebar,
        "cbo": codebar,
        "m": motivo[:255],
        "e": estatus,
        "p": json.dumps(row_dict, default=str)[:60000],
    })

def _generar_codebar_con_sufijo(codebar: str, sufijo: int = 1) -> str:
    """
    Agrega un sufijo antes del último asterisco.
    *ABC*       -> *ABCDX*
    *ABC*       -> *ABCDX2*
    """
    if not codebar:
        return codebar

    limpio = codebar.strip()
    if limpio.startswith("*") and limpio.endswith("*"):
        cuerpo = limpio[1:-1]
        tag = "DX" if sufijo == 1 else f"DX{sufijo}"
        return f"*{cuerpo}{tag}*"

    tag = "DX" if sufijo == 1 else f"DX{sufijo}"
    return f"{limpio}{tag}"

# ============================================================
# JOBS: /jobs/...
# ============================================================

@router.get("/jobs/{job_id}/estado", response_model=JobEstadoResponse)
def get_job_estado(
    job_id: int,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """Obtiene el estado de un job de emisión."""
    job = db_global.query(EmisionJob).filter(EmisionJob.id == job_id).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    if job.id_usuario != current_user.id and current_user.rol.nombre != "superadmin":
        raise HTTPException(status_code=403, detail="No tienes acceso a este job")

    progreso = 0
    if job.total_registros > 0:
        progreso = round((job.procesados / job.total_registros) * 100, 1)

    estimado = None
    if job.status in ('processing', 'pending') and job.started_at:
        estimado = _calcular_tiempo_estimado(
            job.procesados,
            job.total_registros,
            job.started_at
        )

    return JobEstadoResponse(
        id=job.id,
        status=job.status,
        total_registros=job.total_registros,
        procesados=job.procesados,
        progreso=progreso,
        ultimo_pk_procesado=job.ultimo_pk_procesado,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        ruta_zip=job.ruta_zip,
        error_msg=job.error_msg,
        estimado_restante=estimado
    )

@router.post("/jobs/{job_id}/cancelar", response_model=CancelarEmisionResponse)
def cancelar_job(
    job_id: int,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """Cancela un job de emisión en progreso."""
    job = db_global.query(EmisionJob).filter(EmisionJob.id == job_id).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    if job.id_usuario != current_user.id and current_user.rol.nombre != "superadmin":
        raise HTTPException(status_code=403, detail="No tienes acceso a este job")

    if job.status not in ('pending', 'processing'):
        raise HTTPException(
            status_code=400,
            detail=f"El job no se puede cancelar porque está en estado '{job.status}'"
        )

    job.status = 'cancelled'
    job.completed_at = datetime.now()
    db_global.commit()

    registrar_log(
        db_global,
        current_user.id,
        "cancelar_emision",
        f"Emisión cancelada: job_id={job_id}, usuario={current_user.nombre}",
        job.id_proyecto
    )

    return CancelarEmisionResponse(
        success=True,
        message=f"Job {job_id} cancelado correctamente"
    )

@router.get("/jobs")
def listar_jobs_usuario(
    status: Optional[str] = Query(None, description="Filtrar por estado"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """Lista los jobs de emisión del usuario actual."""
    query = db_global.query(EmisionJob).filter(
        EmisionJob.id_usuario == current_user.id
    )

    if status:
        query = query.filter(EmisionJob.status == status)

    total = query.count()
    jobs = query.order_by(EmisionJob.created_at.desc()).offset(
        (page - 1) * limit
    ).limit(limit).all()

    return {
        "jobs": [
            {
                "id": j.id,
                "nombre_job": j.nombre_job,
                "status": j.status,
                "total_registros": j.total_registros,
                "procesados": j.procesados,
                "progreso": round((j.procesados / j.total_registros) * 100, 1) if j.total_registros > 0 else 0,
                "created_at": j.created_at,
                "completed_at": j.completed_at,
                "ruta_zip": j.ruta_zip,
                "error_msg": j.error_msg
            }
            for j in jobs
        ],
        "total": total,
        "page": page,
        "limit": limit
    }

# ============================================================
# WORKERS: /workers/...
# ============================================================

@router.get("/workers/pending")
def get_pending_jobs(
    worker_id: str = Query(..., description="ID del worker"),
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Obtiene jobs pendientes para el worker.
    """
    # Verificar que el worker está registrado
    _requerir_worker_registrado(worker_id)

    # ============================================================
    # OBTENER TODOS LOS JOBS DE LA COLA (SIN REMOVERLOS)
    # ============================================================
    job_ids = get_all_queue_jobs()  # ← Usar función de conveniencia

    jobs = []
    for job_id_str in job_ids:
        try:
            job_id = int(job_id_str)

            # Obtener job de la BD
            job = db_global.query(EmisionJob).filter(
                EmisionJob.id == job_id,
                EmisionJob.status == 'pending'
            ).first()

            if not job:
                # Si el job ya no existe o no está pending, limpiar de Redis
                redis_client.connection.lrem("emision_jobs", 0, job_id_str)
                continue

            # Obtener datos del proyecto y plantilla
            proyecto = db_global.query(Proyecto).filter(Proyecto.id == job.id_proyecto).first()
            plantilla = db_global.query(Plantilla).filter(Plantilla.id == job.id_plantilla).first()

            jobs.append({
                "id": job.id,
                "nombre_job": job.nombre_job,
                "proyecto_id": job.id_proyecto,
                "proyecto_slug": proyecto.slug if proyecto else None,
                "proyecto_nombre": proyecto.nombre if proyecto else None,
                "plantilla_id": job.id_plantilla,
                "plantilla_nombre": plantilla.nombre if plantilla else None,
                "plantilla_archivo": plantilla.nombre_archivo if plantilla else None,
                "modo": job.modo,
                "cuentas_por_lote": job.cuentas_por_lote,
                "orden_impresion_inicial": job.orden_impresion_inicial,
                "total_registros": job.total_registros,
                "filtros": job.filtros,
                "created_at": job.created_at.isoformat() if job.created_at else None,
            })

        except ValueError:
            continue
        except Exception as e:
            logger.error(f"Error procesando job {job_id_str}: {e}")
            continue

    return {
        "jobs": jobs,
        "total": len(jobs),
        "worker_id": worker_id,
        "timestamp": datetime.now().isoformat()
    }

@router.post("/workers/claim")
def claim_job(
    request: dict,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Toma un job para procesarlo.
    """
    worker_id = request.get("worker_id")
    job_id = request.get("job_id")

    if not worker_id or not job_id:
        raise HTTPException(status_code=400, detail="Faltan worker_id o job_id")

    # Verificar que el worker está registrado
    _requerir_worker_registrado(worker_id)

    # Obtener job
    job = db_global.query(EmisionJob).filter(
        EmisionJob.id == job_id,
        EmisionJob.status == 'pending'
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado o ya fue tomado")

    # Verificar que el job está en Redis (para evitar duplicados)
    redis_conn = redis_client.connection
    in_queue = redis_conn.lrem("emision_jobs", 0, str(job_id))

    if in_queue == 0:
        # El job no está en la cola, podría estar siendo procesado
        raise HTTPException(status_code=409, detail="Job ya fue tomado por otro worker")

    # Marcar como processing
    job.status = 'processing'
    job.started_at = datetime.now()
    job.ultimo_pk_procesado = None
    db_global.commit()

    # Guardar en Redis que está siendo procesado (usar función de conveniencia)
    set_worker_job(job_id, worker_id)

    # Obtener datos del proyecto y plantilla
    proyecto = db_global.query(Proyecto).filter(Proyecto.id == job.id_proyecto).first()
    plantilla = db_global.query(Plantilla).filter(Plantilla.id == job.id_plantilla).first()

    # Registrar log
    registrar_log(
        db_global,
        current_user.id,
        "claim_job",
        f"Job {job_id} tomado por worker {worker_id}",
        job.id_proyecto
    )

    return {
        "success": True,
        "message": f"Job {job_id} tomado exitosamente",
        "job": {
            "id": job.id,
            "nombre_job": job.nombre_job,
            "proyecto_id": job.id_proyecto,
            "proyecto_slug": proyecto.slug if proyecto else None,
            "proyecto_nombre": proyecto.nombre if proyecto else None,
            "plantilla_id": job.id_plantilla,
            "plantilla_nombre": plantilla.nombre if plantilla else None,
            "plantilla_archivo": plantilla.nombre_archivo if plantilla else None,
            "modo": job.modo,
            "cuentas_por_lote": job.cuentas_por_lote,
            "orden_impresion_inicial": job.orden_impresion_inicial,
            "total_registros": job.total_registros,
            "filtros": job.filtros,
            "created_at": job.created_at.isoformat() if job.created_at else None,
        }
    }

@router.post("/workers/{worker_id}/progress/{job_id}")
def update_progress(
    worker_id: str,
    job_id: int,
    request: dict,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Actualiza el progreso de un job.
    """
    job = db_global.query(EmisionJob).filter(EmisionJob.id == job_id).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    # Verificar que el worker tiene el job
    current_worker = get_worker_job(job_id)  # ← Usar función de conveniencia

    if current_worker and current_worker != worker_id:
        raise HTTPException(
            status_code=409,
            detail=f"Job está siendo procesado por otro worker: {current_worker}"
        )

    # Actualizar campos
    if "procesados" in request:
        job.procesados = request["procesados"]

    if "ultimo_pk" in request:
        job.ultimo_pk_procesado = request["ultimo_pk"]

    if "status" in request:
        new_status = request["status"]

        valid_transitions = {
            'processing': ['processing', 'completed', 'failed', 'cancelled'],
            'pending': ['processing', 'cancelled'],
        }

        if job.status in valid_transitions and new_status in valid_transitions.get(job.status, []):
            job.status = new_status
        elif job.status == 'processing' and new_status in ['completed', 'failed', 'cancelled']:
            job.status = new_status
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Transición inválida: {job.status} -> {new_status}"
            )

        if new_status in ['completed', 'failed', 'cancelled']:
            job.completed_at = datetime.now()
            # Limpiar de Redis
            remove_worker_job(job_id)  # ← Usar función de conveniencia
            if request.get("checkpoint_data"):
                job.checkpoint_data = request["checkpoint_data"]

    if "error_msg" in request:
        job.error_msg = request["error_msg"]

    db_global.commit()

    # Guardar progreso en Redis
    set_job_status(  # ← Usar función de conveniencia
        job_id,
        job.status,
        {
            "procesados": job.procesados,
            "total": job.total_registros,
            "ultimo_pk": job.ultimo_pk_procesado
        }
    )

    return {
        "success": True,
        "message": f"Progreso actualizado: {job.procesados}/{job.total_registros}",
        "job": {
            "id": job.id,
            "status": job.status,
            "procesados": job.procesados,
            "total_registros": job.total_registros,
            "ultimo_pk_procesado": job.ultimo_pk_procesado
        }
    }

@router.post("/workers/{worker_id}/upload/{job_id}")
def upload_result(
    worker_id: str,
    job_id: int,
    request: dict,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Recibe la confirmación de que el worker completó el job.

    Además de marcar el job como completed, ejecuta el traspaso
    de tabla_temporal → tabla_historica. Solo si el traspaso queda
    limpio, vacía tabla_temporal.
    """
    from app.core.redis_client import redis_client
    from app.core.config import settings
    from app.api.analisis import _info

    job = db_global.query(EmisionJob).filter(EmisionJob.id == job_id).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    # Verificar worker
    redis_conn = redis_client.connection
    current_worker = redis_conn.get(f"job:{job_id}:worker")

    if current_worker and current_worker != worker_id:
        raise HTTPException(
            status_code=409,
            detail=f"Job está siendo procesado por otro worker: {current_worker}"
        )

    # Datos del manifiesto
    manifest = request.get("manifest", {})
    ruta_local = manifest.get("ruta_local")
    total_generados = manifest.get("generados", 0)
    total_fallidos = manifest.get("fallidos", 0)

    if not ruta_local:
        raise HTTPException(status_code=400, detail="Falta ruta_local en el manifiesto")

    # Validar ruta dentro de EMISIONES_PATH
    base_emisiones = Path(settings.EMISIONES_PATH).resolve()
    ruta_resuelta = Path(ruta_local).resolve()
    if base_emisiones not in ruta_resuelta.parents and ruta_resuelta != base_emisiones:
        raise HTTPException(
            status_code=400,
            detail="ruta_local debe estar dentro del directorio de emisiones configurado",
        )

    # ============================================================
    # TRASPASO TEMPORAL → HISTÓRICA
    # ============================================================
    proyecto = db_global.query(Proyecto).filter(Proyecto.id == job.id_proyecto).first()
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    info = _info(proyecto.slug)
    clave = info["pk"]

    resultado_traspaso = {
        "insertados": 0,
        "duplicados_exactos": 0,
        "conflictos": 0,
        "limpio": False,
    }

    db_gen = get_project_db(proyecto.slug)
    db_proyecto = next(db_gen)
    try:
        resultado_traspaso = _traspasar_temporal_a_historica(
            db_proyecto,
            proyecto.slug,
            clave,
            id_job=job.id,
            id_usuario=job.id_usuario,
            worker_id=worker_id,
        )

        # Solo limpiar si el traspaso quedó limpio
        if resultado_traspaso["limpio"]:
            db_proyecto.execute(text("DELETE FROM tabla_temporal"))
            db_proyecto.execute(text("DELETE FROM tabla_temporal_errores"))
            db_proyecto.commit()
    finally:
        db_gen.close()

    # ============================================================
    # ACTUALIZAR JOB
    # ============================================================
    job.status = 'completed'
    job.completed_at = datetime.now()
    job.ruta_zip = str(ruta_resuelta)
    job.procesados = total_generados
    job.checkpoint_data = {
        "manifest": manifest,
        "worker_id": worker_id,
        "completed_at": datetime.now().isoformat(),
        "traspaso": resultado_traspaso,
    }
    db_global.commit()

    # Limpiar Redis
    redis_conn.delete(f"job:{job_id}:worker")
    redis_conn.delete(f"job:{job_id}:progress")

    registrar_log(
        db_global,
        current_user.id,
        "job_completed",
        f"Job {job_id}: {total_generados} PDFs, "
        f"traspaso={resultado_traspaso['insertados']} insertados, "
        f"{resultado_traspaso['duplicados_exactos']} duplicados, "
        f"{resultado_traspaso['conflictos']} conflictos",
        job.id_proyecto
    )

    return {
        "success": True,
        "message": f"Job {job_id} completado",
        "job_id": job_id,
        "ruta_local": str(ruta_resuelta),
        "generados": total_generados,
        "fallidos": total_fallidos,
        "traspaso": resultado_traspaso,
    }

@router.post("/workers/heartbeat")
def worker_heartbeat(
    request: dict,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Recibe heartbeat de los workers para monitoreo.
    """
    from app.core.redis_client import redis_client

    worker_id = request.get("worker_id")
    status = request.get("status", "running")
    timestamp = request.get("timestamp", datetime.now().isoformat())
    current_job = request.get("current_job")

    if not worker_id:
        raise HTTPException(status_code=400, detail="Falta worker_id")

    # Guardar en Redis con expiración
    redis_conn = redis_client.connection
    redis_conn.setex(
        f"worker:{worker_id}:heartbeat",
        60,  # 1 minuto
        json.dumps({
            "worker_id": worker_id,
            "status": status,
            "timestamp": timestamp,
            "current_job": current_job,
            "last_seen": datetime.now().isoformat()
        })
    )

    # También guardar en un hash para listar workers activos
    redis_conn.hset(
        "workers:active",
        worker_id,
        json.dumps({
            "status": status,
            "last_seen": datetime.now().isoformat(),
            "current_job": current_job
        })
    )

    return {
        "success": True,
        "message": f"Heartbeat recibido de {worker_id}",
        "timestamp": datetime.now().isoformat()
    }

@router.post("/workers/checkpoint")
def save_checkpoint(
    request: dict,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Guarda un checkpoint de un job.
    """
    from app.core.redis_client import redis_client

    job_id = request.get("job_id")
    checkpoint_data = request.get("checkpoint", {})

    if not job_id:
        raise HTTPException(status_code=400, detail="Falta job_id")

    # Guardar en Redis
    redis_conn = redis_client.connection
    redis_conn.setex(
        f"job:{job_id}:checkpoint",
        86400,  # 24 horas
        json.dumps({
            **checkpoint_data,
            "saved_at": datetime.now().isoformat()
        })
    )

    # También actualizar en BD
    job = db_global.query(EmisionJob).filter(EmisionJob.id == job_id).first()
    if job:
        job.checkpoint_data = {
            **(job.checkpoint_data or {}),
            **checkpoint_data,
            "last_checkpoint": datetime.now().isoformat()
        }
        db_global.commit()

    return {
        "success": True,
        "message": f"Checkpoint guardado para job {job_id}",
        "job_id": job_id,
        "checkpoint": checkpoint_data
    }

@router.get("/workers/checkpoint/{job_id}")
def get_checkpoint(
    job_id: int,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Obtiene el checkpoint de un job.
    """
    from app.core.redis_client import redis_client

    # Primero intentar desde Redis
    redis_conn = redis_client.connection
    checkpoint_data = redis_conn.get(f"job:{job_id}:checkpoint")

    if checkpoint_data:
        return {
            "success": True,
            "job_id": job_id,
            "checkpoint": json.loads(checkpoint_data)
        }

    # Si no está en Redis, intentar desde BD
    job = db_global.query(EmisionJob).filter(EmisionJob.id == job_id).first()

    if job and job.checkpoint_data:
        return {
            "success": True,
            "job_id": job_id,
            "checkpoint": job.checkpoint_data
        }

    return {
        "success": False,
        "job_id": job_id,
        "checkpoint": None,
        "message": "No hay checkpoint para este job"
    }

@router.get("/workers/active")
def get_active_workers(
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Obtiene la lista de workers activos.
    """
    from app.core.redis_client import redis_client

    redis_conn = redis_client.connection
    workers = redis_conn.hgetall("workers:active")

    result = []
    for worker_id, data in workers.items():
        try:
            worker_data = json.loads(data)
            result.append({
                "worker_id": worker_id,
                **worker_data
            })
        except:
            continue

    return {
        "workers": result,
        "total": len(result),
        "timestamp": datetime.now().isoformat()
    }

@router.post("/workers/register")
def register_worker(
    worker_id: str = Query(..., description="ID del worker"),
    worker_secret: str = Query(..., description="Secreto del worker"),
    db_global: Session = Depends(get_global_db),
):
    """
    Registra un worker y devuelve un token JWT.
    """
    from app.core.security import create_access_token
    from app.core.config import settings
    from app.models.global_models import Usuario

    if not worker_id.startswith("worker_"):
        raise HTTPException(status_code=403, detail="ID de worker inválido")

    secreto_configurado = getattr(settings, "WORKER_SECRET", "") or ""
    
    if not secreto_configurado:
        logger.error("WORKER_SECRET no está configurado")
        raise HTTPException(
            status_code=503,
            detail="Registro de workers no disponible: falta configuración del servidor.",
        )

    if not secrets_module.compare_digest(worker_secret, secreto_configurado):
        logger.warning(f"Intento de registro de worker '{worker_id}' con secreto inválido")
        raise HTTPException(status_code=403, detail="Secreto de worker inválido")

    # Buscar usuario de servicio
    service_user = db_global.query(Usuario).filter(
        Usuario.correo == "worker@trinnova.local"
    ).first()

    if not service_user:
        # Crear usuario de servicio
        from app.core.security import hash_password
        from app.models.global_models import Rol
        
        rol = db_global.query(Rol).filter(Rol.nombre == "auxiliar").first()
        if not rol:
            rol = db_global.query(Rol).first()
            if not rol:
                raise HTTPException(
                    status_code=500,
                    detail="No se encontró ningún rol para el usuario de servicio"
                )
        
        service_user = Usuario(
            nombre="Worker",
            apellidos="Service",
            correo="worker@trinnova.local",
            password_hash=hash_password("worker_service_2024_secure"),
            id_rol=rol.id,
            activo=True
        )
        db_global.add(service_user)
        db_global.commit()
        db_global.refresh(service_user)
        logger.info(f"Usuario de servicio creado: {service_user.correo}")

    if not service_user.activo:
        raise HTTPException(
            status_code=403,
            detail="El usuario de servicio del worker está inactivo."
        )

    # Generar token
    token = create_access_token(
        data={
            "sub": str(service_user.id),
            "rol": service_user.rol.nombre,
            "worker_id": worker_id
        }
    )

    # ============================================================
    # REGISTRAR EN REDIS - USAR FUNCIÓN DE CONVENIENCIA
    # ============================================================
    redis_conn = redis_client.connection
    redis_conn.setex(
        f"worker:{worker_id}:auth",
        86400,  # 24 horas
        json.dumps({
            "worker_id": worker_id,
            "user_id": service_user.id,
            "registered_at": datetime.now().isoformat()
        })
    )

    logger.info(f"Worker '{worker_id}' registrado correctamente")

    return {
        "success": True,
        "worker_id": worker_id,
        "access_token": token,
        "expires_in": 86400,
        "message": "Worker registrado correctamente"
    }

@router.get("/workers/checkpoint/verify/{job_id}")
def verify_checkpoint(
    job_id: int,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Verifica la integridad del checkpoint de un job.
    Detecta si los datos originales cambiaron.
    """
    from app.core.redis_client import redis_client
    from app.api.analisis import _info

    job = db_global.query(EmisionJob).filter(EmisionJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    # Obtener proyecto
    proyecto = db_global.query(Proyecto).filter(Proyecto.id == job.id_proyecto).first()
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    # Obtener checkpoint
    redis_conn = redis_client.connection
    checkpoint_data = redis_conn.get(f"job:{job_id}:checkpoint")

    if not checkpoint_data:
        # Intentar desde BD
        if job.checkpoint_data:
            checkpoint_data = json.dumps(job.checkpoint_data)
        else:
            return {
                "success": False,
                "mensaje": "No hay checkpoint para este job"
            }

    checkpoint = json.loads(checkpoint_data)

    # Obtener conexión al proyecto
    info = _info(proyecto.slug)
    pk = info["pk"]

    db_gen = get_project_db(proyecto.slug)
    db_proyecto = next(db_gen)

    try:
        es_valido = _verificar_integridad_checkpoint(
            db_proyecto,
            checkpoint,
            proyecto.slug,
            pk
        )

    finally:
        db_gen.close()

    # Contar archivos existentes (si hay ruta local)
    archivos_existentes = 0
    archivos_esperados = checkpoint.get('procesados', 0)

    if job.ruta_zip:
        job_path = Path(job.ruta_zip)
        if job_path.exists():
            archivos_existentes = len(list(job_path.glob("*.pdf")))

    return {
        "success": True,
        "job_id": job_id,
        "checkpoint_valido": es_valido,
        "archivos_existentes": archivos_existentes,
        "archivos_esperados": archivos_esperados,
        "procesados": checkpoint.get('procesados', 0),
        "total": checkpoint.get('total', 0),
        "hash_datos": checkpoint.get('hash_datos'),
        "mensaje": "Checkpoint válido" if es_valido else "Los datos originales han cambiado. No se puede recuperar."
    }

@router.post("/workers/checkpoint/restore/{job_id}")
def restore_from_checkpoint(
    job_id: int,
    request: dict,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Restaura un job desde el último checkpoint.
    El worker llama a este endpoint cuando se reinicia.
    """
    from app.core.redis_client import redis_client

    worker_id = request.get("worker_id")

    if not worker_id:
        raise HTTPException(status_code=400, detail="Falta worker_id")

    _requerir_worker_registrado(worker_id)

    job = db_global.query(EmisionJob).filter(EmisionJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    # Verificar que el job está en estado processing o pending
    if job.status not in ['processing', 'pending']:
        raise HTTPException(
            status_code=400,
            detail=f"No se puede restaurar un job en estado '{job.status}'"
        )

    # Obtener checkpoint
    redis_conn = redis_client.connection
    checkpoint_data = redis_conn.get(f"job:{job_id}:checkpoint")

    if not checkpoint_data:
        if job.checkpoint_data:
            checkpoint_data = json.dumps(job.checkpoint_data)
        else:
            return {
                "success": False,
                "mensaje": "No hay checkpoint para restaurar",
                "desde_cero": True,
                "procesados": 0
            }

    checkpoint = json.loads(checkpoint_data)

    # Verificar integridad antes de restaurar
    proyecto = db_global.query(Proyecto).filter(Proyecto.id == job.id_proyecto).first()
    if proyecto:
        from app.api.analisis import _info

        info = _info(proyecto.slug)
        pk = info["pk"]

        db_gen = get_project_db(proyecto.slug)
        db_proyecto = next(db_gen)

        try:
            es_valido = _verificar_integridad_checkpoint(
                db_proyecto,
                checkpoint,
                proyecto.slug,
                pk
            )

        finally:
            db_gen.close()

        if not es_valido:
            return {
                "success": False,
                "mensaje": (
                    "Los datos originales han cambiado. "
                    "No se puede recuperar. "
                    "Reiniciando desde cero."
                ),
                "desde_cero": True,
                "procesados": 0
            }

    # Actualizar el job con los datos del checkpoint
    job.procesados = checkpoint.get('procesados', 0)
    job.ultimo_pk_procesado = checkpoint.get('ultimo_pk')

    # Si hay un último orden, actualizarlo
    if checkpoint.get('ultimo_orden'):
        job.orden_impresion_inicial = checkpoint.get('ultimo_orden') + 1

    # Guardar que el worker retomó el job
    redis_conn.setex(
        f"job:{job_id}:worker",
        3600,
        worker_id
    )

    db_global.commit()

    registrar_log(
        db_global,
        current_user.id,
        "restore_checkpoint",
        f"Job {job_id} restaurado desde checkpoint: {job.procesados} registros procesados",
        job.id_proyecto
    )

    return {
        "success": True,
        "job_id": job_id,
        "worker_id": worker_id,
        "procesados": job.procesados,
        "ultimo_pk": job.ultimo_pk_procesado,
        "ultimo_orden": job.orden_impresion_inicial,
        "total_registros": job.total_registros,
        "desde_cero": False,
        "mensaje": f"Job restaurado desde checkpoint. Procesados: {job.procesados}/{job.total_registros}"
    }

@router.get("/workers/checkpoint/{job_id}/files")
def get_checkpoint_files(
    job_id: int,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Obtiene el estado de los archivos generados para un job.
    Útil para recuperación parcial.
    """
    job = db_global.query(EmisionJob).filter(EmisionJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    # Control de propiedad: antes cualquier usuario autenticado podía
    # consultar archivos de jobs de otros usuarios/proyectos solo con
    # adivinar el job_id.
    if job.id_usuario != current_user.id and current_user.rol.nombre != "superadmin":
        raise HTTPException(status_code=403, detail="No tienes acceso a este job")

    if not job.ruta_zip:
        return {
            "success": True,
            "job_id": job_id,
            "files_exist": False,
            "mensaje": "El job no tiene archivos generados aún"
        }

    job_path = Path(job.ruta_zip)
    if not job_path.exists():
        return {
            "success": True,
            "job_id": job_id,
            "files_exist": False,
            "mensaje": "La carpeta del job no existe"
        }

    # Obtener archivos PDF
    pdf_files = list(job_path.glob("*.pdf"))
    total_pdfs = len(pdf_files)

    # Obtener metadatos de los archivos
    file_info = []
    for pdf in sorted(pdf_files):
        try:
            # Extraer orden y PK del nombre: "00001 - PK_12345.pdf"
            name = pdf.stem
            parts = name.split(" - ", 1)
            orden = int(parts[0]) if parts[0].isdigit() else 0
            pk = parts[1] if len(parts) > 1 else name
            size = pdf.stat().st_size

            file_info.append({
                "nombre": pdf.name,
                "orden": orden,
                "pk": pk,
                "tamaño_bytes": size,
                "tamaño_kb": round(size / 1024, 2)
            })
        except Exception:
            continue

    return {
        "success": True,
        "job_id": job_id,
        "files_exist": True,
        "total_archivos": total_pdfs,
        "ruta": str(job_path),
        "archivos": file_info[:100],  # Limitamos a 100 para no sobrecargar
        "ultimo_orden": file_info[-1]['orden'] if file_info else 0
    }

@router.delete("/workers/checkpoint/{job_id}")
def clear_checkpoint(
    job_id: int,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Limpia el checkpoint de un job (útil para reiniciar desde cero).
    """
    from app.core.redis_client import redis_client

    job = db_global.query(EmisionJob).filter(EmisionJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    # Limpiar Redis
    redis_conn = redis_client.connection
    redis_conn.delete(f"job:{job_id}:checkpoint")
    redis_conn.delete(f"job:{job_id}:worker")

    # Limpiar BD
    job.checkpoint_data = None
    db_global.commit()

    registrar_log(
        db_global,
        current_user.id,
        "clear_checkpoint",
        f"Checkpoint del job {job_id} eliminado",
        job.id_proyecto
    )

    return {
        "success": True,
        "job_id": job_id,
        "mensaje": "Checkpoint eliminado correctamente"
    }

# ============================================================
# SISTEMA: /sistema/...
# ============================================================

@router.post("/sistema/limpieza")
def limpieza_sistema(
    dias_antiguedad: int = Query(30, description="Días de antigüedad para eliminar"),
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Limpia archivos antiguos del sistema (solo superadmin).
    """
    from app.core.dependencies import require_superadmin
    require_superadmin(current_user)

    from app.core.config import settings

    # 1. Limpiar archivos temporales
    temp_path = Path(settings.TEMP_PATH)
    temp_eliminados = _limpiar_archivos_temporales(temp_path, dias_antiguedad)

    # 2. Limpiar jobs antiguos (más de X días)
    fecha_limite = datetime.now() - timedelta(days=dias_antiguedad)

    jobs_antiguos = db_global.query(EmisionJob).filter(
        EmisionJob.status.in_(['completed', 'failed', 'cancelled']),
        EmisionJob.completed_at < fecha_limite
    ).all()

    jobs_eliminados = 0
    espacio_liberado_kb = 0

    for job in jobs_antiguos:
        # Obtener proyecto
        proyecto = db_global.query(Proyecto).filter(Proyecto.id == job.id_proyecto).first()
        if not proyecto:
            continue

        # Obtener directorio
        job_dir = _get_job_directory(proyecto.slug, job.id, Path(settings.EMISIONES_PATH))

        if job_dir.exists():
            # Calcular tamaño
            pdf_files = list(job_dir.glob("*.pdf"))
            tamaño = sum(f.stat().st_size for f in pdf_files) / 1024
            espacio_liberado_kb += tamaño

            # Eliminar
            try:
                shutil.rmtree(job_dir)
                jobs_eliminados += 1
            except Exception as e:
                logger.error(f"Error eliminando job {job.id}: {e}")

    # Registrar log
    registrar_log(
        db_global,
        current_user.id,
        "limpieza_sistema",
        f"Limpieza automática: {temp_eliminados} archivos temporales, {jobs_eliminados} jobs antiguos",
        None
    )

    return {
        "success": True,
        "archivos_temporales_eliminados": temp_eliminados,
        "jobs_eliminados": jobs_eliminados,
        "espacio_liberado_kb": round(espacio_liberado_kb, 2),
        "espacio_liberado_mb": round(espacio_liberado_kb / 1024, 2),
        "mensaje": f"Limpieza completada. Se eliminaron {jobs_eliminados} jobs antiguos y {temp_eliminados} archivos temporales."
    }

@router.get("/sistema/espacio")
def get_espacio_disco(
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Obtiene información del espacio en disco (solo superadmin).
    """
    from app.core.dependencies import require_superadmin
    require_superadmin(current_user)

    from app.core.config import settings

    # Directorios principales
    emisiones_path = Path(settings.EMISIONES_PATH)
    temp_path = Path(settings.TEMP_PATH)

    resultado = {
        "emisiones": None,
        "temp": None,
        "total": None
    }

    for name, path in [("emisiones", emisiones_path), ("temp", temp_path)]:
        if path.exists():
            stat = shutil.disk_usage(path)
            resultado[name] = {
                "ruta": str(path),
                "total_kb": round(stat.total / 1024, 2),
                "usado_kb": round((stat.total - stat.free) / 1024, 2),
                "libre_kb": round(stat.free / 1024, 2),
                "porcentaje_usado": round(((stat.total - stat.free) / stat.total) * 100, 2)
            }

    # Calcular total
    if resultado["emisiones"] and resultado["temp"]:
        resultado["total"] = {
            "total_kb": resultado["emisiones"]["total_kb"],
            "libre_kb": resultado["emisiones"]["libre_kb"],
            "porcentaje_usado": resultado["emisiones"]["porcentaje_usado"]
        }

    return resultado

# ============================================================
# MONITOREO: /monitoreo/...
# ============================================================

@router.get("/monitoreo/metricas")
def get_metricas(
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Obtiene las métricas de rendimiento del sistema.
    """
    # Verificar permisos (solo superadmin y analistas)
    if current_user.rol.nombre not in ['superadmin', 'analista']:
        raise HTTPException(status_code=403, detail="No tienes permisos para ver métricas")

    metricas = MonitoreoService.obtener_metricas()

    # Obtener métricas adicionales de la BD
    try:
        # Total de jobs por estado
        jobs_por_estado = db_global.query(
            EmisionJob.status,
            func.count(EmisionJob.id)
        ).group_by(EmisionJob.status).all()

        metricas["jobs_por_estado"] = [
            {"estado": row[0], "total": row[1]}
            for row in jobs_por_estado
        ]

        # Total de PDFs generados
        total_pdfs = db_global.query(
            func.sum(EmisionJob.procesados)
        ).filter(
            EmisionJob.status == 'completed'
        ).scalar() or 0

        metricas["total_pdfs_generados"] = total_pdfs

        # Últimos 10 jobs
        ultimos_jobs = db_global.query(EmisionJob).order_by(
            EmisionJob.created_at.desc()
        ).limit(10).all()

        metricas["ultimos_jobs"] = [
            {
                "id": j.id,
                "nombre_job": j.nombre_job,
                "status": j.status,
                "total_registros": j.total_registros,
                "procesados": j.procesados,
                "created_at": j.created_at.isoformat() if j.created_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None
            }
            for j in ultimos_jobs
        ]

    except Exception as e:
        logger.error(f"Error obteniendo métricas adicionales: {e}")

    return {
        "success": True,
        "metricas": metricas,
        "timestamp": datetime.now().isoformat()
    }

@router.get("/monitoreo/logs")
def get_logs(
    nivel: Optional[str] = Query(None, description="Filtrar por nivel (info, warning, error)"),
    job_id: Optional[int] = Query(None, description="Filtrar por job"),
    worker_id: Optional[str] = Query(None, description="Filtrar por worker"),
    desde: Optional[str] = Query(None, description="Fecha desde (ISO format)"),
    hasta: Optional[str] = Query(None, description="Fecha hasta (ISO format)"),
    limit: int = Query(100, ge=1, le=500, description="Límite de registros"),
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Obtiene logs estructurados del sistema.
    """
    # Verificar permisos
    if current_user.rol.nombre not in ['superadmin', 'analista']:
        raise HTTPException(status_code=403, detail="No tienes permisos para ver logs")

    log_dir = Path(__file__).parent.parent.parent.parent / "Logs"
    log_file = log_dir / "emision_logs.jsonl"

    if not log_file.exists():
        return {
            "success": True,
            "logs": [],
            "total": 0,
            "mensaje": "No hay logs disponibles"
        }

    logs = []
    try:
        with open(log_file, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    log_entry = json.loads(line.strip())

                    # Aplicar filtros
                    if nivel and log_entry.get("nivel") != nivel:
                        continue
                    if job_id and log_entry.get("job_id") != job_id:
                        continue
                    if worker_id and log_entry.get("worker_id") != worker_id:
                        continue

                    # Filtros de fecha
                    if desde:
                        try:
                            fecha_desde = datetime.fromisoformat(desde)
                            fecha_log = datetime.fromisoformat(log_entry["timestamp"])
                            if fecha_log < fecha_desde:
                                continue
                        except:
                            pass

                    if hasta:
                        try:
                            fecha_hasta = datetime.fromisoformat(hasta)
                            fecha_log = datetime.fromisoformat(log_entry["timestamp"])
                            if fecha_log > fecha_hasta:
                                continue
                        except:
                            pass

                    logs.append(log_entry)

                except json.JSONDecodeError:
                    continue

        # Ordenar por timestamp (más reciente primero)
        logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

        # Limitar resultados
        total = len(logs)
        logs = logs[:limit]

    except Exception as e:
        logger.error(f"Error leyendo logs: {e}")
        return {
            "success": False,
            "error": str(e)
        }

    return {
        "success": True,
        "logs": logs,
        "total": total,
        "limit": limit,
        "filtros": {
            "nivel": nivel,
            "job_id": job_id,
            "worker_id": worker_id,
            "desde": desde,
            "hasta": hasta
        }
    }

@router.post("/monitoreo/alerta")
def enviar_alerta(
    request: dict,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Endpoint para que los workers envíen alertas.
    """
    nivel = request.get("nivel", "warning")
    mensaje = request.get("mensaje", "")
    job_id = request.get("job_id")
    worker_id = request.get("worker_id")
    datos_extra = request.get("datos_extra", {})

    if not mensaje:
        raise HTTPException(status_code=400, detail="Falta mensaje de alerta")

    # Registrar alerta
    MonitoreoService.registrar_log_estructurado(
        nivel=nivel,
        mensaje=mensaje,
        job_id=job_id,
        worker_id=worker_id,
        datos_extra=datos_extra,
        db_global=db_global
    )

    # Si es error crítico, guardar en tabla de alertas
    if nivel in ['error', 'critical']:
        try:
            # Guardar en tabla de alertas (si existe)
            # Por ahora solo log
            logger.warning(f"ALERTA {nivel}: {mensaje}")
        except Exception:
            pass

    return {
        "success": True,
        "mensaje": "Alerta registrada",
        "nivel": nivel,
        "timestamp": datetime.now().isoformat()
    }

@router.get("/monitoreo/workers")
def get_workers_status(
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Obtiene el estado de todos los workers.
    """
    from app.core.redis_client import redis_client

    if current_user.rol.nombre not in ['superadmin', 'analista']:
        raise HTTPException(status_code=403, detail="No tienes permisos")

    redis_conn = redis_client.connection

    # Obtener workers activos de Redis
    workers_data = redis_conn.hgetall("workers:active")

    workers = []
    for worker_id, data in workers_data.items():
        try:
            worker_info = json.loads(data)

            # Obtener estadísticas del worker desde BD
            stats = MonitoreoService.obtener_estadisticas_worker(worker_id, db_global)

            workers.append({
                "worker_id": worker_id,
                "status": worker_info.get("status", "unknown"),
                "last_seen": worker_info.get("last_seen"),
                "current_job": worker_info.get("current_job"),
                "estadisticas": stats
            })
        except Exception as e:
            logger.error(f"Error procesando worker {worker_id}: {e}")

    return {
        "success": True,
        "workers": workers,
        "total": len(workers),
        "timestamp": datetime.now().isoformat()
    }

@router.get("/monitoreo/health")
def health_check(
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Health check completo del sistema de emisión.
    """
    from app.core.redis_client import redis_client

    health = {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "checks": {}
    }

    redis_conn = None

    # 1. Verificar Redis
    try:
        redis_conn = redis_client.connection
        redis_conn.ping()
        health["checks"]["redis"] = {"status": "healthy"}
    except Exception as e:
        health["checks"]["redis"] = {"status": "unhealthy", "error": str(e)}
        health["status"] = "degraded"

    # 2. Verificar BD
    try:
        db_global.execute(text("SELECT 1")).first()
        health["checks"]["database"] = {"status": "healthy"}
    except Exception as e:
        health["checks"]["database"] = {"status": "unhealthy", "error": str(e)}
        health["status"] = "degraded"

    # 3. Verificar cola de jobs
    try:
        queue_length = redis_conn.llen("emision_jobs") if redis_conn and health["checks"].get("redis", {}).get("status") == "healthy" else 0
        health["checks"]["queue"] = {
            "status": "healthy" if queue_length < 1000 else "warning",
            "length": queue_length,
            "message": f"{queue_length} jobs en cola"
        }
    except Exception as e:
        health["checks"]["queue"] = {"status": "error", "error": str(e)}

    # 4. Verificar workers activos
    try:
        workers = redis_conn.hgetall("workers:active") if redis_conn and health["checks"].get("redis", {}).get("status") == "healthy" else {}
        health["checks"]["workers"] = {
            "status": "healthy" if len(workers) > 0 else "warning",
            "active": len(workers),
            "message": f"{len(workers)} workers activos"
        }
    except Exception as e:
        health["checks"]["workers"] = {"status": "error", "error": str(e)}

    # 5. Verificar espacio en disco
    try:
        from app.core.config import settings
        emisiones_path = Path(settings.EMISIONES_PATH)
        if emisiones_path.exists():
            stat = shutil.disk_usage(emisiones_path)
            porcentaje = ((stat.total - stat.free) / stat.total) * 100
            health["checks"]["disk"] = {
                "status": "healthy" if porcentaje < 80 else "warning" if porcentaje < 90 else "critical",
                "free_gb": round(stat.free / (1024**3), 2),
                "used_percent": round(porcentaje, 2),
                "message": f"{round(porcentaje, 2)}% usado"
            }
        else:
            health["checks"]["disk"] = {"status": "warning", "message": "Directorio de emisiones no existe"}
    except Exception as e:
        health["checks"]["disk"] = {"status": "error", "error": str(e)}

    # Determinar estado general
    for check in health["checks"].values():
        if check.get("status") == "critical":
            health["status"] = "critical"
            break
        elif check.get("status") == "unhealthy" and health["status"] != "critical":
            health["status"] = "unhealthy"
        elif check.get("status") == "warning" and health["status"] not in ["critical", "unhealthy"]:
            health["status"] = "warning"

    return health

# ============================================================
# PROYECTO: /{proyecto_slug}/preparar-tabla-temporal
# ============================================================

@router.post("/{proyecto_slug}/preparar-tabla-temporal",
             response_model=ContinuarEmisionResponse)
def preparar_tabla_temporal(
    proyecto_slug: str,
    request: PrepararEmisionRequest,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    from app.api.analisis import _info

    proyecto = check_project_access(proyecto_slug, current_user, db_global)
    info = _info(proyecto_slug)
    clave = info["pk"]     # ← clave foránea (clave_APA, credito, ...)

    if not request.ids:
        raise HTTPException(status_code=400, detail="No se enviaron cuentas.")

    db_gen = get_project_db(proyecto_slug)
    db_proyecto = next(db_gen)
    try:
        orden_map = {str(k): int(v) for k, v in (request.orden_map or {}).items()}

        resultado = _poblar_tabla_temporal(
            db_proyecto,
            clave,
            request.ids,
            orden_map,
        )

        registrar_log(
            db_global, current_user.id, "preparar_tabla_temporal",
            f"tabla_temporal: {resultado['insertados']} insertados, "
            f"{resultado['errores']} errores en {proyecto_slug}",
            proyecto.id,
        )

        return ContinuarEmisionResponse(
            success=True,
            total=resultado["insertados"],
            insertados=resultado["insertados"],
            errores=resultado["errores"],
            message=(
                f"{resultado['insertados']} registros listos para emisión."
                + (f" {resultado['errores']} quedaron en errores."
                   if resultado["errores"] > 0 else "")
            ),
        )
    finally:
        db_gen.close()

# ============================================================
# PROYECTO: /{proyecto_slug}/tabla-temporal
# ============================================================

@router.get("/{proyecto_slug}/tabla-temporal")
def get_tabla_temporal(
    proyecto_slug: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Devuelve el contenido actual de tabla_temporal.
    PK real = codebar. Clave foránea = la de _info (clave_APA, credito, ...).
    """
    from sqlalchemy import text
    from app.api.analisis import _info

    check_project_access(proyecto_slug, current_user, db_global)
    info = _info(proyecto_slug)
    clave = info["pk"]

    db_gen = get_project_db(proyecto_slug)
    db_proyecto = next(db_gen)

    try:
        try:
            total = db_proyecto.execute(text(
                "SELECT COUNT(*) AS c FROM tabla_temporal"
            )).first().c
        except Exception:
            return {
                "rows": [], "total": 0,
                "page": page, "limit": limit,
                "pk": "codebar", "clave": clave,
            }

        offset = (page - 1) * limit
        rows = db_proyecto.execute(text("""
            SELECT * FROM tabla_temporal
            ORDER BY orden_impresion ASC, `codebar` ASC
            LIMIT :limit OFFSET :offset
        """), {"limit": limit, "offset": offset}).fetchall()

        return {
            "rows": [dict(r._mapping) for r in rows],
            "total": total,
            "page": page,
            "limit": limit,
            "pk": "codebar",       # ← PK real
            "clave": clave,        # ← clave foránea (por si el front la quiere)
        }
    finally:
        db_gen.close()

# ============================================================
# PROYECTO: /{proyecto_slug}/tabla-temporal-errores
# ============================================================

@router.get("/{proyecto_slug}/tabla-temporal-errores")
def get_tabla_temporal_errores(
    proyecto_slug: str,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """Lista los errores/conflictos del último traspaso."""
    from sqlalchemy import text

    check_project_access(proyecto_slug, current_user, db_global)
    db_gen = get_project_db(proyecto_slug)
    db_proyecto = next(db_gen)
    try:
        try:
            rows = db_proyecto.execute(text("""
                SELECT id, clave_origen, codebar_intento, codebar_original,
                       motivo, estatus, created_at
                FROM tabla_temporal_errores
                ORDER BY id ASC
            """)).fetchall()
        except Exception:
            return {"errores": [], "total": 0}

        return {
            "errores": [dict(r._mapping) for r in rows],
            "total": len(rows),
        }
    finally:
        db_gen.close()

# ============================================================
# PROYECTO: /{proyecto_slug}/resolver-duplicados
# ============================================================ 

@router.post("/{proyecto_slug}/resolver-duplicado")
def resolver_duplicado(
    proyecto_slug: str,
    request: ResolverDuplicadoRequest,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Resuelve un conflicto de traspaso:
    - reemplazar:      actualiza la fila existente en histórica
    - agregar_sufijo:  inserta con codebar+N-DX
    - descartar:       elimina la fila de temporal_errores y de temporal
    """
    from sqlalchemy import text
    import json
    from app.api.analisis import _info

    proyecto = check_project_access(proyecto_slug, current_user, db_global)
    info = _info(proyecto_slug)
    clave = info["pk"]
    campo_monto = CAMPO_MONTO_POR_PROYECTO.get(proyecto_slug)

    db_gen = get_project_db(proyecto_slug)
    db_proyecto = next(db_gen)
    try:
        err = db_proyecto.execute(text(
            "SELECT * FROM tabla_temporal_errores WHERE id = :id LIMIT 1"
        ), {"id": request.error_id}).first()

        if not err:
            raise HTTPException(status_code=404, detail="Error no encontrado")

        err_dict = dict(err._mapping)
        row_dict = json.loads(err_dict["payload_json"] or "{}")
        codebar_original = err_dict["codebar_original"] or err_dict["codebar_intento"]
        clave_val = err_dict["clave_origen"]

        accion = request.accion

        if accion == "descartar":
            db_proyecto.execute(text("DELETE FROM tabla_temporal_errores WHERE id = :id"),
                                {"id": request.error_id})
            db_proyecto.execute(text(
                f"DELETE FROM tabla_temporal WHERE `{clave}` = :c AND codebar = :cb"
            ), {"c": clave_val, "cb": codebar_original})
            db_proyecto.commit()
            return {"success": True, "message": "Descartado"}

        if accion == "reemplazar":
            # Actualizar fila existente en histórica con los datos de temporal
            cols_temp = _get_columnas_tabla(db_proyecto, "tabla_temporal")
            cols_hist = _get_columnas_tabla(db_proyecto, "tabla_historica")
            cols_extra = {"fecha_registro", "id_job", "id_usuario", "worker_id",
                          "ruta_pdf", "estatus", "observaciones_preparacion"}
            cols_comunes = [c for c in cols_temp if c in cols_hist and c not in cols_extra]

            set_parts = [f"`{c}` = :{c}" for c in cols_comunes if c != "codebar"]
            params = {c: row_dict.get(c) for c in cols_comunes if c != "codebar"}
            params["cb"] = codebar_original

            db_proyecto.execute(text(
                f"UPDATE tabla_historica SET {', '.join(set_parts)} WHERE codebar = :cb"
            ), params)
            db_proyecto.execute(text("DELETE FROM tabla_temporal_errores WHERE id = :id"),
                                {"id": request.error_id})
            db_proyecto.execute(text(
                f"DELETE FROM tabla_temporal WHERE `{clave}` = :c AND codebar = :cb"
            ), {"c": clave_val, "cb": codebar_original})
            db_proyecto.commit()
            return {"success": True, "message": "Reemplazado"}

        if accion == "agregar_sufijo":
            # Insertar con codebar + DX (y probar DX2, DX3... si sigue chocando)
            cols_temp = _get_columnas_tabla(db_proyecto, "tabla_temporal")
            cols_hist = _get_columnas_tabla(db_proyecto, "tabla_historica")
            cols_extra = {"fecha_registro", "id_job", "id_usuario", "worker_id",
                          "ruta_pdf", "estatus", "observaciones_preparacion"}
            cols_comunes = [c for c in cols_temp if c in cols_hist and c not in cols_extra]

            insertados = False
            sufijo = request.sufijo or 1
            codebar_nuevo = None

            for intento in range(sufijo, sufijo + 20):
                candidato = _generar_codebar_con_sufijo(codebar_original, intento)
                # Verificar unicidad
                existe = db_proyecto.execute(text(
                    "SELECT 1 FROM tabla_historica WHERE codebar = :cb LIMIT 1"
                ), {"cb": candidato}).first()
                if existe:
                    continue

                cols_insert = list(cols_comunes) + [
                    "id_job", "id_usuario", "worker_id", "estatus", "fecha_registro"
                ]
                vals_insert = [f":{c}" for c in cols_comunes] + [
                    ":id_job", ":id_usuario", ":worker_id", ":estatus", ":fecha_registro"
                ]
                params = {c: row_dict.get(c) for c in cols_comunes}
                params["codebar"] = candidato
                params.update({
                    "id_job": None,
                    "id_usuario": current_user.id,
                    "worker_id": None,
                    "estatus": "emitida_revision",
                    "fecha_registro": datetime.now(),
                })

                # codebar no está en cols_comunes porque ya lo seteamos aparte
                cols_final = [c if c != "codebar" else "codebar" for c in cols_insert]
                db_proyecto.execute(text(f"""
                    INSERT INTO tabla_historica
                        ({", ".join(f"`{c}`" for c in cols_final)})
                    VALUES ({", ".join(vals_insert)})
                """), params)

                codebar_nuevo = candidato
                insertados = True
                break

            if not insertados:
                raise HTTPException(
                    status_code=409,
                    detail="No se pudo generar un codebar único después de 20 intentos."
                )

            db_proyecto.execute(text("DELETE FROM tabla_temporal_errores WHERE id = :id"),
                                {"id": request.error_id})
            db_proyecto.execute(text(
                f"DELETE FROM tabla_temporal WHERE `{clave}` = :c AND codebar = :cb"
            ), {"c": clave_val, "cb": codebar_original})
            db_proyecto.commit()

            return {
                "success": True,
                "message": f"Insertado con codebar {codebar_nuevo}",
                "codebar_nuevo": codebar_nuevo,
            }

        raise HTTPException(status_code=400, detail=f"Acción desconocida: {accion}")
    finally:
        db_gen.close()

# ============================================================
# PROYECTO: /{proyecto_slug}/resolver-duplicados
# ============================================================ 

@router.post("/{proyecto_slug}/tabla-temporal/finalizar-traspaso")
def finalizar_traspaso(
    proyecto_slug: str,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Verifica que no queden errores pendientes. Si todo está resuelto,
    vacía tabla_temporal y tabla_temporal_errores.
    """
    from sqlalchemy import text

    proyecto = check_project_access(proyecto_slug, current_user, db_global)
    db_gen = get_project_db(proyecto_slug)
    db_proyecto = next(db_gen)
    try:
        pendientes = db_proyecto.execute(text(
            "SELECT COUNT(*) AS c FROM tabla_temporal_errores WHERE estatus != 'resuelto'"
        )).first().c

        if pendientes > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Hay {pendientes} conflictos sin resolver. Resuélvelos primero."
            )

        db_proyecto.execute(text("DELETE FROM tabla_temporal"))
        db_proyecto.execute(text("DELETE FROM tabla_temporal_errores"))
        db_proyecto.commit()

        registrar_log(
            db_global, current_user.id, "finalizar_traspaso",
            f"Traspaso cerrado en {proyecto_slug}",
            proyecto.id
        )

        return {"success": True, "message": "Temporal vaciada correctamente."}
    finally:
        db_gen.close()

# ============================================================
# PROYECTO: /{proyecto_slug}/seleccionar-cuentas-csv
# ============================================================

@router.post("/{proyecto_slug}/seleccionar-cuentas-csv")
async def seleccionar_cuentas_csv(
    proyecto_slug: str,
    file: UploadFile = File(...),
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Lee un CSV/Excel con:
      - columna de PK (obligatoria)
      - columna de orden_impresion (opcional)

    Devuelve:
      - ids:       lista de PKs (como vienen en el archivo)
      - orden_map: dict {pk_str: orden}
      - pk:        nombre de la columna PK en tabla_analisis
      - total:     cantidad de ids

    NO escribe en BD. Solo parsea.
    """
    import pandas as pd
    import io
    from app.api.analisis import _info

    if not file.filename.lower().endswith((".csv", ".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Formato no soportado. Usa CSV o Excel.")

    check_project_access(proyecto_slug, current_user, db_global)
    info = _info(proyecto_slug)
    pk = info["pk"]

    contents = await file.read()
    try:
        if file.filename.lower().endswith(".csv"):
            try:
                df = pd.read_csv(io.BytesIO(contents), encoding="utf-8", sep=None, engine="python")
            except UnicodeDecodeError:
                df = pd.read_csv(io.BytesIO(contents), encoding="latin-1", sep=None, engine="python")
        else:
            df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo leer el archivo: {e}")

    if df.empty:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    # Normalizar nombres de columnas
    df.columns = [str(c).strip().lower() for c in df.columns]

    # Detectar columna PK
    pk_col = None
    for cand in [pk.lower(), "pk", "cuenta", "prestamo", "licencia", "credito", "clave_apa", "cuenta_n"]:
        if cand in df.columns:
            pk_col = cand
            break

    if pk_col is None:
        raise HTTPException(
            status_code=400,
            detail=f"No se encontró columna de PK. Columnas detectadas: {list(df.columns)[:10]}"
        )

    # Detectar columna de orden (opcional)
    orden_col = None
    for cand in ["orden", "orden_impresion", "order", "no", "num"]:
        if cand in df.columns:
            orden_col = cand
            break

    ids: list = []
    orden_map: dict = {}

    for idx, row in df.iterrows():
        pk_val = row[pk_col]
        if pd.isna(pk_val):
            continue

        if info["pk_type"] == "int":
            try:
                pk_val = int(pk_val)
            except (ValueError, TypeError):
                continue
        else:
            pk_val = str(pk_val).strip()

        ids.append(pk_val)

        if orden_col is not None and not pd.isna(row[orden_col]):
            try:
                orden_map[str(pk_val)] = int(row[orden_col])
            except (ValueError, TypeError):
                pass

    return {
        "success": True,
        "ids": ids,
        "orden_map": orden_map,
        "total": len(ids),
        "pk": pk,
    }

# ============================================================
# PROYECTO: /{proyecto_slug}/preparar
# ============================================================

@router.post("/{proyecto_slug}/preparar", response_model=PrepararEmisionResponse)
def preparar_emision(
    proyecto_slug: str,
    request: PrepararEmisionRequest,
    background_tasks: BackgroundTasks,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Prepara una emisión masiva de documentos.

    1. Valida que el proyecto y plantilla existen
    2. Cuenta los registros a procesar según los filtros
    3. Crea un job en la base de datos (status: pending)
    4. Lo pone en la cola de Redis para que un worker lo procese
    5. Retorna el ID del job para seguimiento
    """
    from app.api.analisis import _info

    # 1. VALIDAR ACCESO AL PROYECTO
    proyecto = check_project_access(proyecto_slug, current_user, db_global)

    # 2. VALIDAR PLANTILLA
    plantilla = db_global.query(Plantilla).filter(
        Plantilla.id == request.id_plantilla,
        Plantilla.id_proyecto == proyecto.id,
        Plantilla.activa == True
    ).first()

    if not plantilla:
        raise HTTPException(
            status_code=404,
            detail=f"Plantilla no encontrada o inactiva. ID: {request.id_plantilla}"
        )

    # 3. OBTENER REGISTROS A PROCESAR
    db_proyecto = next(get_project_db(proyecto_slug))
    info = _info(proyecto_slug)
    pk = info["pk"]

    condiciones = ["viabilidad = 'viable'"]
    params = {}

    if (
        request.filtros.get("programa")
        and request.filtros["programa"] != "todos"
    ):
        condiciones.append(
            "programa = :programa"
        )

        params["programa"] = request.filtros["programa"]

    if (
        request.filtros.get("ids")
        and isinstance(request.filtros["ids"], list)
    ):
        placeholders = ", ".join(
            f":id{i}"
            for i in range(len(request.filtros["ids"]))
        )

        condiciones.append(
            f"`{pk}` IN ({placeholders})"
        )

        for i, id_val in enumerate(request.filtros["ids"]):
            params[f"id{i}"] = id_val

    if (
        request.filtros.get("cuenta_inicial")
        and request.filtros.get("cuenta_final")
    ):
        condiciones.append(
            f"`{pk}` BETWEEN :inicio AND :fin"
        )

        params["inicio"] = request.filtros["cuenta_inicial"]
        params["fin"] = request.filtros["cuenta_final"]

    where = " AND ".join(condiciones)

    db_gen = get_project_db(proyecto_slug)
    db_proyecto = next(db_gen)

    try:
        count_query = text(
            f"""
            SELECT COUNT(*) AS total
            FROM tabla_analisis
            WHERE {where}
            """
        )

        count_result = db_proyecto.execute(
            count_query,
            params
        ).first()

        total = count_result.total if count_result else 0

    finally:
        db_gen.close()

    if total == 0:
        raise HTTPException(
            status_code=400,
            detail="No hay registros viables para emitir con los filtros seleccionados"
        )

    # 4. CREAR JOB EN LA BASE DE DATOS
    job = EmisionJob(
        id_proyecto=proyecto.id,
        id_plantilla=plantilla.id,
        id_usuario=current_user.id,
        nombre_job=request.nombre_job or f"Emisión {proyecto.nombre} - {datetime.now().strftime('%d/%m/%Y %H:%M')}",
        modo=request.modo,
        cuentas_por_lote=request.cuentas_por_lote,
        orden_impresion_inicial=request.orden_impresion_inicial,
        status='pending',
        total_registros=total,
        filtros=json.dumps(request.filtros),
        created_by=current_user.id
    )

    db_global.add(job)
    db_global.commit()
    db_global.refresh(job)

    # 5. REGISTRAR EN LOG
    registrar_log(
        db_global,
        current_user.id,
        "preparar_emision",
        f"Emisión preparada: {total} registros, job_id={job.id}, plantilla={plantilla.nombre}",
        proyecto.id
    )

    # 6. PONER EN COLA DE REDIS
    from app.core.redis_client import push_job
    publicado = push_job(job.id)

    if not publicado:
        logger.warning(f"Job {job.id} creado pero NO publicado en Redis")

    from app.core.redis_client import set_job_status
    set_job_status(
        job.id,
        'pending',
        {
            'total': total,
            'proyecto': proyecto.nombre,
            'usuario': current_user.nombre
        }
    )

    return PrepararEmisionResponse(
        success=True,
        job_id=job.id,
        total_registros=total,
        message=f"Emisión preparada. {total} registros en cola para procesamiento."
    )

# ============================================================
# PROYECTO: /{proyecto_slug}/plantillas
# ============================================================

@router.get("/{proyecto_slug}/plantillas")
def get_plantillas_emision(
    proyecto_slug: str,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Obtiene las plantillas disponibles para emisión en un proyecto.
    """
    proyecto = check_project_access(proyecto_slug, current_user, db_global)

    plantillas = db_global.query(Plantilla).filter(
        Plantilla.id_proyecto == proyecto.id,
        Plantilla.activa == True
    ).all()

    return [
        {
            "id": p.id,
            "nombre": p.nombre,
            "nombre_archivo": p.nombre_archivo,
            "descripcion": p.descripcion,
            "total_campos": len(p.campos) if p.campos else 0,
            "created_at": p.created_at
        }
        for p in plantillas
    ]

# ============================================================
# PROYECTO: /{proyecto_slug}/programas
# ============================================================

@router.get("/{proyecto_slug}/programas")
def get_programas_emision(
    proyecto_slug: str,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """Obtiene los programas disponibles para emisión."""
    from app.api.analisis import get_programas
    return get_programas(proyecto_slug, current_user, db_global)

# ============================================================
# RESTO DE ENDPOINTS DE PROYECTO
# ============================================================

@router.get("/{proyecto_slug}/estadisticas-emision")
def get_estadisticas_emision(
    proyecto_slug: str,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """Obtiene estadísticas para emisión."""
    from sqlalchemy import text

    check_project_access(
        proyecto_slug,
        current_user,
        db_global
    )

    db_gen = get_project_db(proyecto_slug)
    db_proyecto = next(db_gen)

    try:
        total_viables_row = db_proyecto.execute(
            text(
                """
                SELECT COUNT(*) AS total
                FROM tabla_analisis
                WHERE viabilidad = 'viable'
                """
            )
        ).first()

        total_no_viables_row = db_proyecto.execute(
            text(
                """
                SELECT COUNT(*) AS total
                FROM tabla_analisis
                WHERE viabilidad = 'no_viable'
                """
            )
        ).first()

        total_pendientes_row = db_proyecto.execute(
            text(
                """
                SELECT COUNT(*) AS total
                FROM tabla_analisis
                WHERE viabilidad = 'pendiente'
                """
            )
        ).first()

        total_general_row = db_proyecto.execute(
            text(
                """
                SELECT COUNT(*) AS total
                FROM tabla_analisis
                """
            )
        ).first()

        total_viables = (
            total_viables_row.total
            if total_viables_row
            else 0
        )

        total_no_viables = (
            total_no_viables_row.total
            if total_no_viables_row
            else 0
        )

        total_pendientes = (
            total_pendientes_row.total
            if total_pendientes_row
            else 0
        )

        total_general = (
            total_general_row.total
            if total_general_row
            else 0
        )

        return {
            "total_viables": total_viables,
            "total_no_viables": total_no_viables,
            "total_pendientes": total_pendientes,
            "total_general": total_general,
            "mensaje": (
                f"{total_viables} registros "
                "viables para emisión"
            )
        }

    except Exception as e:
        return {
            "total_viables": 0,
            "total_no_viables": 0,
            "total_pendientes": 0,
            "total_general": 0,
            "mensaje": (
                "La tabla de análisis aún no existe. "
                "Genera el análisis primero."
            ),
            "error": str(e)
        }

    finally:
        db_gen.close()

@router.get("/{proyecto_slug}/cuentas")
def get_cuentas_emision(
    proyecto_slug: str,
    page: int = Query(1, ge=1, description="Número de página"),
    limit: int = Query(50, ge=1, le=200, description="Registros por página (máx 200)"),
    viabilidad: Optional[str] = Query(None, description="Filtrar por viabilidad"),
    programa: Optional[str] = Query(None, description="Filtrar por programa"),
    busqueda: Optional[str] = Query(None, description="Búsqueda general"),
    sort_col: Optional[str] = Query(None, description="Columna para ordenar"),
    sort_dir: Optional[str] = Query("asc", description="Dirección de ordenamiento"),
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """Obtiene cuentas para selección en emisión."""
    from sqlalchemy import text
    from app.api.analisis import _info

    check_project_access(proyecto_slug, current_user, db_global)
    info = _info(proyecto_slug)
    pk = info["pk"]
    db_gen = get_project_db(proyecto_slug)
    db_proyecto = next(db_gen)

    try:
        conditions = []
        params = {}

        if viabilidad and viabilidad in ("viable", "no_viable", "pendiente"):
            conditions.append("viabilidad = :viabilidad")
            params["viabilidad"] = viabilidad

        if programa and programa != "todos":
            conditions.append("programa = :programa")
            params["programa"] = programa

        if busqueda:
            search_cols = list(dict.fromkeys(info["col_nombre"] + info["col_calle"] + [pk]))
            parts = [f"CAST(`{c}` AS CHAR) LIKE :busqueda" for c in search_cols]
            conditions.append("(" + " OR ".join(parts) + ")")
            params["busqueda"] = f"%{busqueda}%"

        where = " AND ".join(conditions) if conditions else "1=1"

        # Columnas válidas para ordenamiento
        try:
            cols_result = db_proyecto.execute(text("SHOW COLUMNS FROM tabla_analisis")).fetchall()
            cols_validas = {r[0] for r in cols_result}
        except Exception:
            cols_validas = set()

        order_col = pk
        if sort_col and sort_col in cols_validas:
            order_col = sort_col
        order_dir = "DESC" if sort_dir.lower() == "desc" else "ASC"

        # Contar total
        count_query = text(f"SELECT COUNT(*) AS total FROM tabla_analisis WHERE {where}")
        total = db_proyecto.execute(count_query, params).first().total

        # Obtener datos
        offset = (page - 1) * limit
        data_query = text(f"""
            SELECT * FROM tabla_analisis
            WHERE {where}
            ORDER BY `{order_col}` {order_dir}
            LIMIT {limit} OFFSET {offset}
        """)
        rows = db_proyecto.execute(data_query, params).fetchall()

        # Procesar resultados
        result = []
        for r in rows:
            row_dict = dict(r._mapping)

            # Adeudo
            adeudo_val = 0
            for col in info["col_adeudo"]:
                v = row_dict.get(col)
                if v is not None:
                    try:
                        adeudo_val = float(v)
                        break
                    except (TypeError, ValueError):
                        pass
            row_dict["_adeudo_display"] = adeudo_val

            # Nombre
            nombre_val = ""
            for col in info["col_nombre"]:
                v = row_dict.get(col)
                if v:
                    nombre_val = str(v)
                    break
            row_dict["_nombre_display"] = nombre_val

            # Calle
            calle_val = ""
            for col in info["col_calle"]:
                v = row_dict.get(col)
                if v:
                    calle_val = str(v)
                    break
            row_dict["_calle_display"] = calle_val

            result.append(row_dict)

        return {
            "rows": result,
            "total": total,
            "page": page,
            "limit": limit,
            "pk": pk,
            "total_pages": (
                (total + limit - 1) // limit
                if total > 0
                else 1
            )
        }

    finally:
        db_gen.close()

@router.get("/{proyecto_slug}/jobs/{job_id}/archivos")
def get_job_archivos(
    proyecto_slug: str,
    job_id: int,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Obtiene el manifiesto de archivos de un job.
    """
    # Verificar acceso
    proyecto = check_project_access(proyecto_slug, current_user, db_global)

    job = db_global.query(EmisionJob).filter(
        EmisionJob.id == job_id,
        EmisionJob.id_proyecto == proyecto.id
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    # Obtener directorio del job
    from app.core.config import settings
    job_dir = _get_job_directory(proyecto_slug, job_id, Path(settings.EMISIONES_PATH))

    manifest = _obtener_manifiesto_job(job_dir)

    return {
        "success": True,
        "job_id": job_id,
        "proyecto_slug": proyecto_slug,
        "manifest": manifest,
        "job_info": {
            "nombre_job": job.nombre_job,
            "status": job.status,
            "total_registros": job.total_registros,
            "procesados": job.procesados,
            "created_at": job.created_at,
            "completed_at": job.completed_at
        }
    }

@router.post("/{proyecto_slug}/jobs/{job_id}/archivos/limpiar")
def limpiar_archivos_job(
    proyecto_slug: str,
    job_id: int,
    confirmar: bool = Query(False, description="Confirmar eliminación"),
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Elimina los archivos generados por un job.
    Solo permite eliminar si está completado.
    """
    # Verificar acceso
    proyecto = check_project_access(proyecto_slug, current_user, db_global)

    job = db_global.query(EmisionJob).filter(
        EmisionJob.id == job_id,
        EmisionJob.id_proyecto == proyecto.id
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    # Verificar estado
    if job.status not in ['completed', 'failed', 'cancelled']:
        raise HTTPException(
            status_code=400,
            detail=f"No se pueden eliminar archivos de un job en estado '{job.status}'"
        )

    if not confirmar:
        raise HTTPException(
            status_code=400,
            detail="Confirmar eliminación con ?confirmar=true"
        )

    # Obtener directorio
    from app.core.config import settings
    job_dir = _get_job_directory(proyecto_slug, job_id, Path(settings.EMISIONES_PATH))

    if not job_dir.exists():
        return {
            "success": True,
            "mensaje": "El directorio del job no existe"
        }

    # Contar archivos antes de eliminar
    pdf_files = list(job_dir.glob("*.pdf"))
    total_archivos = len(pdf_files)
    tamaño_total = sum(f.stat().st_size for f in pdf_files) / 1024  # KB

    # Eliminar directorio
    try:
        shutil.rmtree(job_dir)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error eliminando archivos: {e}")

    # Registrar log
    registrar_log(
        db_global,
        current_user.id,
        "limpiar_archivos_job",
        f"Archivos del job {job_id} eliminados: {total_archivos} archivos, {round(tamaño_total, 2)} KB",
        proyecto.id
    )

    return {
        "success": True,
        "job_id": job_id,
        "archivos_eliminados": total_archivos,
        "espacio_liberado_kb": round(tamaño_total, 2),
        "mensaje": f"Eliminados {total_archivos} archivos"
    }