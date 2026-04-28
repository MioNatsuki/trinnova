# backend/app/api/plantillas.py
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import re, os, io, zipfile

from app.db.session import get_global_db
from app.core.dependencies import get_current_active_user, check_project_access
from app.models.global_models import Usuario, Plantilla, PlantillaCampo
from app.db.router import get_project_db
from app.services.log_service import registrar_log
from pydantic import BaseModel

router = APIRouter()

# ── Schemas ───────────────────────────────────────────────────────────────────

class PlantillaCreate(BaseModel):
    id_proyecto: int
    nombre: str
    descripcion: Optional[str] = None
    origen: str = "editor"

class PlantillaUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    activa: Optional[bool] = None

class CampoMapeo(BaseModel):
    placeholder: str
    campo_bd: str
    orden: int = 0

class MapeoRequest(BaseModel):
    campos: List[CampoMapeo]

# ── Helpers ───────────────────────────────────────────────────────────────────

def _require_analista(user: Usuario):
    """
    FIX: user.rol es un objeto ORM (Rol), no un string.
    Se accede a user.rol.nombre para comparar.
    """
    rol_nombre = user.rol.nombre if hasattr(user.rol, "nombre") else str(user.rol)
    if rol_nombre not in ("superadmin", "analista"):
        raise HTTPException(status_code=403, detail="Requiere rol analista o superadmin.")

def _get_plantilla_or_404(db: Session, pid: int) -> Plantilla:
    p = db.query(Plantilla).filter(Plantilla.id == pid).first()
    if not p:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada.")
    return p

def _slug_from_proyecto_id(db: Session, proyecto_id: int) -> str:
    from sqlalchemy import text
    row = db.execute(
        text("SELECT slug FROM proyectos WHERE id = :id"), {"id": proyecto_id}
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    return row.slug

def _get_campos_analisis(slug: str) -> List[str]:
    """
    FIX: Busca primero tabla_analisis (que siempre existe si hay padrón cargado).
    Si no existe, intenta tabla_temporal como fallback.
    """
    for tabla in ("tabla_analisis", "tabla_temporal"):
        try:
            db = next(get_project_db(slug))
            from sqlalchemy import text
            rows = db.execute(text(f"SHOW COLUMNS FROM `{tabla}`")).fetchall()
            campos = [r[0] for r in rows if not r[0].startswith("_")]
            if campos:
                return campos
        except Exception:
            continue
    return []

def _extraer_placeholders_docx(contenido: bytes) -> List[str]:
    """
    Extrae {{campo}} de un .docx parseando el XML interno.
    Los placeholders en Word a veces se fragmentan en múltiples runs XML,
    por eso se une el texto completo antes de buscar con regex.
    """
    placeholders = []
    seen = set()
    try:
        with zipfile.ZipFile(io.BytesIO(contenido)) as z:
            with z.open("word/document.xml") as f:
                xml_text = f.read().decode("utf-8", errors="replace")

        # Quitar tags XML para quedarnos solo con el texto plano
        texto = re.sub(r"<[^>]+>", "", xml_text)

        for m in re.finditer(r"\{\{(\w+)\}\}", texto):
            ph = m.group(1)
            if ph not in seen:
                seen.add(ph)
                placeholders.append(ph)
    except Exception:
        pass
    return placeholders

def _mapeo_automatico(
    placeholders: List[str], campos_bd: List[str]
) -> Dict[str, Optional[str]]:
    campos_idx = {c.lower(): c for c in campos_bd}
    return {ph: campos_idx.get(ph.lower()) for ph in placeholders}

# ── GET / — listar plantillas ─────────────────────────────────────────────────
# IMPORTANTE: Las rutas con path estático (/subir, /campos-temporales-slug, etc.)
# deben registrarse ANTES que las rutas con parámetros (/{plantilla_id}).
# FastAPI evalúa las rutas en orden de registro.

@router.get("/")
def listar_plantillas(
    proyecto_id: Optional[int] = Query(None),
    activa: Optional[bool] = Query(None),
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    from sqlalchemy import text

    if current_user.rol.nombre == "superadmin":
        ids_permitidos = None
    else:
        rows = db.execute(
            text("SELECT id_proyecto FROM usuario_proyecto WHERE id_usuario = :u"),
            {"u": current_user.id},
        ).fetchall()
        ids_permitidos = [r.id_proyecto for r in rows]

    q = db.query(Plantilla)
    if proyecto_id:
        q = q.filter(Plantilla.id_proyecto == proyecto_id)
    if activa is not None:
        q = q.filter(Plantilla.activa == activa)
    if ids_permitidos is not None:
        q = q.filter(Plantilla.id_proyecto.in_(ids_permitidos))

    plantillas = q.order_by(Plantilla.created_at.desc()).all()

    result = []
    for p in plantillas:
        proy = db.execute(
            text("SELECT nombre, slug FROM proyectos WHERE id = :id"), {"id": p.id_proyecto}
        ).first()
        total_campos = (
            db.query(PlantillaCampo)
            .filter(PlantillaCampo.id_plantilla == p.id)
            .count()
        )
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
            "total_campos": total_campos,
        })
    return result

# ── POST / — crear metadata (para editor desde cero) ─────────────────────────

@router.post("/")
def crear_plantilla(
    body: PlantillaCreate,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    _require_analista(current_user)
    p = Plantilla(
        id_proyecto=body.id_proyecto,
        nombre=body.nombre,
        descripcion=body.descripcion,
        origen=body.origen,
        activa=True,
        created_by=current_user.id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    registrar_log(
        db, current_user.id, "crear_plantilla",
        f"Plantilla '{p.nombre}' creada (proyecto {body.id_proyecto})",
        body.id_proyecto,
    )
    return {"id": p.id, "mensaje": "Plantilla creada."}

# ── POST /subir — subir .docx ─────────────────────────────────────────────────
# CRÍTICO: Esta ruta DEBE estar antes de /{plantilla_id} para que FastAPI
# no intente parsear "subir" como un entero.

@router.post("/subir")
async def subir_plantilla_docx(
    proyecto_id: int = Query(...),
    nombre: str = Query(...),
    descripcion: Optional[str] = Query(None),
    file: UploadFile = File(...),
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    _require_analista(current_user)

    if not file.filename.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos .docx.")

    contenido = await file.read()

    # Extraer placeholders del docx
    placeholders = _extraer_placeholders_docx(contenido)

    # Guardar archivo físico
    upload_dir = os.path.join("uploads", "plantillas")
    os.makedirs(upload_dir, exist_ok=True)
    safe_name = re.sub(r"[^\w.\-]", "_", file.filename)
    ruta = os.path.join(upload_dir, f"{proyecto_id}_{safe_name}")
    with open(ruta, "wb") as f_out:
        f_out.write(contenido)

    # Crear registro en BD
    p = Plantilla(
        id_proyecto=proyecto_id,
        nombre=nombre,
        descripcion=descripcion,
        origen="upload",
        ruta_archivo=ruta,
        activa=True,
        created_by=current_user.id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)

    # Obtener campos disponibles y hacer mapeo automático
    slug = _slug_from_proyecto_id(db, proyecto_id)
    campos_bd = _get_campos_analisis(slug)
    mapeo_auto = _mapeo_automatico(placeholders, campos_bd)

    # Guardar mapeo automático de los que sí coincidieron
    for orden, (ph, campo) in enumerate(mapeo_auto.items()):
        if campo:
            db.add(PlantillaCampo(
                id_plantilla=p.id,
                placeholder=f"{{{{{ph}}}}}",
                campo_bd=campo,
                orden=orden,
            ))
    db.commit()

    registrar_log(
        db, current_user.id, "subir_plantilla",
        f"Plantilla '{nombre}' subida. {len(placeholders)} placeholders detectados.",
        proyecto_id,
    )

    return {
        "id": p.id,
        "mensaje": f"Plantilla subida con {len(placeholders)} placeholders detectados.",
        "placeholders": placeholders,
        "mapeo_automatico": mapeo_auto,
        "campos_disponibles": campos_bd,
    }

# ── GET /campos-temporales-slug/{proyecto_slug} ───────────────────────────────
# CRÍTICO: Ruta estática, debe ir ANTES de /{plantilla_id}.
# El frontend la llama como /plantillas/{slug}/campos-temporales-slug

@router.get("/{proyecto_slug}/campos-temporales-slug")
def campos_temporales_por_slug(
    proyecto_slug: str,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    """
    FIX: Este endpoint puede colisionar con /{plantilla_id} si se registra después.
    Al estar antes, FastAPI lo evalúa primero. Funciona porque proyecto_slug
    contiene letras/guiones bajos, no puede ser confundido con un int por FastAPI
    en tiempo de ejecución (aunque sí en orden de matching de rutas).
    """
    campos = _get_campos_analisis(proyecto_slug)
    return {"campos": campos, "proyecto_slug": proyecto_slug}

# ── GET /{plantilla_id} — detalle ─────────────────────────────────────────────
# Todas las rutas con /{plantilla_id} (int) van DESPUÉS de las rutas estáticas.

@router.get("/{plantilla_id}")
def detalle_plantilla(
    plantilla_id: int,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    p = _get_plantilla_or_404(db, plantilla_id)
    slug = _slug_from_proyecto_id(db, p.id_proyecto)
    campos = (
        db.query(PlantillaCampo)
        .filter(PlantillaCampo.id_plantilla == plantilla_id)
        .order_by(PlantillaCampo.orden)
        .all()
    )
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
        "campos": [
            {"id": c.id, "placeholder": c.placeholder, "campo_bd": c.campo_bd, "orden": c.orden}
            for c in campos
        ],
    }

# ── PUT /{plantilla_id} ───────────────────────────────────────────────────────

@router.put("/{plantilla_id}")
def actualizar_plantilla(
    plantilla_id: int,
    body: PlantillaUpdate,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    _require_analista(current_user)
    p = _get_plantilla_or_404(db, plantilla_id)
    if body.nombre is not None:
        p.nombre = body.nombre
    if body.descripcion is not None:
        p.descripcion = body.descripcion
    if body.activa is not None:
        p.activa = body.activa
    db.commit()
    return {"mensaje": "Actualizada."}

# ── DELETE /{plantilla_id} ────────────────────────────────────────────────────

@router.delete("/{plantilla_id}")
def eliminar_plantilla(
    plantilla_id: int,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    _require_analista(current_user)
    p = _get_plantilla_or_404(db, plantilla_id)
    # Soft delete: desactivar en lugar de borrar físicamente
    p.activa = False
    db.commit()
    return {"mensaje": "Plantilla desactivada."}

# ── POST /{plantilla_id}/mapear ───────────────────────────────────────────────

@router.post("/{plantilla_id}/mapear")
def guardar_mapeo(
    plantilla_id: int,
    body: MapeoRequest,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    _require_analista(current_user)
    p = _get_plantilla_or_404(db, plantilla_id)
    # Reemplazar mapeo anterior completamente
    db.query(PlantillaCampo).filter(PlantillaCampo.id_plantilla == plantilla_id).delete()
    for c in body.campos:
        db.add(PlantillaCampo(
            id_plantilla=plantilla_id,
            placeholder=c.placeholder,
            campo_bd=c.campo_bd,
            orden=c.orden,
        ))
    db.commit()
    registrar_log(
        db, current_user.id, "guardar_mapeo",
        f"Mapeo actualizado: plantilla {plantilla_id}, {len(body.campos)} campos.",
        p.id_proyecto,
    )
    return {"mensaje": f"{len(body.campos)} campos guardados."}

# ── GET /{plantilla_id}/campos-temporales ─────────────────────────────────────

@router.get("/{plantilla_id}/campos-temporales")
def campos_temporales(
    plantilla_id: int,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    p = _get_plantilla_or_404(db, plantilla_id)
    slug = _slug_from_proyecto_id(db, p.id_proyecto)
    return {"campos": _get_campos_analisis(slug), "proyecto_slug": slug}

# ── GET /{plantilla_id}/preview-mapeo ────────────────────────────────────────

@router.get("/{plantilla_id}/preview-mapeo")
def preview_mapeo(
    plantilla_id: int,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    p = _get_plantilla_or_404(db, plantilla_id)
    slug = _slug_from_proyecto_id(db, p.id_proyecto)
    campos_bd = _get_campos_analisis(slug)
    campos_actuales = (
        db.query(PlantillaCampo)
        .filter(PlantillaCampo.id_plantilla == plantilla_id)
        .order_by(PlantillaCampo.orden)
        .all()
    )
    return {
        "campos_actuales": [
            {"placeholder": c.placeholder, "campo_bd": c.campo_bd}
            for c in campos_actuales
        ],
        "campos_disponibles": campos_bd,
    }