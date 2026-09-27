<#
.SYNOPSIS
    OtakuSoul - Windows Installer & Shortcut Setup
.DESCRIPTION
    Installs OtakuSoul to %LOCALAPPDATA%\Programs\OtakuSoul,
    creates Start Menu and Desktop shortcuts with custom icon,
    and makes the application immediately launchable.
#>

[CmdletBinding()]
param(
    [switch]$NoDesktopShortcut,
    [switch]$AutoStart
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   OtakuSoul Windows Installer & Shortcut Setup           " -ForegroundColor Magenta
Write-Host "==========================================================" -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$InstallDir = Join-Path $env:LOCALAPPDATA "Programs\OtakuSoul"
$StartMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$DesktopDir = [Environment]::GetFolderPath("Desktop")

# 1. Locate Binary
$SourceBin = $null
$PossiblePaths = @(
    (Join-Path $ScriptDir "src-tauri\target\release\otakusoul.exe"),
    (Join-Path $ScriptDir "target\release\otakusoul.exe"),
    (Join-Path $ScriptDir "otakusoul.exe")
)

foreach ($path in $PossiblePaths) {
    if (Test-Path $path) {
        $SourceBin = $path
        break
    }
}

if (-not $SourceBin) {
    Write-Host "Keine vorkompilierte Release-Binary gefunden. Baue OtakuSoul jetzt..." -ForegroundColor Yellow
    if (Get-Command "npm" -ErrorAction SilentlyContinue) {
        Set-Location $ScriptDir
        Write-Host "[1/2] Baue Frontend..." -ForegroundColor Cyan
        & npm run build
        Write-Host "[2/2] Kompiliere Rust Backend (Tauri Release)..." -ForegroundColor Cyan
        & npm run tauri build
        
        $ExpectedBin = Join-Path $ScriptDir "src-tauri\target\release\otakusoul.exe"
        if (Test-Path $ExpectedBin) {
            $SourceBin = $ExpectedBin
        }
    } else {
        Write-Error "Weder die Binärdatei 'otakusoul.exe' noch 'npm' wurden gefunden. Bitte lade den fertigen NSIS-Installer (.exe) herunter."
        exit 1
    }
}

if (-not (Test-Path $SourceBin)) {
    Write-Error "Konnte 'otakusoul.exe' nicht finden."
    exit 1
}

Write-Host "Gefundene Binärdatei: $SourceBin" -ForegroundColor Gray

# 2. Create Target Directory & Copy Files
Write-Host "[1/3] Kopiere Dateien nach $InstallDir..." -ForegroundColor Cyan
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$TargetBin = Join-Path $InstallDir "otakusoul.exe"
Copy-Item -Path $SourceBin -Destination $TargetBin -Force

# Copy Icon
$SourceIcon = Join-Path $ScriptDir "src-tauri\icons\icon.ico"
$TargetIcon = Join-Path $InstallDir "icon.ico"
if (Test-Path $SourceIcon) {
    Copy-Item -Path $SourceIcon -Destination $TargetIcon -Force
}

# 3. Create Windows Shortcuts via WScript.Shell
Write-Host "[2/3] Erstelle Windows-Verknüpfungen..." -ForegroundColor Cyan
$WScriptShell = New-Object -ComObject WScript.Shell

# Start Menu Shortcut
$StartMenuShortcutPath = Join-Path $StartMenuDir "OtakuSoul.lnk"
$StartShortcut = $WScriptShell.CreateShortcut($StartMenuShortcutPath)
$StartShortcut.TargetPath = $TargetBin
$StartShortcut.WorkingDirectory = $InstallDir
$StartShortcut.Description = "OtakuSoul - Local Anime AI & Roleplay Studio"
if (Test-Path $TargetIcon) {
    $StartShortcut.IconLocation = "$TargetIcon, 0"
}
$StartShortcut.Save()
Write-Host "  ✔ Startmenü: $StartMenuShortcutPath" -ForegroundColor Green

# Desktop Shortcut
if (-not $NoDesktopShortcut -and (Test-Path $DesktopDir)) {
    $DesktopShortcutPath = Join-Path $DesktopDir "OtakuSoul.lnk"
    $DesktopShortcut = $WScriptShell.CreateShortcut($DesktopShortcutPath)
    $DesktopShortcut.TargetPath = $TargetBin
    $DesktopShortcut.WorkingDirectory = $InstallDir
    $DesktopShortcut.Description = "OtakuSoul - Local Anime AI & Roleplay Studio"
    if (Test-Path $TargetIcon) {
        $DesktopShortcut.IconLocation = "$TargetIcon, 0"
    }
    $DesktopShortcut.Save()
    Write-Host "  ✔ Desktop:   $DesktopShortcutPath" -ForegroundColor Green
}

Write-Host "[3/3] Registrierung abgeschlossen!" -ForegroundColor Cyan
Write-Host ""
Write-Host "✔ OtakuSoul wurde erfolgreich installiert!" -ForegroundColor Green
Write-Host "Du kannst OtakuSoul jetzt über das Startmenü oder die Desktop-Verknüpfung starten." -ForegroundColor White
Write-Host ""

if ($AutoStart) {
    Write-Host "Starte OtakuSoul..." -ForegroundColor Magenta
    Start-Process $TargetBin
} else {
    $choice = Read-Host "Möchtest du OtakuSoul jetzt starten? (J/N)"
    if ($choice -match '^[jJyY]') {
        Start-Process $TargetBin
    }
}
