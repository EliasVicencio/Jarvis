@echo off
:: Script que arranca el backend de Jarvis usando el venv correcto
:: Edita JARVIS_DIR si tu ruta es diferente

set JARVIS_DIR=C:\Users\evice\Downloads\jarvis_project\jarvis_project
set BACKEND_DIR=%JARVIS_DIR%\backend
set PYTHON=%BACKEND_DIR%\venv\Scripts\python.exe

cd /d "%BACKEND_DIR%"
"%PYTHON%" app.py