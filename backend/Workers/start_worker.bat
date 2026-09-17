@echo off
echo ============================================================
echo  TRINNOVA - Worker (Modo Desarrollo)
echo ============================================================
echo.

cd /d "%~dp0"

:: Verificar virtual environment
if exist "venv\Scripts\activate" (
    call venv\Scripts\activate
) else (
    echo [WARNING] No se encontro virtual environment
    echo Usando Python del sistema...
)

echo Iniciando worker...
echo.

python worker_service.py %1

pause