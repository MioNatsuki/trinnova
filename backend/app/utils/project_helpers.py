# backend/app/utils/project_helpers.py
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.global_models import Proyecto, UsuarioProyecto

def check_project_access(proyecto_slug: str, current_user, db_global: Session):
    """Verifica que el usuario tenga acceso al proyecto"""
    if current_user.rol.nombre == "superadmin":
        return True
    
    proyecto = db_global.query(Proyecto).filter(Proyecto.slug == proyecto_slug).first()
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    
    tiene_acceso = db_global.query(UsuarioProyecto).filter(
        UsuarioProyecto.id_usuario == current_user.id,
        UsuarioProyecto.id_proyecto == proyecto.id
    ).first()
    
    if not tiene_acceso:
        raise HTTPException(status_code=403, detail="No tienes acceso a este proyecto")
    
    return True

def obtener_pk(proyecto_slug: str) -> str:
    """Retorna el nombre de la llave primaria según el proyecto"""
    pks = {
        "apa_tlajomulco": "clave_APA",
        "predial_tlajomulco": "cuenta",
        "licencias_gdl": "licencia",
        "predial_gdl": "cuenta_n",
        "estado": "credito",
        "pensiones": "prestamo",
    }
    return pks.get(proyecto_slug, "id")