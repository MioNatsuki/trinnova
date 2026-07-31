"""
Script para sincronizar el INPC desde la API del INEGI.
Ejecutar: python -m app.scripts.sincronizar_inpc
"""

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.services.inpc_service import INPCService
from app.models.global_models import Base

# Configurar conexión
DATABASE_URL = (
    f"mysql+pymysql://{settings.DB_GLOBAL_USER}:{settings.DB_GLOBAL_PASSWORD}"
    f"@{settings.DB_GLOBAL_HOST}:{settings.DB_GLOBAL_PORT}/{settings.DB_GLOBAL_NAME}"
)

engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
db = Session()

# Crear tabla si no existe
Base.metadata.create_all(engine)

try:
    resultado = INPCService.sincronizar_desde_inegi(db)
    print(f"✅ Sincronización completada: {resultado['total']} registros")
except Exception as e:
    print(f"❌ Error: {e}")
finally:
    db.close()