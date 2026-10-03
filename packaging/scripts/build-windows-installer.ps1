# OtakuSoul Windows Installer Build Script
# Builds NSIS (.exe) and MSI installers via Tauri CLI

$ErrorActionPreference = "Stop"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " Building OtakuSoul Windows Installers   " -ForegroundColor Magenta
Write-Host "=========================================" -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectDir = Resolve-Path (Join-Path $ScriptDir "..\..")
Set-Location $ProjectDir

Write-Host "[1/3] Running tests..." -ForegroundColor Cyan
npm run test
Set-Location "src-tauri"
cargo test
Set-Location $ProjectDir

Write-Host "[2/3] Building Web Frontend..." -ForegroundColor Cyan
npm run build

Write-Host "[3/3] Building Windows NSIS and MSI Installers..." -ForegroundColor Cyan
npm run tauri build -- --bundles nsis,msi

Write-Host "Installers generated:" -ForegroundColor Green
Get-ChildItem "target\release\bundle\nsis", "target\release\bundle\msi", "src-tauri\target\release\bundle\nsis", "src-tauri\target\release\bundle\msi" -ErrorAction SilentlyContinue
