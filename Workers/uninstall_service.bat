@echo off
echo ============================================================
echo  TRINNOVA - Desinstalacion de Servicio Worker
echo ============================================================
echo.

cd /d "%~dp0"

set SERVICE_NAME=TrinnovaWorker

if not exist "nssm.exe" (
    echo [ERROR] No se encuentra nssm.exe
    pause
    exit /b 1
)

echo Deteniendo servicio...
nssm stop %SERVICE_NAME%
timeout /t 3 /nobreak >nul

echo Eliminando servicio...
nssm remove %SERVICE_NAME% confirm

echo.
echo Servicio desinstalado correctamente.
pause