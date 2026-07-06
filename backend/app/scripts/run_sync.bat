@echo off
echo ========================================
echo Sincronizacion de Plantillas HTML
echo ========================================

echo.
echo Paso 1: Limpiando tablas...
mysql -u root -p db_global < scripts_sql\limpiar_plantillas.sql

echo.
echo Paso 2: Sincronizando plantillas...
cd backend
python -m app.scripts.sincronizar_plantillas_inicial

echo.
echo Sincronizacion completada
pause