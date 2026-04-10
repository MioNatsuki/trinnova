from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text,
    ForeignKey, Enum, UniqueConstraint
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
    origen       = Column(Enum("upload", "editor"), default="editor")
    ruta_archivo = Column(String(500))
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