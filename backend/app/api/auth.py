from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session, joinedload
from app.db.session import get_global_db
from app.core.security import verify_password, create_access_token
from app.core.dependencies import get_current_active_user
from app.models.global_models import Usuario, UsuarioProyecto, Proyecto
from app.schemas.auth import LoginRequest, TokenResponse, UsuarioMe, ProyectoBasico
from app.services.log_service import registrar_log

router = APIRouter()


def _load_user_full(db: Session, user_id: int):
    return (
        db.query(Usuario)
        .options(
            joinedload(Usuario.rol),
            joinedload(Usuario.proyectos).joinedload(UsuarioProyecto.proyecto),
        )
        .filter(Usuario.id == user_id)
        .first()
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_global_db)):
    user = (
        db.query(Usuario)
        .options(joinedload(Usuario.rol))
        .filter(Usuario.correo == payload.correo)
        .first()
    )

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos",
        )
    if not user.activo:
        raise HTTPException(status_code=403, detail="Usuario inactivo")

    token = create_access_token(data={"sub": str(user.id), "rol": user.rol.nombre})

    registrar_log(
        db=db,
        id_usuario=user.id,
        accion="login",
        descripcion=f"Inicio de sesion exitoso: {user.correo}",
        ip=request.client.host,
    )

    return TokenResponse(access_token=token)


@router.get("/me", response_model=UsuarioMe)
def me(current_user: Usuario = Depends(get_current_active_user), db: Session = Depends(get_global_db)):
    print(f"Usuario autenticado: {current_user.id} - {current_user.correo}")
    user = _load_user_full(db, current_user.id)
    print(f"Proyectos encontrados: {len(user.proyectos)}")

    for up in user.proyectos:
        print(f"   - {up.proyecto.nombre} ({up.proyecto.slug}) - activo: {up.proyecto.activo}")

    proyectos = [
        ProyectoBasico(
            id=up.proyecto.id,
            nombre=up.proyecto.nombre,
            slug=up.proyecto.slug,
        )
        for up in user.proyectos
        if up.proyecto.activo
    ]

    return UsuarioMe(
        id=user.id,
        nombre=user.nombre,
        apellidos=user.apellidos,
        correo=user.correo,
        rol=user.rol.nombre,
        proyectos=proyectos,
    )


@router.post("/logout")
def logout(
    request: Request,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    registrar_log(
        db=db,
        id_usuario=current_user.id,
        accion="logout",
        descripcion=f"Cierre de sesion: {current_user.correo}",
        ip=request.client.host,
    )
    return {"message": "Sesion cerrada"}