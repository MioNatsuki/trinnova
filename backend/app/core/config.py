from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path
import os
from dotenv import load_dotenv

# Cargar .env
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BACKEND_DIR / ".env"
if ENV_FILE.exists():
    load_dotenv(ENV_FILE)

class Settings(BaseSettings):
    # JWT
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

    # Base de datos global
    DB_GLOBAL_HOST: str = os.getenv("DB_GLOBAL_HOST", "localhost")
    DB_GLOBAL_PORT: int = int(os.getenv("DB_GLOBAL_PORT", "3305"))
    DB_GLOBAL_USER: str = os.getenv("DB_GLOBAL_USER", "")
    DB_GLOBAL_PASSWORD: str = os.getenv("DB_GLOBAL_PASSWORD", "")
    DB_GLOBAL_NAME: str = os.getenv("DB_GLOBAL_NAME", "")

    # Nombres de las BDs por proyecto
    DB_APA_TLAJOMULCO: str = os.getenv("DB_APA_TLAJOMULCO", "")
    DB_PREDIAL_TLAJOMULCO: str = os.getenv("DB_PREDIAL_TLAJOMULCO", "")
    DB_LICENCIAS_GDL: str = os.getenv("DB_LICENCIAS_GDL", "")
    DB_PREDIAL_GDL: str = os.getenv("DB_PREDIAL_GDL", "")
    DB_PENSIONES: str = os.getenv("DB_PENSIONES", "")
    DB_ESTADO: str = os.getenv("DB_ESTADO", "")

    # REDIS Configuration
    REDIS_HOST: str = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))
    REDIS_PASSWORD: str = os.getenv("REDIS_PASSWORD", "")
    REDIS_DB: int = int(os.getenv("REDIS_DB", "0"))
    REDIS_QUEUE_NAME: str = os.getenv("REDIS_QUEUE_NAME", "emision_jobs")
    
    # Emisión Configuration
    MAX_WORKERS: int = int(os.getenv("MAX_WORKERS", "4"))
    CHECKPOINT_INTERVAL: int = int(os.getenv("CHECKPOINT_INTERVAL", "50"))
    MAX_JOBS_PER_USER: int = int(os.getenv("MAX_JOBS_PER_USER", "1"))
    MAX_TOTAL_JOBS: int = int(os.getenv("MAX_TOTAL_JOBS", "5"))
    JOB_TIMEOUT: int = int(os.getenv("JOB_TIMEOUT", "3600"))
    
    # Almacenamiento
    EMISIONES_PATH: str = os.getenv("EMISIONES_PATH", str(BACKEND_DIR.parent / "Emisiones"))
    TEMP_PATH: str = os.getenv("TEMP_PATH", str(BACKEND_DIR.parent / "Temp"))

    class Config:
        pass


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()