$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Install Node.js 18+ from https://nodejs.org then re-run setup.ps1"
  exit 1
}

npm install
Write-Host ""
Write-Host "Installed. Start with .\start.ps1 or npm run dev"
Write-Host "Dashboard: http://127.0.0.1:5173 (dev) or http://127.0.0.1:3840 (start)"
