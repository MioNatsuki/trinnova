from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


class UsuarioCreate(BaseModel):
    nombre:     str
    apellidos:  str
    correo:     EmailStr
    password:   str
    id_rol:     int
    proyectos:  List[int] = []   # lista de id_proyecto


class UsuarioUpdate(BaseModel):
    nombre:    Optional[str]    = None
    apellidos: Optional[str]    = None
    correo:    Optional[EmailStr] = None
    id_rol:    Optional[int]    = None
    activo:    Optional[bool]   = None
    proyectos: Optional[List[int]] = None


class UsuarioResponse(BaseModel):
    id:        int
    nombre:    str
    apellidos: str
    correo:    str
    rol:       str
    activo:    bool
    proyectos: List[str] = []   # slugs
    created_at: datetime

    class Config:
        from_attributes = True