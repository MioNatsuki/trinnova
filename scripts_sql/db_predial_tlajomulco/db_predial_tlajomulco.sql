-- ============================================================
-- db_predial_tlajomulco.sql
-- Proyecto: Predial Tlajomulco
-- Diagrama de referencia: 6_1_Proyecto_Predial_Tlajomulco.png
-- Guardar en: scripts_sql/db_predial_tlajomulco/
-- ============================================================

CREATE DATABASE IF NOT EXISTS db_predial_tlajomulco
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE db_predial_tlajomulco;

-- ------------------------------------------------------------
-- TABLA_PADRON
-- ------------------------------------------------------------
CREATE TABLE tabla_padron (
    control_req          INT,
    axo_req              YEAR,
    folio_req            INT,
    cve_cuenta           INT,
    cuenta               INT          NOT NULL,
    cve_catastral        VARCHAR(25),
    domicilio            LONGTEXT,
    no_ext               VARCHAR(5),
    no_int               VARCHAR(5),
    estado               VARCHAR(255),
    municipio            VARCHAR(255),
    poblacion            VARCHAR(255),
    ubicacion            VARCHAR(255),
    ubic_no_ext          VARCHAR(15),
    ubic_no_int          VARCHAR(15),
    ubic_colonia         VARCHAR(255),
    calle_encontrado     VARCHAR(255),
    no_ext_3             VARCHAR(5),
    no_int_3             VARCHAR(5),
    colonia_3            VARCHAR(255),
    axo_desde            YEAR,
    bim_desde            INT,
    axo_hasta            YEAR,
    bim_hasta            INT,
    impuesto             NUMERIC(15,2),
    recargos             NUMERIC(15,2),
    total_multas         NUMERIC(15,2),
    total_gastos         NUMERIC(15,2),
    saldo                NUMERIC(15,2),
    gastos_requerimiento NUMERIC(15,2),
    actualizacion        NUMERIC(15,2),
    exento               VARCHAR(5),
    tasa                 NUMERIC(15,4),
    valor_fiscal         NUMERIC(15,2),
    terreno              NUMERIC(15,2),
    construccion         NUMERIC(15,2),
    blqcat               VARCHAR(15),
    blqapre              VARCHAR(15),
    zona                 INT,
    subzona              INT,
    emision              DATE,
    id_firmado           INT,
    firmante             VARCHAR(255),
    cargo                VARCHAR(255),
    validez_certi        VARCHAR(255),
    fecha_firma          DATE,
    hash                 VARCHAR(255),
    PRIMARY KEY (cuenta)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_DETALLE
-- Detalle de adeudos por año/bimestre (evita columnas infinitas)
-- ------------------------------------------------------------
CREATE TABLE tabla_detalle (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    control_req   INT NOT NULL,
    cuenta        INT NOT NULL,
    axo           YEAR,
    bimini        INT,
    bimfin        INT,
    valfiscal     NUMERIC(15,2),
    tasa          NUMERIC(15,4),
    impuesto      NUMERIC(15,2),
    recargos      NUMERIC(15,2),
    CONSTRAINT fk_det_padron FOREIGN KEY (cuenta) REFERENCES tabla_padron(cuenta) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_DETALLE_ADEUDOS
-- Tabla puente detalle (many-to-many via detalle)
-- ------------------------------------------------------------
CREATE TABLE tabla_detalle_adeudos (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    cuenta      INT NOT NULL,
    cuenta_n    INT NOT NULL,
    CONSTRAINT fk_deta_padron FOREIGN KEY (cuenta) REFERENCES tabla_padron(cuenta) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_COMPLEMENTARIA
-- ------------------------------------------------------------
CREATE TABLE tabla_complementaria (
    id_comp              INT AUTO_INCREMENT PRIMARY KEY,
    cuenta               INT          NOT NULL,
    claveparaRutear      VARCHAR(25),
    manzana              INT,
    llave_manzana_full   VARCHAR(15),
    cartografia          VARCHAR(5),
    programa             VARCHAR(50),
    recaudadora          INT,
    tipo                 VARCHAR(5),
    administracion       VARCHAR(20),
    impuesto_control_req INT,
    total_recargos       NUMERIC(15,2),
    recargo_control_req  INT,
    total_tasa           NUMERIC(15,4),
    tasa_control_req     INT,
    total_valor_fiscal   NUMERIC(15,2),
    valor_fiscal_control_req INT,
    ano_bimestres_control_req INT,
    bimestres_control_req INT,
    CONSTRAINT fk_comp_padron FOREIGN KEY (cuenta) REFERENCES tabla_padron(cuenta) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_ANALISIS
-- ------------------------------------------------------------
CREATE TABLE tabla_analisis (
    control_req          INT,
    axo_req              YEAR,
    folio_req            INT,
    cve_cuenta           INT,
    cuenta               INT          NOT NULL,
    cve_catastral        VARCHAR(25),
    domicilio            LONGTEXT,
    no_ext               VARCHAR(5),
    no_int               VARCHAR(5),
    estado               VARCHAR(255),
    municipio            VARCHAR(255),
    poblacion            VARCHAR(255),
    ubicacion            VARCHAR(255),
    ubic_no_ext          VARCHAR(15),
    ubic_no_int          VARCHAR(15),
    ubic_colonia         VARCHAR(255),
    calle_encontrado     VARCHAR(255),
    no_ext_3             VARCHAR(5),
    no_int_3             VARCHAR(5),
    colonia_3            VARCHAR(255),
    axo_desde            YEAR,
    bim_desde            INT,
    axo_hasta            YEAR,
    bim_hasta            INT,
    impuesto             NUMERIC(15,2),
    recargos             NUMERIC(15,2),
    total_multas         NUMERIC(15,2),
    total_gastos         NUMERIC(15,2),
    saldo                NUMERIC(15,2),
    gastos_requerimiento NUMERIC(15,2),
    actualizacion        NUMERIC(15,2),
    exento               VARCHAR(5),
    tasa                 NUMERIC(15,4),
    valor_fiscal         NUMERIC(15,2),
    terreno              NUMERIC(15,2),
    construccion         NUMERIC(15,2),
    blqcat               VARCHAR(15),
    blqapre              VARCHAR(15),
    zona                 INT,
    subzona              INT,
    emision              DATE,
    id_firmado           INT,
    firmante             VARCHAR(255),
    cargo                VARCHAR(255),
    validez_certi        VARCHAR(255),
    fecha_firma          DATE,
    hash                 VARCHAR(255),
    -- De complementaria
    claveparaRutear      VARCHAR(25),
    manzana              INT,
    llave_manzana_full   VARCHAR(15),
    cartografia          VARCHAR(5),
    programa             VARCHAR(50),
    recaudadora          INT,
    tipo                 VARCHAR(5),
    administracion       VARCHAR(20),
    -- Control
    calle_captura        LONGTEXT,
    numero_captura       LONGTEXT,
    colonia_captura      LONGTEXT,
    obs_generales        LONGTEXT,
    viabilidad           ENUM('viable','no_viable','pendiente') DEFAULT 'pendiente',
    PRIMARY KEY (cuenta)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_DINAMICA
-- ------------------------------------------------------------
CREATE TABLE tabla_dinamica (
    codebar          VARCHAR(25) NOT NULL PRIMARY KEY,
    cuenta           INT         NOT NULL,
    id_documento     INT,
    visita           VARCHAR(10),
    pmo              VARCHAR(10),
    fecha_emision    DATETIME,
    fecha_notificacion DATETIME,
    status_captura   VARCHAR(50),
    id_notificador   INT,
    programa         VARCHAR(255),
    CONSTRAINT fk_din_padron FOREIGN KEY (cuenta) REFERENCES tabla_padron(cuenta)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_CAPTURA
-- ------------------------------------------------------------
CREATE TABLE tabla_captura (
    id_captura       INT AUTO_INCREMENT PRIMARY KEY,
    cuenta           INT NOT NULL,
    cuenta_obs       LONGTEXT,
    calle_captura    LONGTEXT,
    numero_captura   LONGTEXT,
    colonia_captura  LONGTEXT,
    obs_generales    LONGTEXT,
    CONSTRAINT fk_cap_padron FOREIGN KEY (cuenta) REFERENCES tabla_padron(cuenta)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_TEMPORAL
-- ------------------------------------------------------------
CREATE TABLE tabla_temporal (
    cuenta               INT          NOT NULL,
    orden_impresion      INT,
    obs                  LONGTEXT,
    codebar              VARCHAR(25)  NOT NULL,
    terreno              NUMERIC(15,2),
    construccion         NUMERIC(15,2),
    recaudadora          INT,
    tipo                 VARCHAR(5),
    cve_cuenta           INT,
    cve_catastral        VARCHAR(50),
    fecha_emision        DATE,
    zona                 INT,
    subzona              INT,
    manzana              INT,
    pmo                  VARCHAR(5),
    acronimo             VARCHAR(10),
    propietario          LONGTEXT,
    domicilio_fiscal     LONGTEXT,
    domicilio            LONGTEXT,
    no_ext               VARCHAR(5),
    no_int               VARCHAR(5),
    ubic_colonia         LONGTEXT,
    ubicacion            LONGTEXT,
    ubic_no_ext          VARCHAR(5),
    ubic_no_int          VARCHAR(5),
    calle_encontrado     LONGTEXT,
    no_ext_3             VARCHAR(5),
    no_int_3             VARCHAR(5),
    colonia_3            LONGTEXT,
    axo_desde            YEAR,
    bim_desde            INT,
    axo_hasta            YEAR,
    bim_hasta            INT,
    impuesto             NUMERIC(15,2),
    recargos             NUMERIC(15,2),
    total_multas         NUMERIC(15,2),
    total_gastos         NUMERIC(15,2),
    saldo                NUMERIC(15,2),
    fecha_historica      DATE,
    PRIMARY KEY (cuenta),
    CONSTRAINT fk_tmp_padron FOREIGN KEY (cuenta) REFERENCES tabla_padron(cuenta)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_HISTORICA
-- ------------------------------------------------------------
CREATE TABLE tabla_historica (
    id_historico         INT AUTO_INCREMENT PRIMARY KEY,
    cuenta               INT          NOT NULL,
    orden_impresion      INT,
    obs                  LONGTEXT,
    codebar              VARCHAR(25)  NOT NULL,
    terreno              NUMERIC(15,2),
    construccion         NUMERIC(15,2),
    recaudadora          INT,
    tipo                 VARCHAR(5),
    cve_cuenta           INT,
    cve_catastral        VARCHAR(50),
    fecha_emision        DATE,
    zona                 INT,
    subzona              INT,
    manzana              INT,
    pmo                  VARCHAR(5),
    acronimo             VARCHAR(10),
    propietario          LONGTEXT,
    domicilio_fiscal     LONGTEXT,
    domicilio            LONGTEXT,
    no_ext               VARCHAR(5),
    no_int               VARCHAR(5),
    ubic_colonia         LONGTEXT,
    ubicacion            LONGTEXT,
    ubic_no_ext          VARCHAR(5),
    ubic_no_int          VARCHAR(5),
    calle_encontrado     LONGTEXT,
    no_ext_3             VARCHAR(5),
    no_int_3             VARCHAR(5),
    colonia_3            LONGTEXT,
    axo_desde            YEAR,
    bim_desde            INT,
    axo_hasta            YEAR,
    bim_hasta            INT,
    impuesto             NUMERIC(15,2),
    recargos             NUMERIC(15,2),
    total_multas         NUMERIC(15,2),
    total_gastos         NUMERIC(15,2),
    saldo                NUMERIC(15,2),
    fecha_historica      DATE,
    CONSTRAINT fk_hist_padron FOREIGN KEY (cuenta) REFERENCES tabla_padron(cuenta)
) ENGINE=InnoDB;
