# backend/app/api/plantillas.py
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import re
import io
import zipfile
import base64
from pathlib import Path

from app.db.session import get_global_db
from app.core.dependencies import get_current_active_user, check_project_access
from app.models.global_models import Usuario, Plantilla, PlantillaCampo
from app.db.router import get_project_db
from app.services.log_service import registrar_log
from app.services.plantilla_renderer import (
    PlantillaRenderer,
    generar_preview_pdf,
    obtener_placeholders_especiales
)
from pydantic import BaseModel

# ============================================
# ROUTER - DEBE ESTAR AL PRINCIPIO
# ============================================
router = APIRouter()
# ============================================
# SCHEMAS
# ============================================
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

class PreviewRequest(BaseModel):
    """Request para preview de plantilla"""
    placeholders: Dict[str, str] = {}
    preview_on: bool = False

# ============================================
# HELPERS
# ============================================
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

# ============================================
# ENDPOINTS EXISTENTES (MODIFICADOS)
# ============================================

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
            "nombre_archivo": p.nombre_archivo,
            "activa": p.activa,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            "total_campos": total_campos,
        })
    return result

@router.get("/{proyecto_slug}/campos-temporales-slug")
def campos_temporales_por_slug(
    proyecto_slug: str,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    campos = _get_campos_analisis(proyecto_slug)
    return {"campos": campos, "proyecto_slug": proyecto_slug}

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
        "nombre_archivo": p.nombre_archivo,
        "activa": p.activa,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "campos": [
            {"id": c.id, "placeholder": c.placeholder, "campo_bd": c.campo_bd, "orden": c.orden}
            for c in campos
        ],
    }

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

# ============================================
# NUEVOS ENDPOINTS - FASE 4
# ============================================

@router.post("/{plantilla_id}/preview")
def preview_plantilla_pdf(
    plantilla_id: int,
    body: PreviewRequest,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    """
    Genera un PDF de preview de la plantilla usando el nuevo motor de renderizado
    
    - preview_on: False → muestra placeholders resaltados en amarillo
    - preview_on: True → reemplaza placeholders con datos reales
    """
    # Obtener plantilla
    plantilla = _get_plantilla_or_404(db, plantilla_id)
    
    # Verificar que tiene nombre_archivo
    if not plantilla.nombre_archivo:
        raise HTTPException(
            status_code=400,
            detail="La plantilla no tiene asociado un archivo HTML. Ejecuta la sincronización primero."
        )
    
    # Obtener slug del proyecto
    proyecto_slug = _slug_from_proyecto_id(db, plantilla.id_proyecto)
    
    # Verificar acceso al proyecto
    check_project_access(proyecto_slug, current_user, db)
    
    try:
        # Generar PDF usando el renderer
        pdf_bytes = generar_preview_pdf(
            proyecto_slug=proyecto_slug,
            nombre_archivo=plantilla.nombre_archivo.split('/')[-1],  # Solo el nombre del archivo
            placeholders=body.placeholders if body.preview_on else {},
            preview_mode=not body.preview_on  # Si preview_on=False, resaltar placeholders
        )
        
        # Convertir a base64 para enviar al frontend
        pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
        
        return {
            "success": True,
            "pdf_base64": pdf_base64,
            "preview_on": body.preview_on,
            "plantilla_id": plantilla_id,
            "nombre_archivo": plantilla.nombre_archivo
        }
        
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=f"Archivo HTML no encontrado: {str(e)}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error generando PDF: {str(e)}")

@router.post("/sincronizar")
def sincronizar_plantillas(
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    """
    Sincroniza las plantillas HTML del sistema con la base de datos.
    Solo accesible para superadmin.
    """
    from app.core.dependencies import require_superadmin
    require_superadmin(current_user)
    
    from sqlalchemy import text
    
    base_path = Path(__file__).parent.parent / "plantillas_html"
    
    if not base_path.exists():
        raise HTTPException(status_code=404, detail="Carpeta de plantillas no encontrada")
    
    # Mapeo de carpetas a slugs de proyecto
    carpetas_proyectos = {
        "apa_tlajomulco": "apa_tlajomulco",
        "estado": "estado",
        "pensiones": "pensiones",
        "predial_gdl": "predial_gdl",
        "predial_tlajomulco": "predial_tlajomulco",
        "licencias_gdl": "licencias_gdl",
    }
    
    resultados = {
        "creadas": 0,
        "actualizadas": 0,
        "errores": [],
        "total_archivos": 0
    }
    
    # Recorrer carpetas
    for carpeta in base_path.iterdir():
        if not carpeta.is_dir():
            continue
            
        proyecto_slug = carpeta.name
        if proyecto_slug not in carpetas_proyectos:
            continue
            
        # Obtener ID del proyecto
        proyecto = db.execute(
            text("SELECT id FROM proyectos WHERE slug = :slug"),
            {"slug": proyecto_slug}
        ).first()
        
        if not proyecto:
            resultados["errores"].append(f"Proyecto no encontrado: {proyecto_slug}")
            continue
            
        proyecto_id = proyecto.id
        
        # Procesar archivos HTML
        archivos_html = list(carpeta.glob("*.html"))
        resultados["total_archivos"] += len(archivos_html)
        
        for archivo in archivos_html:
            try:
                nombre_archivo = archivo.name
                nombre_base = archivo.stem
                nombre_plantilla = nombre_base.replace('_', ' ').title()
                nombre_archivo_relativo = f"{proyecto_slug}/{nombre_archivo}"
                
                # Leer HTML y extraer placeholders
                with open(archivo, 'r', encoding='utf-8') as f:
                    contenido = f.read()
                
                # Extraer placeholders
                pattern = r'\{\{([a-zA-Z0-9_]+)\}\}'
                placeholders = list(dict.fromkeys(re.findall(pattern, contenido)))
                
                # Verificar si ya existe
                existente = db.query(Plantilla).filter(
                    Plantilla.nombre_archivo == nombre_archivo_relativo
                ).first()
                
                if existente:
                    existente.nombre = nombre_plantilla
                    existente.activa = True
                    plantilla = existente
                    resultados["actualizadas"] += 1
                else:
                    nueva = Plantilla(
                        id_proyecto=proyecto_id,
                        nombre=nombre_plantilla,
                        descripcion=f"Plantilla {nombre_plantilla}",
                        nombre_archivo=nombre_archivo_relativo,
                        activa=True,
                        created_by=current_user.id
                    )
                    db.add(nueva)
                    db.flush()
                    plantilla = nueva
                    resultados["creadas"] += 1
                
                # Actualizar campos
                db.query(PlantillaCampo).filter(
                    PlantillaCampo.id_plantilla == plantilla.id
                ).delete()
                
                for orden, placeholder in enumerate(placeholders):
                    campo = PlantillaCampo(
                        id_plantilla=plantilla.id,
                        placeholder=f"{{{{{placeholder}}}}}",
                        campo_bd=placeholder,
                        orden=orden
                    )
                    db.add(campo)
                
            except Exception as e:
                resultados["errores"].append(f"Error en {archivo.name}: {str(e)}")
    
    db.commit()
    
    return {
        "success": True,
        "message": f"Sincronización completada",
        "resultados": resultados
    }

@router.get("/placeholders-especiales")
def obtener_placeholders_especiales_endpoint(
    current_user: Usuario = Depends(get_current_active_user),
):
    """
    Obtiene la lista de placeholders especiales del sistema
    """
    return obtener_placeholders_especiales()

@router.get("/{plantilla_id}/placeholders")
def obtener_placeholders_plantilla(
    plantilla_id: int,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    """
    Obtiene los placeholders de una plantilla (para mostrar en el frontend)
    """
    plantilla = _get_plantilla_or_404(db, plantilla_id)
    
    campos = db.query(PlantillaCampo).filter(
        PlantillaCampo.id_plantilla == plantilla_id
    ).order_by(PlantillaCampo.orden).all()
    
    return {
        "plantilla_id": plantilla_id,
        "nombre": plantilla.nombre,
        "nombre_archivo": plantilla.nombre_archivo,
        "placeholders": [
            {
                "placeholder": c.placeholder,
                "campo_bd": c.campo_bd,
                "orden": c.orden
            }
            for c in campos
        ]
    }