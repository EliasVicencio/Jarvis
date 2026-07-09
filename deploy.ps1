param(
  [string]$Server = "https://129.80.59.180:8080"
)

$ErrorActionPreference = "Stop"
$dist = Join-Path $PSScriptRoot "frontend\dist"

if (-not (Test-Path $dist)) {
  Write-Host "No existe frontend\dist. Ejecute 'npm run build' primero." -ForegroundColor Red
  exit 1
}

$zip = [System.IO.Path]::GetTempPath() + "jarvis-deploy.zip"
if (Test-Path $zip) { Remove-Item $zip }

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($dist, $zip)

$uri = "$Server/api/deploy"
Write-Host "Subiendo frontend a $uri ..." -ForegroundColor Cyan

try {
  $resp = Invoke-WebRequest -Uri $uri -Method POST -Form @{ file = (Get-Item $zip) } -SkipCertificateCheck
  $result = $resp.Content | ConvertFrom-Json
  if ($result.ok) {
    Write-Host "Desplegado: $($result.archivos) archivos" -ForegroundColor Green
  } else {
    Write-Host "Error: $($result.error)" -ForegroundColor Red
  }
} catch {
  Write-Host "Error de conexion: $_" -ForegroundColor Red
} finally {
  if (Test-Path $zip) { Remove-Item $zip }
}
