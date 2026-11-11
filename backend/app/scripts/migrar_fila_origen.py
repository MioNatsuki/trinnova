"""
Migración idempotente:
  - Agrega `_fila_origen INT NULL` a tabla_temporal en todos los proyectos.
  - Agrega `_fila_origen INT NULL` a tabla_temporal_subida_directa (por si
    ya existía antes del módulo).
  - Es seguro correrlo varias veces (IF NOT EXISTS / chequeo previo).
Ejecutar: python -m app.scripts.migrar_fila_origen
"""

import sys
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR))

from sqlalchemy import create_engine, text
from app.core.config import settings

PROYECTOS = [
    settings.DB_APA_TLAJOMULCO,
    settings.DB_PREDIAL_TLAJOMULCO,
    settings.DB_LICENCIAS_GDL,
    settings.DB_PREDIAL_GDL,
    settings.DB_PENSIONES,
    settings.DB_ESTADO,
]


def _existe_columna(db, tabla: str, columna: str) -> bool:
    r = db.execute(text(
        "SELECT COUNT(*) AS c FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c"
    ), {"t": tabla, "c": columna}).first()
    return bool(r and r.c > 0)


def _existe_tabla(db, tabla: str) -> bool:
    r = db.execute(text(
        "SELECT COUNT(*) AS c FROM information_schema.tables "
        "WHERE table_schema = DATABASE() AND table_name = :t"
    ), {"t": tabla}).first()
    return bool(r and r.c > 0)


def migrar():
    base_url = (
        f"mysql+pymysql://{settings.DB_GLOBAL_USER}:{settings.DB_GLOBAL_PASSWORD}"
        f"@{settings.DB_GLOBAL_HOST}:{settings.DB_GLOBAL_PORT}"
    )

    for db_name in PROYECTOS:
        if not db_name:
            continue
        engine = create_engine(f"{base_url}/{db_name}")
        with engine.begin() as db:
            # tabla_temporal
            if _existe_tabla(db, "tabla_temporal") and not _existe_columna(db, "tabla_temporal", "_fila_origen"):
                db.execute(text(
                    "ALTER TABLE `tabla_temporal` "
                    "ADD COLUMN `_fila_origen` INT NULL"
                ))
                print(f"[{db_name}] tabla_temporal: _fila_origen agregada")
            else:
                print(f"[{db_name}] tabla_temporal: sin cambios")

            # tabla_temporal_subida_directa
            if _existe_tabla(db, "tabla_temporal_subida_directa") and not _existe_columna(db, "tabla_temporal_subida_directa", "_fila_origen"):
                db.execute(text(
                    "ALTER TABLE `tabla_temporal_subida_directa` "
                    "ADD COLUMN `_fila_origen` INT NULL"
                ))
                print(f"[{db_name}] tabla_temporal_subida_directa: _fila_origen agregada")
            else:
                print(f"[{db_name}] tabla_temporal_subida_directa: sin cambios")
        engine.dispose()


if __name__ == "__main__":
    migrar()
    print("Migración completada.")