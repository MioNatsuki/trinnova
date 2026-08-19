# backend/app/db/router.py

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from functools import lru_cache
from fastapi import HTTPException

# Importamos la sesión global y el modelo para buscar el mapeo
from app.db.session import SessionGlobal
from app.models.global_models import Proyecto

@lru_cache(maxsize=10)
def _get_engine(db_name: str):
    """
    Crea (o reutiliza) un engine por nombre de BD.
    Mantenemos el cache para no recrear conexiones innecesariamente.
    """
    url = (
        f"mysql+pymysql://{settings.DB_GLOBAL_USER}:{settings.DB_GLOBAL_PASSWORD}"
        f"@{settings.DB_GLOBAL_HOST}:{settings.DB_GLOBAL_PORT}/{db_name}"
    )
    return create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=10)


def get_project_db(project_slug: str):
    """
    Busca dinámicamente el nombre de la base de datos del proyecto 
    en la tabla global y entrega una sesión.
    """
    
    # 1. Obtener el nombre de la base de datos desde la DB Global
    db_global = SessionGlobal()
    db_name = None
    try:
        proyecto = db_global.query(Proyecto).filter(
            Proyecto.slug == project_slug, 
            Proyecto.activo == True
        ).first()
        
        if not proyecto:
            raise HTTPException(
                status_code=404, 
                detail=f"El proyecto '{project_slug}' no existe o está inactivo."
            )
        
        db_name = proyecto.db_name
    finally:
        db_global.close() # Cerramos la conexión a la global de inmediato

    # 2. Crear sesión para la base de datos específica del proyecto
    engine = _get_engine(db_name)
    ProjectSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = ProjectSession()
    
    try:
        yield db
    finally:
        db.close()