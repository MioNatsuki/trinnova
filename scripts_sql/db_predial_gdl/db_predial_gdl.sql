-- ============================================================
-- db_predial_gdl.sql
-- Proyecto: Predial Guadalajara
-- Diagrama de referencia: 4_1_Proyecto_Predial_GDL.png
-- Guardar en: scripts_sql/db_predial_gdl/
-- ============================================================

CREATE DATABASE IF NOT EXISTS db_predial_gdl
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE db_predial_gdl;

-- ------------------------------------------------------------
-- TABLA_PADRON
-- ------------------------------------------------------------
CREATE TABLE tabla_padron (
    despacho          INT,
    cuenta_n          VARCHAR(15)  NOT NULL,
    estatus_n         VARCHAR(55),
    clavecatastral    VARCHAR(55),
    subpredio         INTEGER,
    infonavit         VARCHAR(5),
    propietariotitular_n LONGTEXT,
    calle             LONGTEXT,
    num_exterior      VARCHAR(10),
    num_interior      VARCHAR(10),
    colonia           LONGTEXT,
    poblacion_desc    INT,
    calle_n           LONGINT,
    numero_exterior   VARCHAR(10),
    numero_interior   VARCHAR(10),
    colonia_n         LONGTEXT,
    incp              NUMERIC(15,2),
    gastos            NUMERIC(15,2),
    multas            NUMERIC(15,2),
    saldomulta        NUMERIC(15,2),
    saldo2025         NUMERIC(15,2),
    axo               YEAR,
    bimestre          VARCHAR(10),
    ultimoRequerimiento VARCHAR(55),
    valor_fiscal      NUMERIC(15,2),
    tasa_n            NUMERIC(15,4),
    terreno           NUMERIC(15,2),
    construccion      NUMERIC(15,2),
    biqcat            VARCHAR(15),
    biqapre           VARCHAR(15),
    zona              INT,
    subzona           INT,
    emision           DATE,
    id_firmado        INT,
    firmante          VARCHAR(255),
    cargo             VARCHAR(255),
    validez_certi     VARCHAR(255),
    fecha_firma       DATE,
    hash              VARCHAR(255),
    PRIMARY KEY (cuenta_n)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_DETALLE
-- Adeudos por año/bimestre
-- ------------------------------------------------------------
CREATE TABLE tabla_detalle (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    cuenta      INT          NOT NULL,
    cuenta_n    VARCHAR(15)  NOT NULL,
    impuestos   NUMERIC(15,2),
    recargos    NUMERIC(15,2),
    CONSTRAINT fk_det_padron FOREIGN KEY (cuenta_n) REFERENCES tabla_padron(cuenta_n) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_DETALLE_ADEUDOS
-- ------------------------------------------------------------
CREATE TABLE tabla_detalle_adeudos (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    cuenta      INT          NOT NULL,
    cuenta_n    VARCHAR(15)  NOT NULL,
    CONSTRAINT fk_deta_padron FOREIGN KEY (cuenta_n) REFERENCES tabla_padron(cuenta_n) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_COMPLEMENTARIA
-- ------------------------------------------------------------
CREATE TABLE tabla_complementaria (
    id_comp              INT AUTO_INCREMENT PRIMARY KEY,
    cuenta_n             VARCHAR(15)  NOT NULL,
    predial_total        NUMERIC(15,2),
    gastos_estimados     NUMERIC(15,2),
    gastos_ejecucion     NUMERIC(15,2),
    gastos_totales       NUMERIC(15,2),
    impuestos_totales    NUMERIC(15,2),
    recargos_totales     NUMERIC(15,2),
    total_adeudo         NUMERIC(15,2),
    axofin               YEAR,
    bimestre_fin         VARCHAR(5),
    recaudadora          INT,
    tipo                 VARCHAR(5),
    cuenta               INT,
    firma                VARCHAR(15),
    pob_fisc             LONGTEXT,
    col_fisc             LONGTEXT,
    calle_fisc           LONGTEXT,
    num_ext_fiscl        VARCHAR(5),
    num_int_fiscl        VARCHAR(5),
    num_ext_pred         VARCHAR(15),
    num_int_pred         VARCHAR(15),
    domicilio_fiscal     LONGTEXT,
    llave_agp            VARCHAR(255),
    CONSTRAINT fk_comp_padron FOREIGN KEY (cuenta_n) REFERENCES tabla_padron(cuenta_n) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_ANALISIS
-- ------------------------------------------------------------
CREATE TABLE tabla_analisis (
    despacho             INT,
    cuenta_n             VARCHAR(15)  NOT NULL,
    estatus_n            VARCHAR(55),
    clavecatastral       VARCHAR(55),
    subpredio            INT,
    infonavit            VARCHAR(5),
    propietariotitular_n LONGTEXT,
    calle                LONGTEXT,
    num_exterior         VARCHAR(10),
    num_interior         VARCHAR(10),
    colonia              LONGTEXT,
    poblacion_desc       INT,
    calle_n              LONGTEXT,
    numero_exterior      VARCHAR(10),
    numero_interior      VARCHAR(10),
    colonia_n            LONGTEXT,
    incp                 NUMERIC(15,2),
    gastos               NUMERIC(15,2),
    multas               NUMERIC(15,2),
    saldomulta           NUMERIC(15,2),
    saldo2025            NUMERIC(15,2),
    axo                  YEAR,
    bimestre             VARCHAR(10),
    ultimoRequerimiento  VARCHAR(55),
    valor_fiscal         NUMERIC(15,2),
    tasa_n               NUMERIC(15,4),
    terreno              NUMERIC(15,2),
    construccion         NUMERIC(15,2),
    biqcat               VARCHAR(15),
    biqapre              VARCHAR(15),
    zona                 INT,
    subzona              INT,
    -- De complementaria
    predial_total        NUMERIC(15,2),
    gastos_estimados     NUMERIC(15,2),
    gastos_totales       NUMERIC(15,2),
    impuestos_totales    NUMERIC(15,2),
    recargos_totales     NUMERIC(15,2),
    total_adeudo         NUMERIC(15,2),
    recaudadora          INT,
    tipo                 VARCHAR(5),
    cuenta               INT,
    firma                VARCHAR(15),
    pob_fisc             LONGTEXT,
    col_fisc             LONGTEXT,
    calle_fisc           LONGTEXT,
    num_ext_fiscl        VARCHAR(5),
    num_int_fiscl        VARCHAR(5),
    domicilio_fiscal     LONGTEXT,
    llave_agp            VARCHAR(255),
    -- Viabilidad
    colonia_carto        VARCHAR(50),
    colonia_llave        VARCHAR(50),
    colonia_agrupador    VARCHAR(255),
    colonia_final        VARCHAR(255),
    id_zona              INT,
    viabilidad_col_predio         VARCHAR(15),
    viabilidad_num_predio         VARCHAR(15),
    viabilidad_calle_predio       VARCHAR(15),
    viabilidad_por_domicilio_predio VARCHAR(15),
    motivo_viabilidad             VARCHAR(50),
    viabilidad_domicilio_fiscal   VARCHAR(15),
    motivo_viabilidad_final       VARCHAR(15),
    viabilidad_final_localizacion VARCHAR(15),
    viabilidad_final              VARCHAR(15),
    suspension                    VARCHAR(20),
    entidades_publicas            VARCHAR(50),
    calle_captura        LONGTEXT,
    numero_captura       LONGTEXT,
    colonia_captura      LONGTEXT,
    obs_generales        LONGTEXT,
    viabilidad           ENUM('viable','no_viable','pendiente') DEFAULT 'pendiente',
    PRIMARY KEY (cuenta_n)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_DINAMICA
-- ------------------------------------------------------------
CREATE TABLE tabla_dinamica (
    codebar          VARCHAR(25) NOT NULL PRIMARY KEY,
    cuenta           NUMERIC     NOT NULL,
    id_documento     INT,
    visita           VARCHAR(10),
    pmo              VARCHAR(10),
    fecha_emision    DATETIME,
    fecha_notificacion DATETIME,
    status_captura   VARCHAR(50),
    id_notificador   INT,
    programa         VARCHAR(255),
    id_zona          INT,
    CONSTRAINT fk_din_padron FOREIGN KEY (cuenta) REFERENCES tabla_padron(cuenta_n)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_CAPTURA
-- ------------------------------------------------------------
CREATE TABLE tabla_captura (
    id_captura        INT AUTO_INCREMENT PRIMARY KEY,
    cuenta_n          VARCHAR(15) NOT NULL,
    colonia_captura   LONGTEXT,
    calle_captura     LONGTEXT,
    numero_captura    LONGTEXT,
    ubicacion_captura LONGTEXT,
    obs_final         LONGTEXT,
    obs_org           LONGTEXT,
    concat_obs        LONGTEXT,
    CONSTRAINT fk_cap_padron FOREIGN KEY (cuenta_n) REFERENCES tabla_padron(cuenta_n)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_TEMPORAL
-- ------------------------------------------------------------
CREATE TABLE tabla_temporal (
    cuenta_n             VARCHAR(15)  NOT NULL,
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
    propietariotitular_n LONGTEXT,
    domicilio_fiscal     LONGTEXT,
    domicilio            LONGTEXT,
    num_exterior         VARCHAR(5),
    num_interior         VARCHAR(5),
    colonia              LONGTEXT,
    colonia_n            LONGTEXT,
    numero_exterior      VARCHAR(10),
    numero_interior      VARCHAR(10),
    incp                 NUMERIC(15,2),
    gastos               NUMERIC(15,2),
    multas               NUMERIC(15,2),
    saldomulta           NUMERIC(15,2),
    saldo2025            NUMERIC(15,2),
    axo                  YEAR,
    bimestre             VARCHAR(10),
    ultimoRequerimiento  VARCHAR(55),
    valor_fiscal         NUMERIC(15,2),
    tasa_n               NUMERIC(15,4),
    predial_total        NUMERIC(15,2),
    gastos_totales       NUMERIC(15,2),
    impuestos_totales    NUMERIC(15,2),
    recargos_totales     NUMERIC(15,2),
    total_adeudo         NUMERIC(15,2),
    firma                VARCHAR(15),
    llave_agp            VARCHAR(255),
    colonia_captura      LONGTEXT,
    calle_captura        LONGTEXT,
    numero_captura       LONGTEXT,
    PRIMARY KEY (cuenta_n),
    CONSTRAINT fk_tmp_padron FOREIGN KEY (cuenta_n) REFERENCES tabla_padron(cuenta_n)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_HISTORICA
-- ------------------------------------------------------------
CREATE TABLE tabla_historica (
    id_historico         INT AUTO_INCREMENT PRIMARY KEY,
    cuenta_n             VARCHAR(15)  NOT NULL,
    orden_impresion      INT,
    obs                  LONGTEXT,
    codebar              VARCHAR(25)  NOT NULL,
    terreno              NUMERIC(15,2),
    construccion         NUMERIC(15,2),
    recaudadora          INT,
    tipo                 VARCHAR(5),
    cve_catastral        VARCHAR(50),
    fecha_emision        DATE,
    zona                 INT,
    subzona              INT,
    pmo                  VARCHAR(5),
    propietariotitular_n LONGTEXT,
    domicilio_fiscal     LONGTEXT,
    domicilio            LONGTEXT,
    incp                 NUMERIC(15,2),
    gastos               NUMERIC(15,2),
    multas               NUMERIC(15,2),
    saldo2025            NUMERIC(15,2),
    predial_total        NUMERIC(15,2),
    total_adeudo         NUMERIC(15,2),
    firma                VARCHAR(15),
    fecha_historica      DATETIME,
    CONSTRAINT fk_hist_padron FOREIGN KEY (cuenta_n) REFERENCES tabla_padron(cuenta_n)
) ENGINE=InnoDB;
