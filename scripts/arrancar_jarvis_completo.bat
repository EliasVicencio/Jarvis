@echo off
title Jarvis + OpenClaw
echo ============================================
echo  Jarvis con OpenClaw - Inicio completo
echo ============================================
echo.

cd /d "%~dp0.."

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
npm run tauri dev

echo.
echo Jarvis + OpenClaw corriendo.
echo Backend:  http://localhost:5000
echo OpenClaw: http://localhost:18789
echo.
