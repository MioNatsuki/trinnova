@echo off
echo ============================================================
echo  TRINNOVA - Crear Entorno Virtual
echo ============================================================
echo.

cd /d "%~dp0"

echo Creando entorno virtual...
python -m venv venv

echo Activando entorno virtual...
call venv\Scripts\activate

echo Instalando dependencias...
pip install --upgrade pip
pip install -r requirements.txt
pip install pyinstaller

echo Instalando Playwright...
playwright install chromium

echo.
echo ============================================================
echo  Entorno virtual creado correctamente
echo  Para activarlo manualmente: venv\Scripts\activate
echo ============================================================
pause