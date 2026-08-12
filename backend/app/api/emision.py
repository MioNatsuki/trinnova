"""
TRINNOVA - API de Emisión (Fase 6)
===================================
Endpoints para la emisión masiva de documentos.

Endpoints:
- POST /{proyecto_slug}/preparar   → Crear un job de emisión
- GET  /jobs/{job_id}/estado       → Obtener estado de un job
- POST /jobs/{job_id}/cancelar     → Cancelar un job en progreso
- GET  /{proyecto_slug}/plantillas → Obtener plantillas disponibles
- GET  /{proyecto_slug}/programas  → Obtener programas disponibles
- GET  /{proyecto_slug}/estadisticas-emision → Estadísticas para emisión
- GET  /{proyecto_slug}/cuentas    → Lista de cuentas con paginación
- GET  /jobs                       → Listar jobs del usuario
"""

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, Dict, Any, List
from datetime import datetime
import json

from app.db.session import get_global_db
from app.core.dependencies import get_current_active_user, check_project_access
from app.models.global_models import Usuario, Proyecto, Plantilla, EmisionJob, EmisionDetalle
from app.db.router import get_project_db
from app.services.log_service import registrar_log
from pydantic import BaseModel, Field

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

# ============================================================
# FUNCIONES AUXILIARES
# ============================================================

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

# ============================================================
# ENDPOINT: PREPARAR EMISIÓN
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
    
    if request.filtros.get("programa") and request.filtros["programa"] != "todos":
        condiciones.append("programa = :programa")
        params["programa"] = request.filtros["programa"]
    
    if request.filtros.get("ids") and isinstance(request.filtros["ids"], list):
        placeholders = ", ".join([f":id{i}" for i in range(len(request.filtros["ids"]))])
        condiciones.append(f"{pk} IN ({placeholders})")
        for i, id_val in enumerate(request.filtros["ids"]):
            params[f"id{i}"] = id_val
    
    if request.filtros.get("cuenta_inicial") and request.filtros.get("cuenta_final"):
        condiciones.append(f"{pk} BETWEEN :inicio AND :fin")
        params["inicio"] = request.filtros["cuenta_inicial"]
        params["fin"] = request.filtros["cuenta_final"]
    
    where = " AND ".join(condiciones)
    
    count_query = text(f"SELECT COUNT(*) AS total FROM tabla_analisis WHERE {where}")
    total = db_proyecto.execute(count_query, params).first().total
    
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
        import logging
        logger = logging.getLogger("TrinnovaAPI")
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
# ENDPOINT: ESTADO DE JOB
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


# ============================================================
# ENDPOINT: CANCELAR JOB
# ============================================================

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


# ============================================================
# ENDPOINTS DE CATÁLOGOS PARA EMISIÓN
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


@router.get("/{proyecto_slug}/programas")
def get_programas_emision(
    proyecto_slug: str,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """Obtiene los programas disponibles para emisión."""
    from app.api.analisis import get_programas
    return get_programas(proyecto_slug, current_user, db_global)


@router.get("/{proyecto_slug}/estadisticas-emision")
def get_estadisticas_emision(
    proyecto_slug: str,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """Obtiene estadísticas para emisión."""
    from sqlalchemy import text
    
    check_project_access(proyecto_slug, current_user, db_global)
    db_proyecto = next(get_project_db(proyecto_slug))
    
    try:
        total_viables = db_proyecto.execute(
            text("SELECT COUNT(*) AS total FROM tabla_analisis WHERE viabilidad = 'viable'")
        ).first().total
        
        total_no_viables = db_proyecto.execute(
            text("SELECT COUNT(*) AS total FROM tabla_analisis WHERE viabilidad = 'no_viable'")
        ).first().total
        
        total_pendientes = db_proyecto.execute(
            text("SELECT COUNT(*) AS total FROM tabla_analisis WHERE viabilidad = 'pendiente'")
        ).first().total
        
        total_general = db_proyecto.execute(
            text("SELECT COUNT(*) AS total FROM tabla_analisis")
        ).first().total
        
    except Exception as e:
        return {
            "total_viables": 0,
            "total_no_viables": 0,
            "total_pendientes": 0,
            "total_general": 0,
            "mensaje": "La tabla de análisis aún no existe. Genera el análisis primero.",
            "error": str(e)
        }
    
    return {
        "total_viables": total_viables,
        "total_no_viables": total_no_viables,
        "total_pendientes": total_pendientes,
        "total_general": total_general,
        "mensaje": f"{total_viables} registros viables para emisión"
    }


@router.get("/{proyecto_slug}/cuentas")
def get_cuentas_emision(
    proyecto_slug: str,
    page: int = Query(1, ge=1, description="Número de página"),
    limit: int = Query(50, ge=1, le=100, description="Registros por página"),
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
    db_proyecto = next(get_project_db(proyecto_slug))
    
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
        "total_pages": (total + limit - 1) // limit if total > 0 else 1
    }


# ============================================================
# ENDPOINT: LISTAR JOBS DEL USUARIO
# ============================================================

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