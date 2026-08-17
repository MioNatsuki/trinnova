# backend/app/api/catalogos.py
"""
Catálogos CRUD - Fase 6
- Documentos
- Notificadores
- Zonas
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field

from app.db.session import get_global_db
from app.core.dependencies import get_current_active_user, check_project_access, require_superadmin
from app.models.global_models import (
    Usuario, Proyecto, 
    CatalogoDocumento, CatalogoNotificador, CatalogoZona
)
from app.services.log_service import registrar_log

router = APIRouter()

# ============================================================
# SCHEMAS
# ============================================================

class DocumentoCreate(BaseModel):
    id_proyecto: int
    nombre_documento: str = Field(..., max_length=150)
    identificador_documento: str = Field(..., max_length=10)

class DocumentoUpdate(BaseModel):
    nombre_documento: Optional[str] = Field(None, max_length=150)
    identificador_documento: Optional[str] = Field(None, max_length=10)
    activo: Optional[bool] = None

class DocumentoResponse(BaseModel):
    id: int
    id_proyecto: int
    proyecto_nombre: Optional[str]
    nombre_documento: str
    identificador_documento: str
    activo: bool
    created_at: datetime
    created_by: int

class NotificadorCreate(BaseModel):
    id_proyecto: int
    nombre: str = Field(..., max_length=150)
    acronimo: str = Field(..., max_length=10)

class NotificadorUpdate(BaseModel):
    nombre: Optional[str] = Field(None, max_length=150)
    acronimo: Optional[str] = Field(None, max_length=10)
    activo: Optional[bool] = None

class NotificadorResponse(BaseModel):
    id: int
    id_proyecto: int
    proyecto_nombre: Optional[str]
    nombre: str
    acronimo: str
    activo: bool
    created_at: datetime
    created_by: int

class ZonaCreate(BaseModel):
    id_proyecto: int
    nombre_zona: str = Field(..., max_length=100)
    clave_zona: str = Field(..., max_length=20)
    descripcion: Optional[str] = Field(None, max_length=255)

class ZonaUpdate(BaseModel):
    nombre_zona: Optional[str] = Field(None, max_length=100)
    clave_zona: Optional[str] = Field(None, max_length=20)
    descripcion: Optional[str] = Field(None, max_length=255)
    activo: Optional[bool] = None

class ZonaResponse(BaseModel):
    id: int
    id_proyecto: int
    proyecto_nombre: Optional[str]
    nombre_zona: str
    clave_zona: str
    descripcion: Optional[str]
    activo: bool
    created_at: datetime
    created_by: int

# ============================================================
# HELPERS
# ============================================================

def _get_proyecto_nombre(db: Session, proyecto_id: int) -> Optional[str]:
    proyecto = db.query(Proyecto).filter(Proyecto.id == proyecto_id).first()
    return proyecto.nombre if proyecto else None

# ============================================================
# ENDPOINTS - DOCUMENTOS
# ============================================================

@router.get("/documentos", response_model=List[DocumentoResponse])
def listar_documentos(
    proyecto_id: Optional[int] = Query(None, description="Filtrar por proyecto"),
    activo: Optional[bool] = Query(None, description="Filtrar por activo"),
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    """Lista documentos (solo superadmin y analista pueden ver)"""
    if current_user.rol.nombre not in ['superadmin', 'analista']:
        raise HTTPException(status_code=403, detail="No tienes permisos para ver catálogos")
    
    query = db.query(CatalogoDocumento)
    
    if proyecto_id:
        query = query.filter(CatalogoDocumento.id_proyecto == proyecto_id)
    if activo is not None:
        query = query.filter(CatalogoDocumento.activo == activo)
    
    # Si no es superadmin, solo ver proyectos asignados
    if current_user.rol.nombre != 'superadmin':
        proyectos_usuario = [up.id_proyecto for up in current_user.proyectos]
        query = query.filter(CatalogoDocumento.id_proyecto.in_(proyectos_usuario))
    
    documentos = query.order_by(CatalogoDocumento.nombre_documento).all()
    
    return [
        DocumentoResponse(
            id=d.id,
            id_proyecto=d.id_proyecto,
            proyecto_nombre=_get_proyecto_nombre(db, d.id_proyecto),
            nombre_documento=d.nombre_documento,
            identificador_documento=d.identificador_documento,
            activo=d.activo,
            created_at=d.created_at,
            created_by=d.created_by
        )
        for d in documentos
    ]


@router.post("/documentos", response_model=DocumentoResponse)
def crear_documento(
    data: DocumentoCreate,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    """Crea un nuevo documento (solo superadmin y analista)"""
    if current_user.rol.nombre not in ['superadmin', 'analista']:
        raise HTTPException(status_code=403, detail="No tienes permisos para crear catálogos")
    
    # Verificar que el proyecto existe y el usuario tiene acceso
    proyecto = check_project_access_by_id(data.id_proyecto, current_user, db)
    
    # Verificar duplicado
    existente = db.query(CatalogoDocumento).filter(
        CatalogoDocumento.id_proyecto == data.id_proyecto,
        CatalogoDocumento.nombre_documento == data.nombre_documento
    ).first()
    if existente:
        raise HTTPException(status_code=400, detail="Ya existe un documento con ese nombre")
    
    nuevo = CatalogoDocumento(
        id_proyecto=data.id_proyecto,
        nombre_documento=data.nombre_documento,
        identificador_documento=data.identificador_documento.upper(),
        created_by=current_user.id
    )
    
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    
    registrar_log(
        db,
        current_user.id,
        "catalogo_documento_crear",
        f"Documento creado: {nuevo.nombre_documento} ({nuevo.identificador_documento})",
        data.id_proyecto
    )
    
    return DocumentoResponse(
        id=nuevo.id,
        id_proyecto=nuevo.id_proyecto,
        proyecto_nombre=_get_proyecto_nombre(db, nuevo.id_proyecto),
        nombre_documento=nuevo.nombre_documento,
        identificador_documento=nuevo.identificador_documento,
        activo=nuevo.activo,
        created_at=nuevo.created_at,
        created_by=nuevo.created_by
    )


@router.put("/documentos/{documento_id}", response_model=DocumentoResponse)
def actualizar_documento(
    documento_id: int,
    data: DocumentoUpdate,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    """Actualiza un documento"""
    if current_user.rol.nombre not in ['superadmin', 'analista']:
        raise HTTPException(status_code=403, detail="No tienes permisos para editar catálogos")
    
    documento = db.query(CatalogoDocumento).filter(CatalogoDocumento.id == documento_id).first()
    if not documento:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    
    # Verificar acceso al proyecto
    check_project_access_by_id(documento.id_proyecto, current_user, db)
    
    if data.nombre_documento is not None:
        documento.nombre_documento = data.nombre_documento
    if data.identificador_documento is not None:
        documento.identificador_documento = data.identificador_documento.upper()
    if data.activo is not None:
        documento.activo = data.activo
    
    db.commit()
    db.refresh(documento)
    
    registrar_log(
        db,
        current_user.id,
        "catalogo_documento_actualizar",
        f"Documento actualizado: {documento.nombre_documento}",
        documento.id_proyecto
    )
    
    return DocumentoResponse(
        id=documento.id,
        id_proyecto=documento.id_proyecto,
        proyecto_nombre=_get_proyecto_nombre(db, documento.id_proyecto),
        nombre_documento=documento.nombre_documento,
        identificador_documento=documento.identificador_documento,
        activo=documento.activo,
        created_at=documento.created_at,
        created_by=documento.created_by
    )


@router.delete("/documentos/{documento_id}")
def eliminar_documento(
    documento_id: int,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    """Elimina (desactiva) un documento"""
    if current_user.rol.nombre not in ['superadmin', 'analista']:
        raise HTTPException(status_code=403, detail="No tienes permisos para eliminar catálogos")
    
    documento = db.query(CatalogoDocumento).filter(CatalogoDocumento.id == documento_id).first()
    if not documento:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    
    check_project_access_by_id(documento.id_proyecto, current_user, db)
    
    # Soft delete
    documento.activo = False
    db.commit()
    
    registrar_log(
        db,
        current_user.id,
        "catalogo_documento_eliminar",
        f"Documento desactivado: {documento.nombre_documento}",
        documento.id_proyecto
    )
    
    return {"success": True, "message": "Documento desactivado correctamente"}

# ============================================================
# ENDPOINTS - NOTIFICADORES
# ============================================================

@router.get("/notificadores", response_model=List[NotificadorResponse])
def listar_notificadores(
    proyecto_id: Optional[int] = Query(None, description="Filtrar por proyecto"),
    activo: Optional[bool] = Query(None, description="Filtrar por activo"),
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    """Lista notificadores"""
    if current_user.rol.nombre not in ['superadmin', 'analista']:
        raise HTTPException(status_code=403, detail="No tienes permisos para ver catálogos")
    
    query = db.query(CatalogoNotificador)
    
    if proyecto_id:
        query = query.filter(CatalogoNotificador.id_proyecto == proyecto_id)
    if activo is not None:
        query = query.filter(CatalogoNotificador.activo == activo)
    
    if current_user.rol.nombre != 'superadmin':
        proyectos_usuario = [up.id_proyecto for up in current_user.proyectos]
        query = query.filter(CatalogoNotificador.id_proyecto.in_(proyectos_usuario))
    
    notificadores = query.order_by(CatalogoNotificador.nombre).all()
    
    return [
        NotificadorResponse(
            id=n.id,
            id_proyecto=n.id_proyecto,
            proyecto_nombre=_get_proyecto_nombre(db, n.id_proyecto),
            nombre=n.nombre,
            acronimo=n.acronimo,
            activo=n.activo,
            created_at=n.created_at,
            created_by=n.created_by
        )
        for n in notificadores
    ]


@router.post("/notificadores", response_model=NotificadorResponse)
def crear_notificador(
    data: NotificadorCreate,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    """Crea un nuevo notificador"""
    if current_user.rol.nombre not in ['superadmin', 'analista']:
        raise HTTPException(status_code=403, detail="No tienes permisos para crear catálogos")
    
    check_project_access_by_id(data.id_proyecto, current_user, db)
    
    existente = db.query(CatalogoNotificador).filter(
        CatalogoNotificador.id_proyecto == data.id_proyecto,
        CatalogoNotificador.nombre == data.nombre
    ).first()
    if existente:
        raise HTTPException(status_code=400, detail="Ya existe un notificador con ese nombre")
    
    nuevo = CatalogoNotificador(
        id_proyecto=data.id_proyecto,
        nombre=data.nombre,
        acronimo=data.acronimo.upper(),
        created_by=current_user.id
    )
    
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    
    registrar_log(
        db,
        current_user.id,
        "catalogo_notificador_crear",
        f"Notificador creado: {nuevo.nombre} ({nuevo.acronimo})",
        data.id_proyecto
    )
    
    return NotificadorResponse(
        id=nuevo.id,
        id_proyecto=nuevo.id_proyecto,
        proyecto_nombre=_get_proyecto_nombre(db, nuevo.id_proyecto),
        nombre=nuevo.nombre,
        acronimo=nuevo.acronimo,
        activo=nuevo.activo,
        created_at=nuevo.created_at,
        created_by=nuevo.created_by
    )


@router.put("/notificadores/{notificador_id}", response_model=NotificadorResponse)
def actualizar_notificador(
    notificador_id: int,
    data: NotificadorUpdate,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    """Actualiza un notificador"""
    if current_user.rol.nombre not in ['superadmin', 'analista']:
        raise HTTPException(status_code=403, detail="No tienes permisos para editar catálogos")
    
    notificador = db.query(CatalogoNotificador).filter(CatalogoNotificador.id == notificador_id).first()
    if not notificador:
        raise HTTPException(status_code=404, detail="Notificador no encontrado")
    
    check_project_access_by_id(notificador.id_proyecto, current_user, db)
    
    if data.nombre is not None:
        notificador.nombre = data.nombre
    if data.acronimo is not None:
        notificador.acronimo = data.acronimo.upper()
    if data.activo is not None:
        notificador.activo = data.activo
    
    db.commit()
    db.refresh(notificador)
    
    registrar_log(
        db,
        current_user.id,
        "catalogo_notificador_actualizar",
        f"Notificador actualizado: {notificador.nombre}",
        notificador.id_proyecto
    )
    
    return NotificadorResponse(
        id=notificador.id,
        id_proyecto=notificador.id_proyecto,
        proyecto_nombre=_get_proyecto_nombre(db, notificador.id_proyecto),
        nombre=notificador.nombre,
        acronimo=notificador.acronimo,
        activo=notificador.activo,
        created_at=notificador.created_at,
        created_by=notificador.created_by
    )


@router.delete("/notificadores/{notificador_id}")
def eliminar_notificador(
    notificador_id: int,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    """Elimina (desactiva) un notificador"""
    if current_user.rol.nombre not in ['superadmin', 'analista']:
        raise HTTPException(status_code=403, detail="No tienes permisos para eliminar catálogos")
    
    notificador = db.query(CatalogoNotificador).filter(CatalogoNotificador.id == notificador_id).first()
    if not notificador:
        raise HTTPException(status_code=404, detail="Notificador no encontrado")
    
    check_project_access_by_id(notificador.id_proyecto, current_user, db)
    
    notificador.activo = False
    db.commit()
    
    registrar_log(
        db,
        current_user.id,
        "catalogo_notificador_eliminar",
        f"Notificador desactivado: {notificador.nombre}",
        notificador.id_proyecto
    )
    
    return {"success": True, "message": "Notificador desactivado correctamente"}

# ============================================================
# ENDPOINTS - ZONAS
# ============================================================

@router.get("/zonas", response_model=List[ZonaResponse])
def listar_zonas(
    proyecto_id: Optional[int] = Query(None, description="Filtrar por proyecto"),
    activo: Optional[bool] = Query(None, description="Filtrar por activo"),
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    """Lista zonas"""
    if current_user.rol.nombre not in ['superadmin', 'analista']:
        raise HTTPException(status_code=403, detail="No tienes permisos para ver catálogos")
    
    query = db.query(CatalogoZona)
    
    if proyecto_id:
        query = query.filter(CatalogoZona.id_proyecto == proyecto_id)
    if activo is not None:
        query = query.filter(CatalogoZona.activo == activo)
    
    if current_user.rol.nombre != 'superadmin':
        proyectos_usuario = [up.id_proyecto for up in current_user.proyectos]
        query = query.filter(CatalogoZona.id_proyecto.in_(proyectos_usuario))
    
    zonas = query.order_by(CatalogoZona.nombre_zona).all()
    
    return [
        ZonaResponse(
            id=z.id,
            id_proyecto=z.id_proyecto,
            proyecto_nombre=_get_proyecto_nombre(db, z.id_proyecto),
            nombre_zona=z.nombre_zona,
            clave_zona=z.clave_zona,
            descripcion=z.descripcion,
            activo=z.activo,
            created_at=z.created_at,
            created_by=z.created_by
        )
        for z in zonas
    ]


@router.post("/zonas", response_model=ZonaResponse)
def crear_zona(
    data: ZonaCreate,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    """Crea una nueva zona"""
    if current_user.rol.nombre not in ['superadmin', 'analista']:
        raise HTTPException(status_code=403, detail="No tienes permisos para crear catálogos")
    
    check_project_access_by_id(data.id_proyecto, current_user, db)
    
    existente = db.query(CatalogoZona).filter(
        CatalogoZona.id_proyecto == data.id_proyecto,
        CatalogoZona.nombre_zona == data.nombre_zona
    ).first()
    if existente:
        raise HTTPException(status_code=400, detail="Ya existe una zona con ese nombre")
    
    nueva = CatalogoZona(
        id_proyecto=data.id_proyecto,
        nombre_zona=data.nombre_zona,
        clave_zona=data.clave_zona.upper(),
        descripcion=data.descripcion,
        created_by=current_user.id
    )
    
    db.add(nueva)
    db.commit()
    db.refresh(nueva)
    
    registrar_log(
        db,
        current_user.id,
        "catalogo_zona_crear",
        f"Zona creada: {nueva.nombre_zona} ({nueva.clave_zona})",
        data.id_proyecto
    )
    
    return ZonaResponse(
        id=nueva.id,
        id_proyecto=nueva.id_proyecto,
        proyecto_nombre=_get_proyecto_nombre(db, nueva.id_proyecto),
        nombre_zona=nueva.nombre_zona,
        clave_zona=nueva.clave_zona,
        descripcion=nueva.descripcion,
        activo=nueva.activo,
        created_at=nueva.created_at,
        created_by=nueva.created_by
    )


@router.put("/zonas/{zona_id}", response_model=ZonaResponse)
def actualizar_zona(
    zona_id: int,
    data: ZonaUpdate,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    """Actualiza una zona"""
    if current_user.rol.nombre not in ['superadmin', 'analista']:
        raise HTTPException(status_code=403, detail="No tienes permisos para editar catálogos")
    
    zona = db.query(CatalogoZona).filter(CatalogoZona.id == zona_id).first()
    if not zona:
        raise HTTPException(status_code=404, detail="Zona no encontrada")
    
    check_project_access_by_id(zona.id_proyecto, current_user, db)
    
    if data.nombre_zona is not None:
        zona.nombre_zona = data.nombre_zona
    if data.clave_zona is not None:
        zona.clave_zona = data.clave_zona.upper()
    if data.descripcion is not None:
        zona.descripcion = data.descripcion
    if data.activo is not None:
        zona.activo = data.activo
    
    db.commit()
    db.refresh(zona)
    
    registrar_log(
        db,
        current_user.id,
        "catalogo_zona_actualizar",
        f"Zona actualizada: {zona.nombre_zona}",
        zona.id_proyecto
    )
    
    return ZonaResponse(
        id=zona.id,
        id_proyecto=zona.id_proyecto,
        proyecto_nombre=_get_proyecto_nombre(db, zona.id_proyecto),
        nombre_zona=zona.nombre_zona,
        clave_zona=zona.clave_zona,
        descripcion=zona.descripcion,
        activo=zona.activo,
        created_at=zona.created_at,
        created_by=zona.created_by
    )


@router.delete("/zonas/{zona_id}")
def eliminar_zona(
    zona_id: int,
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    """Elimina (desactiva) una zona"""
    if current_user.rol.nombre not in ['superadmin', 'analista']:
        raise HTTPException(status_code=403, detail="No tienes permisos para eliminar catálogos")
    
    zona = db.query(CatalogoZona).filter(CatalogoZona.id == zona_id).first()
    if not zona:
        raise HTTPException(status_code=404, detail="Zona no encontrada")
    
    check_project_access_by_id(zona.id_proyecto, current_user, db)
    
    zona.activo = False
    db.commit()
    
    registrar_log(
        db,
        current_user.id,
        "catalogo_zona_eliminar",
        f"Zona desactivada: {zona.nombre_zona}",
        zona.id_proyecto
    )
    
    return {"success": True, "message": "Zona desactivada correctamente"}

# ============================================================
# FUNCIÓN AUXILIAR
# ============================================================

def check_project_access_by_id(proyecto_id: int, current_user: Usuario, db: Session):
    """Verifica acceso a un proyecto por ID"""
    if current_user.rol.nombre == 'superadmin':
        return True
    
    proyecto = db.query(Proyecto).filter(Proyecto.id == proyecto_id).first()
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    
    # Verificar asignación
    from app.models.global_models import UsuarioProyecto
    asignado = db.query(UsuarioProyecto).filter(
        UsuarioProyecto.id_usuario == current_user.id,
        UsuarioProyecto.id_proyecto == proyecto_id
    ).first()
    
    if not asignado:
        raise HTTPException(status_code=403, detail="No tienes acceso a este proyecto")
    
    return True