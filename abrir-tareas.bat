@echo off
setlocal
cd /d "%~dp0"
set "ELECTRON_EXE=%~dp0node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON_EXE%" (
  echo Electron no esta instalado en este proyecto.
  echo Ejecuta npm install en esta carpeta y vuelve a abrir este archivo.
  pause
  exit /b 1
)
start "" "%ELECTRON_EXE%" "%~dp0"
