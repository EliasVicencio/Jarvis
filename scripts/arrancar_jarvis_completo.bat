@echo off
title Jarvis + OpenClaw
cd /d "%~dp0.."

echo ============================================
echo  Jarvis con OpenClaw - Inicio completo
echo ============================================
echo.

:: Matar procesos anteriores de Flask y pythonw
echo [0/3] Limpiando procesos anteriores...
powershell -Command "Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { try { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } catch {} }"
timeout /t 2 /nobreak >nul

:: 1. Arrancar OpenClaw Gateway
echo [1/3] Arrancando OpenClaw Gateway...
start "OpenClaw Gateway" cmd /c "openclaw gateway --port 18789 --verbose"
timeout /t 3 /nobreak >nul

:: 2. Arrancar backend Flask
echo [2/3] Arrancando backend Flask...
cd backend
start "Jarvis Backend" cmd /c "python app.py"
cd ..
timeout /t 2 /nobreak >nul

:: 3. Arrancar frontend Tauri
echo [3/3] Arrancando interfaz Tauri...
npm run dev

echo.
echo Jarvis + OpenClaw corriendo.
echo Backend:  http://localhost:5000
echo OpenClaw: http://localhost:18789
echo.
