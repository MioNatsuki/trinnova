# backend/app/api/analisis.py
"""
Módulo de Análisis — Fase 3
Endpoints:
  POST  /{slug}/cargar-padron          — sube CSV/Excel, detecta columnas, inserta en tabla_padron
  GET   /{slug}/complementar           — tabla paginada padron + complementaria
  POST  /{slug}/guardar-complemento    — guarda ediciones y reconstruye tabla_analisis
  GET   /{slug}/analisis               — tabla_analisis con filtros de viabilidad
  POST  /{slug}/acciones-manuales      — marcar viable/no_viable/pagada/nd en lote
  POST  /{slug}/limpieza/normalizar-calles  — regex via Python sobre tabla_analisis
  POST  /{slug}/limpieza/limpiar-espacios   — trim y espacios dobles
  GET   /{slug}/versiones              — historial de versiones de padrón cargadas
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import pandas as pd
import io
import re
import unicodedata
from datetime import datetime

from app.db.session import get_global_db
from app.core.dependencies import get_current_active_user, check_project_access
from app.models.global_models import Usuario, PadronVersion
from app.db.router import get_project_db
from app.services.log_service import registrar_log
from pydantic import BaseModel

router = APIRouter()

# ---------------------------------------------------------------------------
# Schemas de respuesta / request
# ---------------------------------------------------------------------------

class CargaPadronResponse(BaseModel):
    success: bool
    message: str
    total_registros: int = 0
    columnas_csv: List[str] = []
    columnas_bd: List[str] = []
    preview: List[Dict] = []
    version_id: Optional[int] = None
    errores: List[str] = []


class FilaComplementar(BaseModel):
    pk_value: Any
    campos_complementarios: Dict[str, Any]


class AccionManualRequest(BaseModel):
    ids: List[Any]
    accion: str          # viable | no_viable | quitar_pagada | quitar_nd
    valor: Optional[str] = None


# ---------------------------------------------------------------------------
# Metadata por proyecto: pk, columnas de padrón y complementaria
# ---------------------------------------------------------------------------

_INFO: Dict[str, Dict] = {
    "apa_tlajomulco": {
        "pk": "clave_APA",
        "pk_type": "int",
        "col_nombre": ["propietario"],
        "col_calle":  ["calle"],
        "col_adeudo": ["saldo"],
        "columnas_padron": [
            "despacho","clave_APA","propietario","calle","exterior","interior",
            "poblacion","localidad","tipo_servicio","tipo_tarifa","adeudo_agua",
            "adeudo_colectores","adeudo_infraestructura","actualizacion","conexion",
            "c_drenaje","descuento","recargos","descuentos_recargos","multa",
            "gastos","saldo","periodo_desde","periodo_hasta","recaudadora",
            "tipo_predio","cuenta","recamaras","banos","medidor","id_convenio",
            "cobros_a_considerar","lectura_real","fecha_lectura","autosuficiente","baldio",
        ],
        "columnas_complementaria": ["multa_virtual","axoini","mesini","axofin","mesfin","ultimo_req","ejecutor","etiqueta"],
    },
    "predial_tlajomulco": {
        "pk": "cuenta",
        "pk_type": "int",
        "col_nombre": ["domicilio"],
        "col_calle":  ["domicilio"],
        "col_adeudo": ["saldo"],
        "columnas_padron": [
            "control_req","axo_req","folio_req","cve_cuenta","cuenta","cve_catastral",
            "domicilio","no_ext","no_int","estado","municipio","poblacion","ubicacion",
            "ubic_no_ext","ubic_no_int","ubic_colonia","calle_encontrado","no_ext_3",
            "no_int_3","colonia_3","axo_desde","bim_desde","axo_hasta","bim_hasta",
            "impuesto","recargos","total_multas","total_gastos","saldo",
            "gastos_requerimiento","actualizacion","exento","tasa","valor_fiscal",
            "terreno","construccion","blqcat","blqapre","zona","subzona",
        ],
        "columnas_complementaria": ["manzana","recaudadora","tipo","programa"],
    },
    "licencias_gdl": {
        "pk": "licencia",
        "pk_type": "int",
        "col_nombre": ["propietario"],
        "col_calle":  ["ubicacion"],
        "col_adeudo": ["total"],
        "columnas_padron": [
            "cvereq","axoreq","folioreq","cveproceso","fecemi","recaud","id_licencia",
            "licencia","propietario","ubicacion","numext_ubic","letraext_ubic",
            "numint_ubic","letraint_ubic","colonia_ubic","zona","subzona","descripcion",
            "actividad","axoini","axofin","formas","derechos","recargos","multas",
            "anuncios","holograma","solicitud","fverdederecho","fverdeanuncio",
            "actualizacion","gastos","total","cveejecut","ncompleto",
        ],
        "columnas_complementaria": ["tipo_propietario","viable_domicilio"],
    },
    "predial_gdl": {
        "pk": "cuenta_n",
        "pk_type": "str",
        "col_nombre": ["propietariotitular_n"],
        "col_calle":  ["calle"],
        "col_adeudo": ["saldo2025"],
        "columnas_padron": [
            "despacho","cuenta_n","estatus_n","clavecatastral","subpredio","infonavit",
            "propietariotitular_n","calle","num_exterior","num_interior","colonia",
            "incp","gastos","multas","saldomulta","saldo2025","axo","bimestre",
            "ultimoRequerimiento","valor_fiscal","tasa_n","terreno","construccion",
            "biqcat","biqapre","zona","subzona",
        ],
        "columnas_complementaria": ["predial_total","gastos_totales","total_adeudo","recaudadora","firma"],
    },
    "estado": {
        "pk": "credito",
        "pk_type": "str",
        "col_nombre": ["nombre_razon_social"],
        "col_calle":  ["calle_numero"],
        "col_adeudo": ["importe_historico_determinado"],
        "columnas_padron": [
            "id","rfc","credito","nombre_razon_social","calle_numero","colonia","cp",
            "municipio","coordinadora","area_asignacion","autoridad_determinante",
            "fecha_recepcion","expediente_procedencia","fecha_documento_determinante",
            "importe_historico_determinado","concepto","fecha_notificacion","exigible",
            "tipo_credito","tipo_cartera",
        ],
        "columnas_complementaria": ["tipo_tipo","firma","cargo"],
    },
    "pensiones": {
        "pk": "prestamo",
        "pk_type": "int",
        "col_nombre": ["nombre"],
        "col_calle":  ["afiliado_calle"],
        "col_adeudo": ["adeudo"],
        "columnas_padron": [
            "afiliado","nombre","rfc","tipo_prestamo","prestamo","saldo_por_vencer",
            "adeudo","liquidacion","moratorio","ultimo_abono","sub_estatus","estatus",
            "dependencia","fecha_alta","ultima_aportacion","afiliado_calle",
            "afiliado_exterior","afiliado_interior","afiliado_cruza","afiliado_cruza_2",
            "afiliado_colonia","afiliado_poblacion","afiliado_municipio","afiliado_cp",
            "afiliado_lada","afiliado_telefono","afiliado_celular","aval_codigo",
            "aval_nombre","aval_calle","aval_exterior","aval_interior","aval_cruza",
            "aval_cruza_2","aval_colonia","aval_poblacion","aval_municipio","aval_cp",
            "aval_lada","aval_telefono","aval_celular","garantia_direccion",
            "garantia_colonia","garantia_calles_cruces","garantia_poblacion",
            "garantia_municipio",
        ],
        "columnas_complementaria": ["num_convenio","estatus_prestamo","juzgado","expediente"],
    },
}

# Alias de columnas: nombre_en_csv -> nombre_en_bd (para cada proyecto)
_COL_ALIAS: Dict[str, Dict[str, str]] = {
    "pensiones": {
        "subestatus":         "sub_estatus",
        "alta":               "fecha_alta",
        "afiliado_cruza1":    "afiliado_cruza",
        "afiliado_cruza2":    "afiliado_cruza_2",
        "aval":               "aval_nombre",
        "aval_cruza1":        "aval_cruza",
        "aval_cruza2":        "aval_cruza_2",
        "garantia_calles_cruza": "garantia_calles_cruces",
    }
}


def _info(slug: str) -> Dict:
    if slug not in _INFO:
        raise HTTPException(status_code=400, detail=f"Proyecto desconocido: {slug}")
    return _INFO[slug]


def _normalizar_col(nombre: str) -> str:
    """Quita tildes, minúsculas, reemplaza espacios por _"""
    txt = unicodedata.normalize("NFKD", nombre).encode("ASCII", "ignore").decode()
    return re.sub(r"\s+", "_", txt.lower().strip())


def _mapear_columnas(slug: str, df_cols: List[str]) -> Dict[str, str]:
    """
    Devuelve {col_csv_normalizada: col_bd} para las columnas reconocidas.
    Usa coincidencia exacta primero, luego alias por proyecto, luego parcial.
    """
    info = _info(slug)
    cols_bd = info["columnas_padron"]
    alias = _COL_ALIAS.get(slug, {})

    # Índice de BD normalizada -> nombre real
    bd_idx = {_normalizar_col(c): c for c in cols_bd}

    mapeo: Dict[str, str] = {}
    for csv_col in df_cols:
        norm = _normalizar_col(csv_col)
        # 1. Exacto
        if norm in bd_idx:
            mapeo[csv_col] = bd_idx[norm]
            continue
        # 2. Alias explícito del proyecto
        if norm in alias:
            mapeo[csv_col] = alias[norm]
            continue
        # 3. Parcial (uno contiene al otro)
        for bd_norm, bd_real in bd_idx.items():
            if bd_norm in norm or norm in bd_norm:
                mapeo[csv_col] = bd_real
                break

    return mapeo


def _siguiente_version(db_global: Session, proyecto_id: int) -> int:
    ultima = (
        db_global.query(PadronVersion)
        .filter(PadronVersion.id_proyecto == proyecto_id)
        .order_by(PadronVersion.version.desc())
        .first()
    )
    return (ultima.version + 1) if ultima else 1


def _safe_value(val: Any) -> Any:
    """Convierte NaN, NaT y Timestamp a tipos Python seguros para SQLAlchemy."""
    if val is None:
        return None
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(val, pd.Timestamp):
        return val.to_pydatetime()
    return val


# ---------------------------------------------------------------------------
# CARGAR PADRÓN
# ---------------------------------------------------------------------------

@router.post("/{proyecto_slug}/cargar-padron", response_model=CargaPadronResponse)
async def cargar_padron(
    proyecto_slug: str,
    file: UploadFile = File(...),
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    from sqlalchemy import text

    if not file.filename.lower().endswith((".csv", ".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Formato no soportado. Usa CSV o Excel.")

    proyecto = check_project_access(proyecto_slug, current_user, db_global)
    info = _info(proyecto_slug)
    pk = info["pk"]
    errores: List[str] = []

    # --- Leer archivo ---
    contents = await file.read()
    try:
        if file.filename.lower().endswith(".csv"):
            # Detectar separador y encoding
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

    # Normalizar nombres de columna del CSV (quitar espacios extras, sin lowercase aún para display)
    df.columns = [c.strip() for c in df.columns]
    columnas_csv = list(df.columns)

    # Mapear CSV -> BD
    mapeo = _mapear_columnas(proyecto_slug, columnas_csv)
    # Columnas de BD que se van a insertar
    columnas_bd_detectadas = list(set(mapeo.values()))

    # Renombrar el DataFrame según el mapeo (solo columnas mapeadas)
    df_mapped = df[[c for c in df.columns if c in mapeo]].rename(columns=mapeo)
    # Eliminar columnas duplicadas si el mapeo produce dos CSV → misma BD col
    df_mapped = df_mapped.loc[:, ~df_mapped.columns.duplicated()]

    if pk not in df_mapped.columns:
        raise HTTPException(
            status_code=400,
            detail=f"No se encontró la columna primaria '{pk}' en el archivo. "
                   f"Columnas detectadas: {columnas_csv[:15]}",
        )

    db_proyecto = next(get_project_db(proyecto_slug))
    insertados = 0
    actualizados = 0

    registros = df_mapped.to_dict("records")

    for idx, registro in enumerate(registros):
        try:
            # Limpiar valores
            limpio: Dict[str, Any] = {}
            for k, v in registro.items():
                limpio[k] = _safe_value(v)

            pk_val = limpio.get(pk)
            if pk_val is None:
                errores.append(f"Fila {idx + 2}: sin valor en columna '{pk}', se omite.")
                continue

            # Convertir pk al tipo correcto
            if info["pk_type"] == "int":
                try:
                    pk_val = int(pk_val)
                    limpio[pk] = pk_val
                except (ValueError, TypeError):
                    errores.append(f"Fila {idx + 2}: '{pk}' = '{pk_val}' no es entero.")
                    continue

            # UPSERT manual
            existe = db_proyecto.execute(
                text(f"SELECT 1 FROM tabla_padron WHERE `{pk}` = :pk_val LIMIT 1"),
                {"pk_val": pk_val},
            ).first()

            if existe:
                set_parts = [f"`{k}` = :{k}" for k in limpio if k != pk]
                if set_parts:
                    db_proyecto.execute(
                        text(f"UPDATE tabla_padron SET {', '.join(set_parts)} WHERE `{pk}` = :pk_val"),
                        {**limpio, "pk_val": pk_val},
                    )
                    actualizados += 1
            else:
                cols_str  = ", ".join(f"`{k}`" for k in limpio)
                vals_str  = ", ".join(f":{k}" for k in limpio)
                db_proyecto.execute(
                    text(f"INSERT INTO tabla_padron ({cols_str}) VALUES ({vals_str})"),
                    limpio,
                )
                insertados += 1

            if (insertados + actualizados) % 200 == 0:
                db_proyecto.commit()

        except Exception as e:
            errores.append(f"Fila {idx + 2}: {str(e)[:120]}")
            if len(errores) >= 30:
                errores.append("Se alcanzó el límite de 30 errores, se detuvo la importación.")
                break

    db_proyecto.commit()

    # --- Versionado ---
    version_id = None
    total = insertados + actualizados
    if total > 0:
        version = PadronVersion(
            id_proyecto=proyecto.id,
            version=_siguiente_version(db_global, proyecto.id),
            ruta_snapshot="",
            total_registros=total,
            archivo_nombre=file.filename,
            cargado_por=current_user.id,
        )
        db_global.add(version)
        db_global.commit()
        version_id = version.id

    registrar_log(
        db_global,
        current_user.id,
        "cargar_padron",
        f"Padrón {proyecto_slug}: {insertados} nuevos, {actualizados} actualizados. Archivo: {file.filename}",
        proyecto.id,
    )

    # Preview — primeras 5 filas del DataFrame mapeado (solo cols mapeadas)
    preview_cols = list(df_mapped.columns[:10])
    preview = [
        {k: str(v) if v is not None and not (isinstance(v, float) and pd.isna(v)) else ""
         for k, v in row.items() if k in preview_cols}
        for row in registros[:5]
    ]

    return CargaPadronResponse(
        success=total > 0,
        message=f"{insertados} registros nuevos, {actualizados} actualizados de {len(registros)} en el archivo.",
        total_registros=total,
        columnas_csv=columnas_csv,
        columnas_bd=columnas_bd_detectadas,
        preview=preview,
        version_id=version_id,
        errores=errores[:30],
    )


# ---------------------------------------------------------------------------
# COMPLEMENTAR — GET
# ---------------------------------------------------------------------------

@router.get("/{proyecto_slug}/complementar")
def get_complementar(
    proyecto_slug: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    from sqlalchemy import text

    check_project_access(proyecto_slug, current_user, db_global)
    info = _info(proyecto_slug)
    pk = info["pk"]

    # Columnas de texto en las que buscar (las que existen en cada proyecto)
    search_cols = info["col_nombre"] + info["col_calle"] + [pk]
    search_cols = list(dict.fromkeys(search_cols))  # deduplica manteniendo orden

    search_cond = ""
    params: Dict[str, Any] = {}
    if search:
        parts = [f"CAST(p.`{c}` AS CHAR) LIKE :search" for c in search_cols]
        search_cond = " AND (" + " OR ".join(parts) + ")"
        params["search"] = f"%{search}%"

    db_proyecto = next(get_project_db(proyecto_slug))

    total_row = db_proyecto.execute(
        text(f"SELECT COUNT(*) AS total FROM tabla_padron p WHERE 1=1 {search_cond}"),
        params,
    ).first()
    total = total_row.total if total_row else 0

    offset = (page - 1) * limit
    rows = db_proyecto.execute(
        text(f"""
            SELECT p.*, c.*
            FROM tabla_padron p
            LEFT JOIN tabla_complementaria c ON p.`{pk}` = c.`{pk}`
            WHERE 1=1 {search_cond}
            ORDER BY p.`{pk}`
            LIMIT {limit} OFFSET {offset}
        """),
        params,
    ).fetchall()

    result = [dict(r._mapping) for r in rows]

    return {
        "rows":              result,
        "columnas_editables": info["columnas_complementaria"],
        "total":             total,
        "page":              page,
        "limit":             limit,
        "pk":                pk,
    }


# ---------------------------------------------------------------------------
# COMPLEMENTAR — POST (guarda + reconstruye tabla_analisis)
# ---------------------------------------------------------------------------

@router.post("/{proyecto_slug}/guardar-complemento")
def guardar_complemento(
    proyecto_slug: str,
    datos: List[FilaComplementar],
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    from sqlalchemy import text

    proyecto = check_project_access(proyecto_slug, current_user, db_global)
    info = _info(proyecto_slug)
    pk = info["pk"]

    db_proyecto = next(get_project_db(proyecto_slug))
    guardados = 0

    for fila in datos:
        pk_val = fila.pk_value
        campos = {k: v for k, v in fila.campos_complementarios.items() if v is not None and v != ""}

        # UPSERT en tabla_complementaria
        existe = db_proyecto.execute(
            text(f"SELECT 1 FROM tabla_complementaria WHERE `{pk}` = :pk_val LIMIT 1"),
            {"pk_val": pk_val},
        ).first()

        if existe:
            if campos:
                set_parts = [f"`{k}` = :{k}" for k in campos]
                db_proyecto.execute(
                    text(f"UPDATE tabla_complementaria SET {', '.join(set_parts)} WHERE `{pk}` = :pk_val"),
                    {**campos, "pk_val": pk_val},
                )
        else:
            all_fields = {pk: pk_val, **campos}
            cols_str = ", ".join(f"`{k}`" for k in all_fields)
            vals_str = ", ".join(f":{k}" for k in all_fields)
            db_proyecto.execute(
                text(f"INSERT INTO tabla_complementaria ({cols_str}) VALUES ({vals_str})"),
                all_fields,
            )

        # Reconstruir tabla_analisis para esta fila: DELETE + INSERT SELECT JOIN
        db_proyecto.execute(
            text(f"DELETE FROM tabla_analisis WHERE `{pk}` = :pk_val"),
            {"pk_val": pk_val},
        )
        db_proyecto.execute(
            text(f"""
                INSERT INTO tabla_analisis
                SELECT p.*, c.*
                FROM tabla_padron p
                LEFT JOIN tabla_complementaria c ON p.`{pk}` = c.`{pk}`
                WHERE p.`{pk}` = :pk_val
            """),
            {"pk_val": pk_val},
        )
        guardados += 1

    db_proyecto.commit()

    registrar_log(
        db_global,
        current_user.id,
        "guardar_complemento",
        f"Complemento guardado: {guardados} registros en {proyecto_slug}",
        proyecto.id,
    )

    return {"success": True, "message": f"Guardados y sincronizados {guardados} registros."}


# ---------------------------------------------------------------------------
# ANALISIS — GET (tabla_analisis con filtros)
# ---------------------------------------------------------------------------

@router.get("/{proyecto_slug}/analisis")
def get_analisis(
    proyecto_slug: str,
    viabilidad: Optional[str] = Query(None),
    busqueda: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    from sqlalchemy import text

    check_project_access(proyecto_slug, current_user, db_global)
    info = _info(proyecto_slug)
    pk = info["pk"]

    conditions = []
    params: Dict[str, Any] = {}

    if viabilidad and viabilidad in ("viable", "no_viable", "pendiente"):
        conditions.append("viabilidad = :viabilidad")
        params["viabilidad"] = viabilidad

    if busqueda:
        search_cols = info["col_nombre"] + info["col_calle"] + [pk]
        search_cols = list(dict.fromkeys(search_cols))
        parts = [f"CAST(`{c}` AS CHAR) LIKE :busqueda" for c in search_cols]
        conditions.append("(" + " OR ".join(parts) + ")")
        params["busqueda"] = f"%{busqueda}%"

    where = " AND ".join(conditions) if conditions else "1=1"

    db_proyecto = next(get_project_db(proyecto_slug))

    total = db_proyecto.execute(
        text(f"SELECT COUNT(*) AS total FROM tabla_analisis WHERE {where}"), params
    ).first().total

    offset = (page - 1) * limit
    rows = db_proyecto.execute(
        text(f"SELECT * FROM tabla_analisis WHERE {where} ORDER BY `{pk}` LIMIT {limit} OFFSET {offset}"),
        params,
    ).fetchall()

    # Campos de adeudo según proyecto
    adeudo_cols = info["col_adeudo"]

    result = []
    for r in rows:
        row_dict = dict(r._mapping)
        # Campo unificado adeudo_display para la UI
        adeudo_val = 0
        for col in adeudo_cols:
            v = row_dict.get(col)
            if v is not None:
                try:
                    adeudo_val = float(v)
                    break
                except (TypeError, ValueError):
                    pass
        row_dict["_adeudo_display"] = adeudo_val
        # Campo unificado nombre
        nombre_val = ""
        for col in info["col_nombre"]:
            v = row_dict.get(col)
            if v:
                nombre_val = str(v)
                break
        row_dict["_nombre_display"] = nombre_val
        # Campo unificado calle
        calle_val = ""
        for col in info["col_calle"]:
            v = row_dict.get(col)
            if v:
                calle_val = str(v)
                break
        row_dict["_calle_display"] = calle_val
        result.append(row_dict)

    return {
        "rows":  result,
        "total": total,
        "page":  page,
        "limit": limit,
        "pk":    pk,
    }


# ---------------------------------------------------------------------------
# ACCIONES MANUALES (viable / no_viable / quitar_pagada / quitar_nd)
# ---------------------------------------------------------------------------

@router.post("/{proyecto_slug}/acciones-manuales")
def acciones_manuales(
    proyecto_slug: str,
    request: AccionManualRequest,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    from sqlalchemy import text

    proyecto = check_project_access(proyecto_slug, current_user, db_global)
    info = _info(proyecto_slug)
    pk = info["pk"]

    if not request.ids:
        raise HTTPException(status_code=400, detail="No se enviaron IDs.")

    db_proyecto = next(get_project_db(proyecto_slug))

    # Construir IN clause con parámetros nombrados
    ph = {f"id{i}": v for i, v in enumerate(request.ids)}
    in_clause = ", ".join(f":id{i}" for i in range(len(request.ids)))

    accion = request.accion
    if accion == "viable":
        db_proyecto.execute(
            text(f"UPDATE tabla_analisis SET viabilidad = 'viable' WHERE `{pk}` IN ({in_clause})"), ph
        )
        msg = f"{len(request.ids)} registros marcados como Viables"

    elif accion == "no_viable":
        db_proyecto.execute(
            text(f"UPDATE tabla_analisis SET viabilidad = 'no_viable' WHERE `{pk}` IN ({in_clause})"), ph
        )
        msg = f"{len(request.ids)} registros marcados como No Viables"

    elif accion == "quitar_pagada":
        db_proyecto.execute(
            text(f"UPDATE tabla_analisis SET pagada = 1, viabilidad = 'no_viable' WHERE `{pk}` IN ({in_clause})"), ph
        )
        msg = f"{len(request.ids)} registros marcados como Pagados"

    elif accion == "quitar_nd":
        motivo = request.valor or "ND"
        ph["motivo_nd"] = motivo
        db_proyecto.execute(
            text(f"UPDATE tabla_analisis SET nd = :motivo_nd, viabilidad = 'no_viable' WHERE `{pk}` IN ({in_clause})"), ph
        )
        msg = f"{len(request.ids)} registros marcados como No Deudores ({motivo})"

    else:
        raise HTTPException(status_code=400, detail=f"Acción '{accion}' no reconocida.")

    db_proyecto.commit()

    registrar_log(db_global, current_user.id, f"accion_{accion}", msg, proyecto.id)
    return {"success": True, "message": msg}


# ---------------------------------------------------------------------------
# LIMPIEZA — Normalizar calles (Python regex, no MySQL REPLACE con regex)
# ---------------------------------------------------------------------------

_REGLAS_CALLES = [
    (r"\bAv\.?\b",          "Avenida"),
    (r"\bBlvd\.?\b",        "Boulevard"),
    (r"\bBlvrd\.?\b",       "Boulevard"),
    (r"\bProlong\.?\b",     "Prolongación"),
    (r"\bProle\.?\b",       "Prolongación"),
    (r"\bPriv\.?\b",        "Privada"),
    (r"\bFracc\.?\b",       "Fraccionamiento"),
    (r"\bCol\.?\b",         "Colonia"),
    (r"\bMz\.?\b",          "Manzana"),
    (r"\bLt\.?\b",          "Lote"),
    (r"\bCda\.?\b",         "Cerrada"),
    (r"\bClle\.?\b",        "Calle"),
    (r"\bAndador\b",        "Andador"),
    (r"\bCallejon\b",       "Callejón"),
    # Abreviaturas de Guadalupe
    (r"\bGpe\.?\b",         "Guadalupe"),
    # Dobles espacios
    (r" {2,}",              " "),
]

_COMPILED_REGLAS = [(re.compile(pat, re.IGNORECASE), repl) for pat, repl in _REGLAS_CALLES]


def _aplicar_regex_calles(texto: str) -> str:
    if not texto:
        return texto
    for patron, reemplazo in _COMPILED_REGLAS:
        texto = patron.sub(reemplazo, texto)
    return texto.strip()


@router.post("/{proyecto_slug}/limpieza/normalizar-calles")
def normalizar_calles(
    proyecto_slug: str,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    from sqlalchemy import text

    proyecto = check_project_access(proyecto_slug, current_user, db_global)
    info = _info(proyecto_slug)
    pk = info["pk"]
    # Columnas de calle en tabla_analisis para este proyecto
    cols_calle_bd = info["col_calle"]
    # También intentamos columnas genéricas si existen
    extra_cols = ["calle", "domicilio", "ubicacion", "calle_numero"]
    all_calle_cols = list(dict.fromkeys(cols_calle_bd + extra_cols))

    db_proyecto = next(get_project_db(proyecto_slug))

    # Obtener columnas reales de tabla_analisis para no usar cols inexistentes
    cols_result = db_proyecto.execute(text("SHOW COLUMNS FROM tabla_analisis")).fetchall()
    cols_existentes = {row[0] for row in cols_result}

    cols_a_procesar = [c for c in all_calle_cols if c in cols_existentes]

    if not cols_a_procesar:
        return {"success": True, "message": "No se encontraron columnas de calle para normalizar."}

    # Traer todos los registros (pk + cols de calle)
    sel_cols = ", ".join(f"`{c}`" for c in [pk] + cols_a_procesar)
    filas = db_proyecto.execute(text(f"SELECT {sel_cols} FROM tabla_analisis")).fetchall()

    actualizados = 0
    for fila in filas:
        row = dict(fila._mapping)
        pk_val = row[pk]
        cambios: Dict[str, str] = {}
        for col in cols_a_procesar:
            original = row.get(col) or ""
            normalizado = _aplicar_regex_calles(str(original))
            if normalizado != original:
                cambios[col] = normalizado

        if cambios:
            set_parts = [f"`{k}` = :{k}" for k in cambios]
            db_proyecto.execute(
                text(f"UPDATE tabla_analisis SET {', '.join(set_parts)} WHERE `{pk}` = :pk_val"),
                {**cambios, "pk_val": pk_val},
            )
            actualizados += 1

    db_proyecto.commit()

    registrar_log(db_global, current_user.id, "normalizar_calles",
                  f"Normalizadas calles en {actualizados} filas de {proyecto_slug}", proyecto.id)
    return {"success": True, "message": f"Calles normalizadas: {actualizados} registros actualizados."}


# ---------------------------------------------------------------------------
# LIMPIEZA — Limpiar espacios dobles y trim
# ---------------------------------------------------------------------------

@router.post("/{proyecto_slug}/limpieza/limpiar-espacios")
def limpiar_espacios(
    proyecto_slug: str,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    from sqlalchemy import text

    proyecto = check_project_access(proyecto_slug, current_user, db_global)
    info = _info(proyecto_slug)
    pk = info["pk"]

    db_proyecto = next(get_project_db(proyecto_slug))

    # Columnas de texto candidatas
    cols_result = db_proyecto.execute(text("SHOW COLUMNS FROM tabla_analisis")).fetchall()
    cols_texto = [
        row[0] for row in cols_result
        if row[1].upper() in ("LONGTEXT", "TEXT", "MEDIUMTEXT", "VARCHAR(255)", "VARCHAR(150)", "VARCHAR(100)")
        or "VARCHAR" in str(row[1]).upper()
        or "TEXT" in str(row[1]).upper()
    ]

    actualizados = 0
    # Usamos MySQL TRIM + REGEXP_REPLACE (disponible desde MySQL 8)
    # Si el servidor es MySQL 5.7, caemos al fallback Python
    for col in cols_texto[:20]:  # límite razonable
        try:
            result = db_proyecto.execute(text(f"""
                UPDATE tabla_analisis
                SET `{col}` = TRIM(REGEXP_REPLACE(`{col}`, '[ ]{{2,}}', ' '))
                WHERE `{col}` IS NOT NULL AND `{col}` LIKE '%  %'
            """))
            actualizados += result.rowcount
        except Exception:
            # Fallback para MySQL 5.7 (sin REGEXP_REPLACE)
            try:
                result = db_proyecto.execute(text(f"""
                    UPDATE tabla_analisis
                    SET `{col}` = TRIM(`{col}`)
                    WHERE `{col}` IS NOT NULL
                """))
                actualizados += result.rowcount
            except Exception:
                pass

    db_proyecto.commit()

    registrar_log(db_global, current_user.id, "limpiar_espacios",
                  f"Espacios limpiados en {proyecto_slug}: {actualizados} celdas", proyecto.id)
    return {"success": True, "message": f"Espacios limpiados: {actualizados} celdas actualizadas."}


# ---------------------------------------------------------------------------
# VERSIONES DEL PADRÓN
# ---------------------------------------------------------------------------

@router.get("/{proyecto_slug}/versiones")
def get_versiones(
    proyecto_slug: str,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    proyecto = check_project_access(proyecto_slug, current_user, db_global)

    versiones = (
        db_global.query(PadronVersion)
        .filter(PadronVersion.id_proyecto == proyecto.id)
        .order_by(PadronVersion.version.desc())
        .all()
    )

    return [
        {
            "id":              v.id,
            "version":         v.version,
            "total_registros": v.total_registros,
            "archivo_nombre":  v.archivo_nombre,
            "cargado_por":     v.cargado_por,
            "created_at":      v.created_at.isoformat() if v.created_at else None,
        }
        for v in versiones
    ]


# ---------------------------------------------------------------------------
# ESTADÍSTICAS RÁPIDAS para el módulo de análisis
# ---------------------------------------------------------------------------

@router.get("/{proyecto_slug}/estadisticas")
def get_estadisticas(
    proyecto_slug: str,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    from sqlalchemy import text

    check_project_access(proyecto_slug, current_user, db_global)
    db_proyecto = next(get_project_db(proyecto_slug))

    def count(tabla: str) -> int:
        try:
            return db_proyecto.execute(text(f"SELECT COUNT(*) AS c FROM {tabla}")).first().c
        except Exception:
            return 0

    def count_viabilidad(valor: str) -> int:
        try:
            return db_proyecto.execute(
                text("SELECT COUNT(*) AS c FROM tabla_analisis WHERE viabilidad = :v"),
                {"v": valor},
            ).first().c
        except Exception:
            return 0

    return {
        "padron":     count("tabla_padron"),
        "analisis":   count("tabla_analisis"),
        "viable":     count_viabilidad("viable"),
        "no_viable":  count_viabilidad("no_viable"),
        "pendiente":  count_viabilidad("pendiente"),
    }