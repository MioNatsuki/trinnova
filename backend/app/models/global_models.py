from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text,
    ForeignKey, Enum, UniqueConstraint, JSON,  
    DECIMAL
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base
import enum


class RolNombre(str, enum.Enum):
    superadmin = "superadmin"
    analista   = "analista"
    auxiliar   = "auxiliar"


class Rol(Base):
    __tablename__ = "roles"

    id          = Column(Integer, primary_key=True, index=True)
    nombre      = Column(String(50), unique=True, nullable=False)
    descripcion = Column(String(255))

    usuarios = relationship("Usuario", back_populates="rol")


class Usuario(Base):
    __tablename__ = "usuarios"

    id            = Column(Integer, primary_key=True, index=True)
    nombre        = Column(String(100), nullable=False)
    apellidos     = Column(String(100), nullable=False)
    correo        = Column(String(150), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    id_rol        = Column(Integer, ForeignKey("roles.id"), nullable=False)
    activo        = Column(Boolean, default=True)
    created_at    = Column(DateTime, server_default=func.now())
    updated_at    = Column(DateTime, server_default=func.now(), onupdate=func.now())

    rol       = relationship("Rol", back_populates="usuarios")
    proyectos = relationship("UsuarioProyecto", back_populates="usuario", lazy="joined")
    logs      = relationship("Log", back_populates="usuario")


class Proyecto(Base):
    __tablename__ = "proyectos"

    id          = Column(Integer, primary_key=True, index=True)
    nombre      = Column(String(150), nullable=False)
    slug        = Column(String(50), unique=True, nullable=False, index=True)
    db_name     = Column(String(100), nullable=False)
    descripcion = Column(String(255))
    activo      = Column(Boolean, default=True)
    created_at  = Column(DateTime, server_default=func.now())

    usuarios   = relationship("UsuarioProyecto", back_populates="proyecto")
    plantillas = relationship("Plantilla", back_populates="proyecto")


class UsuarioProyecto(Base):
    __tablename__ = "usuario_proyecto"
    __table_args__ = (UniqueConstraint("id_usuario", "id_proyecto"),)

    id          = Column(Integer, primary_key=True, index=True)
    id_usuario  = Column(Integer, ForeignKey("usuarios.id",  ondelete="CASCADE"))
    id_proyecto = Column(Integer, ForeignKey("proyectos.id", ondelete="CASCADE"))

    usuario  = relationship("Usuario",  back_populates="proyectos")
    proyecto = relationship("Proyecto", back_populates="usuarios", lazy="joined")


class Plantilla(Base):
    __tablename__ = "plantillas"

    id           = Column(Integer, primary_key=True, index=True)
    id_proyecto  = Column(Integer, ForeignKey("proyectos.id"), nullable=False)
    nombre       = Column(String(150), nullable=False)
    descripcion  = Column(String(255))
    nombre_archivo = Column(String(255), nullable=False)
    activa       = Column(Boolean, default=True)
    created_by   = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    created_at   = Column(DateTime, server_default=func.now())
    updated_at   = Column(DateTime, server_default=func.now(), onupdate=func.now())

    proyecto = relationship("Proyecto", back_populates="plantillas")
    campos   = relationship("PlantillaCampo", back_populates="plantilla", cascade="all, delete-orphan")


class PlantillaCampo(Base):
    __tablename__ = "plantilla_campos"

    id           = Column(Integer, primary_key=True, index=True)
    id_plantilla = Column(Integer, ForeignKey("plantillas.id", ondelete="CASCADE"))
    placeholder  = Column(String(100), nullable=False)
    campo_bd     = Column(String(100), nullable=False)
    orden        = Column(Integer, default=0)

    plantilla = relationship("Plantilla", back_populates="campos")


class Log(Base):
    __tablename__ = "logs"

    id          = Column(Integer, primary_key=True, index=True)
    id_usuario  = Column(Integer, ForeignKey("usuarios.id",  ondelete="SET NULL"), nullable=True)
    id_proyecto = Column(Integer, ForeignKey("proyectos.id", ondelete="SET NULL"), nullable=True)
    accion      = Column(String(100), nullable=False)
    descripcion = Column(Text)
    ip          = Column(String(45))
    created_at  = Column(DateTime, server_default=func.now())

    usuario = relationship("Usuario", back_populates="logs")


class EmisionArchivo(Base):
    __tablename__ = "emision_archivos"

    id            = Column(Integer, primary_key=True, index=True)
    id_proyecto   = Column(Integer, ForeignKey("proyectos.id"), nullable=False)
    id_plantilla  = Column(Integer, ForeignKey("plantillas.id"), nullable=False)
    id_usuario    = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    ruta_zip      = Column(String(500))
    total_cuentas = Column(Integer)
    status        = Column(Enum("procesando", "completado", "error"), default="procesando")
    error_msg     = Column(Text)
    created_at    = Column(DateTime, server_default=func.now())
    completado_at = Column(DateTime, nullable=True)


class PadronVersion(Base):
    __tablename__ = "padron_versiones"

    id              = Column(Integer, primary_key=True, index=True)
    id_proyecto     = Column(Integer, ForeignKey("proyectos.id"), nullable=False)
    version         = Column(Integer, nullable=False)
    # ruta_snapshot es opcional — se puede guardar snapshot JSON en disco si se quiere
    ruta_snapshot   = Column(String(500), nullable=True)
    total_registros = Column(Integer, default=0)
    archivo_nombre  = Column(String(255), nullable=True)
    cargado_por     = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    created_at      = Column(DateTime, server_default=func.now())

    proyecto = relationship("Proyecto")
    usuario  = relationship("Usuario")


class Programa(Base):
    __tablename__ = "programas"

    id           = Column(Integer, primary_key=True, index=True)
    id_proyecto  = Column(Integer, ForeignKey("proyectos.id"), nullable=False)
    nombre       = Column(String(150), nullable=False)
    slug         = Column(String(50), nullable=False)
    activo       = Column(Boolean, default=True)
    created_at   = Column(DateTime, server_default=func.now())
    updated_at   = Column(DateTime, server_default=func.now(), onupdate=func.now())

    proyecto = relationship("Proyecto")

class InpcHistorico(Base):
    __tablename__ = "inpc_historico"

    id = Column(Integer, primary_key=True, index=True)
    periodo = Column(String(7), nullable=False, unique=True, comment="Período en formato YYYY-MM")
    valor = Column(DECIMAL(10, 4), nullable=False, comment="Valor del INPC")
    fecha_actualizacion = Column(DateTime, server_default=func.now(), comment="Fecha de última actualización")

    def __repr__(self):
        return f"<InpcHistorico periodo={self.periodo} valor={self.valor}>"

class EmisionJob(Base):
    """
    Tabla: emision_jobs (en db_global)
    Almacena los trabajos de emisión masiva de documentos
    """
    __tablename__ = "emision_jobs"

    id = Column(Integer, primary_key=True, index=True)
    id_proyecto = Column(Integer, ForeignKey("proyectos.id"), nullable=False)
    id_plantilla = Column(Integer, ForeignKey("plantillas.id"), nullable=False)
    id_usuario = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    
    # Datos del job
    nombre_job = Column(String(200), nullable=True)
    modo = Column(Enum("lotes", "paquetes"), default="lotes")
    cuentas_por_lote = Column(Integer, default=50)
    orden_impresion_inicial = Column(Integer, default=1)
    
    # Estado y progreso
    status = Column(Enum("pending", "processing", "completed", "failed", "cancelled"), default="pending")
    total_registros = Column(Integer, default=0)
    procesados = Column(Integer, default=0)
    ultimo_pk_procesado = Column(String(100), nullable=True)
    ultimo_orden_procesado = Column(Integer, nullable=True)
    checkpoint_data = Column(JSON, nullable=True)
    
    # Filtros (JSON)
    filtros = Column(JSON, nullable=True)
    
    # Resultados
    ruta_zip = Column(String(500), nullable=True)
    ruta_temporal = Column(String(500), nullable=True)
    
    # Errores
    error_msg = Column(Text, nullable=True)
    
    # Fechas
    created_at = Column(DateTime, server_default=func.now())
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)  # 24h después de completado
    
    # Quién lo creó
    created_by = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    
    # Relaciones
    proyecto = relationship("Proyecto", foreign_keys=[id_proyecto])
    plantilla = relationship("Plantilla", foreign_keys=[id_plantilla])
    usuario = relationship("Usuario", foreign_keys=[id_usuario])
    detalles = relationship("EmisionDetalle", back_populates="job", cascade="all, delete-orphan")


class EmisionDetalle(Base):
    """
    Tabla: emision_detalle (en db_global)
    Almacena el detalle de cada registro procesado en un job
    """
    __tablename__ = "emision_detalle"

    id = Column(Integer, primary_key=True, index=True)
    id_job = Column(Integer, ForeignKey("emision_jobs.id", ondelete="CASCADE"), nullable=False)
    
    # Datos del registro
    pk_value = Column(String(100), nullable=False)  # PK del registro en su proyecto
    orden_impresion = Column(Integer, nullable=False)
    codebar = Column(String(100), nullable=True)
    
    # Estado
    status = Column(Enum("pending", "processing", "completed", "failed"), default="pending")
    error_msg = Column(Text, nullable=True)
    
    # Ruta del PDF
    ruta_pdf = Column(String(500), nullable=True)
    
    # Fechas
    created_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)
    
    # Relaciones
    job = relationship("EmisionJob", back_populates="detalles")

# ============================================================
# CATÁLOGOS (Fase 6)
# ============================================================

class CatalogoDocumento(Base):
    """Catálogo de documentos para emisión"""
    __tablename__ = "catalogo_documento"

    id = Column(Integer, primary_key=True, index=True)
    id_proyecto = Column(Integer, ForeignKey("proyectos.id"), nullable=False)
    nombre_documento = Column(String(150), nullable=False)
    identificador_documento = Column(String(10), nullable=False, comment="N, R, A, etc.")
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("usuarios.id"), nullable=False)

    proyecto = relationship("Proyecto")
    usuario = relationship("Usuario")


class CatalogoNotificador(Base):
    """Catálogo de notificadores/ejecutores"""
    __tablename__ = "catalogo_notificadores"

    id = Column(Integer, primary_key=True, index=True)
    id_proyecto = Column(Integer, ForeignKey("proyectos.id"), nullable=False)
    nombre = Column(String(150), nullable=False)
    acronimo = Column(String(10), nullable=False)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("usuarios.id"), nullable=False)

    proyecto = relationship("Proyecto")
    usuario = relationship("Usuario")


class CatalogoZona(Base):
    """Catálogo de zonas para proyectos"""
    __tablename__ = "catalogo_zonas"

    id = Column(Integer, primary_key=True, index=True)
    id_proyecto = Column(Integer, ForeignKey("proyectos.id"), nullable=False)
    nombre_zona = Column(String(100), nullable=False)
    clave_zona = Column(String(20), nullable=False)
    descripcion = Column(String(255), nullable=True)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("usuarios.id"), nullable=False)

    proyecto = relationship("Proyecto")
    usuario = relationship("Usuario")