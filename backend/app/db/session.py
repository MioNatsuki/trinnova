from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import settings

DATABASE_URL_GLOBAL = (
    f"mysql+pymysql://{settings.DB_GLOBAL_USER}:{settings.DB_GLOBAL_PASSWORD}"
    f"@{settings.DB_GLOBAL_HOST}:{settings.DB_GLOBAL_PORT}/{settings.DB_GLOBAL_NAME}"
)

engine_global = create_engine(
    DATABASE_URL_GLOBAL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

SessionGlobal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine_global,
)


class Base(DeclarativeBase):
    pass


def get_global_db():
    """Dependencia FastAPI para obtener sesión de db_global."""
    db = SessionGlobal()
    try:
        yield db
    finally:
        db.close()