@echo off
setlocal
cd /d "%~dp0"

rem Use the side-by-side Node installation if available.
set "NODE_HOME=%LOCALAPPDATA%\Programs\node-v24.22.2"
if exist "%NODE_HOME%\node.exe" set "PATH=%NODE_HOME%;%PATH%"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js/npm no esta disponible en este ordenador.
  echo Instala Node.js 24 y vuelve a abrir este archivo.
  pause
  exit /b 1
)

set "ELECTRON_EXE=%~dp0node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON_EXE%" (
  echo Preparando la aplicacion por primera vez...
  call npm install
  if errorlevel 1 (
    echo No se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)
if not exist "%ELECTRON_EXE%" (
  echo npm install termino, pero no se encontro Electron.
  pause
  exit /b 1
)

start "" "%ELECTRON_EXE%" .