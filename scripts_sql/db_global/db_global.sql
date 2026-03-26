-- ============================================================
-- db_global.sql
-- Base de datos global: usuarios, roles, proyectos, catálogos
-- compartidos, plantillas, logs, emisiones y versionado.
-- Guardar en: scripts_sql/db_global/db_global.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS db_global
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE db_global;

-- ------------------------------------------------------------
-- ROLES
-- ------------------------------------------------------------
CREATE TABLE roles (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    nombre      VARCHAR(50)  NOT NULL UNIQUE,
    descripcion VARCHAR(255)
) ENGINE=InnoDB;

INSERT INTO roles (nombre, descripcion) VALUES
    ('superadmin', 'Acceso total a todos los proyectos y configuraciones'),
    ('analista',   'CRUD en su proyecto asignado, puede generar PDFs'),
    ('auxiliar',   'Solo lectura y generacion de PDFs en su proyecto');

-- ------------------------------------------------------------
-- USUARIOS
-- ------------------------------------------------------------
CREATE TABLE usuarios (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    nombre        VARCHAR(100) NOT NULL,
    apellidos     VARCHAR(100) NOT NULL,
    correo        VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    id_rol        INT NOT NULL,
    activo        BOOLEAN  DEFAULT TRUE,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_usuario_rol FOREIGN KEY (id_rol) REFERENCES roles(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- PROYECTOS
-- ------------------------------------------------------------
CREATE TABLE proyectos (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    nombre      VARCHAR(150) NOT NULL,
    slug        VARCHAR(50)  NOT NULL UNIQUE,
    db_name     VARCHAR(100) NOT NULL,
    descripcion VARCHAR(255),
    activo      BOOLEAN  DEFAULT TRUE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO proyectos (nombre, slug, db_name, descripcion) VALUES
    ('APA Tlajomulco',     'apa_tlajomulco',     'db_apa_tlajomulco',     'Agua potable Tlajomulco'),
    ('Predial Tlajomulco', 'predial_tlajomulco', 'db_predial_tlajomulco', 'Predial municipio de Tlajomulco'),
    ('Licencias GDL',      'licencias_gdl',      'db_licencias_gdl',      'Licencias Guadalajara'),
    ('Predial GDL',        'predial_gdl',        'db_predial_gdl',        'Predial Guadalajara'),
    ('Proyecto del Estado','estado',             'db_estado',             'Proyecto del Estado de Jalisco'),
    ('Pensiones',          'pensiones',          'db_pensiones',          'Instituto de Pensiones del Estado de Jalisco');

-- ------------------------------------------------------------
-- USUARIO <-> PROYECTO  (muchos a muchos)
-- ------------------------------------------------------------
CREATE TABLE usuario_proyecto (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario  INT NOT NULL,
    id_proyecto INT NOT NULL,
    UNIQUE KEY uq_usr_proy (id_usuario, id_proyecto),
    CONSTRAINT fk_up_usuario  FOREIGN KEY (id_usuario)  REFERENCES usuarios(id)  ON DELETE CASCADE,
    CONSTRAINT fk_up_proyecto FOREIGN KEY (id_proyecto) REFERENCES proyectos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- CATALOGO DOCUMENTO  (global con filtro opcional por proyecto)
-- ------------------------------------------------------------
CREATE TABLE catalogo_documento (
    id_documento            INT AUTO_INCREMENT PRIMARY KEY,
    id_proyecto             INT          DEFAULT NULL,
    nombre_documento        VARCHAR(255) NOT NULL,
    identificador_documento VARCHAR(5)   NOT NULL,
    CONSTRAINT fk_cd_proyecto FOREIGN KEY (id_proyecto) REFERENCES proyectos(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- CATALOGO NOTIFICADORES  (global con filtro opcional por proyecto)
-- ------------------------------------------------------------
CREATE TABLE catalogo_notificadores (
    id_notificador INT AUTO_INCREMENT PRIMARY KEY,
    id_proyecto    INT         DEFAULT NULL,
    nombre         VARCHAR(255) NOT NULL,
    acronimo       VARCHAR(10)  NOT NULL,
    CONSTRAINT fk_cn_proyecto FOREIGN KEY (id_proyecto) REFERENCES proyectos(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- CATALOGO ZONA  (global con filtro por proyecto)
-- ------------------------------------------------------------
CREATE TABLE catalogo_zona (
    id_zona     INT AUTO_INCREMENT PRIMARY KEY,
    id_proyecto INT          DEFAULT NULL,
    zona_final  VARCHAR(255),
    orden_zona  INT,
    CONSTRAINT fk_cz_proyecto FOREIGN KEY (id_proyecto) REFERENCES proyectos(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- PLANTILLAS
-- ------------------------------------------------------------
CREATE TABLE plantillas (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    id_proyecto  INT NOT NULL,
    nombre       VARCHAR(150) NOT NULL,
    descripcion  VARCHAR(255),
    origen       ENUM('upload','editor') NOT NULL DEFAULT 'editor',
    ruta_archivo VARCHAR(500),
    activa       BOOLEAN  DEFAULT TRUE,
    created_by   INT NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_pl_proyecto FOREIGN KEY (id_proyecto) REFERENCES proyectos(id),
    CONSTRAINT fk_pl_usuario  FOREIGN KEY (created_by)  REFERENCES usuarios(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- PLANTILLA_CAMPOS  (mapeo placeholder -> campo de tabla_temporal)
-- ------------------------------------------------------------
CREATE TABLE plantilla_campos (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    id_plantilla INT          NOT NULL,
    placeholder  VARCHAR(100) NOT NULL,
    campo_bd     VARCHAR(100) NOT NULL,
    orden        INT DEFAULT 0,
    CONSTRAINT fk_pc_plantilla FOREIGN KEY (id_plantilla) REFERENCES plantillas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- PADRON_VERSIONES  (snapshot por cada carga de padron)
-- ------------------------------------------------------------
CREATE TABLE padron_versiones (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    id_proyecto     INT          NOT NULL,
    version         INT          NOT NULL,
    ruta_snapshot   VARCHAR(500) NOT NULL,
    total_registros INT,
    cargado_por     INT NOT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pv_proyecto FOREIGN KEY (id_proyecto) REFERENCES proyectos(id),
    CONSTRAINT fk_pv_usuario  FOREIGN KEY (cargado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- EMISION_ARCHIVOS  (registro de PDFs generados)
-- ------------------------------------------------------------
CREATE TABLE emision_archivos (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    id_proyecto   INT NOT NULL,
    id_plantilla  INT NOT NULL,
    id_usuario    INT NOT NULL,
    ruta_zip      VARCHAR(500),
    total_cuentas INT,
    status        ENUM('procesando','completado','error') DEFAULT 'procesando',
    error_msg     TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    completado_at DATETIME DEFAULT NULL,
    CONSTRAINT fk_ea_proyecto  FOREIGN KEY (id_proyecto)  REFERENCES proyectos(id),
    CONSTRAINT fk_ea_plantilla FOREIGN KEY (id_plantilla) REFERENCES plantillas(id),
    CONSTRAINT fk_ea_usuario   FOREIGN KEY (id_usuario)   REFERENCES usuarios(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- LOGS / BITACORA
-- ------------------------------------------------------------
CREATE TABLE logs (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario  INT          DEFAULT NULL,
    id_proyecto INT          DEFAULT NULL,
    accion      VARCHAR(100) NOT NULL,
    descripcion TEXT,
    ip          VARCHAR(45),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_log_usuario  FOREIGN KEY (id_usuario)  REFERENCES usuarios(id)  ON DELETE SET NULL,
    CONSTRAINT fk_log_proyecto FOREIGN KEY (id_proyecto) REFERENCES proyectos(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- SUPERADMIN por defecto  (password: Admin2024! — cambiar en produccion)
-- hash bcrypt generado con passlib
-- ------------------------------------------------------------
INSERT INTO usuarios (nombre, apellidos, correo, password_hash, id_rol) VALUES (
    'Administrador', 'Sistema',
    'admin@trinnova.mx',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGGMbVRmLmYTnKq3nH4y8eJq5gO',
    1
);
