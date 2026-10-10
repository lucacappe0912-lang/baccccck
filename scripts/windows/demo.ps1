# Avvia l'hub in modalita' DEMO con dati inventati (non tocca la configurazione ufficiale).
$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path "$PSScriptRoot\..\..")
Write-Host ""
Write-Host "  BACKROOMS STUDIO - Demo dell'hub" -ForegroundColor White
Write-Host ""

$node = Get-Command node -ErrorAction SilentlyContinue
$ok = $false
if ($node) {
  $v = (node -v).TrimStart("v").Split(".")
  $ok = ([int]$v[0] -gt 22) -or (([int]$v[0] -eq 22) -and ([int]$v[1] -ge 13))
}
if (-not $ok) {
  Write-Host "Installo Node.js (serve una sola volta)..." -ForegroundColor Yellow
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  Write-Host ""
  Write-Host "Node.js installato. Chiudi questa finestra e rilancia DEMO-WINDOWS.bat." -ForegroundColor Green
  Read-Host "Premi Invio per chiudere"
  exit
}

if (-not (Test-Path "node_modules")) {
  Write-Host "[1/3] Installo le dipendenze (qualche minuto, solo la prima volta)..."
  npm ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm ci non riuscito" }
}

# Configurazione demo solo per questa finestra: password "backrooms-demo", dati in data-demo\
$env:DEMO_MODE = "true"
$env:DATA_DIR = "$PWD\data-demo"
$env:PARTNERS = "Plugghe,Freya,Astral"
$env:INTERNAL_SCHEDULER = "false"
$lines = node scripts/hash-password.mjs "backrooms-demo"
foreach ($l in $lines) {
  $k, $val = $l -split "=", 2
  if ($k -eq "MASTER_PASSWORD_HASH") {
    $env:MASTER_PASSWORD_HASH = $val
    $env:PASSWORD_HASH_PLUGGHE = $val
    $env:PASSWORD_HASH_FREYA = $val
    $env:PASSWORD_HASH_ASTRAL = $val
  }
  if ($k -eq "SESSION_SECRET") { $env:SESSION_SECRET = $val }
}

if (-not (Test-Path "data-demo\hub.db")) {
  Write-Host "[2/3] Creo i dati demo..."
  npm run seed
}

if (-not (Test-Path ".next\BUILD_ID")) {
  Write-Host "[3/3] Preparo l'applicazione (1-2 minuti)..."
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Build non riuscita" }
}

Write-Host ""
Write-Host "Demo pronta: si apre il browser su http://localhost:3000" -ForegroundColor Green
Write-Host "Password per tutti i soci: backrooms-demo" -ForegroundColor Green
Write-Host "Per chiudere la demo chiudi questa finestra." -ForegroundColor DarkGray
Start-Job { Start-Sleep -Seconds 6; Start-Process "http://localhost:3000" } | Out-Null
npm start
