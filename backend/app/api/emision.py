# backend/app/api/emision.py
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
import io
import zipfile
import re
import copy
import os

from app.db.session import get_global_db
from app.core.dependencies import get_current_active_user, check_project_access
from app.models.global_models import Usuario, Plantilla, PlantillaCampo
from app.db.router import get_project_db

router = APIRouter(prefix="/api/v1/emision", tags=["Emisión"])


@router.post("/preview/{plantilla_id}/{pk_value}")
def preview_documento(
    plantilla_id: int,
    pk_value: str,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Genera una vista previa del documento con datos reales de UN registro.
    """
    # Obtener plantilla y verificar acceso
    plantilla = db_global.query(Plantilla).filter(Plantilla.id == plantilla_id).first()
    if not plantilla:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada.")

    from sqlalchemy import text as sa_text
    proy = db_global.execute(
        sa_text("SELECT slug FROM proyectos WHERE id = :id"),
        {"id": plantilla.id_proyecto}
    ).first()
    if not proy:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")

    check_project_access(proy.slug, current_user, db_global)

    # Obtener mapeo de campos
    campos = db_global.query(PlantillaCampo).filter(
        PlantillaCampo.id_plantilla == plantilla_id
    ).order_by(PlantillaCampo.orden).all()

    if not campos:
        raise HTTPException(status_code=400, detail="La plantilla no tiene mapeo de campos.")

    # Obtener datos del registro desde tabla_analisis
    db_proyecto = next(get_project_db(proy.slug))

    # Detectar PK del proyecto
    pk_col = db_proyecto.execute(sa_text(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_NAME = 'tabla_analisis' AND COLUMN_KEY = 'PRI' LIMIT 1"
    )).first()
    if not pk_col:
        # Fallback: leer info del proyecto
        from app.api.analisis import _info
        info = _info(proy.slug)
        pk_col_name = info["pk"]
    else:
        pk_col_name = pk_col[0]

    row = db_proyecto.execute(
        sa_text(f"SELECT * FROM tabla_analisis WHERE `{pk_col_name}` = :pk"),
        {"pk": pk_value}
    ).first()

    if not row:
        raise HTTPException(status_code=404, detail="Registro no encontrado en tabla_analisis.")

    row_dict = dict(row._mapping)

    # Crear diccionario de reemplazos
    reemplazos = {}
    for c in campos:
        placeholder = c.placeholder  # {{campo}}
        campo_bd = c.campo_bd
        valor = row_dict.get(campo_bd, "")
        if valor is None:
            valor = ""
        reemplazos[placeholder] = str(valor)

    # Si no hay archivo físico, no podemos hacer preview
    if not plantilla.ruta_archivo or not os.path.exists(plantilla.ruta_archivo):
        return {
            "success": True,
            "message": "Vista previa textual (sin archivo .docx)",
            "datos": reemplazos,
            "registro": row_dict
        }

    # Procesar el documento .docx
    import os as _os
    ruta = plantilla.ruta_archivo

    with zipfile.ZipFile(ruta, 'r') as zin:
        with zipfile.ZipFile(io.BytesIO(), 'w') as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)

                # Solo procesar XML
                if item.filename.endswith('.xml') or item.filename == 'word/document.xml':
                    texto = data.decode('utf-8', errors='replace')
                    for ph, valor in reemplazos.items():
                        # Reemplazar {{campo}} con el valor real
                        texto = texto.replace(ph, valor)
                    data = texto.encode('utf-8')

                zout.writestr(item, data)

            # Obtener el buffer del zip modificado
            zout_bytes = io.BytesIO()
            # Necesitamos cerrar el zip actual y crear uno nuevo
            # (zipfile no permite es 
            # ...

    return {"success": True, "message": "Preview generado", "datos": reemplazos}