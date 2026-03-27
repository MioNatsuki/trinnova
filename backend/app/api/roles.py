from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_global_db
from app.core.dependencies import require_superadmin
from app.models.global_models import Rol
from pydantic import BaseModel

router = APIRouter()

class RolResponse(BaseModel):
    id: int
    nombre: str
    descripcion: str = None

    class Config:
        from_attributes = True

@router.get("/", response_model=List[RolResponse])
def listar_roles(
    db: Session = Depends(get_global_db),
    _ = Depends(require_superadmin),
):
    roles = db.query(Rol).all()
    return roles