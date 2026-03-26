from sqlalchemy.orm import Session
from app.models.global_models import Log
from typing import Optional


def registrar_log(
    db: Session,
    accion: str,
    id_usuario: Optional[int] = None,
    id_proyecto: Optional[int] = None,
    descripcion: Optional[str] = None,
    ip: Optional[str] = None,
) -> None:
    """Registra una entrada en la bitácora. No lanza excepciones para no interrumpir el flujo."""
    try:
        log = Log(
            id_usuario=id_usuario,
            id_proyecto=id_proyecto,
            accion=accion,
            descripcion=descripcion,
            ip=ip,
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()