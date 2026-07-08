@echo off
title OpenClaw Gateway - Jarvis
echo ============================================
echo  Arrancando OpenClaw Gateway para Jarvis
echo ============================================
echo.

:: Ir a la raiz del proyecto
cd /d "%~dp0.."

:: Iniciar el gateway de OpenClaw
echo [1/2] Iniciando OpenClaw Gateway...
start "OpenClaw Gateway" cmd /c "openclaw gateway --port 18789 --verbose"

:: Esperar a que el gateway arranque
timeout /t 5 /nobreak >nul

echo [2/2] Onboard completado (si es primera vez, ejecuta: openclaw onboard)
echo.
echo OpenClaw Gateway corriendo en http://localhost:18789
echo.
echo Para enviar un mensaje al agente:
echo   openclaw message send --target jarvis --message "tu mensaje"
echo.
