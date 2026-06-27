# ============================================================
# crear_tarea_jarvis.ps1
# Crea una tarea programada que lanza Jarvis al iniciar sesion.
# ============================================================

$JARVIS_DIR  = "C:\Users\evice\Downloads\jarvis_project\jarvis_project"
$BACKEND_DIR = "$JARVIS_DIR\backend"
$PYTHON      = "$BACKEND_DIR\venv\Scripts\python.exe"
$APP_PY      = "$BACKEND_DIR\app.py"
$scriptPath  = "$JARVIS_DIR\arrancar_ui.ps1"

# Verificar npm
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    Write-Host "ERROR: npm no encontrado." -ForegroundColor Red
    pause; exit 1
}

if (-not (Test-Path $PYTHON)) {
    Write-Host "ERROR: No se encontro el venv en $PYTHON" -ForegroundColor Red
    pause; exit 1
}

Write-Host "Creando tareas programadas para Jarvis..." -ForegroundColor Cyan

# Tarea 1: Backend Flask
$accionBackend = New-ScheduledTaskAction -Execute $PYTHON -Argument $APP_PY -WorkingDirectory $BACKEND_DIR
$triggerBackend = New-ScheduledTaskTrigger -AtLogon
$configBackend = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 0) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -RunOnlyIfNetworkAvailable
Register-ScheduledTask -TaskName "Jarvis - Backend" -Action $accionBackend -Trigger $triggerBackend -Settings $configBackend -RunLevel Highest -Force | Out-Null
Write-Host "  OK  Tarea 'Jarvis - Backend' creada" -ForegroundColor Green

# Script intermedio para la UI
"Start-Sleep -Seconds 4`nSet-Location '$JARVIS_DIR'`nnpm run dev" | Out-File -FilePath $scriptPath -Encoding UTF8

# Tarea 2: Frontend Tauri
$accionUI = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`"" -WorkingDirectory $JARVIS_DIR
$triggerUI = New-ScheduledTaskTrigger -AtLogon
$configUI = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 0) -StartWhenAvailable
Register-ScheduledTask -TaskName "Jarvis - UI" -Action $accionUI -Trigger $triggerUI -Settings $configUI -RunLevel Highest -Force | Out-Null
Write-Host "  OK  Tarea 'Jarvis - UI' creada" -ForegroundColor Green

Write-Host ""
Write-Host "Listo. Jarvis arrancara automaticamente al iniciar sesion." -ForegroundColor Cyan
Write-Host "Tareas: 'Jarvis - Backend' y 'Jarvis - UI'"
Write-Host ""

$r = Read-Host "Iniciar Jarvis ahora? (S/N)"
if ($r -match "^[Ss]") {
    Write-Host "Iniciando..." -ForegroundColor Cyan
    Start-ScheduledTask -TaskName "Jarvis - Backend"
    Start-Sleep -Seconds 4
    Start-ScheduledTask -TaskName "Jarvis - UI"
    Write-Host "Jarvis iniciado." -ForegroundColor Green
}

pause