-- ============================================================
-- db_pensiones.sql
-- Proyecto: Instituto de Pensiones del Estado de Jalisco
-- Diagrama de referencia: 2_1_Diagrama_Pensiones.png
-- Guardar en: scripts_sql/db_pensiones/
-- ============================================================

CREATE DATABASE IF NOT EXISTS db_pensiones
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE db_pensiones;

-- ------------------------------------------------------------
-- TABLA_PADRON
-- ------------------------------------------------------------
CREATE TABLE tabla_padron (
    afiliado            NUMERIC      NOT NULL,
    nombre              VARCHAR(255),
    rfc                 VARCHAR(255),
    tipo_prestamo       VARCHAR(10),
    prestamo            NUMERIC      NOT NULL,
    saldo_por_vencer    NUMERIC(15,2),
    adeudo              NUMERIC(15,2),
    liquidacion         NUMERIC(15,2),
    moratorio           NUMERIC(15,2),
    ultimo_abono        DATETIME,
    sub_estatus         VARCHAR(255),
    estatus             VARCHAR(50),
    dependencia         LONGTEXT,
    fecha_alta          DATETIME,
    ultima_aportacion   DATETIME,
    afiliado_calle      VARCHAR(255),
    afiliado_exterior   VARCHAR(25),
    afiliado_interior   VARCHAR(25),
    afiliado_cruza      VARCHAR(255),
    afiliado_cruza_2    VARCHAR(255),
    afiliado_colonia    VARCHAR(255),
    afiliado_poblacion  VARCHAR(255),
    afiliado_municipio  VARCHAR(255),
    afiliado_cp         NUMERIC(10),
    afiliado_lada       VARCHAR(25),
    afiliado_telefono   VARCHAR(50),
    afiliado_celular    VARCHAR(50),
    aval_codigo         NUMERIC,
    aval_nombre         VARCHAR(255),
    aval_calle          VARCHAR(255),
    aval_exterior       VARCHAR(25),
    aval_interior       VARCHAR(25),
    aval_cruza          VARCHAR(255),
    aval_cruza_2        VARCHAR(255),
    aval_colonia        VARCHAR(255),
    aval_poblacion      VARCHAR(255),
    aval_municipio      VARCHAR(255),
    aval_cp             NUMERIC(10),
    aval_lada           VARCHAR(25),
    aval_telefono       VARCHAR(50),
    aval_celular        VARCHAR(50),
    garantia_direccion  VARCHAR(255),
    garantia_colonia    VARCHAR(255),
    garantia_calles_cruces LONGTEXT,
    garantia_poblacion  VARCHAR(255),
    garantia_municipio  VARCHAR(255),
    num_convenio        VARCHAR(50),
    fecha_convenio      DATETIME,
    estatus_prestamo    VARCHAR(50),
    juzgado             LONGTEXT,
    expediente          VARCHAR(50),
    estatus_despacho    LONGTEXT,
    juicio_caduca       LONGTEXT,
    afiliado_coordenadas LONGTEXT,
    lat                 NUMERIC(8,15),
    lon                 NUMERIC(8,15),
    fecha_asignacion    DATETIME,
    PRIMARY KEY (prestamo)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_COMPLEMENTARIA
-- Elementos fijos (casi no cambia)
-- ------------------------------------------------------------
CREATE TABLE tabla_complementaria (
    id_comp         INT AUTO_INCREMENT PRIMARY KEY,
    prestamo        NUMERIC      NOT NULL,
    num_convenio    VARCHAR(50),
    fecha_convenio  DATETIME,
    estatus_prestamo VARCHAR(50),
    estatus_captura VARCHAR(50),
    demanda         VARCHAR(10),
    juzgado         LONGTEXT,
    expediente      VARCHAR(50),
    estatus_despacho LONGTEXT,
    juicio_caduca   LONGTEXT,
    afiliado_coordenadas LONGTEXT,
    lat             NUMERIC(8,15),
    lon             NUMERIC(8,15),
    fecha_asignacion DATETIME,
    id_zona_afiliado INT,
    id_zona_aval     INT,
    id_zona_garantia INT,
    CONSTRAINT fk_comp_padron FOREIGN KEY (prestamo) REFERENCES tabla_padron(prestamo) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_ANALISIS
-- ------------------------------------------------------------
CREATE TABLE tabla_analisis (
    afiliado            NUMERIC,
    nombre              VARCHAR(255),
    rfc                 VARCHAR(255),
    tipo_prestamo       VARCHAR(10),
    prestamo            NUMERIC      NOT NULL,
    saldo_por_vencer    NUMERIC(15,2),
    adeudo              NUMERIC(15,2),
    liquidacion         NUMERIC(15,2),
    moratorio           NUMERIC(15,2),
    ultimo_abono        DATETIME,
    sub_estatus         VARCHAR(255),
    estatus             VARCHAR(50),
    dependencia         LONGTEXT,
    fecha_alta          DATETIME,
    ultima_aportacion   DATETIME,
    afiliado_calle      VARCHAR(255),
    afiliado_exterior   VARCHAR(25),
    afiliado_interior   VARCHAR(25),
    afiliado_cruza      VARCHAR(255),
    afiliado_cruza_2    VARCHAR(255),
    afiliado_colonia    VARCHAR(255),
    afiliado_poblacion  VARCHAR(255),
    afiliado_municipio  VARCHAR(255),
    afiliado_cp         NUMERIC(10),
    afiliado_lada       VARCHAR(25),
    afiliado_telefono   VARCHAR(50),
    afiliado_celular    VARCHAR(50),
    aval_codigo         NUMERIC,
    aval_nombre         VARCHAR(255),
    aval_calle          VARCHAR(255),
    aval_exterior       VARCHAR(25),
    aval_interior       VARCHAR(25),
    aval_cruza          VARCHAR(255),
    aval_cruza_2        VARCHAR(255),
    aval_colonia        VARCHAR(255),
    aval_poblacion      VARCHAR(255),
    aval_municipio      VARCHAR(255),
    aval_cp             NUMERIC(10),
    aval_lada           VARCHAR(25),
    aval_telefono       VARCHAR(50),
    aval_celular        VARCHAR(50),
    garantia_direccion  VARCHAR(255),
    garantia_colonia    VARCHAR(255),
    garantia_calles_cruces LONGTEXT,
    garantia_poblacion  VARCHAR(255),
    garantia_municipio  VARCHAR(255),
    -- De complementaria
    num_convenio        VARCHAR(50),
    fecha_convenio      DATETIME,
    estatus_prestamo    VARCHAR(50),
    demanda             VARCHAR(10),
    juzgado             LONGTEXT,
    expediente          VARCHAR(50),
    estatus_despacho    LONGTEXT,
    juicio_caduca       LONGTEXT,
    afiliado_coordenadas LONGTEXT,
    lat                 NUMERIC(8,15),
    lon                 NUMERIC(8,15),
    fecha_asignacion    DATETIME,
    id_zona_afiliado    INT,
    id_zona_aval        INT,
    id_zona_garantia    INT,
    -- Control
    viabilidad          ENUM('viable','no_viable','pendiente') DEFAULT 'pendiente',
    PRIMARY KEY (prestamo)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_DINAMICA
-- ------------------------------------------------------------
CREATE TABLE tabla_dinamica (
    codebar                VARCHAR(25)  NOT NULL PRIMARY KEY,
    prestamo               NUMERIC      NOT NULL,
    id_documento           INT,
    visita                 VARCHAR(10),
    pmo                    VARCHAR(10),
    fecha_emision          DATETIME,
    ultimo_abono_modificado DATETIME,
    sub_estatus_id         VARCHAR(5),
    status_captura         VARCHAR(50),
    id_notificador         INT,
    CONSTRAINT fk_din_padron FOREIGN KEY (prestamo) REFERENCES tabla_padron(prestamo)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_CAPTURA
-- ------------------------------------------------------------
CREATE TABLE tabla_captura (
    id_captura        INT AUTO_INCREMENT PRIMARY KEY,
    prestamo          NUMERIC      NOT NULL,
    colonia_captura   LONGTEXT,
    calle_captura     LONGTEXT,
    numero_captura    LONGTEXT,
    ubicacion_captura LONGTEXT,
    obs_final         LONGTEXT,
    obs_org           LONGTEXT,
    concat_obs        LONGTEXT,
    CONSTRAINT fk_cap_padron FOREIGN KEY (prestamo) REFERENCES tabla_padron(prestamo)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_TEMPORAL
-- ------------------------------------------------------------
CREATE TABLE tabla_temporal (
    prestamo               NUMERIC      NOT NULL,
    orden_impresion        INT,
    obs                    LONGTEXT,
    codebar                VARCHAR(25)  NOT NULL,
    nombre                 VARCHAR(255),
    numero_afiliado        NUMERIC,
    afiliado_calle         VARCHAR(255),
    afiliado_exterior      VARCHAR(50),
    afiliado_interior      VARCHAR(50),
    afiliado_colonia       VARCHAR(50),
    cruce_1                VARCHAR(255),
    cruce_2                VARCHAR(255),
    afiliado_poblacion     VARCHAR(50),
    afiliado_municipio     VARCHAR(50),
    afiliado_cp            NUMERIC,
    afiliado_lada          NUMERIC,
    afiliado_celular       VARCHAR(50),
    tipo_prestamo          VARCHAR(25),
    nombre_aval            VARCHAR(255),
    aval_telefono          VARCHAR(255),
    aval_celular           VARCHAR(255),
    aval_calle             VARCHAR(255),
    aval_exterior          VARCHAR(50),
    aval_interior          VARCHAR(50),
    aval_colonia           VARCHAR(255),
    aval_municipio         VARCHAR(255),
    garantia_direccion     LONGTEXT,
    garantia_colonia       VARCHAR(255),
    garantia_poblacion     VARCHAR(255),
    garantia_municipio     VARCHAR(255),
    pmo                    VARCHAR(5),
    sub_estatus_id         VARCHAR(5),
    ultimo_abono_modificado DATETIME,
    adeudo                 NUMERIC(15,2),
    saldo_por_vencer       NUMERIC(15,2),
    moratorio              NUMERIC(15,2),
    liquidacion            NUMERIC(15,2),
    fecha_historica        DATETIME,
    PRIMARY KEY (prestamo),
    CONSTRAINT fk_tmp_padron FOREIGN KEY (prestamo) REFERENCES tabla_padron(prestamo)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_HISTORICA
-- ------------------------------------------------------------
CREATE TABLE tabla_historica (
    id_historico           INT AUTO_INCREMENT PRIMARY KEY,
    prestamo               NUMERIC      NOT NULL,
    orden_impresion        INT,
    obs                    LONGTEXT,
    codebar                VARCHAR(25)  NOT NULL,
    nombre                 VARCHAR(255),
    numero_afiliado        NUMERIC,
    afiliado_calle         VARCHAR(255),
    afiliado_exterior      VARCHAR(50),
    afiliado_interior      VARCHAR(50),
    afiliado_colonia       VARCHAR(50),
    cruce_1                VARCHAR(255),
    cruce_2                VARCHAR(255),
    afiliado_poblacion     VARCHAR(50),
    afiliado_municipio     VARCHAR(50),
    afiliado_cp            NUMERIC,
    afiliado_lada          NUMERIC,
    afiliado_celular       VARCHAR(50),
    tipo_prestamo          VARCHAR(25),
    nombre_aval            VARCHAR(255),
    aval_telefono          VARCHAR(255),
    aval_celular           VARCHAR(255),
    aval_calle             VARCHAR(255),
    aval_exterior          VARCHAR(50),
    aval_interior          VARCHAR(50),
    aval_colonia           VARCHAR(255),
    aval_municipio         VARCHAR(255),
    garantia_direccion     LONGTEXT,
    garantia_colonia       VARCHAR(255),
    garantia_poblacion     VARCHAR(255),
    garantia_municipio     VARCHAR(255),
    pmo                    VARCHAR(5),
    sub_estatus_id         VARCHAR(5),
    ultimo_abono_modificado DATETIME,
    adeudo                 NUMERIC(15,2),
    saldo_por_vencer       NUMERIC(15,2),
    moratorio              NUMERIC(15,2),
    liquidacion            NUMERIC(15,2),
    fecha_historica        DATETIME,
    CONSTRAINT fk_hist_padron FOREIGN KEY (prestamo) REFERENCES tabla_padron(prestamo)
) ENGINE=InnoDB;
