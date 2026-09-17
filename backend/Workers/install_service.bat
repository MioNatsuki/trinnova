@echo off
echo ============================================================
echo  TRINNOVA - Instalacion de Servicio Worker
echo ============================================================
echo.

cd /d "%~dp0"

set SERVICE_NAME=TrinnovaWorker
set SERVICE_DISPLAY=Trinnova Worker Service
set SERVICE_DESC=Procesa jobs de emision de documentos Trinnova

echo Instalando servicio: %SERVICE_NAME%
echo.

:: Verificar si nssm.exe existe
if not exist "nssm.exe" (
    echo [ERROR] No se encuentra nssm.exe
    echo Descargar desde: https://nssm.cc/download
    pause
    exit /b 1
)

:: Crear directorios necesarios
mkdir "%CD%\..\Logs" 2>nul
mkdir "%CD%\..\Emisiones" 2>nul

:: Instalar servicio
nssm install %SERVICE_NAME% "%CD%\venv\Scripts\python.exe" "%CD%\worker_service.py"

:: Configurar servicio
nssm set %SERVICE_NAME% DisplayName "%SERVICE_DISPLAY%"
nssm set %SERVICE_NAME% Description "%SERVICE_DESC%"
nssm set %SERVICE_NAME% Start SERVICE_AUTO_START
nssm set %SERVICE_NAME% AppDirectory "%CD%"
nssm set %SERVICE_NAME% AppStdout "%CD%\..\Logs\worker_stdout.log"
nssm set %SERVICE_NAME% AppStderr "%CD%\..\Logs\worker_stderr.log"
nssm set %SERVICE_NAME% AppRotateFiles 1
nssm set %SERVICE_NAME% AppRotateOnline 1
nssm set %SERVICE_NAME% AppRotateSeconds 86400
nssm set %SERVICE_NAME% AppRotateBytes 10485760

:: Iniciar servicio
nssm start %SERVICE_NAME%

echo.
echo ============================================================
echo  Servicio instalado correctamente
echo  Estado del servicio:
nssm status %SERVICE_NAME%
echo ============================================================
echo.
echo  Comandos utiles:
echo    net stop %SERVICE_NAME%     - Detener servicio
echo    net start %SERVICE_NAME%    - Iniciar servicio
echo    nssm restart %SERVICE_NAME% - Reiniciar servicio
echo    nssm remove %SERVICE_NAME%  - Desinstalar servicio
echo.
pause