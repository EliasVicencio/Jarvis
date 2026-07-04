# ============================================================
# crear_tarea_jarvis.ps1 - Ejecutar como Administrador
# Sin ventanas visibles en segundo plano
# ============================================================

$JARVIS_DIR  = "C:\Users\evice\Downloads\jarvis_project\jarvis_project"
$BACKEND_DIR = "$JARVIS_DIR\backend"
$PYTHONW     = "$BACKEND_DIR\venv\Scripts\pythonw.exe"  # sin ventana
$PYTHON      = "$BACKEND_DIR\venv\Scripts\python.exe"
$APP_PY      = "$BACKEND_DIR\app.py"
$PS_UI       = "$JARVIS_DIR\arrancar_ui.ps1"

# Verificaciones
if (-not (Test-Path $PYTHON)) {
    Write-Host "ERROR: No se encontro el venv en $PYTHON" -ForegroundColor Red
    pause; exit 1
}
if (-not (Test-Path $APP_PY)) {
    Write-Host "ERROR: No se encontro app.py en $APP_PY" -ForegroundColor Red
    pause; exit 1
}

# Copiar pythonw.exe si no existe (a veces el venv no lo incluye)
if (-not (Test-Path $PYTHONW)) {
    Copy-Item $PYTHON $PYTHONW
    Write-Host "  OK  pythonw.exe creado desde python.exe" -ForegroundColor Yellow
}

Write-Host "Configurando inicio automatico de Jarvis (sin ventanas)..." -ForegroundColor Cyan

# Eliminar tareas anteriores
Unregister-ScheduledTask -TaskName "Jarvis - Backend" -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "Jarvis - UI"      -Confirm:$false -ErrorAction SilentlyContinue

# Tarea 1: Backend Flask — usa pythonw para no mostrar ventana
$accion1 = New-ScheduledTaskAction `
    -Execute $PYTHONW `
    -Argument $APP_PY `
    -WorkingDirectory $BACKEND_DIR

$trigger1 = New-ScheduledTaskTrigger -AtLogon

$config1 = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable

Register-ScheduledTask `
    -TaskName "Jarvis - Backend" `
    -Action $accion1 `
    -Trigger $trigger1 `
    -Settings $config1 `
    -RunLevel Highest `
    -Force | Out-Null

Write-Host "  OK  Tarea 'Jarvis - Backend' registrada (sin ventana)" -ForegroundColor Green

# Script UI: arranca Tauri en silencio después de 6s
@"
Start-Sleep -Seconds 6
Set-Location '$JARVIS_DIR'
`$env:BROWSER = 'none'
npm run dev 2>`$null
"@ | Out-File -FilePath $PS_UI -Encoding UTF8

# Tarea 2: UI Tauri — ventana oculta
$accion2 = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -NonInteractive -File `"$PS_UI`"" `
    -WorkingDirectory $JARVIS_DIR

$trigger2 = New-ScheduledTaskTrigger -AtLogon

$config2 = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -StartWhenAvailable

Register-ScheduledTask `
    -TaskName "Jarvis - UI" `
    -Action $accion2 `
    -Trigger $trigger2 `
    -Settings $config2 `
    -RunLevel Highest `
    -Force | Out-Null

Write-Host "  OK  Tarea 'Jarvis - UI' registrada (sin ventana)" -ForegroundColor Green

Write-Host ""
Write-Host "Listo. Jarvis arrancara silenciosamente al iniciar sesion." -ForegroundColor Cyan
Write-Host ""

$r = Read-Host "Probar ahora? (S/N)"
if ($r -match "^[Ss]") {
    Write-Host "Iniciando backend (sin ventana)..." -ForegroundColor Cyan
    Start-ScheduledTask -TaskName "Jarvis - Backend"
    Write-Host "Esperando que Flask arranque (6s)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 6
    Write-Host "Iniciando UI..." -ForegroundColor Cyan
    Start-ScheduledTask -TaskName "Jarvis - UI"
    Write-Host "Jarvis iniciado. Deberia abrirse la ventana en unos segundos." -ForegroundColor Green
}

pause