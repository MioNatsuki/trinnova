from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from functools import lru_cache

# Mapa proyecto_slug → nombre de BD
PROJECT_DB_MAP = {
    "apa_tlajomulco":     settings.DB_APA_TLAJOMULCO,
    "predial_tlajomulco": settings.DB_PREDIAL_TLAJOMULCO,
    "licencias_gdl":      settings.DB_LICENCIAS_GDL,
    "predial_gdl":        settings.DB_PREDIAL_GDL,
    "pensiones":          settings.DB_PENSIONES,
    "estado":             settings.DB_ESTADO,
}


@lru_cache(maxsize=10)
def _get_engine(db_name: str):
    """Crea (o reutiliza) un engine por nombre de BD."""
    url = (
        f"mysql+pymysql://{settings.DB_GLOBAL_USER}:{settings.DB_GLOBAL_PASSWORD}"
        f"@{settings.DB_GLOBAL_HOST}:{settings.DB_GLOBAL_PORT}/{db_name}"
    )
    return create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=10)


def get_project_db(project_slug: str):
    """
    Dependencia FastAPI. Uso:
        db = Depends(lambda: get_project_db("apa_tlajomulco"))
    O desde el token del usuario actual (Fase 2).
    """
    if project_slug not in PROJECT_DB_MAP:
        raise ValueError(f"Proyecto desconocido: {project_slug}")
    db_name = PROJECT_DB_MAP[project_slug]
    engine = _get_engine(db_name)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = Session()
    try:
        yield db
    finally:
        db.close()