-- =============================================
-- LIMPIEZA DE TABLAS DE PLANTILLAS
-- =============================================

-- Eliminar datos existentes
DELETE FROM plantilla_campos;
DELETE FROM plantillas;

-- Verificar que quedaron vacías
SELECT 'plantillas' AS tabla, COUNT(*) AS total FROM plantillas
UNION
SELECT 'plantilla_campos' AS tabla, COUNT(*) AS total FROM plantilla_campos;

-- Reiniciar auto-increment (opcional)
ALTER TABLE plantillas AUTO_INCREMENT = 1;
ALTER TABLE plantilla_campos AUTO_INCREMENT = 1;

SELECT '✅ Tablas limpiadas correctamente' AS mensaje;