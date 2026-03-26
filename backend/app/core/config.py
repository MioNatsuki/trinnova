from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # JWT
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # Base de datos global
    DB_GLOBAL_HOST: str = "localhost"
    DB_GLOBAL_PORT: int = 3305
    DB_GLOBAL_USER: str
    DB_GLOBAL_PASSWORD: str
    DB_GLOBAL_NAME: str

    # Nombres de las BDs por proyecto
    DB_APA_TLAJOMULCO: str
    DB_PREDIAL_TLAJOMULCO: str
    DB_LICENCIAS_GDL: str
    DB_PREDIAL_GDL: str
    DB_PENSIONES: str
    DB_ESTADO: str

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()