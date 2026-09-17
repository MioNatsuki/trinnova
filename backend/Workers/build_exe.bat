@echo off
echo ============================================================
echo  TRINNOVA - Crear Ejecutable del Worker
echo ============================================================
echo.

cd /d "%~dp0"

if not exist "venv\Scripts\activate" (
    echo [ERROR] No existe entorno virtual
    echo Ejecuta primero create_venv.bat
    pause
    exit /b 1
)

call venv\Scripts\activate

echo Generando ejecutable con PyInstaller...
echo.

pyinstaller --onefile ^
    --name "TrinnovaWorker" ^
    --add-data "worker_config.json;." ^
    --hidden-import "playwright.async_api" ^
    --hidden-import "playwright._impl._api_structures" ^
    --hidden-import "httpx" ^
    --hidden-import "pydantic" ^
    --console ^
    worker_service.py

echo.
echo ============================================================
echo  Ejecutable generado en: dist\TrinnovaWorker.exe
echo ============================================================
pause