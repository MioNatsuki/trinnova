from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_global_db
from app.core.dependencies import require_superadmin
from app.models.global_models import Proyecto
from pydantic import BaseModel

router = APIRouter()

class ProyectoResponse(BaseModel):
    id: int
    nombre: str
    slug: str
    db_name: str
    descripcion: str = None
    activo: bool

    class Config:
        from_attributes = True

@router.get("/", response_model=List[ProyectoResponse])
def listar_proyectos(
    db: Session = Depends(get_global_db),
    _ = Depends(require_superadmin),
):
    proyectos = db.query(Proyecto).filter(Proyecto.activo == True).all()
    return proyectos