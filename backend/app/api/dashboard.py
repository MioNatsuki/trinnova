from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.db.session import get_global_db
from app.core.dependencies import get_current_active_user
from app.models.global_models import Usuario, Proyecto, Plantilla, EmisionArchivo, UsuarioProyecto, RolNombre
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

router = APIRouter()


class StatCards(BaseModel):
    usuarios:   Optional[int] = None
    proyectos:  int
    plantillas: int


class EmisionMes(BaseModel):
    mes:        str
    proyecto:   str
    slug:       str
    total:      int


class DashboardResponse(BaseModel):
    cards:    StatCards
    emisiones: List[EmisionMes]


@router.get("/", response_model=DashboardResponse)
def get_dashboard(
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    rol = current_user.rol.nombre
    es_superadmin = rol == RolNombre.superadmin

    # --- Proyectos visibles para este usuario ---
    if es_superadmin:
        proyectos = db.query(Proyecto).filter(Proyecto.activo == True).all()
        proyecto_ids = [p.id for p in proyectos]
    else:
        ups = db.query(UsuarioProyecto).filter(
            UsuarioProyecto.id_usuario == current_user.id
        ).all()
        proyecto_ids = [up.id_proyecto for up in ups]
        proyectos = db.query(Proyecto).filter(Proyecto.id.in_(proyecto_ids)).all()

    # --- Cards ---
    total_usuarios = None
    if es_superadmin:
        total_usuarios = db.query(func.count(Usuario.id)).filter(Usuario.activo == True).scalar()

    total_plantillas = db.query(func.count(Plantilla.id)).filter(
        Plantilla.id_proyecto.in_(proyecto_ids),
        Plantilla.activa == True,
    ).scalar()

    # --- Emisiones por mes y proyecto (últimos 6 meses) ---
    emisiones_raw = (
        db.query(
            func.date_format(EmisionArchivo.created_at, '%Y-%m').label('mes'),
            EmisionArchivo.id_proyecto,
            func.count(EmisionArchivo.id).label('total'),
        )
        .filter(
            EmisionArchivo.id_proyecto.in_(proyecto_ids),
            EmisionArchivo.status == 'completado',
        )
        .group_by('mes', EmisionArchivo.id_proyecto)
        .order_by('mes')
        .all()
    )

    # Mapa id_proyecto -> proyecto
    proy_map = {p.id: p for p in proyectos}

    emisiones = []
    for row in emisiones_raw:
        proy = proy_map.get(row.id_proyecto)
        if not proy:
            continue
        # Convertir '2025-01' -> 'Enero 2025'
        try:
            dt = datetime.strptime(row.mes, '%Y-%m')
            MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
            mes_label = f"{MESES[dt.month - 1]} {dt.year}"
        except Exception:
            mes_label = row.mes

        emisiones.append(EmisionMes(
            mes=mes_label,
            proyecto=proy.nombre,
            slug=proy.slug,
            total=row.total,
        ))

    return DashboardResponse(
        cards=StatCards(
            usuarios=total_usuarios,
            proyectos=len(proyectos),
            plantillas=total_plantillas or 0,
        ),
        emisiones=emisiones,
    )