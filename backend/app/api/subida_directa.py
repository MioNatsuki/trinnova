# backend/app/api/subida_directa.py
"""
Módulo Subida Directa
=====================
Permite al usuario subir un Excel/CSV ya listo para impresión y omitir
todo el flujo de Análisis (padrón → complementaria → análisis).

Crea una tabla ad-hoc `tabla_temporal_subida_directa` por proyecto,
que se dropea y recrea en cada subida.

El resto del flujo (Cálculos, Preparación, Emisión) reutiliza las
tablas originales (tabla_dinamica, tabla_temporal, tabla_historica);
solo cambia el origen de lectura mediante el parámetro `origen`.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any, Optional
import pandas as pd
import io
import re
import unicodedata
import logging
from datetime import datetime
from pydantic import BaseModel, Field

from app.db.session import get_global_db
from app.core.dependencies import get_current_active_user, check_project_access
from app.models.global_models import Usuario, Plantilla, PlantillaCampo
from app.db.router import get_project_db
from app.services.log_service import registrar_log
from app.api.analisis import (
    _info,
    _normalizar_col,
    _parse_fecha,
    _safe_value_v2,
    _DATE_COLS,
    _aplicar_regex_calles,
)
from app.api.emision import _get_columnas_tipos, _get_columnas_tabla

logger = logging.getLogger(__name__)
router = APIRouter()

TABLA_SD = "tabla_temporal_subida_directa"
TABLA_SD_ERR = "tabla_temporal_subida_directa_errores"

# ============================================================
# SCHEMAS
# ============================================================

class PreviewResponse(BaseModel):
    success: bool
    columnas_archivo: List[str]
    mapeo_propuesto: Dict[str, str]
    columnas_sin_mapear: List[str]
    columnas_destino_disponibles: List[str]
    placeholders_plantilla: List[str]
    preview_filas: List[Dict[str, Any]]
    total_filas: int

class CrearTemporalRequest(BaseModel):
    mapeo: Dict[str, str]  # col_archivo -> col_destino | "__nueva__"
    nombre_job: Optional[str] = None

class ActualizarInlineRequest(BaseModel):
    cambios: List[Dict[str, Any]]  # [{pk_value, campos}]

class LimpiezaRequest(BaseModel):
    accion: str  # "espacios" | "calles"

# ============================================================
# HELPERS
# ============================================================

def _leer_archivo(contents: bytes, filename: str) -> pd.DataFrame:
    """Lee CSV o Excel y devuelve DataFrame."""
    try:
        if filename.lower().endswith(".csv"):
            try:
                return pd.read_csv(io.BytesIO(contents), encoding="utf-8-sig",
                                   sep=None, engine="python")
            except UnicodeDecodeError:
                return pd.read_csv(io.BytesIO(contents), encoding="latin-1",
                                   sep=None, engine="python")
        return pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(400, f"No se pudo leer el archivo: {e}")


def _columnas_esperadas_proyecto(proyecto_slug: str) -> List[str]:
    """
    Columnas que `calcular-todas` necesita para no fallar en cada proyecto.
    Se devuelven como sugerencias al usuario en el paso de mapeo.
    """
    info = _info(proyecto_slug)
    base = [info["pk"]] + info["col_nombre"] + info["col_adeudo"]
    if proyecto_slug == "estado":
        base += ["fecha_notificacion", "importe_historico_determinado",
                 "nombre_razon_social", "calle_numero", "colonia",
                 "codigo_postal", "municipio", "rfc"]
    elif proyecto_slug == "pensiones":
        base += ["ultimo_abono", "programa", "adeudo", "liquidacion",
                 "saldo_por_vencer", "moratorio"]
    return list(dict.fromkeys([c for c in base if c]))


def _propuesta_mapeo(
    proyecto_slug: str,
    columnas_archivo: List[str],
    destinos: List[str],
) -> Dict[str, str]:
    """Propone mapeo automático usando normalización + alias."""
    from app.api.analisis import _COL_ALIAS
    alias = _COL_ALIAS.get(proyecto_slug, {})
    dest_idx = {_normalizar_col(c): c for c in destinos}

    mapeo: Dict[str, str] = {}
    for col in columnas_archivo:
        norm = _normalizar_col(col)
        if norm in dest_idx:
            mapeo[col] = dest_idx[norm]
            continue
        if norm in alias:
            mapeo[col] = alias[norm]
            continue
        # match parcial
        matched = None
        best = 0
        for dnorm, dreal in dest_idx.items():
            if dnorm in norm or norm in dnorm:
                ml = max(len(dnorm), len(norm))
                if ml > best:
                    best = ml
                    matched = dreal
        if matched:
            mapeo[col] = matched
    return mapeo

def _coercionar_valor(v, tipo_sql: str, col_name: str, proyecto_slug: str):
    t = (tipo_sql or "").lower()

    # ── Normalización específica por columna ───────────────────────────
    # pmo: "PMO 19" → "19" (el proyecto espera solo el número)
    if col_name == "pmo":
        s = str(v).strip()
        m = re.search(r"(\d+)", s)
        if m:
            return m.group(1)
        return None
    # ───────────────────────────────────────────────────────────────────
    # ── Teléfonos: si el destino es VARCHAR y el valor es numérico,
    #    convertirlo a string sin notación científica.
    if "varchar" in t or "text" in t or "char" in t:
        s = str(v).strip()
        if s == "":
            return None
        # Si el valor original es numérico (int, float), evitar notación científica
        if isinstance(v, (int, float)):
            # int puro → sin decimales; float → con la menor representación
            if float(v).is_integer():
                s = str(int(v))
            else:
                s = repr(float(v))
                # Si aún tiene notación científica, usar formato fijo
                if "e" in s.lower():
                    s = f"{v:.0f}"
        # Respetar límite de VARCHAR(n)
        m = re.search(r"varchar\((\d+)\)", t)
        if m:
            max_len = int(m.group(1))
            if len(s) > max_len:
                s = s[:max_len]
        return s

    if "datetime" in t or "date" in t or "timestamp" in t:
        return _safe_value_v2(v, col_name=col_name, slug=proyecto_slug) or None

    if "decimal" in t or "int" in t or "float" in t or "double" in t:
        try:
            if isinstance(v, str):
                s = v.replace(",", "").strip()
                if s == "":
                    return None
                return float(s)
            return float(v)
        except (ValueError, TypeError):
            return None

    if "varchar" in t or "text" in t or "char" in t:
        s = str(v).strip()
        if s == "":
            return None
        m = re.search(r"varchar\((\d+)\)", t)
        if m:
            max_len = int(m.group(1))
            if len(s) > max_len:
                s = s[:max_len]
        return s

    return v

def _inferir_tipo_sql(serie: pd.Series) -> str:
    """Infiere tipo SQL simple a partir de una serie."""
    no_nulos = serie.dropna()
    if len(no_nulos) == 0:
        return "VARCHAR(255)"
    muestra = no_nulos.head(50)
    # intentar numérico
    try:
        pd.to_numeric(muestra)
        return "DECIMAL(18,4)"
    except (ValueError, TypeError):
        pass
    # intentar fecha
    if pd.api.types.is_datetime64_any_dtype(muestra):
        return "DATETIME"
    return "VARCHAR(500)"


def _drop_tabla_si_existe(db_proyecto, tabla: str):
    try:
        db_proyecto.execute(text(f"DROP TABLE IF EXISTS `{tabla}`"))
    except Exception as e:
        logger.warning(f"No se pudo dropear {tabla}: {e}")


def _get_columnas_tabla(db_proyecto, tabla: str) -> List[str]:
    """Obtiene la lista de nombres de columnas de una tabla existente."""
    try:
        cols = db_proyecto.execute(text(f"SHOW COLUMNS FROM `{tabla}`")).fetchall()
        return [r[0] for r in cols]
    except Exception as e:
        logger.warning(f"No se pudieron obtener columnas de {tabla}: {e}")
        return []


def _crear_tabla_ad_hoc(db_proyecto, columnas: List[str], tipos: Dict[str, str],
                        pk_name: str):
    # Descartar nombres vacíos o inválidos antes de construir el CREATE TABLE
    columnas = [c for c in columnas if c and c.strip()]

    columnas_ya_incluidas = set(columnas)
    partes = ["`id_sd` INT AUTO_INCREMENT PRIMARY KEY"]
    for col in columnas:
        partes.append(f"`{col}` {tipos[col]}")
    partes.append("`_fila_origen` INT NULL")
    partes.append("`_extra_json` LONGTEXT NULL")
    if "orden_impresion" not in columnas_ya_incluidas:
        partes.append("`orden_impresion` INT NULL")
    if "codebar" not in columnas_ya_incluidas:
        partes.append("`codebar` VARCHAR(100) NULL")

    # Índice sobre la PK si existe como columna
    if pk_name in columnas_ya_incluidas:
        partes.append(f"INDEX idx_pk (`{pk_name}`)")   # ← backticks simples

    sql = f"CREATE TABLE `{TABLA_SD}` ({', '.join(partes)}) " \
          "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    db_proyecto.execute(text(sql))

    # tabla de errores/warnings
    db_proyecto.execute(text(f"""
        CREATE TABLE IF NOT EXISTS `{TABLA_SD_ERR}` (
            id INT AUTO_INCREMENT PRIMARY KEY,
            fila_origen INT,
            columna VARCHAR(100),
            tipo ENUM('warning','error') DEFAULT 'warning',
            mensaje VARCHAR(255),
            valor_original TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """))


def _tabla_existe(db_proyecto, tabla: str) -> bool:
    r = db_proyecto.execute(text(
        "SELECT COUNT(*) AS c FROM information_schema.tables "
        "WHERE table_schema = DATABASE() AND table_name = :t"
    ), {"t": tabla}).first()
    return bool(r and r.c > 0)


# ============================================================
# ENDPOINTS
# ============================================================

@router.post("/{proyecto_slug}/subida-directa/preview", response_model=PreviewResponse)
async def preview_subida_directa(
    proyecto_slug: str,
    file: UploadFile = File(...),
    id_plantilla: Optional[int] = Query(None),
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Lee encabezados del archivo y propone mapeo. NO escribe en BD.
    """
    proyecto = check_project_access(proyecto_slug, current_user, db_global)

    if not file.filename.lower().endswith((".csv", ".xlsx", ".xls")):
        raise HTTPException(400, "Formato no soportado. Usa CSV o Excel.")

    contents = await file.read()
    df = _leer_archivo(contents, file.filename)
    if df.empty:
        raise HTTPException(400, "El archivo está vacío.")

    df.columns = [str(c).strip() for c in df.columns]
    columnas_archivo = list(df.columns)

    # ── Destinos: todas las columnas de tabla_temporal, sin excluir codebar,
    #    orden_impresion ni fecha_emision. Solo excluimos las internas.
    destinos: List[str] = []
    db_gen = get_project_db(proyecto_slug)
    db_proyecto = next(db_gen)
    try:
        try:
            cols_temp = db_proyecto.execute(
                text("SHOW COLUMNS FROM `tabla_temporal`")
            ).fetchall()
            excluir = {"seleccionada", "id_temporal", "_fila_origen"}
            destinos = [r[0] for r in cols_temp if r[0] not in excluir]
        except Exception as e:
            logger.warning(f"No se pudo leer tabla_temporal en {proyecto_slug}: {e}")
            info = _info(proyecto_slug)
            destinos = [info["pk"]] + info["col_nombre"] + info["col_adeudo"]
    finally:
        db_gen.close()

    mapeo = _propuesta_mapeo(proyecto_slug, columnas_archivo, destinos)
    sin_mapear = [c for c in columnas_archivo if c not in mapeo]

    placeholders_plantilla: List[str] = []

    # preview de las primeras 25 filas
    preview = []
    for _, row in df.head(25).iterrows():
        preview.append({str(k): ("" if pd.isna(v) else str(v)) for k, v in row.items()})

    return PreviewResponse(
        success=True,
        columnas_archivo=columnas_archivo,
        mapeo_propuesto=mapeo,
        columnas_sin_mapear=sin_mapear,
        columnas_destino_disponibles=destinos,
        placeholders_plantilla=placeholders_plantilla,
        preview_filas=preview,
        total_filas=len(df),
    )


@router.post("/{proyecto_slug}/subida-directa/crear-temporal")
async def crear_temporal_subida_directa(
    proyecto_slug: str,
    file: UploadFile = File(...),
    mapeo_json: str = Query(..., description="JSON con {col_archivo: col_destino}"),
    modo: str = Query("calcular", description="sin_calcular | calcular"),
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Crea (o recrea) tabla_temporal_subida_directa con las columnas
    mapeadas + las no mapeadas (en _extra_json). Hace upsert fila por fila.
    """
    import json as _json

    proyecto = check_project_access(proyecto_slug, current_user, db_global)
    info = _info(proyecto_slug)
    pk_name = info["pk"]

    try:
        mapeo = _json.loads(mapeo_json)
    except Exception:
        raise HTTPException(400, "mapeo_json inválido.")

    if not file.filename.lower().endswith((".csv", ".xlsx", ".xls")):
        raise HTTPException(400, "Formato no soportado. Usa CSV o Excel.")

    contents = await file.read()
    df = _leer_archivo(contents, file.filename)
    if df.empty:
        raise HTTPException(400, "El archivo está vacío.")

    df.columns = [str(c).strip() for c in df.columns]

    # Descartar los que el usuario dejó en blanco (no mapear → _extra_json)
    mapeadas = {
        c: mapeo[c] for c in df.columns
        if c in mapeo and mapeo[c] and mapeo[c] not in ("__nueva__", "")
    }
    nuevas = {
        c: mapeo[c] for c in df.columns
        if c in mapeo and mapeo[c] == "__nueva__"
    }
    sin_mapear = [
        c for c in df.columns
        if c not in mapeo or not mapeo[c] or mapeo[c] == ""
    ]

    # Validar campos mínimos
    destinos_finales = set(mapeadas.values())
    esperadas = set(_columnas_esperadas_proyecto(proyecto_slug))
    faltantes = sorted(esperadas - destinos_finales)
    if pk_name not in destinos_finales:
        raise HTTPException(
            400,
            f"El campo '{pk_name}' (PK del proyecto) es obligatorio. "
            f"Columnas sin mapear: {faltantes[:10]}"
        )

    db_gen = get_project_db(proyecto_slug)
    db_proyecto = next(db_gen)
    try:
        _drop_tabla_si_existe(db_proyecto, TABLA_SD)
        _drop_tabla_si_existe(db_proyecto, TABLA_SD_ERR)

        # ── Tipos: los que ya existen en tabla_temporal se respetan tal cual;
        #    los nuevos se infieren de la muestra.
        tip_temp = _get_columnas_tipos(db_proyecto, "tabla_temporal")

        tipos: Dict[str, str] = {}
        columnas_destino: List[str] = []
        for col_archivo, col_destino in mapeadas.items():
            if not col_destino or not col_destino.strip():
                continue
            if col_destino in tipos:
                continue
            # Si existe en tabla_temporal, copiar el tipo real
            if col_destino in tip_temp:
                tipos[col_destino] = tip_temp[col_destino]
            else:
                tipos[col_destino] = _inferir_tipo_sql(df[col_archivo])
            columnas_destino.append(col_destino)

        for col_archivo, col_destino in nuevas.items():
            nombre = _normalizar_col(col_destino) or _normalizar_col(col_archivo)
            if nombre in tipos:
                continue
            if nombre in tip_temp:
                tipos[nombre] = tip_temp[nombre]
            else:
                tipos[nombre] = _inferir_tipo_sql(df[col_archivo])
            columnas_destino.append(nombre)

        _crear_tabla_ad_hoc(db_proyecto, columnas_destino, tipos, pk_name)
        db_proyecto.commit()

        # Insertar filas
        insertados = 0
        errores = 0
        for idx, row in df.iterrows():
            try:
                valores: Dict[str, Any] = {}
                for col_archivo, col_destino in mapeadas.items():
                    v = row[col_archivo]
                    if pd.isna(v):
                        valores[col_destino] = None
                    else:
                        valores[col_destino] = _coercionar_valor(
                            v, tip_temp.get(col_destino, ""), col_destino, proyecto_slug
                        )
                for col_archivo, col_destino in nuevas.items():
                    nombre = _normalizar_col(col_destino) or _normalizar_col(col_archivo)
                    v = row[col_archivo]
                    valores[nombre] = (
                        None if pd.isna(v)
                        else _coercionar_valor(v, tip_temp.get(nombre, ""), nombre, proyecto_slug)
                    )

                # _extra_json con las no mapeadas
                extras = {c: (None if pd.isna(row[c]) else str(row[c])) for c in sin_mapear}

                valores["_fila_origen"] = int(idx) + 2  # +2 = header + 1-based
                valores["_extra_json"] = _json.dumps(extras, default=str) if extras else None

                cols = list(valores.keys())
                placeholders = [f":{c}" for c in cols]
                db_proyecto.execute(
                    text(f"INSERT INTO `{TABLA_SD}` "
                         f"({', '.join(f'`{c}`' for c in cols)}) "
                         f"VALUES ({', '.join(placeholders)})"),
                    valores,
                )
                insertados += 1
                if insertados % 200 == 0:
                    db_proyecto.commit()
            except Exception as e:
                errores += 1
                db_proyecto.execute(text(f"""
                    INSERT INTO `{TABLA_SD_ERR}`
                        (fila_origen, columna, tipo, mensaje, valor_original)
                    VALUES (:f, NULL, 'error', :m, NULL)
                """), {"f": int(idx) + 2, "m": str(e)[:255]})

        db_proyecto.commit()

        registrar_log(
            db_global, current_user.id, "subida_directa_crear_temporal",
            f"Subida Directa {proyecto_slug}: {insertados} insertados, {errores} errores. "
            f"Faltantes: {faltantes[:5]}",
            proyecto.id,
        )

        # ── Poblar tabla_dinamica según el modo elegido ─────────────────
        # Ambos modos dejan tabla_dinamica con datos.
        if modo == "sin_calcular":
            # TRUNCATE + INSERT SELECT de la ad-hoc tal cual (respetando
            # la PK de tabla_dinamica, que en Pensiones es `prestamo`).
            db_proyecto.execute(text("TRUNCATE TABLE tabla_dinamica"))
            cols_din = _get_columnas_tabla(db_proyecto, "tabla_dinamica")
            cols_sd = _get_columnas_tabla(db_proyecto, TABLA_SD)
            comunes = [c for c in cols_din if c in cols_sd]
            if comunes:
                cols_str = ", ".join(f"`{c}`" for c in comunes)
                db_proyecto.execute(text(
                    f"INSERT INTO tabla_dinamica ({cols_str}) "
                    f"SELECT {cols_str} FROM `{TABLA_SD}`"
                ))
                db_proyecto.commit()

        elif modo == "calcular":
            from fastapi.concurrency import run_in_threadpool
            from app.api.analisis import calcular_todas_filas
            try:
                await run_in_threadpool(
                    calcular_todas_filas,
                    proyecto_slug=proyecto_slug,
                    fecha_emision=None,
                    visita=None,
                    pmo=None,
                    id_documento=None,
                    id_notificador=None,
                    modo_inpc="actual",
                    origen="subida_directa",
                    current_user=current_user,
                    db_global=db_global,
                )
            except Exception as e:
                logger.error(f"Error al calcular automáticamente: {e}")

        # ────────────────────────────────────────────────────────────────

        return {
            "success": insertados > 0,
            "insertados": insertados,
            "errores": errores,
            "modo": modo,                                       # ← agregado
            "columnas_destino": columnas_destino,
            "columnas_faltantes": faltantes,
            "advertencia": (
                f"Faltan campos que Cálculos necesita: {faltantes}. "
                "Esas filas podrían fallar al calcular."
            ) if faltantes else None,
        }
    finally:
        db_gen.close()


@router.get("/{proyecto_slug}/subida-directa/tabla")
def get_tabla_subida_directa(
    proyecto_slug: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """Devuelve filas paginadas de tabla_temporal_subida_directa para el paso 1."""
    check_project_access(proyecto_slug, current_user, db_global)

    db_gen = get_project_db(proyecto_slug)
    db_proyecto = next(db_gen)
    try:
        if not _tabla_existe(db_proyecto, TABLA_SD):
            return {"rows": [], "total": 0, "page": page, "limit": limit,
                    "columnas": [], "pk": _info(proyecto_slug)["pk"]}

        cols_result = db_proyecto.execute(text(f"SHOW COLUMNS FROM `{TABLA_SD}`")).fetchall()
        columnas = [r[0] for r in cols_result]

        conditions = []
        params: Dict[str, Any] = {}
        if search:
            busca_cols = [c for c in columnas if c not in
                          ("id_sd", "_fila_origen", "_extra_json")]
            parts = [f"CAST(`{c}` AS CHAR) LIKE :s" for c in busca_cols]
            if parts:
                conditions.append("(" + " OR ".join(parts) + ")")
                params["s"] = f"%{search}%"
        where = " AND ".join(conditions) if conditions else "1=1"

        total = db_proyecto.execute(text(
            f"SELECT COUNT(*) AS c FROM `{TABLA_SD}` WHERE {where}"
        ), params).first().c

        offset = (page - 1) * limit
        rows = db_proyecto.execute(text(
            f"SELECT * FROM `{TABLA_SD}` WHERE {where} "
            f"ORDER BY id_sd ASC LIMIT {limit} OFFSET {offset}"
        ), params).fetchall()

        return {
            "rows": [dict(r._mapping) for r in rows],
            "total": total,
            "page": page,
            "limit": limit,
            "columnas": [c for c in columnas if c not in
                         ("id_sd", "_fila_origen", "_extra_json")],
            "pk": _info(proyecto_slug)["pk"],
        }
    finally:
        db_gen.close()


@router.post("/{proyecto_slug}/subida-directa/actualizar")
def actualizar_inline(
    proyecto_slug: str,
    payload: ActualizarInlineRequest,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """Guarda cambios inline (solo cuando el usuario pulsa Guardar)."""
    check_project_access(proyecto_slug, current_user, db_global)

    db_gen = get_project_db(proyecto_slug)
    db_proyecto = next(db_gen)
    try:
        if not _tabla_existe(db_proyecto, TABLA_SD):
            raise HTTPException(400, "No existe tabla de Subida Directa.")

        cols_result = db_proyecto.execute(text(f"SHOW COLUMNS FROM `{TABLA_SD}`")).fetchall()
        cols_validas = {r[0] for r in cols_result}
        actualizados = 0

        for cambio in payload.cambios:
            pk_val = cambio.get("pk_value")
            campos = {k: v for k, v in cambio.get("campos", {}).items()
                      if k in cols_validas and k not in ("id_sd",)}
            if not campos or pk_val is None:
                continue
            set_parts = [f"`{k}` = :{k}" for k in campos]
            db_proyecto.execute(text(
                f"UPDATE `{TABLA_SD}` SET {', '.join(set_parts)} "
                f"WHERE id_sd = :id_sd"
            ), {**campos, "id_sd": pk_val})
            actualizados += 1
        db_proyecto.commit()
        return {"success": True, "actualizados": actualizados}
    finally:
        db_gen.close()


@router.post("/{proyecto_slug}/subida-directa/limpieza")
def limpieza_subida_directa(
    proyecto_slug: str,
    payload: LimpiezaRequest,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Aplica limpieza (espacios o calles) sobre tabla_temporal_subida_directa.
    Reusa la lógica de analisis.py adaptada a la tabla ad-hoc.
    """
    check_project_access(proyecto_slug, current_user, db_global)
    accion = payload.accion
    if accion not in ("espacios", "calles"):
        raise HTTPException(400, "Acción no válida. Usa 'espacios' o 'calles'.")

    db_gen = get_project_db(proyecto_slug)
    db_proyecto = next(db_gen)
    try:
        if not _tabla_existe(db_proyecto, TABLA_SD):
            raise HTTPException(400, "No existe tabla de Subida Directa.")

        if accion == "calles":
            cols_result = db_proyecto.execute(text(f"SHOW COLUMNS FROM `{TABLA_SD}`")).fetchall()
            cols_texto = [r[0] for r in cols_result
                          if "char" in str(r[1]).lower() or "text" in str(r[1]).lower()]
            actualizados = 0
            for col in cols_texto:
                filas = db_proyecto.execute(text(
                    f"SELECT id_sd, `{col}` AS v FROM `{TABLA_SD}` "
                    f"WHERE `{col}` IS NOT NULL AND `{col}` <> ''"
                )).fetchall()
                for fila in filas:
                    original = str(fila.v or "")
                    normalizado = _aplicar_regex_calles(original)
                    if normalizado != original:
                        db_proyecto.execute(text(
                            f"UPDATE `{TABLA_SD}` SET `{col}` = :v WHERE id_sd = :id"
                        ), {"v": normalizado, "id": fila.id_sd})
                        actualizados += 1
            db_proyecto.commit()
            return {"success": True, "actualizados": actualizados,
                    "mensaje": f"Calles normalizadas: {actualizados} celdas."}

        # espacios
        cols_result = db_proyecto.execute(text(f"SHOW COLUMNS FROM `{TABLA_SD}`")).fetchall()
        cols_texto = [r[0] for r in cols_result
                      if "char" in str(r[1]).lower() or "text" in str(r[1]).lower()]
        actualizados = 0
        for col in cols_texto:
            try:
                r = db_proyecto.execute(text(f"""
                    UPDATE `{TABLA_SD}`
                    SET `{col}` = TRIM(REGEXP_REPLACE(`{col}`, '[ ]{{2,}}', ' '))
                    WHERE `{col}` IS NOT NULL AND `{col}` LIKE '%  %'
                """))
                actualizados += r.rowcount
            except Exception:
                try:
                    r = db_proyecto.execute(text(
                        f"UPDATE `{TABLA_SD}` SET `{col}` = TRIM(`{col}`) "
                        f"WHERE `{col}` IS NOT NULL"
                    ))
                    actualizados += r.rowcount
                except Exception:
                    pass
        db_proyecto.commit()
        return {"success": True, "actualizados": actualizados,
                "mensaje": f"Espacios limpiados: {actualizados} celdas."}
    finally:
        db_gen.close()


@router.get("/{proyecto_slug}/subida-directa/estadisticas")
def estadisticas_subida_directa(
    proyecto_slug: str,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    check_project_access(proyecto_slug, current_user, db_global)
    db_gen = get_project_db(proyecto_slug)
    db_proyecto = next(db_gen)
    try:
        if not _tabla_existe(db_proyecto, TABLA_SD):
            return {"existe": False, "total": 0, "errores": 0}
        total = db_proyecto.execute(text(
            f"SELECT COUNT(*) AS c FROM `{TABLA_SD}`"
        )).first().c
        errores = 0
        if _tabla_existe(db_proyecto, TABLA_SD_ERR):
            errores = db_proyecto.execute(text(
                f"SELECT COUNT(*) AS c FROM `{TABLA_SD_ERR}`"
            )).first().c
        return {"existe": True, "total": total, "errores": errores}
    finally:
        db_gen.close()

@router.get("/{proyecto_slug}/subida-directa/ids")
def get_ids_subida_directa(
    proyecto_slug: str,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_globals) if False else Depends(get_global_db),
):
    """
    Devuelve todos los PKs de tabla_temporal_subida_directa.
    Útil para preseleccionar en Preparación.
    """
    check_project_access(proyecto_slug, current_user, db_global)
    pk = _info(proyecto_slug)["pk"]

    db_gen = get_project_db(proyecto_slug)
    db_proyecto = next(db_gen)
    try:
        if not _tabla_existe(db_proyecto, TABLA_SD):
            return {"ids": [], "total": 0, "pk": pk}

        rows = db_proyecto.execute(text(
            f"SELECT `{pk}` AS pk FROM `{TABLA_SD}`"
        )).fetchall()
        ids = [r.pk for r in rows if r.pk is not None]

        return {"ids": ids, "total": len(ids), "pk": pk}
    finally:
        db_gen.close()