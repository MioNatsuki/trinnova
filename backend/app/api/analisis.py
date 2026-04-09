# backend/app/api/analisis.py
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import pandas as pd
import io
from datetime import datetime
from app.db.session import get_global_db
from app.core.dependencies import get_current_active_user, check_project_access
from app.models.global_models import Usuario, Proyecto, PadronVersion
from app.db.router import get_project_db
from app.services.log_service import registrar_log
from pydantic import BaseModel
import unicodedata

router = APIRouter()

class CargaPadronResponse(BaseModel):
    success: bool
    message: str
    total_registros: int = 0
    columnas: List[str] = []
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

def obtener_pk(proyecto_slug: str) -> str:
    pks = {
        "apa_tlajomulco": "clave_APA",
        "predial_tlajomulco": "cuenta",
        "licencias_gdl": "licencia",
        "predial_gdl": "cuenta_n",
        "estado": "credito",
        "pensiones": "prestamo",
    }
    return pks.get(proyecto_slug, "id")

def obtener_tablas_info(proyecto_slug: str) -> Dict:
    info = {
        "apa_tlajomulco": {
            "pk": "clave_APA",
            "pk_type": "int",
            "columnas_padron": ["clave_APA", "propietario", "calle", "exterior", "interior", "poblacion", "localidad", "tipo_servicio", "adeudo_agua", "adeudo_colectores", "adeudo_infraestructura", "saldo"],
            "columnas_complementaria": ["multa_virtual", "axoini", "mesini", "axofin", "mesfin", "ultimo_req", "ejecutor", "etiqueta"],
        },
        "predial_tlajomulco": {
            "pk": "cuenta",
            "pk_type": "int",
            "columnas_padron": ["cuenta", "cve_catastral", "domicilio", "no_ext", "no_int", "ubic_colonia", "impuesto", "recargos", "saldo"],
            "columnas_complementaria": ["manzana", "recaudadora", "tipo", "programa"],
        },
        "licencias_gdl": {
            "pk": "licencia",
            "pk_type": "int",
            "columnas_padron": ["licencia", "propietario", "ubicacion", "colonia_ubic", "actividad", "derechos", "recargos", "multas", "total"],
            "columnas_complementaria": ["tipo_propietario", "viable_domicilio"],
        },
        "predial_gdl": {
            "pk": "cuenta_n",
            "pk_type": "str",
            "columnas_padron": ["cuenta_n", "propietariotitular_n", "calle", "num_exterior", "colonia", "incp", "gastos", "multas", "saldo2025"],
            "columnas_complementaria": ["predial_total", "gastos_totales", "total_adeudo", "recaudadora", "firma"],
        },
        "estado": {
            "pk": "credito",
            "pk_type": "str",
            "columnas_padron": ["credito", "nombre_razon_social", "calle_numero", "colonia", "municipio", "importe_historico_determinado", "concepto"],
            "columnas_complementaria": ["tipo_tipo", "firma", "cargo"],
        },
        "pensiones": {
            "pk": "prestamo",
            "pk_type": "int",
            "columnas_padron": ["prestamo", "nombre", "rfc", "adeudo", "saldo_por_vencer", "moratorio", "afiliado_calle", "afiliado_colonia"],
            "columnas_complementaria": ["num_convenio", "estatus_prestamo", "juzgado", "expediente"],
        },
    }
    return info.get(proyecto_slug, {})

def mapear_campos_pensiones(registro: Dict) -> Dict:
    mapeado = {}
    
    # Mapeo directo de nombres
    mapeo_columnas = {
        # CSV -> BD
        'afiliado': 'afiliado',
        'nombre': 'nombre',
        'rfc': 'rfc',
        'tipo_prestamo': 'tipo_prestamo',
        'prestamo': 'prestamo',
        'saldo_por_vencer': 'saldo_por_vencer',
        'adeudo': 'adeudo',
        'liquidacion': 'liquidacion',
        'moratorio': 'moratorio',
        'ultimo_abono': 'ultimo_abono',
        'subestatus': 'sub_estatus',  # ← Diferente
        'estatus': 'estatus',
        'dependencia': 'dependencia',
        'alta': 'fecha_alta',  # ← Diferente
        'ultima_aportacion': 'ultima_aportacion',
        'afiliado_calle': 'afiliado_calle',
        'afiliado_exterior': 'afiliado_exterior',
        'afiliado_interior': 'afiliado_interior',
        'afiliado_cruza1': 'afiliado_cruza',  # ← Diferente
        'afiliado_cruza2': 'afiliado_cruza_2',  # ← Diferente
        'afiliado_colonia': 'afiliado_colonia',
        'afiliado_poblacion': 'afiliado_poblacion',
        'afiliado_municipio': 'afiliado_municipio',
        'afiliado_cp': 'afiliado_cp',
        'afiliado_lada': 'afiliado_lada',
        'afiliado_telefono': 'afiliado_telefono',
        'afiliado_celular': 'afiliado_celular',
        'aval_codigo': 'aval_codigo',
        'aval': 'aval_nombre',  # ← Diferente
        'aval_calle': 'aval_calle',
        'aval_exterior': 'aval_exterior',
        'aval_interior': 'aval_interior',
        'aval_cruza1': 'aval_cruza',  # ← Diferente
        'aval_cruza2': 'aval_cruza_2',  # ← Diferente
        'aval_colonia': 'aval_colonia',
        'aval_poblacion': 'aval_poblacion',
        'aval_municipio': 'aval_municipio',
        'aval_cp': 'aval_cp',
        'aval_lada': 'aval_lada',
        'aval_telefono': 'aval_telefono',
        'aval_celular': 'aval_celular',
        'garantia_direccion': 'garantia_direccion',
        'garantia_colonia': 'garantia_colonia',
        'garantia_calles_cruza': 'garantia_calles_cruces',  # ← Diferente
        'garantia_poblacion': 'garantia_poblacion',
        'garantia_municipio': 'garantia_municipio',
    }
    
    for csv_col, bd_col in mapeo_columnas.items():
        if csv_col in registro and pd.notna(registro[csv_col]):
            mapeado[bd_col] = registro[csv_col]
    
    return mapeado

def normalizar_texto(texto: str) -> str:
    texto = texto.lower().strip()
    texto = unicodedata.normalize('NFKD', texto).encode('ASCII', 'ignore').decode('ASCII')
    texto = texto.replace(' ', '_')
    return texto

def mapear_campos_padron(proyecto_slug: str, registro: Dict) -> Dict:
    """Mapea los campos del CSV a los nombres de columna de la BD"""
    info = obtener_tablas_info(proyecto_slug)
    mapeado = {}
    
    # Crear un diccionario con las claves normalizadas del registro
    registro_normalizado = {}
    for key, value in registro.items():
        key_norm = normalizar_texto(key)
        registro_normalizado[key_norm] = value
    
    print(f"Columnas normalizadas del CSV: {list(registro_normalizado.keys())[:10]}")
    
    for col_bd in info.get("columnas_padron", []):
        col_bd_norm = normalizar_texto(col_bd)
        
        if col_bd_norm in registro_normalizado:
            mapeado[col_bd] = registro_normalizado[col_bd_norm]
            print(f"Mapeado: '{col_bd_norm}' -> '{col_bd}'")
        else:
            # Buscar coincidencia parcial
            encontrado = False
            for key_norm, value in registro_normalizado.items():
                if col_bd_norm in key_norm or key_norm in col_bd_norm:
                    mapeado[col_bd] = value
                    print(f"Mapeado (parcial): '{key_norm}' -> '{col_bd}'")
                    encontrado = True
                    break
            
            if not encontrado:
                print(f"No se encontró columna para: {col_bd}")
    
    print(f"Total mapeado: {len(mapeado)} columnas")
    return mapeado

def obtener_siguiente_version(db_global: Session, proyecto_id: int) -> int:
    ultima = db_global.query(PadronVersion).filter(
        PadronVersion.id_proyecto == proyecto_id
    ).order_by(PadronVersion.version.desc()).first()
    return (ultima.version + 1) if ultima else 1


@router.post("/{proyecto_slug}/cargar-padron", response_model=CargaPadronResponse)
async def cargar_padron(
    proyecto_slug: str,
    file: UploadFile = File(...),
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    from sqlalchemy import text
    
    proyecto = check_project_access(proyecto_slug, current_user, db_global)
    
    if not file.filename.endswith(('.csv', '.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Formato no soportado")
    
    errores = []
    
    try:
        contents = await file.read()
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents), encoding='utf-8')
        else:
            df = pd.read_excel(io.BytesIO(contents))
        
        # Limpiar nombres de columnas del CSV
        df.columns = df.columns.str.strip().str.lower().str.replace(' ', '_')
        
        print(f"Columnas CSV: {list(df.columns)}")
        print(f"Total registros: {len(df)}")
        
        db_proyecto = next(get_project_db(proyecto_slug))
        
        # Usar mapeo específico para pensiones
        registros = df.to_dict('records')
        insertados = 0
        
        for idx, registro in enumerate(registros):
            try:
                # Aplicar mapeo
                if proyecto_slug == "pensiones":
                    registro_mapeado = mapear_campos_pensiones(registro)
                else:
                    registro_mapeado = {k: v for k, v in registro.items() if pd.notna(v)}
                
                # Limpiar valores NaN
                for key, value in registro_mapeado.items():
                    if pd.isna(value):
                        registro_mapeado[key] = None
                    elif isinstance(value, (pd.Timestamp, datetime)):
                        registro_mapeado[key] = value.strftime('%Y-%m-%d %H:%M:%S')
                
                # Verificar llave primaria
                if registro_mapeado.get('prestamo') is None:
                    errores.append(f"Registro {idx}: No tiene prestamo")
                    continue
                
                # Verificar si existe
                exists = db_proyecto.execute(
                    text("SELECT 1 FROM tabla_padron WHERE prestamo = :prestamo"),
                    {"prestamo": registro_mapeado['prestamo']}
                ).first()
                
                if exists:
                    # UPDATE
                    set_clause = ", ".join([f"`{k}` = :{k}" for k in registro_mapeado.keys() if k != 'prestamo'])
                    if set_clause:
                        db_proyecto.execute(
                            text(f"UPDATE tabla_padron SET {set_clause} WHERE prestamo = :prestamo"),
                            registro_mapeado
                        )
                else:
                    # INSERT
                    columns = ", ".join([f"`{k}`" for k in registro_mapeado.keys()])
                    values = ":" + ", :".join(registro_mapeado.keys())
                    db_proyecto.execute(
                        text(f"INSERT INTO tabla_padron ({columns}) VALUES ({values})"),
                        registro_mapeado
                    )
                
                insertados += 1
                
                if insertados % 100 == 0:
                    print(f"Procesados {insertados} registros...")
                    
            except Exception as e:
                errores.append(f"Registro {idx}: {str(e)}")
                if len(errores) > 20:
                    break
        
        db_proyecto.commit()
        
        version_id = None
        if insertados > 0:
            version = PadronVersion(
                id_proyecto=proyecto.id,
                version=obtener_siguiente_version(db_global, proyecto.id),
                total_registros=insertados,
                cargado_por=current_user.id,
                archivo_nombre=file.filename
            )
            db_global.add(version)
            db_global.commit()
            version_id = version.id
        
        registrar_log(
            db_global, current_user.id, "cargar_padron",
            f"Cargó padrón para {proyecto_slug}: {insertados} registros",
            proyecto.id
        )
        
        return CargaPadronResponse(
            success=insertados > 0,
            message=f"Padrón cargado: {insertados} registros de {len(registros)}",
            total_registros=insertados,
            columnas=list(df.columns),
            preview=df.head(3).to_dict('records'),
            version_id=version_id,
            errores=errores[:20]
        )
        
    except Exception as e:
        db_global.rollback()
        print(f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


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
    
    db_proyecto = next(get_project_db(proyecto_slug))
    info = obtener_tablas_info(proyecto_slug)
    pk = info["pk"]
    
    # Construir condiciones de búsqueda
    search_condition = ""
    params = {}
    if search:
        search_condition = f" AND (CAST(p.`{pk}` AS CHAR) LIKE :search OR p.propietario LIKE :search OR p.calle LIKE :search OR p.nombre LIKE :search)"
        params["search"] = f"%{search}%"
    
    # Obtener total
    total = db_proyecto.execute(
        text(f"SELECT COUNT(*) as total FROM tabla_padron p WHERE 1=1 {search_condition}"),
        params
    ).first().total
    
    # Obtener datos paginados
    offset = (page - 1) * limit
    rows = db_proyecto.execute(
        text(f"""
            SELECT p.*, c.* 
            FROM tabla_padron p
            LEFT JOIN tabla_complementaria c ON p.`{pk}` = c.`{pk}`
            WHERE 1=1 {search_condition}
            LIMIT {limit} OFFSET {offset}
        """),
        params
    ).fetchall()
    
    result_rows = [dict(row._mapping) for row in rows]
    columnas_editables = info.get("columnas_complementaria", [])
    
    return {
        "rows": result_rows,
        "columnas_editables": columnas_editables,
        "total": total,
        "page": page,
        "limit": limit,
        "pk": pk
    }


@router.post("/{proyecto_slug}/guardar-complemento")
def guardar_complemento(
    proyecto_slug: str,
    datos: List[FilaComplementar],
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    from sqlalchemy import text
    
    proyecto = check_project_access(proyecto_slug, current_user, db_global)
    db_proyecto = next(get_project_db(proyecto_slug))
    info = obtener_tablas_info(proyecto_slug)
    pk = info["pk"]
    
    guardados = 0
    for fila in datos:
        # Verificar si ya existe en complementaria
        existing = db_proyecto.execute(
            text(f"SELECT 1 FROM tabla_complementaria WHERE `{pk}` = :pk"),
            {"pk": fila.pk_value}
        ).first()
        
        if existing:
            # UPDATE
            set_clause = ", ".join([f"`{k}` = :{k}" for k in fila.campos_complementarios.keys()])
            db_proyecto.execute(
                text(f"UPDATE tabla_complementaria SET {set_clause} WHERE `{pk}` = :pk"),
                {**fila.campos_complementarios, "pk": fila.pk_value}
            )
        else:
            # INSERT
            columns = f"`{pk}`, " + ", ".join([f"`{k}`" for k in fila.campos_complementarios.keys()])
            values = ":pk, " + ", :" + ", :".join(fila.campos_complementarios.keys())
            db_proyecto.execute(
                text(f"INSERT INTO tabla_complementaria ({columns}) VALUES ({values})"),
                {**fila.campos_complementarios, "pk": fila.pk_value}
            )
        
        db_proyecto.execute(
            text(f"DELETE FROM tabla_analisis WHERE `{pk}` = :pk_value"),
            {"pk_value": fila.pk_value}
        )
        db_proyecto.execute(
            text(f"""
                INSERT INTO tabla_analisis 
                SELECT p.*, c.* 
                FROM tabla_padron p
                LEFT JOIN tabla_complementaria c ON p.`{pk}` = c.`{pk}`
                WHERE p.`{pk}` = :pk_value
            """),
            {"pk_value": fila.pk_value}
        )
        guardados += 1
    
    db_proyecto.commit()
    
    registrar_log(
        db_global, current_user.id, "guardar_complemento",
        f"Guardó complemento para {guardados} registros en {proyecto_slug}",
        id_proyecto=proyecto.id
    )
    
    return {"success": True, "message": f"Guardados {guardados} registros"}


@router.get("/{proyecto_slug}/analisis")
def get_analisis(
    proyecto_slug: str,
    viabilidad: Optional[str] = Query(None, regex="^(viable|no_viable|pendiente)$"),
    busqueda: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    from sqlalchemy import text
    
    check_project_access(proyecto_slug, current_user, db_global)
    
    db_proyecto = next(get_project_db(proyecto_slug))
    info = obtener_tablas_info(proyecto_slug)
    pk = info["pk"]
    
    # Construir condiciones
    conditions = []
    params = {}
    
    if viabilidad:
        conditions.append("viabilidad = :viabilidad")
        params["viabilidad"] = viabilidad
    
    if busqueda:
        conditions.append(f"(CAST(`{pk}` AS CHAR) LIKE :busqueda OR propietario LIKE :busqueda OR nombre LIKE :busqueda OR calle LIKE :busqueda)")
        params["busqueda"] = f"%{busqueda}%"
    
    where_clause = " AND ".join(conditions) if conditions else "1=1"
    
    # Obtener total
    total = db_proyecto.execute(
        text(f"SELECT COUNT(*) as total FROM tabla_analisis WHERE {where_clause}"),
        params
    ).first().total
    
    # Obtener datos paginados
    offset = (page - 1) * limit
    rows = db_proyecto.execute(
        text(f"SELECT * FROM tabla_analisis WHERE {where_clause} LIMIT {limit} OFFSET {offset}"),
        params
    ).fetchall()
    
    result_rows = [dict(row._mapping) for row in rows]
    
    return {
        "rows": result_rows,
        "total": total,
        "page": page,
        "limit": limit,
        "pk": pk
    }


@router.post("/{proyecto_slug}/acciones-manuales")
def acciones_manuales(
    proyecto_slug: str,
    request: AccionManualRequest,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    from sqlalchemy import text
    
    proyecto = check_project_access(proyecto_slug, current_user, db_global)
    db_proyecto = next(get_project_db(proyecto_slug))
    info = obtener_tablas_info(proyecto_slug)
    pk = info["pk"]
    
    placeholders = ','.join([f":id{i}" for i in range(len(request.ids))])
    params = {f"id{i}": request.ids[i] for i in range(len(request.ids))}
    
    if request.accion == "viable":
        params["viabilidad"] = "viable"
        db_proyecto.execute(
            text(f"UPDATE tabla_analisis SET viabilidad = :viabilidad WHERE `{pk}` IN ({placeholders})"),
            params
        )
        mensaje = f"Marcados {len(request.ids)} registros como Viables"
    
    elif request.accion == "no_viable":
        params["viabilidad"] = "no_viable"
        db_proyecto.execute(
            text(f"UPDATE tabla_analisis SET viabilidad = :viabilidad WHERE `{pk}` IN ({placeholders})"),
            params
        )
        mensaje = f"Marcados {len(request.ids)} registros como No Viables"
    
    elif request.accion == "quitar_pagada":
        params["pagada"] = True
        db_proyecto.execute(
            text(f"UPDATE tabla_analisis SET pagada = :pagada, viabilidad = 'no_viable' WHERE `{pk}` IN ({placeholders})"),
            params
        )
        mensaje = f"Marcados {len(request.ids)} registros como Pagados"
    
    elif request.accion == "quitar_nd":
        params["nd"] = request.valor or "ND"
        db_proyecto.execute(
            text(f"UPDATE tabla_analisis SET nd = :nd, viabilidad = 'no_viable' WHERE `{pk}` IN ({placeholders})"),
            params
        )
        mensaje = f"Marcados {len(request.ids)} registros como No Deudores"
    
    else:
        raise HTTPException(status_code=400, detail="Acción no válida")
    
    db_proyecto.commit()
    
    registrar_log(
        db_global, current_user.id, f"accion_{request.accion}",
        f"{mensaje} en {proyecto_slug}",
        id_proyecto=proyecto.id
    )
    
    return {"success": True, "message": mensaje}


@router.post("/{proyecto_slug}/limpieza/normalizar-calles")
def normalizar_calles(
    proyecto_slug: str,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    from sqlalchemy import text
    
    check_project_access(proyecto_slug, current_user, db_global)
    db_proyecto = next(get_project_db(proyecto_slug))
    
    reglas = [
        (r'Av\.?\s+', 'Avenida '),
        (r'Calle\s+', ''),
        (r'C\.\s+', ''),
        (r'Priv\.?\s+', 'Privada '),
        (r'Blvd\.?\s+', 'Boulevard '),
        (r'Fracc\.?\s+', 'Fraccionamiento '),
        (r'Col\.?\s+', 'Colonia '),
        (r'Mz\.?\s+', 'Manzana '),
        (r'Lt\.?\s+', 'Lote '),
        (r'Cda\.?\s+', 'Cerrada '),
        (r'Prole\.?\s+', 'Prolongación '),
    ]
    
    actualizados = 0
    for patron, reemplazo in reglas:
        result = db_proyecto.execute(
            text(f"""
                UPDATE tabla_analisis 
                SET calle = REPLACE(calle, '{patron}', '{reemplazo}')
                WHERE calle IS NOT NULL AND calle LIKE '%{patron}%'
            """)
        )
        actualizados += result.rowcount
    
    db_proyecto.commit()
    
    return {"success": True, "message": f"Calles normalizadas: {actualizados} registros actualizados"}


@router.post("/{proyecto_slug}/limpieza/limpiar-espacios")
def limpiar_espacios(
    proyecto_slug: str,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    from sqlalchemy import text
    
    check_project_access(proyecto_slug, current_user, db_global)
    db_proyecto = next(get_project_db(proyecto_slug))
    
    columnas_texto = ["propietario", "calle", "colonia", "domicilio", "nombre", "ubicacion"]
    
    actualizados = 0
    for col in columnas_texto:
        result = db_proyecto.execute(
            text(f"""
                UPDATE tabla_analisis 
                SET `{col}` = TRIM(REGEXP_REPLACE(`{col}`, '[ ]+', ' '))
                WHERE `{col}` IS NOT NULL
            """)
        )
        actualizados += result.rowcount
    
    db_proyecto.commit()
    
    return {"success": True, "message": f"Espacios limpiados: {actualizados} registros actualizados"}


@router.get("/{proyecto_slug}/versiones")
def get_versiones(
    proyecto_slug: str,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    proyecto = check_project_access(proyecto_slug, current_user, db_global)
    
    versiones = db_global.query(PadronVersion).filter(
        PadronVersion.id_proyecto == proyecto.id
    ).order_by(PadronVersion.version.desc()).all()
    
    return [
        {
            "id": v.id,
            "version": v.version,
            "total_registros": v.total_registros,
            "archivo_nombre": v.archivo_nombre,
            "created_at": v.created_at,
            "cargado_por": v.cargado_por
        }
        for v in versiones
    ]