$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path "node_modules")) {
  .\setup.ps1
}

if (-not (Test-Path "dist")) {
  npm run build
}

Start-Process "http://127.0.0.1:3840"
npm start
