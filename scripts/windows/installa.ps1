# Installer dell'hub Backrooms Studio per Windows.
# Uso: tasto destro su questo file > "Esegui con PowerShell"  (dalla cartella del progetto)
$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path "$PSScriptRoot\..\..")
Write-Host ""
Write-Host "  BACKROOMS STUDIO - Installazione hub" -ForegroundColor White
Write-Host ""

# 1. Node.js >= 22.13
$node = Get-Command node -ErrorAction SilentlyContinue
$ok = $false
if ($node) {
  $v = (node -v).TrimStart("v").Split(".")
  $ok = ([int]$v[0] -gt 22) -or (([int]$v[0] -eq 22) -and ([int]$v[1] -ge 13))
}
if (-not $ok) {
  Write-Host "Installo Node.js LTS (serve una sola volta)..." -ForegroundColor Yellow
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  Write-Host ""
  Write-Host "Node.js installato. Chiudi questa finestra e rilancia installa.ps1." -ForegroundColor Green
  Read-Host "Premi Invio per chiudere"
  exit
}
Write-Host "[1/5] Node.js $(node -v) OK" -ForegroundColor Green

# 2. Dipendenze
Write-Host "[2/5] Installo le dipendenze (qualche minuto)..."
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm ci non riuscito" }

# 3. Configurazione
Write-Host "[3/5] Configurazione"
$configured = (Test-Path ".env.local") -and (Select-String -Path ".env.local" -Pattern "^PASSWORD_HASH_[A-Z0-9_]+=scrypt:" -Quiet)
if ($configured) {
  Write-Host "      Trovata configurazione esistente (.env.local): la uso." -ForegroundColor Green
  node scripts/create-env.mjs
} else {
  $partners = Read-Host "Nomi dei tre soci separati da virgola (es. Plugghe,Freya,Astral)"
  $map = @{}
  foreach ($name in ($partners -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })) {
    do {
      $p1 = Read-Host "Password di $name (min. 10 caratteri)" -AsSecureString
      $p2 = Read-Host "Ripeti la password di $name" -AsSecureString
      $a = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p1))
      $b = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p2))
      if ($a -ne $b) { Write-Host "Non coincidono, riprova." -ForegroundColor Red }
      elseif ($a.Length -lt 10) { Write-Host "Troppo corta, almeno 10 caratteri." -ForegroundColor Red }
    } while ($a -ne $b -or $a.Length -lt 10)
    $map[$name] = $a
  }
  $env:HUB_PARTNERS = $partners
  $env:HUB_PASSWORDS = ($map | ConvertTo-Json -Compress)
  node scripts/create-env.mjs
  Remove-Item Env:HUB_PASSWORDS; $map = $null; $a = $null; $b = $null
}
if ($LASTEXITCODE -ne 0) { throw "Configurazione non riuscita" }

# 4. Build
Write-Host "[4/5] Preparo l'applicazione..."
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build non riuscita" }

# 5. Avvio automatico all'accensione (cartella Esecuzione automatica, nessun permesso admin)
Write-Host "[5/5] Avvio automatico"
$startup = [Environment]::GetFolderPath("Startup")
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut("$startup\Backrooms Hub.lnk")
$lnk.TargetPath = (Resolve-Path "scripts\windows\avvia-hub.bat").Path
$lnk.WorkingDirectory = (Get-Location).Path
$lnk.WindowStyle = 7  # ridotta a icona
$lnk.Save()

Write-Host ""
Write-Host "Fatto! Avvio l'hub: si aprira' su http://localhost:3000" -ForegroundColor Green
Start-Process "scripts\windows\avvia-hub.bat" -WindowStyle Minimized
Start-Sleep -Seconds 6
Start-Process "http://localhost:3000"
Read-Host "Premi Invio per chiudere"
