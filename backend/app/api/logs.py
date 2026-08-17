# backend/app/api/logs.py
"""
Bitácora de logs - Fase 6
Visible solo para Superadmin
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, desc
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel

from app.db.session import get_global_db
from app.core.dependencies import get_current_active_user, require_superadmin
from app.models.global_models import Usuario, Log, Proyecto
from app.services.log_service import registrar_log

router = APIRouter()

# ============================================================
# SCHEMAS
# ============================================================

class LogResponse(BaseModel):
    id: int
    id_usuario: Optional[int]
    nombre_usuario: Optional[str]
    id_proyecto: Optional[int]
    nombre_proyecto: Optional[str]
    accion: str
    descripcion: Optional[str]
    ip: Optional[str]
    created_at: datetime

class LogsResponse(BaseModel):
    logs: List[LogResponse]
    total: int
    page: int
    limit: int
    total_pages: int

# ============================================================
# ENDPOINTS
# ============================================================

@router.get("/", response_model=LogsResponse)
def listar_logs(
    page: int = Query(1, ge=1, description="Número de página"),
    limit: int = Query(50, ge=1, le=200, description="Registros por página"),
    usuario_id: Optional[int] = Query(None, description="Filtrar por usuario"),
    proyecto_id: Optional[int] = Query(None, description="Filtrar por proyecto"),
    accion: Optional[str] = Query(None, description="Filtrar por acción"),
    fecha_desde: Optional[str] = Query(None, description="Fecha desde (YYYY-MM-DD)"),
    fecha_hasta: Optional[str] = Query(None, description="Fecha hasta (YYYY-MM-DD)"),
    current_user: Usuario = Depends(require_superadmin),
    db: Session = Depends(get_global_db),
):
    """Lista logs del sistema (solo Superadmin)"""
    
    query = db.query(Log)
    
    # Filtros
    if usuario_id:
        query = query.filter(Log.id_usuario == usuario_id)
    
    if proyecto_id:
        query = query.filter(Log.id_proyecto == proyecto_id)
    
    if accion:
        query = query.filter(Log.accion.like(f"%{accion}%"))
    
    if fecha_desde:
        try:
            fecha = datetime.strptime(fecha_desde, "%Y-%m-%d")
            query = query.filter(Log.created_at >= fecha)
        except ValueError:
            pass
    
    if fecha_hasta:
        try:
            fecha = datetime.strptime(fecha_hasta, "%Y-%m-%d")
            query = query.filter(Log.created_at <= fecha.replace(hour=23, minute=59, second=59))
        except ValueError:
            pass
    
    # Total
    total = query.count()
    total_pages = (total + limit - 1) // limit if total > 0 else 1
    
    # Paginación
    offset = (page - 1) * limit
    logs = query.order_by(desc(Log.created_at)).offset(offset).limit(limit).all()
    
    # Enriquecer con nombres
    result = []
    for log in logs:
        nombre_usuario = None
        nombre_proyecto = None
        
        if log.id_usuario:
            usuario = db.query(Usuario).filter(Usuario.id == log.id_usuario).first()
            if usuario:
                nombre_usuario = f"{usuario.nombre} {usuario.apellidos}"
        
        if log.id_proyecto:
            proyecto = db.query(Proyecto).filter(Proyecto.id == log.id_proyecto).first()
            if proyecto:
                nombre_proyecto = proyecto.nombre
        
        result.append(LogResponse(
            id=log.id,
            id_usuario=log.id_usuario,
            nombre_usuario=nombre_usuario,
            id_proyecto=log.id_proyecto,
            nombre_proyecto=nombre_proyecto,
            accion=log.accion,
            descripcion=log.descripcion,
            ip=log.ip,
            created_at=log.created_at
        ))
    
    return LogsResponse(
        logs=result,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages
    )


@router.get("/acciones")
def listar_acciones(
    current_user: Usuario = Depends(require_superadmin),
    db: Session = Depends(get_global_db),
):
    """Lista todas las acciones disponibles en logs"""
    acciones = db.query(Log.accion).distinct().order_by(Log.accion).all()
    return [a[0] for a in acciones]


@router.get("/resumen")
def resumen_logs(
    dias: int = Query(7, ge=1, le=90, description="Días a analizar"),
    current_user: Usuario = Depends(require_superadmin),
    db: Session = Depends(get_global_db),
):
    """Resumen de actividad para dashboard de logs"""
    from sqlalchemy import func
    
    fecha_limite = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Total por día
    logs_por_dia = db.query(
        func.date(Log.created_at).label('fecha'),
        func.count(Log.id).label('total')
    ).filter(
        Log.created_at >= fecha_limite
    ).group_by(
        func.date(Log.created_at)
    ).order_by(
        func.date(Log.created_at).desc()
    ).limit(dias).all()
    
    # Total por acción
    logs_por_accion = db.query(
        Log.accion,
        func.count(Log.id).label('total')
    ).filter(
        Log.created_at >= fecha_limite
    ).group_by(
        Log.accion
    ).order_by(
        func.count(Log.id).desc()
    ).limit(10).all()
    
    # Total por usuario
    logs_por_usuario = db.query(
        Log.id_usuario,
        func.count(Log.id).label('total')
    ).filter(
        Log.created_at >= fecha_limite
    ).group_by(
        Log.id_usuario
    ).order_by(
        func.count(Log.id).desc()
    ).limit(10).all()
    
    # Enriquecer usuarios
    usuarios = []
    for item in logs_por_usuario:
        nombre = None
        if item.id_usuario:
            usuario = db.query(Usuario).filter(Usuario.id == item.id_usuario).first()
            if usuario:
                nombre = f"{usuario.nombre} {usuario.apellidos}"
        usuarios.append({
            "id_usuario": item.id_usuario,
            "nombre": nombre,
            "total": item.total
        })
    
    return {
        "por_dia": [
            {"fecha": r.fecha.isoformat(), "total": r.total}
            for r in logs_por_dia
        ],
        "por_accion": [
            {"accion": r.accion, "total": r.total}
            for r in logs_por_accion
        ],
        "por_usuario": usuarios,
        "total_periodo": sum(r.total for r in logs_por_dia)
    }