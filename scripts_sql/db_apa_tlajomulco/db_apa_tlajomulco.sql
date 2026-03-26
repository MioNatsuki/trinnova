-- ============================================================
-- db_apa_tlajomulco.sql
-- Proyecto: APA Tlajomulco (Agua Potable)
-- Diagrama de referencia: 5__1_Proyecto_APA_Tlajomulco.png
-- Guardar en: scripts_sql/db_apa_tlajomulco/
-- ============================================================

CREATE DATABASE IF NOT EXISTS db_apa_tlajomulco
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE db_apa_tlajomulco;

-- ------------------------------------------------------------
-- TABLA_PADRON
-- Es lo que entrega el estado. Se sube tal cual via CSV/Excel.
-- ------------------------------------------------------------
CREATE TABLE tabla_padron (
    despacho              INT,
    clave_APA             INT          NOT NULL,
    propietario           LONGTEXT,
    calle                 LONGTEXT,
    exterior              VARCHAR(25),
    interior              VARCHAR(25),
    poblacion             LONGTEXT,
    localidad             LONGTEXT,
    tipo_servicio         VARCHAR(10),
    tipo_tarifa           VARCHAR(10),
    adeudo_agua           NUMERIC(15,2),
    adeudo_colectores     NUMERIC(15,2),
    adeudo_infraestructura NUMERIC(15,2),
    actualizacion         NUMERIC(15,2),
    conexion              NUMERIC(15,2),
    c_drenaje             NUMERIC(15,2),
    descuento             NUMERIC(15,2),
    recargos              NUMERIC(15,2),
    descuentos_recargos   NUMERIC(15,2),
    multa                 NUMERIC(15,2),
    gastos                NUMERIC(15,2),
    saldo                 NUMERIC(15,2),
    periodo_desde         VARCHAR(10),
    periodo_hasta         VARCHAR(10),
    recaudadora           NUMERIC(10),
    tipo_predio           VARCHAR(5),
    cuenta                INT,
    recamaras             INT,
    banos                 INT,
    medidor               VARCHAR(100),
    id_convenio           INT,
    cobros_a_considerar   INT,
    lectura_real          VARCHAR(150),
    fecha_lectura         DATE,
    autosuficiente        VARCHAR(100),
    baldio                VARCHAR(100),
    PRIMARY KEY (clave_APA)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_COMPLEMENTARIA
-- Columnas extra que el usuario llena manualmente en la app.
-- ------------------------------------------------------------
CREATE TABLE tabla_complementaria (
    id_apa          INT AUTO_INCREMENT PRIMARY KEY,
    clave_APA       INT          NOT NULL,
    multa_virtual   NUMERIC(15,2),
    axoini          YEAR,
    mesini          INT,
    axofin          YEAR,
    mesfin          INT,
    ultimo_req      DATE,
    fecha           DATETIME,
    ejecutor        VARCHAR(15),
    recaudadora     INT,
    tipo_predio     VARCHAR(5),
    cuenta          INT,
    recamaras       INT,
    banos           INT,
    etiqueta        VARCHAR(38),
    saldo           NUMERIC(15,2),
    CONSTRAINT fk_comp_padron FOREIGN KEY (clave_APA) REFERENCES tabla_padron(clave_APA) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_ANALISIS
-- Fusion de tabla_padron + tabla_complementaria.
-- Se genera al guardar la seccion "Complementar".
-- Incluye columna de viabilidad para la seccion Limpieza.
-- ------------------------------------------------------------
CREATE TABLE tabla_analisis (
    despacho              INT,
    clave_APA             INT          NOT NULL,
    propietario           LONGTEXT,
    calle                 LONGTEXT,
    exterior              VARCHAR(25),
    interior              VARCHAR(25),
    poblacion             LONGTEXT,
    localidad             LONGTEXT,
    tipo_servicio         VARCHAR(10),
    tipo_tarifa           VARCHAR(10),
    adeudo_agua           NUMERIC(15,2),
    adeudo_colectores     NUMERIC(15,2),
    adeudo_infraestructura NUMERIC(15,2),
    actualizacion         NUMERIC(15,2),
    conexion              NUMERIC(15,2),
    c_drenaje             NUMERIC(15,2),
    descuento             NUMERIC(15,2),
    recargos              NUMERIC(15,2),
    descuentos_recargos   NUMERIC(15,2),
    multa                 NUMERIC(15,2),
    gastos                NUMERIC(15,2),
    saldo                 NUMERIC(15,2),
    periodo_desde         VARCHAR(10),
    periodo_hasta         VARCHAR(10),
    recaudadora           NUMERIC(10),
    tipo_predio           VARCHAR(5),
    cuenta                INT,
    recamaras             INT,
    banos                 INT,
    medidor               VARCHAR(100),
    id_convenio           INT,
    cobros_a_considerar   INT,
    lectura_real          VARCHAR(150),
    fecha_lectura         DATE,
    autosuficiente        VARCHAR(100),
    baldio                VARCHAR(100),
    -- Columnas de tabla_complementaria
    multa_virtual         NUMERIC(15,2),
    axoini                YEAR,
    mesini                INT,
    axofin                YEAR,
    mesfin                INT,
    ultimo_req            DATE,
    fecha                 DATETIME,
    ejecutor              VARCHAR(15),
    -- Columnas de observaciones_analisis
    pagada                BOOLEAN,
    se_imprime            BOOLEAN,
    motivo                LONGTEXT,
    nd                    VARCHAR(55),
    motivo_sus            LONGTEXT,
    bases                 LONGTEXT,
    -- Control
    viabilidad            ENUM('viable','no_viable','pendiente') DEFAULT 'pendiente',
    PRIMARY KEY (clave_APA)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_DINAMICA
-- Campos calculados/concatenados. Se ejecuta como trigger/SP
-- antes de la emision.
-- ------------------------------------------------------------
CREATE TABLE tabla_dinamica (
    codebar          VARCHAR(25)  NOT NULL PRIMARY KEY,
    clave_APA        INT          NOT NULL,
    id_documento     INT,
    visita           VARCHAR(10),
    pmo              VARCHAR(10),
    fecha_emision    DATETIME,
    status_captura   VARCHAR(50),
    id_notificador   INT,
    cuenta           NUMERIC,
    domicilio        LONGTEXT,
    firma            VARCHAR(55),
    zona             VARCHAR(55),
    colonia          VARCHAR(55),
    zona_riesgo      VARCHAR(10),
    CONSTRAINT fk_din_padron FOREIGN KEY (clave_APA) REFERENCES tabla_padron(clave_APA)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_CAPTURA
-- Se actualiza en cada emision con lo capturado en la app.
-- ------------------------------------------------------------
CREATE TABLE tabla_captura (
    id_captura       INT AUTO_INCREMENT PRIMARY KEY,
    clave_APA        INT NOT NULL,
    colonia          LONGTEXT,
    calle_captura    LONGTEXT,
    numero_captura   LONGTEXT,
    ubicacion_captura LONGTEXT,
    obs_final        LONGTEXT,
    obs_org          LONGTEXT,
    concat_obs       LONGTEXT,
    CONSTRAINT fk_cap_padron FOREIGN KEY (clave_APA) REFERENCES tabla_padron(clave_APA)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_TEMPORAL
-- Union de tabla_analisis + tabla_dinamica.
-- Usada para mapeo de plantillas y generacion de PDFs.
-- Se limpia (TRUNCATE) tras cada emision exitosa.
-- ------------------------------------------------------------
CREATE TABLE tabla_temporal (
    clave_APA             INT          NOT NULL,
    orden_impresion       INT,
    obs                   LONGTEXT,
    codebar               VARCHAR(25)  NOT NULL,
    fecha_corte           DATE,
    fecha_emision         DATE,
    id_apa                INT,
    propietario           LONGTEXT,
    domicilio             LONGTEXT,
    observaciones         LONGTEXT,
    guia                  LONGTEXT,
    axoini                YEAR,
    axofin                YEAR,
    mesini                VARCHAR(10),
    mesfin                VARCHAR(10),
    adeudo_agua           NUMERIC(15,2),
    adeudo_colectores     NUMERIC(15,2),
    adeudo_infraestructura NUMERIC(15,2),
    recargos              NUMERIC(15,2),
    actualizacion         NUMERIC(15,2),
    saldo                 NUMERIC(15,2),
    gasto_estimado        NUMERIC(15,2),
    multa                 NUMERIC(15,2),
    conexiones            NUMERIC(15,2),
    total_adeudo          NUMERIC(15,2),
    cuenta_vinculada      VARCHAR(15),
    firma                 VARCHAR(55),
    zona                  VARCHAR(55),
    colonia               VARCHAR(55),
    zona_riesgo           VARCHAR(10),
    colonia_captura       LONGTEXT,
    calle_captura         LONGTEXT,
    numero_captura        LONGTEXT,
    ubicacion_captura     LONGTEXT,
    obs_final             LONGTEXT,
    obs_org               LONGTEXT,
    concat_obs            LONGTEXT,
    PRIMARY KEY (clave_APA),
    CONSTRAINT fk_tmp_padron FOREIGN KEY (clave_APA) REFERENCES tabla_padron(clave_APA)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- TABLA_HISTORICA
-- Una vez emitidos los PDFs, tabla_temporal se pasa aqui
-- y se hace TRUNCATE a tabla_temporal.
-- ------------------------------------------------------------
CREATE TABLE tabla_historica (
    id_historico          INT AUTO_INCREMENT PRIMARY KEY,
    clave_APA             INT          NOT NULL,
    orden_impresion       INT,
    obs                   LONGTEXT,
    codebar               VARCHAR(25)  NOT NULL,
    fecha_corte           DATE,
    fecha_emision         DATE,
    id_apa                INT,
    propietario           LONGTEXT,
    domicilio             LONGTEXT,
    observaciones         LONGTEXT,
    guia                  LONGTEXT,
    axoini                YEAR,
    axofin                YEAR,
    mesini                VARCHAR(10),
    mesfin                VARCHAR(10),
    adeudo_agua           NUMERIC(15,2),
    adeudo_colectores     NUMERIC(15,2),
    adeudo_infraestructura NUMERIC(15,2),
    recargos              NUMERIC(15,2),
    actualizacion         NUMERIC(15,2),
    saldo                 NUMERIC(15,2),
    gasto_estimado        NUMERIC(15,2),
    multa                 NUMERIC(15,2),
    conexiones            NUMERIC(15,2),
    total_adeudo          NUMERIC(15,2),
    cuenta_vinculada      VARCHAR(15),
    firma                 VARCHAR(55),
    zona                  VARCHAR(55),
    colonia               VARCHAR(55),
    zona_riesgo           VARCHAR(10),
    colonia_captura       LONGTEXT,
    calle_captura         LONGTEXT,
    numero_captura        LONGTEXT,
    ubicacion_captura     LONGTEXT,
    obs_final             LONGTEXT,
    obs_org               LONGTEXT,
    concat_obs            LONGTEXT,
    fecha_historica       DATE,
    CONSTRAINT fk_hist_padron FOREIGN KEY (clave_APA) REFERENCES tabla_padron(clave_APA)
) ENGINE=InnoDB;
