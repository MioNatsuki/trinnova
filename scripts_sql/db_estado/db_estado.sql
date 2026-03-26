-- ============================================================
-- db_estado.sql
-- Proyecto: Proyecto del Estado de Jalisco
-- Diagrama de referencia: 1_1_Diagrama_Estado.png
-- Guardar en: scripts_sql/db_estado/
-- ============================================================

CREATE DATABASE IF NOT EXISTS db_estado
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE db_estado;

-- ------------------------------------------------------------
-- TABLA_PADRON
-- ------------------------------------------------------------
CREATE TABLE tabla_padron (
    id                             INT,
    rfc                            VARCHAR(20),
    credito                        VARCHAR(255) NOT NULL,
    nombre_razon_social            LONGTEXT,
    calle_numero                   LONGTEXT,
    colonia                        VARCHAR(255),
    cp                             NUMERIC(10),
    municipio                      VARCHAR(255),
    coordinadora                   VARCHAR(255),
    area_asignacion                VARCHAR(255),
    autoridad_determinante         VARCHAR(255),
    fecha_recepcion                DATETIME,
    expediente_procedencia         VARCHAR(50),
    fecha_documento_determinante   DATETIME,
    importe_historico_determinado  NUMERIC(15,2),
    concepto                       LONGTEXT,
    fecha_notificacion             DATETIME,
    exigible                       DATETIME,
    tipo_credito                   VARCHAR(255),
    tipo_cartera                   VARCHAR(255),
    PRIMARY KEY (credito)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_COMPLEMENTARIA
-- Elementos fijos, no suele haber cambios frecuentes.
-- ------------------------------------------------------------
CREATE TABLE tabla_complementaria (
    id_comp          INT AUTO_INCREMENT PRIMARY KEY,
    credito          VARCHAR(255) NOT NULL,
    tipo_tipo        VARCHAR(255),
    tipo_razon_social VARCHAR(255),
    firma            LONGTEXT,
    cargo            LONGTEXT,
    CONSTRAINT fk_comp_padron FOREIGN KEY (credito) REFERENCES tabla_padron(credito) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_ANALISIS
-- ------------------------------------------------------------
CREATE TABLE tabla_analisis (
    id                             INT,
    rfc                            VARCHAR(20),
    credito                        VARCHAR(255) NOT NULL,
    nombre_razon_social            LONGTEXT,
    calle_numero                   LONGTEXT,
    colonia                        VARCHAR(255),
    cp                             NUMERIC(10),
    municipio                      VARCHAR(255),
    coordinadora                   VARCHAR(255),
    area_asignacion                VARCHAR(255),
    autoridad_determinante         VARCHAR(255),
    fecha_recepcion                DATETIME,
    expediente_procedencia         VARCHAR(50),
    fecha_documento_determinante   DATETIME,
    importe_historico_determinado  NUMERIC(15,2),
    concepto                       LONGTEXT,
    fecha_notificacion             DATETIME,
    exigible                       DATETIME,
    tipo_credito                   VARCHAR(255),
    tipo_cartera                   VARCHAR(255),
    -- De complementaria
    tipo_tipo                      VARCHAR(255),
    tipo_razon_social              VARCHAR(255),
    firma                          LONGTEXT,
    cargo                          LONGTEXT,
    -- Control
    viabilidad                     ENUM('viable','no_viable','pendiente') DEFAULT 'pendiente',
    PRIMARY KEY (credito)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_DINAMICA
-- ------------------------------------------------------------
CREATE TABLE tabla_dinamica (
    codebar          VARCHAR(25)  NOT NULL PRIMARY KEY,
    credito          NUMERIC,
    id_documento     INT,
    visita           VARCHAR(10),
    pmo              VARCHAR(10),
    fecha_emision    DATETIME,
    ultimo_abono_modificado DATETIME,
    status_captura   VARCHAR(50),
    id_notificador   INT,
    no_documento     VARCHAR(255),
    importe_letra    LONGTEXT,
    CONSTRAINT fk_din_padron FOREIGN KEY (credito) REFERENCES tabla_padron(credito)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_CAPTURA
-- ------------------------------------------------------------
CREATE TABLE tabla_captura (
    id_captura        INT AUTO_INCREMENT PRIMARY KEY,
    credito           VARCHAR(255) NOT NULL,
    colonia_captura   LONGTEXT,
    calle_captura     LONGTEXT,
    numero_captura    LONGTEXT,
    ubicacion_captura LONGTEXT,
    obs_final         LONGTEXT,
    obs_org           LONGTEXT,
    concat_obs        LONGTEXT,
    CONSTRAINT fk_cap_padron FOREIGN KEY (credito) REFERENCES tabla_padron(credito)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_TEMPORAL
-- ------------------------------------------------------------
CREATE TABLE tabla_temporal (
    credito                        VARCHAR(255) NOT NULL,
    orden_impresion                INT,
    obs                            LONGTEXT,
    codebar                        VARCHAR(25)  NOT NULL,
    po                             VARCHAR(5),
    acronimo                       VARCHAR(10),
    fecha_emision                  DATETIME,
    no_documento                   VARCHAR(255),
    fecha_documento_determinante   DATETIME,
    fecha_notificacion             DATETIME,
    autoridad_determinante         VARCHAR(255),
    nombre_razon_social            LONGTEXT,
    calle_numero                   LONGTEXT,
    colonia                        VARCHAR(255),
    cp                             NUMERIC(10),
    municipio                      VARCHAR(255),
    rfc                            VARCHAR(20),
    importe_historico_determinado  NUMERIC(15,2),
    importe_letra                  LONGTEXT,
    firma                          LONGTEXT,
    cargo                          LONGTEXT,
    fecha_historica                DATETIME,
    PRIMARY KEY (credito),
    CONSTRAINT fk_tmp_padron FOREIGN KEY (credito) REFERENCES tabla_padron(credito)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_HISTORICA
-- ------------------------------------------------------------
CREATE TABLE tabla_historica (
    id_historico                   INT AUTO_INCREMENT PRIMARY KEY,
    credito                        VARCHAR(255) NOT NULL,
    orden_impresion                INT,
    obs                            LONGTEXT,
    codebar                        VARCHAR(25)  NOT NULL,
    po                             VARCHAR(5),
    acronimo                       VARCHAR(10),
    fecha_emision                  DATETIME,
    no_documento                   VARCHAR(255),
    fecha_documento_determinante   DATETIME,
    fecha_notificacion             DATETIME,
    autoridad_determinante         VARCHAR(255),
    nombre_razon_social            LONGTEXT,
    calle_numero                   LONGTEXT,
    colonia                        VARCHAR(255),
    cp                             NUMERIC(10),
    municipio                      VARCHAR(255),
    rfc                            VARCHAR(20),
    importe_historico_determinado  NUMERIC(15,2),
    importe_letra                  LONGTEXT,
    firma                          LONGTEXT,
    cargo                          LONGTEXT,
    fecha_historica                DATETIME,
    CONSTRAINT fk_hist_padron FOREIGN KEY (credito) REFERENCES tabla_padron(credito)
) ENGINE=InnoDB;
