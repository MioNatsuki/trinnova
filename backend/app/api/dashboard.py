from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.db.session import get_global_db
from app.core.dependencies import get_current_active_user
from app.models.global_models import Usuario, Proyecto, Plantilla, EmisionJob, UsuarioProyecto, RolNombre
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

router = APIRouter()


class StatCards(BaseModel):
    usuarios: Optional[int] = None
    proyectos: int
    plantillas: int
    emisiones: int
    viables: Optional[int] = None
    pendientes: Optional[int] = None
    no_viables: Optional[int] = None

class EmisionMes(BaseModel):
    mes: str
    proyecto: str
    slug: str
    total: int


class DashboardResponse(BaseModel):
    cards: StatCards
    emisiones: List[EmisionMes]
    rol: str
    proyectos_usuario: List[dict]


@router.get("/", response_model=DashboardResponse)
def get_dashboard(
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    rol = current_user.rol.nombre
    es_superadmin = rol == RolNombre.superadmin
    es_analista = rol == RolNombre.analista
    es_auxiliar = rol == RolNombre.auxiliar

    # --- Proyectos visibles para este usuario ---
    if es_superadmin:
        proyectos = db.query(Proyecto).filter(Proyecto.activo == True).all()
        proyecto_ids = [p.id for p in proyectos]
    else:
        ups = db.query(UsuarioProyecto).filter(
            UsuarioProyecto.id_usuario == current_user.id
        ).all()
        proyecto_ids = [up.id_proyecto for up in ups]
        proyectos = db.query(Proyecto).filter(
            Proyecto.id.in_(proyecto_ids),
            Proyecto.activo == True
        ).all()

    # --- Cards ---
    total_usuarios = None
    if es_superadmin:
        total_usuarios = db.query(func.count(Usuario.id)).filter(Usuario.activo == True).scalar()

    total_plantillas = db.query(func.count(Plantilla.id)).filter(
        Plantilla.id_proyecto.in_(proyecto_ids),
        Plantilla.activa == True,
    ).scalar() or 0

    total_emisiones = db.query(func.count(EmisionJob.id)).filter(
        EmisionJob.id_proyecto.in_(proyecto_ids),
        EmisionJob.status == 'completed'
    ).scalar() or 0

    # --- Estadísticas de análisis (solo para analista y superadmin) ---
    viables = 0
    pendientes = 0
    no_viables = 0

    if es_superadmin or es_analista:
        for proyecto in proyectos:
            try:
                from app.db.router import get_project_db
                db_proyecto = next(get_project_db(proyecto.slug))
                
                try:
                    v = db_proyecto.execute(
                        text("SELECT COUNT(*) AS total FROM tabla_analisis WHERE viabilidad = 'viable'")
                    ).first()
                    viables += v.total if v else 0
                    
                    p = db_proyecto.execute(
                        text("SELECT COUNT(*) AS total FROM tabla_analisis WHERE viabilidad = 'pendiente'")
                    ).first()
                    pendientes += p.total if p else 0
                    
                    nv = db_proyecto.execute(
                        text("SELECT COUNT(*) AS total FROM tabla_analisis WHERE viabilidad = 'no_viable'")
                    ).first()
                    no_viables += nv.total if nv else 0
                except Exception:
                    pass
                finally:
                    db_proyecto.close()
            except Exception:
                pass

    # --- Emisiones por mes y proyecto (últimos 6 meses) ---
    emisiones_raw = (
        db.query(
            func.date_format(EmisionJob.created_at, '%Y-%m').label('mes'),
            EmisionJob.id_proyecto,
            func.count(EmisionJob.id).label('total'),
        )
        .filter(
            EmisionJob.id_proyecto.in_(proyecto_ids),
            EmisionJob.status == 'completed',
        )
        .group_by('mes', EmisionJob.id_proyecto)
        .order_by('mes')
        .all()
    )

    proy_map = {p.id: p for p in proyectos}

    emisiones = []
    for row in emisiones_raw:
        proy = proy_map.get(row.id_proyecto)
        if not proy:
            continue
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

    # --- Proyectos del usuario (para el frontend) ---
    proyectos_usuario = [
        {"id": p.id, "nombre": p.nombre, "slug": p.slug}
        for p in proyectos
    ]

    return DashboardResponse(
        cards=StatCards(
            usuarios=total_usuarios,
            proyectos=len(proyectos),
            plantillas=total_plantillas,
            emisiones=total_emisiones,
            viables=viables if (es_superadmin or es_analista) else None,
            pendientes=pendientes if (es_superadmin or es_analista) else None,
            no_viables=no_viables if (es_superadmin or es_analista) else None,
        ),
        emisiones=emisiones,
        rol=rol,
        proyectos_usuario=proyectos_usuario
    )