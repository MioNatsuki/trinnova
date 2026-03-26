-- ============================================================
-- ejecutar_todo.sql
-- Script maestro: ejecuta todos los scripts en orden.
-- Uso en MySQL Workbench o terminal:
--   mysql -u root -p < ejecutar_todo.sql
-- Guardar en: scripts_sql/
-- ============================================================

SOURCE scripts_sql/db_global/db_global.sql;
SOURCE scripts_sql/db_apa_tlajomulco/db_apa_tlajomulco.sql;
SOURCE scripts_sql/db_predial_tlajomulco/db_predial_tlajomulco.sql;
SOURCE scripts_sql/db_licencias_gdl/db_licencias_gdl.sql;
SOURCE scripts_sql/db_predial_gdl/db_predial_gdl.sql;
SOURCE scripts_sql/db_estado/db_estado.sql;
SOURCE scripts_sql/db_pensiones/db_pensiones.sql;
