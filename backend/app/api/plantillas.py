# backend/app/api/plantillas.py
"""
Módulo de Plantillas — Fase 4
Endpoints:
  GET    /                              → listar plantillas (filtros: proyecto, padrón)
  POST   /                              → crear plantilla (metadata)
  GET    /{id}                          → detalle de plantilla + campos
  PUT    /{id}                          → actualizar metadata
  DELETE /{id}                          → eliminar plantilla (superadmin/analista)
  POST   /subir                         → subir .docx, extraer placeholders {{campo}}
  POST   /{id}/mapear                   → guardar mapeo placeholder → campo_bd
  GET    /{id}/campos-temporales        → campos disponibles en tabla_temporal del proyecto
  GET    /{id}/preview-mapeo            → previsualizar mapeo automático
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import re
import os
import io
import zipfile

from app.db.session import get_global_db
from app.core.dependencies import get_current_active_user, check_project_access
from app.models.global_models import Usuario, Plantilla, PlantillaCampo
from app.db.router import get_project_db
from app.services.log_service import registrar_log
from pydantic import BaseModel

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────────────────────────

class PlantillaCreate(BaseModel):
    id_proyecto: int
    nombre: str
    descripcion: Optional[str] = None
    origen: str = "editor"          # "upload" | "editor"

class PlantillaUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    activa: Optional[bool] = None

class CampoMapeo(BaseModel):
    placeholder: str    # ej: "{{cuenta}}"
    campo_bd: str       # ej: "cuenta"
    orden: int = 0

class MapeoRequest(BaseModel):
    campos: List[CampoMapeo]


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _require_analista(user: Usuario):
    if user.rol not in ("superadmin", "analista"):
        raise HTTPException(status_code=403, detail="Requiere rol analista o superadmin.")

def _get_plantilla_or_404(db: Session, plantilla_id: int) -> "Plantilla":
    p = db.query(Plantilla).filter(Plantilla.id == plantilla_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada.")
    return p

def _get_slug_from_proyecto_id(db: Session, proyecto_id: int) -> str:
    from sqlalchemy import text
    row = db.execute(text("SELECT slug FROM proyectos WHERE id = :id"), {"id": proyecto_id}).first()
    if not row:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    return row.slug

def _extraer_placeholders_docx(contenido: bytes) -> List[str]:
    """
    Extrae todos los placeholders {{campo}} de un archivo .docx.
    Un .docx es un ZIP; el contenido textual está en word/document.xml.
    """
    placeholders = set()
    try:
        with zipfile.ZipFile(io.BytesIO(contenido)) as z:
            with z.open("word/document.xml") as f:
                xml_text = f.read().decode("utf-8", errors="replace")
        # Los placeholders pueden estar fragmentados entre tags XML.
        # Limpiamos tags y buscamos el patrón.
        texto_limpio = re.sub(r"<[^>]+>", "", xml_text)
        encontrados = re.findall(r"\{\{(\w+)\}\}", texto_limpio)
        placeholders.update(encontrados)
    except Exception:
        pass
    return sorted(list(placeholders))

def _get_campos_temporal(proyecto_slug: str) -> List[str]:
    """Obtiene las columnas de tabla_temporal para el proyecto."""
    try:
        db_proyecto = next(get_project_db(proyecto_slug))
        from sqlalchemy import text
        rows = db_proyecto.execute(text("SHOW COLUMNS FROM `tabla_temporal`")).fetchall()
        return [r[0] for r in rows]
    except Exception:
        return []

def _mapeo_automatico(placeholders: List[str], campos_bd: List[str]) -> Dict[str, Optional[str]]:
    """Intenta mapear automáticamente placeholder → campo_bd por similitud exacta."""
    campos_set = set(campos_bd)
    resultado = {}
    for ph in placeholders:
        # Coincidencia exacta
        if ph in campos_set:
            resultado[ph] = ph
        else:
            # Búsqueda case-insensitive
            match = next((c for c in campos_bd if c.lower() == ph.lower()), None)
            resultado[ph] = match  # puede ser None si no hay match
    return resultado


# ──────────────────────────────────────────────────────────────────────────────
# GET /plantillas — listar
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/")
def listar_plantillas(
    proyecto_id: Optional[int] = Query(None),
    activa: Optional[bool] = Query(None),
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    from sqlalchemy import text

    # Superadmin ve todo; analista/auxiliar solo sus proyectos
    if current_user.rol == "superadmin":
        proyecto_ids_permitidos = None  # sin restricción
    else:
        rows = db.execute(
            text("SELECT id_proyecto FROM usuario_proyecto WHERE id_usuario = :uid"),
            {"uid": current_user.id},
        ).fetchall()
        proyecto_ids_permitidos = [r.id_proyecto for r in rows]

    q = db.query(Plantilla)
    if proyecto_id:
        q = q.filter(Plantilla.id_proyecto == proyecto_id)
    if activa is not None:
        q = q.filter(Plantilla.activa == activa)
    if proyecto_ids_permitidos is not None:
        q = q.filter(Plantilla.id_proyecto.in_(proyecto_ids_permitidos))

    plantillas = q.order_by(Plantilla.created_at.desc()).all()

    result = []
    for p in plantillas:
        # Obtener nombre del proyecto
        proy = db.execute(
            text("SELECT nombre, slug FROM proyectos WHERE id = :id"), {"id": p.id_proyecto}
        ).first()
        result.append({
            "id": p.id,
            "id_proyecto": p.id_proyecto,
            "proyecto_nombre": proy.nombre if proy else "—",
            "proyecto_slug": proy.slug if proy else "",
            "nombre": p.nombre,
            "descripcion": p.descripcion,
            "origen": p.origen,
            "activa": p.activa,
            "ruta_archivo": p.ruta_archivo,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            "total_campos": db.query(PlantillaCampo).filter(PlantillaCampo.id_plantilla == p.id).count(),
        })
    return result


# ──────────────────────────────────────────────────────────────────────────────
# POST /plantillas — crear (solo metadata; el contenido se sube por separado)
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/")
def crear_plantilla(
    body: PlantillaCreate,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    _require_analista(current_user)

    if current_user.rol != "superadmin":
        from sqlalchemy import text
        permitido = db.execute(
            text("SELECT 1 FROM usuario_proyecto WHERE id_usuario=:u AND id_proyecto=:p"),
            {"u": current_user.id, "p": body.id_proyecto},
        ).first()
        if not permitido:
            raise HTTPException(status_code=403, detail="Sin acceso a este proyecto.")

    plantilla = Plantilla(
        id_proyecto=body.id_proyecto,
        nombre=body.nombre,
        descripcion=body.descripcion,
        origen=body.origen,
        activa=True,
        created_by=current_user.id,
    )
    db.add(plantilla)
    db.commit()
    db.refresh(plantilla)
    registrar_log(db, current_user.id, "crear_plantilla",
        f"Plantilla '{plantilla.nombre}' creada (proyecto {body.id_proyecto})", body.id_proyecto)
    return {"id": plantilla.id, "mensaje": "Plantilla creada."}


# ──────────────────────────────────────────────────────────────────────────────
# GET /plantillas/{id} — detalle + campos de mapeo
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/{plantilla_id}")
def detalle_plantilla(
    plantilla_id: int,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    p = _get_plantilla_or_404(db, plantilla_id)
    campos = db.query(PlantillaCampo).filter(
        PlantillaCampo.id_plantilla == plantilla_id
    ).order_by(PlantillaCampo.orden).all()

    slug = _get_slug_from_proyecto_id(db, p.id_proyecto)
    return {
        "id": p.id,
        "id_proyecto": p.id_proyecto,
        "proyecto_slug": slug,
        "nombre": p.nombre,
        "descripcion": p.descripcion,
        "origen": p.origen,
        "activa": p.activa,
        "ruta_archivo": p.ruta_archivo,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "campos": [{"id": c.id, "placeholder": c.placeholder, "campo_bd": c.campo_bd, "orden": c.orden}
                   for c in campos],
    }


# ──────────────────────────────────────────────────────────────────────────────
# PUT /plantillas/{id} — actualizar metadata
# ──────────────────────────────────────────────────────────────────────────────

@router.put("/{plantilla_id}")
def actualizar_plantilla(
    plantilla_id: int,
    body: PlantillaUpdate,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    _require_analista(current_user)
    p = _get_plantilla_or_404(db, plantilla_id)
    if body.nombre is not None:       p.nombre = body.nombre
    if body.descripcion is not None:  p.descripcion = body.descripcion
    if body.activa is not None:       p.activa = body.activa
    db.commit()
    return {"mensaje": "Plantilla actualizada."}


# ──────────────────────────────────────────────────────────────────────────────
# DELETE /plantillas/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.delete("/{plantilla_id}")
def eliminar_plantilla(
    plantilla_id: int,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    _require_analista(current_user)
    p = _get_plantilla_or_404(db, plantilla_id)
    db.delete(p)
    db.commit()
    registrar_log(db, current_user.id, "eliminar_plantilla",
        f"Plantilla {plantilla_id} eliminada", p.id_proyecto)
    return {"mensaje": "Plantilla eliminada."}


# ──────────────────────────────────────────────────────────────────────────────
# POST /plantillas/subir — subir .docx y extraer placeholders
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/subir")
async def subir_plantilla_docx(
    proyecto_id: int,
    nombre: str,
    descripcion: Optional[str] = None,
    file: UploadFile = File(...),
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    _require_analista(current_user)

    if not file.filename.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="Solo se admiten archivos .docx.")

    contenido = await file.read()

    # Extraer placeholders
    placeholders = _extraer_placeholders_docx(contenido)

    # Guardar el archivo en disco (ajusta la ruta según tu servidor)
    upload_dir = os.path.join("uploads", "plantillas")
    os.makedirs(upload_dir, exist_ok=True)
    safe_name = re.sub(r"[^\w.\-]", "_", file.filename)
    ruta = os.path.join(upload_dir, f"{proyecto_id}_{safe_name}")
    with open(ruta, "wb") as f:
        f.write(contenido)

    # Crear plantilla en BD
    plantilla = Plantilla(
        id_proyecto=proyecto_id,
        nombre=nombre,
        descripcion=descripcion,
        origen="upload",
        ruta_archivo=ruta,
        activa=True,
        created_by=current_user.id,
    )
    db.add(plantilla)
    db.commit()
    db.refresh(plantilla)

    # Mapeo automático contra campos de tabla_temporal
    slug = _get_slug_from_proyecto_id(db, proyecto_id)
    campos_bd = _get_campos_temporal(slug)
    mapeo_auto = _mapeo_automatico(placeholders, campos_bd)

    # Guardar mapeo automático
    for orden, (ph, campo) in enumerate(mapeo_auto.items()):
        if campo:
            db.add(PlantillaCampo(
                id_plantilla=plantilla.id,
                placeholder=f"{{{{{ph}}}}}",
                campo_bd=campo,
                orden=orden,
            ))
    db.commit()

    registrar_log(db, current_user.id, "subir_plantilla",
        f"Plantilla '{nombre}' subida. {len(placeholders)} placeholders encontrados.", proyecto_id)

    return {
        "id": plantilla.id,
        "mensaje": f"Plantilla subida con {len(placeholders)} placeholders.",
        "placeholders": placeholders,
        "mapeo_automatico": mapeo_auto,
        "campos_disponibles": campos_bd,
    }


# ──────────────────────────────────────────────────────────────────────────────
# POST /plantillas/{id}/mapear — guardar/actualizar mapeo de campos
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/{plantilla_id}/mapear")
def guardar_mapeo(
    plantilla_id: int,
    body: MapeoRequest,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    _require_analista(current_user)
    p = _get_plantilla_or_404(db, plantilla_id)

    # Reemplazar todos los campos existentes
    db.query(PlantillaCampo).filter(PlantillaCampo.id_plantilla == plantilla_id).delete()
    for campo in body.campos:
        db.add(PlantillaCampo(
            id_plantilla=plantilla_id,
            placeholder=campo.placeholder,
            campo_bd=campo.campo_bd,
            orden=campo.orden,
        ))
    db.commit()
    registrar_log(db, current_user.id, "mapear_plantilla",
        f"Mapeo guardado: {len(body.campos)} campos en plantilla {plantilla_id}", p.id_proyecto)
    return {"mensaje": f"{len(body.campos)} campos guardados."}


# ──────────────────────────────────────────────────────────────────────────────
# GET /plantillas/{id}/campos-temporales — columnas disponibles en tabla_temporal
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/{plantilla_id}/campos-temporales")
def campos_temporales(
    plantilla_id: int,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    p = _get_plantilla_or_404(db, plantilla_id)
    slug = _get_slug_from_proyecto_id(db, p.id_proyecto)
    campos = _get_campos_temporal(slug)
    return {"campos": campos, "proyecto_slug": slug}


# ──────────────────────────────────────────────────────────────────────────────
# GET /plantillas/{id}/preview-mapeo — previsualizar mapeo automático
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/{plantilla_id}/preview-mapeo")
def preview_mapeo(
    plantilla_id: int,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    p = _get_plantilla_or_404(db, plantilla_id)
    slug = _get_slug_from_proyecto_id(db, p.id_proyecto)
    campos_bd = _get_campos_temporal(slug)

    campos_actuales = db.query(PlantillaCampo).filter(
        PlantillaCampo.id_plantilla == plantilla_id
    ).order_by(PlantillaCampo.orden).all()

    return {
        "campos_actuales": [{"placeholder": c.placeholder, "campo_bd": c.campo_bd} for c in campos_actuales],
        "campos_disponibles": campos_bd,
    }
