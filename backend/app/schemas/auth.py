from pydantic import BaseModel, EmailStr
from typing import Optional, List


class LoginRequest(BaseModel):
    correo: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ProyectoBasico(BaseModel):
    id:     int
    nombre: str
    slug:   str

    class Config:
        from_attributes = True


class UsuarioMe(BaseModel):
    id:        int
    nombre:    str
    apellidos: str
    correo:    str
    rol:       str
    proyectos: List[ProyectoBasico] = []

    class Config:
        from_attributes = True