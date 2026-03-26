from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.db.session import get_global_db
from app.core.security import decode_access_token
from app.models.global_models import Usuario, RolNombre

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_global_db),
) -> Usuario:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado o token inválido",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exc

    user_id: int = payload.get("sub")
    if user_id is None:
        raise credentials_exc

    user = db.query(Usuario).filter(Usuario.id == int(user_id), Usuario.activo == True).first()
    if user is None:
        raise credentials_exc
    return user


def get_current_active_user(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    if not current_user.activo:
        raise HTTPException(status_code=400, detail="Usuario inactivo")
    return current_user


# --- Guards de rol ---

def require_superadmin(current_user: Usuario = Depends(get_current_active_user)) -> Usuario:
    if current_user.rol.nombre != RolNombre.superadmin:
        raise HTTPException(status_code=403, detail="Se requiere rol superadmin")
    return current_user


def require_analista_or_above(current_user: Usuario = Depends(get_current_active_user)) -> Usuario:
    if current_user.rol.nombre not in (RolNombre.superadmin, RolNombre.analista):
        raise HTTPException(status_code=403, detail="Se requiere rol analista o superior")
    return current_user


def require_any_role(current_user: Usuario = Depends(get_current_active_user)) -> Usuario:
    """Cualquier usuario autenticado y activo."""
    return current_user


def check_project_access(project_slug: str, current_user: Usuario) -> None:
    """
    Verifica que el usuario tenga acceso al proyecto.
    Superadmin tiene acceso a todo.
    """
    if current_user.rol.nombre == RolNombre.superadmin:
        return
    slugs_asignados = [up.proyecto.slug for up in current_user.proyectos]
    if project_slug not in slugs_asignados:
        raise HTTPException(
            status_code=403,
            detail=f"Sin acceso al proyecto '{project_slug}'"
        )