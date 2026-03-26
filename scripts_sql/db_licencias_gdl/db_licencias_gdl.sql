-- ============================================================
-- db_licencias_gdl.sql
-- Proyecto: Licencias Guadalajara
-- Diagrama de referencia: 3_1_Diagrama_Licencias_GDL.png
-- Guardar en: scripts_sql/db_licencias_gdl/
-- ============================================================

CREATE DATABASE IF NOT EXISTS db_licencias_gdl
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE db_licencias_gdl;

-- ------------------------------------------------------------
-- TABLA_PADRON
-- ------------------------------------------------------------
CREATE TABLE tabla_padron (
    cvereq           INT,
    axoreq           YEAR,
    folioreq         INT,
    cveproceso       VARCHAR(5),
    fecemi           DATE,
    recaud           INT,
    id_licencia      INT,
    licencia         INT          NOT NULL,
    propietario      LONGTEXT,
    ubicacion        LONGTEXT,
    numext_ubic      INT,
    letraext_ubic    VARCHAR(5),
    numint_ubic      INT,
    letraint_ubic    VARCHAR(5),
    colonia_ubic     VARCHAR(255),
    zona             INT,
    subzona          INT,
    descripcion      LONGTEXT,
    actividad        LONGTEXT,
    axoini           YEAR,
    axofin           YEAR,
    formas           NUMERIC(15,2),
    derechos         NUMERIC(15,2),
    recargos         NUMERIC(15,2),
    multas           NUMERIC(15,2),
    anuncios         NUMERIC(15,2),
    holograma        NUMERIC(15,2),
    solicitud        NUMERIC(15,2),
    fverdederecho    NUMERIC(15,2),
    fverdeanuncio    NUMERIC(15,2),
    actualizacion    NUMERIC(15,2),
    gastos           NUMERIC(15,2),
    total            NUMERIC(15,2),
    cveejecut        INT,
    ncompleto        VARCHAR(255),
    PRIMARY KEY (licencia)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_DETALLE
-- Detalle de adeudos por licencia
-- ------------------------------------------------------------
CREATE TABLE tabla_detalle (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    cvereq      INT NOT NULL,
    licencia    INT NOT NULL,
    id_licencia INT,
    anuncio     INT,
    axo         YEAR,
    forma       NUMERIC(15,2),
    derechos    NUMERIC(15,2),
    recargos    NUMERIC(15,2),
    medio_ambiente NUMERIC(15,2),
    actualizacion NUMERIC(15,2),
    multa       NUMERIC(15,2),
    saldo       NUMERIC(15,2),
    CONSTRAINT fk_det_padron FOREIGN KEY (licencia) REFERENCES tabla_padron(licencia) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_COMPLEMENTARIA
-- ------------------------------------------------------------
CREATE TABLE tabla_complementaria (
    id_comp                    INT AUTO_INCREMENT PRIMARY KEY,
    licencia                   INT          NOT NULL,
    tipo_propietario           VARCHAR(255),
    descripcion_tipo_propietario VARCHAR(255),
    viable_domicilio           VARCHAR(50),
    descripcion_2              VARCHAR(255),
    CONSTRAINT fk_comp_padron FOREIGN KEY (licencia) REFERENCES tabla_padron(licencia) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_ANALISIS
-- ------------------------------------------------------------
CREATE TABLE tabla_analisis (
    cvereq           INT,
    axoreq           YEAR,
    folioreq         INT,
    cveproceso       VARCHAR(5),
    fecemi           DATE,
    recaud           INT,
    id_licencia      INT,
    licencia         INT          NOT NULL,
    propietario      LONGTEXT,
    ubicacion        LONGTEXT,
    numext_ubic      INT,
    letraext_ubic    VARCHAR(5),
    numint_ubic      INT,
    letraint_ubic    VARCHAR(5),
    colonia_ubic     VARCHAR(255),
    zona             INT,
    subzona          INT,
    descripcion      LONGTEXT,
    actividad        LONGTEXT,
    axoini           YEAR,
    axofin           YEAR,
    formas           NUMERIC(15,2),
    derechos         NUMERIC(15,2),
    recargos         NUMERIC(15,2),
    multas           NUMERIC(15,2),
    anuncios         NUMERIC(15,2),
    holograma        NUMERIC(15,2),
    solicitud        NUMERIC(15,2),
    fverdederecho    NUMERIC(15,2),
    fverdeanuncio    NUMERIC(15,2),
    actualizacion    NUMERIC(15,2),
    gastos           NUMERIC(15,2),
    total            NUMERIC(15,2),
    cveejecut        INT,
    ncompleto        VARCHAR(255),
    -- De complementaria
    tipo_propietario            VARCHAR(255),
    descripcion_tipo_propietario VARCHAR(255),
    viable_domicilio            VARCHAR(50),
    descripcion_2               VARCHAR(255),
    -- Control
    viabilidad       ENUM('viable','no_viable','pendiente') DEFAULT 'pendiente',
    PRIMARY KEY (licencia)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_DINAMICA
-- ------------------------------------------------------------
CREATE TABLE tabla_dinamica (
    codebar          VARCHAR(25) NOT NULL PRIMARY KEY,
    licencia         NUMERIC     NOT NULL,
    id_documento     INT,
    visita           VARCHAR(10),
    pmo              VARCHAR(10),
    fecha_emision    DATETIME,
    fecha_notificacion DATETIME,
    status_captura   VARCHAR(50),
    id_notificador   INT,
    programa         VARCHAR(255),
    CONSTRAINT fk_din_padron FOREIGN KEY (licencia) REFERENCES tabla_padron(licencia)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_CAPTURA
-- ------------------------------------------------------------
CREATE TABLE tabla_captura (
    id_captura        INT AUTO_INCREMENT PRIMARY KEY,
    licencia          INT NOT NULL,
    colonia_captura   LONGTEXT,
    calle_captura     LONGTEXT,
    numero_captura    LONGTEXT,
    ubicacion_captura LONGTEXT,
    obs_final         LONGTEXT,
    obs_org           LONGTEXT,
    concat_obs        LONGTEXT,
    CONSTRAINT fk_cap_padron FOREIGN KEY (licencia) REFERENCES tabla_padron(licencia)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_TEMPORAL
-- ------------------------------------------------------------
CREATE TABLE tabla_temporal (
    licencia         NUMERIC      NOT NULL,
    orden_impresion  INT,
    obs              LONGTEXT,
    codebar          VARCHAR(25)  NOT NULL,
    propietario      VARCHAR(255),
    ubicacion        LONGTEXT,
    numext_ubic      INT,
    letraext_ubic    VARCHAR(5),
    numint_ubic      INT,
    letraint_ubic    VARCHAR(5),
    colonia_ubic     VARCHAR(255),
    folioreq         INT,
    axoreq           YEAR,
    actividad        LONGTEXT,
    recaud           INT,
    anuncios         NUMERIC(15,2),
    zona             INT,
    subzona          INT,
    axoini           YEAR,
    axofin           YEAR,
    derechos         NUMERIC(15,2),
    fverdederechos   NUMERIC(15,2),
    fverdeanuncios   NUMERIC(15,2),
    recargos         NUMERIC(15,2),
    actualizacion    NUMERIC(15,2),
    formas           NUMERIC(15,2),
    holograma        NUMERIC(15,2),
    solicitud        NUMERIC(15,2),
    gastos           NUMERIC(15,2),
    total            NUMERIC(15,2),
    pmo              VARCHAR(5),
    id_notificador   INT,
    PRIMARY KEY (licencia),
    CONSTRAINT fk_tmp_padron FOREIGN KEY (licencia) REFERENCES tabla_padron(licencia)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_HISTORICA
-- ------------------------------------------------------------
CREATE TABLE tabla_historica (
    id_historico     INT AUTO_INCREMENT PRIMARY KEY,
    licencia         NUMERIC      NOT NULL,
    orden_impresion  INT,
    obs              LONGTEXT,
    codebar          VARCHAR(25)  NOT NULL,
    propietario      VARCHAR(255),
    ubicacion        LONGTEXT,
    numext_ubic      INT,
    letraext_ubic    VARCHAR(5),
    numint_ubic      INT,
    letraint_ubic    VARCHAR(5),
    colonia_ubic     VARCHAR(255),
    folioreq         INT,
    axoreq           YEAR,
    actividad        LONGTEXT,
    recaud           INT,
    anuncios         NUMERIC(15,2),
    zona             INT,
    subzona          INT,
    axoini           YEAR,
    axofin           YEAR,
    derechos         NUMERIC(15,2),
    fverdederechos   NUMERIC(15,2),
    fverdeanuncios   NUMERIC(15,2),
    recargos         NUMERIC(15,2),
    actualizacion    NUMERIC(15,2),
    formas           NUMERIC(15,2),
    holograma        NUMERIC(15,2),
    solicitud        NUMERIC(15,2),
    gastos           NUMERIC(15,2),
    total            NUMERIC(15,2),
    pmo              VARCHAR(5),
    id_notificador   INT,
    fecha_historica  DATETIME,
    CONSTRAINT fk_hist_padron FOREIGN KEY (licencia) REFERENCES tabla_padron(licencia)
) ENGINE=InnoDB;
