from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List
from app.db.session import get_global_db
from app.core.dependencies import require_superadmin
from app.core.security import hash_password
from app.models.global_models import Usuario, Proyecto, UsuarioProyecto
from app.schemas.usuario import UsuarioCreate, UsuarioUpdate, UsuarioResponse
from app.services.log_service import registrar_log

router = APIRouter()


def _load_user(db: Session, user_id: int) -> Usuario:
    user = (
        db.query(Usuario)
        .options(
            joinedload(Usuario.rol),
            joinedload(Usuario.proyectos).joinedload(UsuarioProyecto.proyecto),
        )
        .filter(Usuario.id == user_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user


def _build_response(user: Usuario) -> UsuarioResponse:
    return UsuarioResponse(
        id=user.id,
        nombre=user.nombre,
        apellidos=user.apellidos,
        correo=user.correo,
        rol=user.rol.nombre,
        activo=user.activo,
        proyectos=[up.proyecto.slug for up in user.proyectos],
        created_at=user.created_at,
    )


@router.get("/", response_model=List[UsuarioResponse])
def listar_usuarios(
    db: Session = Depends(get_global_db),
    _: Usuario = Depends(require_superadmin),
):
    users = (
        db.query(Usuario)
        .options(
            joinedload(Usuario.rol),
            joinedload(Usuario.proyectos).joinedload(UsuarioProyecto.proyecto),
        )
        .all()
    )
    return [_build_response(u) for u in users]


@router.post("/", response_model=UsuarioResponse, status_code=status.HTTP_201_CREATED)
def crear_usuario(
    payload: UsuarioCreate,
    db: Session = Depends(get_global_db),
    current_user: Usuario = Depends(require_superadmin),
):
    if db.query(Usuario).filter(Usuario.correo == payload.correo).first():
        raise HTTPException(status_code=400, detail="El correo ya esta registrado")

    nuevo = Usuario(
        nombre=payload.nombre,
        apellidos=payload.apellidos,
        correo=payload.correo,
        password_hash=hash_password(payload.password),
        id_rol=payload.id_rol,
    )
    db.add(nuevo)
    db.flush()

    for id_proy in payload.proyectos:
        if db.query(Proyecto).filter(Proyecto.id == id_proy).first():
            db.add(UsuarioProyecto(id_usuario=nuevo.id, id_proyecto=id_proy))

    db.commit()
    registrar_log(db, current_user.id, "crear_usuario", f"Usuario creado: {nuevo.correo}")
    return _build_response(_load_user(db, nuevo.id))


@router.get("/{user_id}", response_model=UsuarioResponse)
def obtener_usuario(
    user_id: int,
    db: Session = Depends(get_global_db),
    _: Usuario = Depends(require_superadmin),
):
    return _build_response(_load_user(db, user_id))


@router.put("/{user_id}", response_model=UsuarioResponse)
def actualizar_usuario(
    user_id: int,
    payload: UsuarioUpdate,
    db: Session = Depends(get_global_db),
    current_user: Usuario = Depends(require_superadmin),
):
    user = _load_user(db, user_id)

    if payload.nombre    is not None: user.nombre    = payload.nombre
    if payload.apellidos is not None: user.apellidos = payload.apellidos
    if payload.correo    is not None: user.correo    = payload.correo
    if payload.id_rol    is not None: user.id_rol    = payload.id_rol
    if payload.activo    is not None: user.activo    = payload.activo

    if payload.proyectos is not None:
        db.query(UsuarioProyecto).filter(UsuarioProyecto.id_usuario == user_id).delete()
        for id_proy in payload.proyectos:
            db.add(UsuarioProyecto(id_usuario=user_id, id_proyecto=id_proy))

    db.commit()
    registrar_log(db, current_user.id, "actualizar_usuario", f"Usuario actualizado: {user.correo}")
    return _build_response(_load_user(db, user_id))


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_usuario(
    user_id: int,
    db: Session = Depends(get_global_db),
    current_user: Usuario = Depends(require_superadmin),
):
    user = _load_user(db, user_id)
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propio usuario")
    user.activo = False
    db.commit()
    registrar_log(db, current_user.id, "eliminar_usuario", f"Usuario desactivado: {user.correo}")