from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.db.session import get_global_db
from app.core.security import decode_access_token
from app.models.global_models import Usuario, RolNombre, Proyecto, UsuarioProyecto

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


def check_project_access(proyecto_slug: str, current_user: Usuario, db: Session = None) -> Proyecto:
    """
    Verifica que el usuario tenga acceso al proyecto.
    Retorna el proyecto si tiene acceso.
    """    
    # Obtener proyecto por slug
    proyecto = None
    if db:
        proyecto = db.query(Proyecto).filter(Proyecto.slug == proyecto_slug).first()
    else:
        # Si no hay db, necesitamos una sesión global
        from app.db.session import SessionGlobal
        session = SessionGlobal()
        try:
            proyecto = session.query(Proyecto).filter(Proyecto.slug == proyecto_slug).first()
        finally:
            session.close()
    
    if not proyecto:
        raise HTTPException(status_code=404, detail=f"Proyecto '{proyecto_slug}' no encontrado")
    
    # Superadmin tiene acceso a todo
    if current_user.rol.nombre == RolNombre.superadmin:
        return proyecto
    
    # Verificar asignación
    if db:
        asignado = db.query(UsuarioProyecto).filter(
            UsuarioProyecto.id_usuario == current_user.id,
            UsuarioProyecto.id_proyecto == proyecto.id
        ).first()
    else:
        from app.db.session import SessionGlobal
        session = SessionGlobal()
        try:
            asignado = session.query(UsuarioProyecto).filter(
                UsuarioProyecto.id_usuario == current_user.id,
                UsuarioProyecto.id_proyecto == proyecto.id
            ).first()
        finally:
            session.close()
    
    if not asignado:
        raise HTTPException(
            status_code=403,
            detail=f"No tienes acceso al proyecto '{proyecto_slug}'"
        )
    
    return proyecto