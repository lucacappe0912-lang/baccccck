# Aggiorna l'hub all'ultima versione di GitHub (i dati in data\ non vengono toccati).
$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path "$PSScriptRoot\..\..")
Copy-Item data\hub.db "data\hub-backup-$(Get-Date -Format yyyyMMdd-HHmm).db" -ErrorAction SilentlyContinue
git pull
npm ci --no-audit --no-fund
npm run build
Write-Host "Aggiornato. Riavvia il PC o chiudi e riapri la finestra 'Backrooms Hub'." -ForegroundColor Green
Read-Host "Premi Invio per chiudere"
