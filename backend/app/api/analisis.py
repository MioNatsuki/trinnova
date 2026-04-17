# backend/app/api/analisis.py  — Fase 4
"""
Nuevos endpoints en esta versión:
  GET   /{slug}/programas               — lista programas del proyecto
  POST  /{slug}/cargar-viabilidad-csv   — carga masiva viabilidad/pagos desde CSV
  POST  /{slug}/guardar-complemento     — SOLO tabla_complementaria (sin tocar analisis)
  POST  /{slug}/generar-analisis        — reconstruye tabla_analisis con INSERT explícito
  GET   /{slug}/analisis                — ahora filtra también por programa
  GET   /{slug}/complementar            — ahora filtra también por programa
  GET   /{slug}/estadisticas
  GET   /{slug}/versiones
  POST  /{slug}/acciones-manuales
  POST  /{slug}/limpieza/normalizar-calles
  POST  /{slug}/limpieza/limpiar-espacios
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
from app.models.global_models import Usuario, PadronVersion, Programa
from app.db.router import get_project_db
from app.services.log_service import registrar_log
from pydantic import BaseModel

router = APIRouter()

# ---------------------------------------------------------------------------
# Schemas
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
    accion: str
    valor: Optional[str] = None


class CargaViabilidadCSVResponse(BaseModel):
    success: bool
    message: str
    procesados: int = 0
    errores: List[str] = []


# ---------------------------------------------------------------------------
# Metadata por proyecto
# ---------------------------------------------------------------------------

_INFO: Dict[str, Dict] = {
    "apa_tlajomulco": {
        "pk": "clave_APA",
        "pk_type": "int",
        "col_nombre": ["propietario"],
        "col_calle":  ["calle"],
        "col_adeudo": ["saldo"],
        "col_ext":    ["exterior"],
        "col_int":    ["interior"],
        "col_tel":    [],
        "col_gastos": ["gastos"],
        "col_fechas": ["fecha_lectura","periodo_desde","periodo_hasta"],
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
        "col_ext":    ["no_ext","ubic_no_ext","no_ext_3"],
        "col_int":    ["no_int","ubic_no_int","no_int_3"],
        "col_tel":    [],
        "col_gastos": ["total_gastos","gastos_requerimiento"],
        "col_fechas": [],
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
        "col_ext":    ["numext_ubic"],
        "col_int":    ["numint_ubic"],
        "col_tel":    [],
        "col_gastos": ["gastos"],
        "col_fechas": ["fecemi"],
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
        "col_ext":    ["num_exterior","numero_exterior"],
        "col_int":    ["num_interior","numero_interior"],
        "col_tel":    [],
        "col_gastos": ["gastos","incp"],
        "col_fechas": [],
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
        "col_ext":    [],
        "col_int":    [],
        "col_tel":    [],
        "col_gastos": [],
        "col_fechas": ["fecha_recepcion","fecha_documento_determinante","fecha_notificacion"],
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
        "col_ext":    ["afiliado_exterior","aval_exterior"],
        "col_int":    ["afiliado_interior","aval_interior"],
        "col_tel":    ["afiliado_telefono","afiliado_celular","aval_telefono","aval_celular","afiliado_lada","aval_lada"],
        "col_gastos": [],
        "col_fechas": ["ultimo_abono","fecha_alta","ultima_aportacion"],
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
        "columnas_complementaria": [
            "num_convenio","fecha_convenio","estatus_prestamo","estatus_captura",
            "demanda","juzgado","expediente","estatus_despacho","juicio_caduca",
            "afiliado_coordenadas","lat","lon","fecha_asignacion",
            "id_zona_afiliado","id_zona_aval","id_zona_garantia",
        ],
    },
}

_COL_ALIAS: Dict[str, Dict[str, str]] = {
    "pensiones": {
        "subestatus":            "sub_estatus",
        "alta":                  "fecha_alta",
        "afiliado_cruza1":       "afiliado_cruza",
        "afiliado_cruza2":       "afiliado_cruza_2",
        "aval":                  "aval_nombre",
        "aval_cruza1":           "aval_cruza",
        "aval_cruza2":           "aval_cruza_2",
        "garantia_calles_cruza": "garantia_calles_cruces",
    }
}

_DATE_COLS: Dict[str, List[str]] = {
    "pensiones":          ["ultimo_abono","fecha_alta","ultima_aportacion","fecha_convenio","fecha_asignacion"],
    "apa_tlajomulco":     ["fecha_lectura"],
    "licencias_gdl":      ["fecemi"],
    "predial_gdl":        [],
    "predial_tlajomulco": [],
    "estado":             ["fecha_recepcion","fecha_documento_determinante","fecha_notificacion"],
}

_DATE_FORMATS = [
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%d",
    "%d/%m/%Y %H:%M:%S", "%d/%m/%Y",
    "%m/%d/%Y", "%d-%m-%Y",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _info(slug: str) -> Dict:
    if slug not in _INFO:
        raise HTTPException(status_code=400, detail=f"Proyecto desconocido: {slug}")
    return _INFO[slug]


def _normalizar_col(nombre: str) -> str:
    txt = unicodedata.normalize("NFKD", nombre).encode("ASCII", "ignore").decode()
    return re.sub(r"\s+", "_", txt.lower().strip())


def _mapear_columnas(slug: str, df_cols: List[str]) -> Dict[str, str]:
    info = _info(slug)
    alias = _COL_ALIAS.get(slug, {})
    bd_idx = {_normalizar_col(c): c for c in info["columnas_padron"]}
    mapeo: Dict[str, str] = {}
    for csv_col in df_cols:
        norm = _normalizar_col(csv_col)
        if norm in bd_idx:
            mapeo[csv_col] = bd_idx[norm]; continue
        if norm in alias:
            mapeo[csv_col] = alias[norm]; continue
        for bd_norm, bd_real in bd_idx.items():
            if bd_norm in norm or norm in bd_norm:
                mapeo[csv_col] = bd_real; break
    return mapeo


def _siguiente_version(db_global: Session, proyecto_id: int) -> int:
    ultima = (
        db_global.query(PadronVersion)
        .filter(PadronVersion.id_proyecto == proyecto_id)
        .order_by(PadronVersion.version.desc())
        .first()
    )
    return (ultima.version + 1) if ultima else 1


def _parse_fecha(val: Any) -> Any:
    if not isinstance(val, str):
        return None
    val = val.strip()
    if not val:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(val, fmt)
        except ValueError:
            continue
    return None


def _safe_value(val: Any, col_name: str = "", slug: str = "") -> Any:
    if val is None:
        return None
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(val, pd.Timestamp):
        return val.to_pydatetime()
    if isinstance(val, str) and col_name in _DATE_COLS.get(slug, []):
        return _parse_fecha(val)
    return val


def _get_tabla_cols(db_session, tabla: str) -> List[str]:
    from sqlalchemy import text
    rows = db_session.execute(text(f"SHOW COLUMNS FROM `{tabla}`")).fetchall()
    return [r[0] for r in rows]


def _build_analisis_insert(db_session, pk: str, cols_complementaria: List[str]) -> str:
    """INSERT explícito para evitar error MySQL 1136."""
    cols_analisis = _get_tabla_cols(db_session, "tabla_analisis")
    set_padron    = set(_get_tabla_cols(db_session, "tabla_padron"))
    set_comp      = set(_get_tabla_cols(db_session, "tabla_complementaria"))
    set_comp_edit = set(cols_complementaria)

    select_parts = []
    for col in cols_analisis:
        if col == "viabilidad":
            select_parts.append("'pendiente'")
        elif col in set_comp_edit and col in set_comp:
            select_parts.append(f"c.`{col}`")
        elif col in set_padron:
            select_parts.append(f"p.`{col}`")
        elif col in set_comp:
            select_parts.append(f"c.`{col}`")
        else:
            select_parts.append("NULL")

    cols_str   = ", ".join(f"`{c}`" for c in cols_analisis)
    select_str = ", ".join(select_parts)
    return (
        f"INSERT INTO tabla_analisis ({cols_str})\n"
        f"SELECT {select_str}\n"
        f"FROM tabla_padron p\n"
        f"LEFT JOIN tabla_complementaria c ON p.`{pk}` = c.`{pk}`\n"
    )


# ---------------------------------------------------------------------------
# PROGRAMAS — GET (lee de db_global)
# ---------------------------------------------------------------------------

@router.get("/{proyecto_slug}/programas")
def get_programas(
    proyecto_slug: str,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """Devuelve los programas activos del proyecto desde db_global."""
    from sqlalchemy import text

    check_project_access(proyecto_slug, current_user, db_global)

    proyecto = db_global.execute(
        text("SELECT id FROM proyectos WHERE slug = :s AND activo = 1"), {"s": proyecto_slug}
    ).first()

    if not proyecto:
        return []

    # Usa el modelo Programa si está disponible, si no hace raw SQL
    try:
        programas = db_global.query(Programa).filter(
            Programa.id_proyecto == proyecto.id,
            Programa.activo == True,
        ).order_by(Programa.nombre).all()
        return [{"id": p.id, "nombre": p.nombre, "slug": p.slug} for p in programas]
    except Exception:
        # Fallback raw si el modelo ORM aún no está actualizado
        rows = db_global.execute(
            text("SELECT id, nombre, slug FROM programas WHERE id_proyecto = :pid AND activo = 1 ORDER BY nombre"),
            {"pid": proyecto.id},
        ).fetchall()
        return [{"id": r.id, "nombre": r.nombre, "slug": r.slug} for r in rows]


# ---------------------------------------------------------------------------
# CARGAR VIABILIDAD / PAGOS — CSV masivo
# ---------------------------------------------------------------------------

@router.post("/{proyecto_slug}/cargar-viabilidad-csv", response_model=CargaViabilidadCSVResponse)
async def cargar_viabilidad_csv(
    proyecto_slug: str,
    file: UploadFile = File(...),
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Carga masiva de viabilidad y estatus de pago desde CSV/Excel.

    Columnas esperadas (cualquier orden, nombres flexibles):
      - cuenta / pk / prestamo / licencia / credito   → PK del registro
      - viabilidad                                     → 'viable', 'no_viable', 'pendiente'
      - estatus_pago / pago / status_pago              → texto libre
      - fecha_pago                                     → fecha
      - monto_pago / monto                             → numérico
      - observaciones / obs                            → texto
      - programa                                       → slug de programa

    Comportamiento:
      - Actualiza viabilidad en tabla_analisis si la columna está presente.
      - Hace UPSERT en tabla_pagos si estatus_pago está presente.
    """
    from sqlalchemy import text

    if not file.filename.lower().endswith((".csv", ".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Formato no soportado. Usa CSV o Excel.")

    proyecto = check_project_access(proyecto_slug, current_user, db_global)
    info = _info(proyecto_slug)
    pk = info["pk"]
    errores: List[str] = []

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
    df.columns = [_normalizar_col(c) for c in df.columns]

    # Mapear columna PK: acepta varios nombres
    pk_norm = _normalizar_col(pk)
    pk_col_csv = None
    for candidate in [pk_norm, "cuenta", "pk", "prestamo", "licencia", "credito", "cuenta_n"]:
        if candidate in df.columns:
            pk_col_csv = candidate
            break

    if not pk_col_csv:
        raise HTTPException(
            status_code=400,
            detail=f"No se encontró columna de PK. Se esperaba '{pk}' o 'cuenta'. "
                   f"Columnas en el archivo: {list(df.columns)[:10]}"
        )

    # Detectar columnas opcionales
    def _find_col(candidates: List[str]) -> Optional[str]:
        for c in candidates:
            if c in df.columns:
                return c
        return None

    via_col  = _find_col(["viabilidad"])
    pago_col = _find_col(["estatus_pago","pago","status_pago","estatus"])
    fech_col = _find_col(["fecha_pago","fecha"])
    mont_col = _find_col(["monto_pago","monto"])
    obs_col  = _find_col(["observaciones","obs"])
    prog_col = _find_col(["programa","program"])

    VIABILIDADES_VALIDAS = {"viable", "no_viable", "pendiente"}
    db_proyecto = next(get_project_db(proyecto_slug))
    procesados = 0

    for idx, row in df.iterrows():
        try:
            pk_val = row[pk_col_csv]
            if pd.isna(pk_val):
                errores.append(f"Fila {idx + 2}: PK vacío, se omite.")
                continue

            if info["pk_type"] == "int":
                try:
                    pk_val = int(pk_val)
                except (ValueError, TypeError):
                    errores.append(f"Fila {idx + 2}: PK '{pk_val}' no es entero.")
                    continue

            # 1. Actualizar viabilidad en tabla_analisis
            if via_col:
                via_val = str(row[via_col]).strip().lower() if not pd.isna(row[via_col]) else None
                if via_val and via_val in VIABILIDADES_VALIDAS:
                    db_proyecto.execute(
                        text(f"UPDATE tabla_analisis SET viabilidad = :v WHERE `{pk}` = :pk"),
                        {"v": via_val, "pk": pk_val},
                    )

            # 2. UPSERT en tabla_pagos
            if pago_col and not pd.isna(row.get(pago_col, None)):
                estatus_pago = str(row[pago_col]).strip()
                fecha_pago   = None
                if fech_col and not pd.isna(row.get(fech_col)):
                    fp = row[fech_col]
                    if isinstance(fp, pd.Timestamp):
                        fecha_pago = fp.date()
                    else:
                        parsed = _parse_fecha(str(fp))
                        if parsed:
                            fecha_pago = parsed.date()

                monto  = None
                if mont_col and not pd.isna(row.get(mont_col)):
                    try:
                        monto = float(row[mont_col])
                    except (ValueError, TypeError):
                        pass

                obs = str(row[obs_col]).strip() if obs_col and not pd.isna(row.get(obs_col)) else None
                prog = str(row[prog_col]).strip() if prog_col and not pd.isna(row.get(prog_col)) else None

                existe_pago = db_proyecto.execute(
                    text("SELECT id FROM tabla_pagos WHERE pk_cuenta = :pk LIMIT 1"),
                    {"pk": str(pk_val)},
                ).first()

                if existe_pago:
                    db_proyecto.execute(
                        text("""
                            UPDATE tabla_pagos
                            SET estatus_pago = :ep,
                                fecha_pago   = :fp,
                                monto_pago   = :mp,
                                observaciones = :obs,
                                programa     = :prog,
                                updated_at   = NOW()
                            WHERE pk_cuenta = :pk
                        """),
                        {"ep": estatus_pago, "fp": fecha_pago, "mp": monto,
                         "obs": obs, "prog": prog, "pk": str(pk_val)},
                    )
                else:
                    db_proyecto.execute(
                        text("""
                            INSERT INTO tabla_pagos
                                (pk_cuenta, estatus_pago, fecha_pago, monto_pago, observaciones, programa, creado_por)
                            VALUES
                                (:pk, :ep, :fp, :mp, :obs, :prog, :usr)
                        """),
                        {"pk": str(pk_val), "ep": estatus_pago, "fp": fecha_pago,
                         "mp": monto, "obs": obs, "prog": prog, "usr": current_user.id},
                    )

            if (procesados + 1) % 200 == 0:
                db_proyecto.commit()

            procesados += 1

        except Exception as e:
            errores.append(f"Fila {idx + 2}: {str(e)[:120]}")
            if len(errores) >= 30:
                errores.append("Límite de 30 errores alcanzado.")
                break

    db_proyecto.commit()

    registrar_log(
        db_global, current_user.id, "cargar_viabilidad_csv",
        f"CSV viabilidad/pagos {proyecto_slug}: {procesados} filas procesadas.", proyecto.id,
    )

    return CargaViabilidadCSVResponse(
        success=procesados > 0,
        message=f"{procesados} registros procesados de {len(df)} en el archivo.",
        procesados=procesados,
        errores=errores[:30],
    )


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

    df.columns = [c.strip() for c in df.columns]
    columnas_csv = list(df.columns)
    mapeo = _mapear_columnas(proyecto_slug, columnas_csv)
    columnas_bd_detectadas = list(set(mapeo.values()))

    df_mapped = df[[c for c in df.columns if c in mapeo]].rename(columns=mapeo)
    df_mapped = df_mapped.loc[:, ~df_mapped.columns.duplicated()]

    if pk not in df_mapped.columns:
        raise HTTPException(
            status_code=400,
            detail=f"No se encontró la columna primaria '{pk}'. Columnas detectadas: {columnas_csv[:15]}",
        )

    db_proyecto = next(get_project_db(proyecto_slug))
    insertados = actualizados = 0
    registros = df_mapped.to_dict("records")

    for idx, registro in enumerate(registros):
        try:
            limpio: Dict[str, Any] = {
                k: _safe_value(v, col_name=k, slug=proyecto_slug)
                for k, v in registro.items()
            }
            pk_val = limpio.get(pk)
            if pk_val is None:
                errores.append(f"Fila {idx + 2}: sin valor en '{pk}', se omite.")
                continue
            if info["pk_type"] == "int":
                try:
                    pk_val = int(pk_val); limpio[pk] = pk_val
                except (ValueError, TypeError):
                    errores.append(f"Fila {idx + 2}: '{pk}' = '{pk_val}' no es entero.")
                    continue

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
                cols_str = ", ".join(f"`{k}`" for k in limpio)
                vals_str = ", ".join(f":{k}" for k in limpio)
                db_proyecto.execute(
                    text(f"INSERT INTO tabla_padron ({cols_str}) VALUES ({vals_str})"), limpio)
                insertados += 1

            if (insertados + actualizados) % 200 == 0:
                db_proyecto.commit()

        except Exception as e:
            errores.append(f"Fila {idx + 2}: {str(e)[:120]}")
            if len(errores) >= 30:
                errores.append("Límite de 30 errores alcanzado, importación detenida.")
                break

    db_proyecto.commit()

    version_id = None
    total = insertados + actualizados
    if total > 0:
        version = PadronVersion(
            id_proyecto=proyecto.id,
            version=_siguiente_version(db_global, proyecto.id),
            ruta_snapshot="", total_registros=total,
            archivo_nombre=file.filename, cargado_por=current_user.id,
        )
        db_global.add(version)
        db_global.commit()
        version_id = version.id

    registrar_log(db_global, current_user.id, "cargar_padron",
        f"Padrón {proyecto_slug}: {insertados} nuevos, {actualizados} actualizados. Archivo: {file.filename}",
        proyecto.id)

    preview_cols = list(df_mapped.columns[:10])
    preview = [
        {k: str(v) if v is not None and not (isinstance(v, float) and pd.isna(v)) else ""
         for k, v in row.items() if k in preview_cols}
        for row in registros[:5]
    ]

    return CargaPadronResponse(
        success=total > 0,
        message=f"{insertados} registros nuevos, {actualizados} actualizados de {len(registros)} en el archivo.",
        total_registros=total, columnas_csv=columnas_csv,
        columnas_bd=columnas_bd_detectadas, preview=preview,
        version_id=version_id, errores=errores[:30],
    )


# ---------------------------------------------------------------------------
# COMPLEMENTAR — GET (con filtro de programa)
# ---------------------------------------------------------------------------

@router.get("/{proyecto_slug}/complementar")
def get_complementar(
    proyecto_slug: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    programa: Optional[str] = Query(None),
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    from sqlalchemy import text

    check_project_access(proyecto_slug, current_user, db_global)
    info = _info(proyecto_slug)
    pk = info["pk"]
    search_cols = list(dict.fromkeys(info["col_nombre"] + info["col_calle"] + [pk]))

    conditions = ["1=1"]
    params: Dict[str, Any] = {}

    if search:
        parts = [f"CAST(p.`{c}` AS CHAR) LIKE :search" for c in search_cols]
        conditions.append("(" + " OR ".join(parts) + ")")
        params["search"] = f"%{search}%"

    if programa and programa != "todos":
        conditions.append("p.`programa` = :programa")
        params["programa"] = programa

    where = " AND ".join(conditions)
    db_proyecto = next(get_project_db(proyecto_slug))
    total = db_proyecto.execute(
        text(f"SELECT COUNT(*) AS total FROM tabla_padron p WHERE {where}"), params
    ).first().total

    offset = (page - 1) * limit
    cols_c = [col for col in info["columnas_complementaria"] if col != pk and col != "id_comp"]
    cols_c_str = (", " + ", ".join(f"c.`{col}`" for col in cols_c)) if cols_c else ""

    rows = db_proyecto.execute(
        text(f"""
            SELECT p.*{cols_c_str}
            FROM tabla_padron p
            LEFT JOIN tabla_complementaria c ON p.`{pk}` = c.`{pk}`
            WHERE {where}
            ORDER BY p.`{pk}`
            LIMIT {limit} OFFSET {offset}
        """),
        params,
    ).fetchall()

    return {
        "rows":               [dict(r._mapping) for r in rows],
        "columnas_editables": info["columnas_complementaria"],
        "total":              total,
        "page":               page,
        "limit":              limit,
        "pk":                 pk,
    }


# ---------------------------------------------------------------------------
# GUARDAR COMPLEMENTO — SOLO tabla_complementaria
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
        guardados += 1

    db_proyecto.commit()
    registrar_log(db_global, current_user.id, "guardar_complemento",
        f"Complemento guardado: {guardados} registros en {proyecto_slug}", proyecto.id)
    return {"success": True, "message": f"{guardados} registros guardados en tabla complementaria."}


# ---------------------------------------------------------------------------
# GENERAR ANÁLISIS
# ---------------------------------------------------------------------------

@router.post("/{proyecto_slug}/generar-analisis")
def generar_analisis(
    proyecto_slug: str,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    from sqlalchemy import text

    proyecto = check_project_access(proyecto_slug, current_user, db_global)
    info = _info(proyecto_slug)
    pk = info["pk"]
    db_proyecto = next(get_project_db(proyecto_slug))

    previo = db_proyecto.execute(text("SELECT COUNT(*) AS c FROM tabla_analisis")).first().c
    insert_sql = _build_analisis_insert(db_proyecto, pk, info["columnas_complementaria"])

    db_proyecto.execute(text("DELETE FROM tabla_analisis"))
    db_proyecto.execute(text(insert_sql))
    db_proyecto.commit()

    total = db_proyecto.execute(text("SELECT COUNT(*) AS c FROM tabla_analisis")).first().c
    registrar_log(db_global, current_user.id, "generar_analisis",
        f"tabla_analisis reconstruida en {proyecto_slug}: {total} registros", proyecto.id)

    return {"success": True, "message": f"Análisis generado: {total} registros.", "total": total, "previo": previo}


# ---------------------------------------------------------------------------
# ANALISIS — GET (con filtros viabilidad + programa + búsqueda)
# ---------------------------------------------------------------------------

@router.get("/{proyecto_slug}/analisis")
def get_analisis(
    proyecto_slug: str,
    viabilidad: Optional[str] = Query(None),
    busqueda: Optional[str] = None,
    programa: Optional[str] = Query(None),
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

    if programa and programa != "todos":
        conditions.append("`programa` = :programa")
        params["programa"] = programa

    if busqueda:
        search_cols = list(dict.fromkeys(info["col_nombre"] + info["col_calle"] + [pk]))
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

    result = []
    for r in rows:
        row_dict = dict(r._mapping)
        adeudo_val = 0
        for col in info["col_adeudo"]:
            v = row_dict.get(col)
            if v is not None:
                try:
                    adeudo_val = float(v); break
                except (TypeError, ValueError):
                    pass
        row_dict["_adeudo_display"] = adeudo_val
        nombre_val = ""
        for col in info["col_nombre"]:
            v = row_dict.get(col)
            if v:
                nombre_val = str(v); break
        row_dict["_nombre_display"] = nombre_val
        calle_val = ""
        for col in info["col_calle"]:
            v = row_dict.get(col)
            if v:
                calle_val = str(v); break
        row_dict["_calle_display"] = calle_val
        result.append(row_dict)

    return {"rows": result, "total": total, "page": page, "limit": limit, "pk": pk}


# ---------------------------------------------------------------------------
# ACCIONES MANUALES
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
    ph = {f"id{i}": v for i, v in enumerate(request.ids)}
    in_clause = ", ".join(f":id{i}" for i in range(len(request.ids)))

    accion = request.accion
    if accion == "viable":
        db_proyecto.execute(
            text(f"UPDATE tabla_analisis SET viabilidad = 'viable' WHERE `{pk}` IN ({in_clause})"), ph)
        msg = f"{len(request.ids)} registros marcados como Viables"
    elif accion == "no_viable":
        db_proyecto.execute(
            text(f"UPDATE tabla_analisis SET viabilidad = 'no_viable' WHERE `{pk}` IN ({in_clause})"), ph)
        msg = f"{len(request.ids)} registros marcados como No Viables"
    elif accion == "quitar_pagada":
        db_proyecto.execute(
            text(f"UPDATE tabla_analisis SET pagada = 1, viabilidad = 'no_viable' WHERE `{pk}` IN ({in_clause})"), ph)
        msg = f"{len(request.ids)} registros marcados como Pagados"
    elif accion == "quitar_nd":
        motivo = request.valor or "ND"
        ph["motivo_nd"] = motivo
        db_proyecto.execute(
            text(f"UPDATE tabla_analisis SET nd = :motivo_nd, viabilidad = 'no_viable' WHERE `{pk}` IN ({in_clause})"), ph)
        msg = f"{len(request.ids)} registros marcados como No Deudores ({motivo})"
    else:
        raise HTTPException(status_code=400, detail=f"Acción '{accion}' no reconocida.")

    db_proyecto.commit()
    registrar_log(db_global, current_user.id, f"accion_{accion}", msg, proyecto.id)
    return {"success": True, "message": msg}


# ---------------------------------------------------------------------------
# LIMPIEZA
# ---------------------------------------------------------------------------

_REGLAS_CALLES = [
    (r"\bAv\.?\b","Avenida"),(r"\bBlvd\.?\b","Boulevard"),(r"\bBlvrd\.?\b","Boulevard"),
    (r"\bProlong\.?\b","Prolongación"),(r"\bProle\.?\b","Prolongación"),(r"\bPriv\.?\b","Privada"),
    (r"\bFracc\.?\b","Fraccionamiento"),(r"\bCol\.?\b","Colonia"),(r"\bMz\.?\b","Manzana"),
    (r"\bLt\.?\b","Lote"),(r"\bCda\.?\b","Cerrada"),(r"\bClle\.?\b","Calle"),
    (r"\bAndador\b","Andador"),(r"\bCallejon\b","Callejón"),(r"\bGpe\.?\b","Guadalupe"),
    (r" {2,}"," "),
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
    all_calle_cols = list(dict.fromkeys(info["col_calle"] + ["calle","domicilio","ubicacion","calle_numero"]))
    db_proyecto = next(get_project_db(proyecto_slug))
    cols_existentes = set(_get_tabla_cols(db_proyecto, "tabla_analisis"))
    cols_a_procesar = [c for c in all_calle_cols if c in cols_existentes]
    if not cols_a_procesar:
        return {"success": True, "message": "No se encontraron columnas de calle para normalizar."}
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
                {**cambios, "pk_val": pk_val})
            actualizados += 1
    db_proyecto.commit()
    registrar_log(db_global, current_user.id, "normalizar_calles",
        f"Normalizadas calles en {actualizados} filas de {proyecto_slug}", proyecto.id)
    return {"success": True, "message": f"Calles normalizadas: {actualizados} registros actualizados."}


@router.post("/{proyecto_slug}/limpieza/limpiar-espacios")
def limpiar_espacios(
    proyecto_slug: str,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    from sqlalchemy import text
    proyecto = check_project_access(proyecto_slug, current_user, db_global)
    info = _info(proyecto_slug)
    db_proyecto = next(get_project_db(proyecto_slug))
    cols_result = db_proyecto.execute(text("SHOW COLUMNS FROM tabla_analisis")).fetchall()
    cols_texto = [r[0] for r in cols_result if "VARCHAR" in str(r[1]).upper() or "TEXT" in str(r[1]).upper()]
    actualizados = 0
    for col in cols_texto[:20]:
        try:
            result = db_proyecto.execute(text(f"""
                UPDATE tabla_analisis
                SET `{col}` = TRIM(REGEXP_REPLACE(`{col}`, '[ ]{{2,}}', ' '))
                WHERE `{col}` IS NOT NULL AND `{col}` LIKE '%  %'
            """))
            actualizados += result.rowcount
        except Exception:
            try:
                result = db_proyecto.execute(text(
                    f"UPDATE tabla_analisis SET `{col}` = TRIM(`{col}`) WHERE `{col}` IS NOT NULL"))
                actualizados += result.rowcount
            except Exception:
                pass
    db_proyecto.commit()
    registrar_log(db_global, current_user.id, "limpiar_espacios",
        f"Espacios limpiados en {proyecto_slug}: {actualizados} celdas", proyecto.id)
    return {"success": True, "message": f"Espacios limpiados: {actualizados} celdas actualizadas."}


# ---------------------------------------------------------------------------
# VERSIONES
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
        {"id": v.id, "version": v.version, "total_registros": v.total_registros,
         "archivo_nombre": v.archivo_nombre, "cargado_por": v.cargado_por,
         "created_at": v.created_at.isoformat() if v.created_at else None}
        for v in versiones
    ]


# ---------------------------------------------------------------------------
# ESTADÍSTICAS
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

    def count_via(valor: str) -> int:
        try:
            return db_proyecto.execute(
                text("SELECT COUNT(*) AS c FROM tabla_analisis WHERE viabilidad = :v"), {"v": valor}
            ).first().c
        except Exception:
            return 0

    return {
        "padron": count("tabla_padron"), "analisis": count("tabla_analisis"),
        "viable": count_via("viable"), "no_viable": count_via("no_viable"),
        "pendiente": count_via("pendiente"),
    }
