#!/usr/bin/env bash
# ==============================================================================
# OtakuSoul – Linux Universal Installer & Desktop Launcher Setup
# ==============================================================================
# This script installs OtakuSoul on Linux, configures the desktop menu entry,
# high-resolution app icon, and makes it launchable via application menu or CLI.
# ==============================================================================

set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
PURPLE="\033[0;35m"
RESET="\033[0m"

echo -e "${PURPLE}${BOLD}"
echo "  ___  _        _          ____              _ "
echo " / _ \| |_ __ _| | ___   _/ ___|  ___  _   _| |"
echo "| | | | __/ _\` | |/ / | | \___ \ / _ \| | | | |"
echo "| |_| | || (_| |   <| |_| |___) | (_) | |_| | |"
echo " \___/ \__\__,_|_|\_\\\__,_|____/ \___/ \__,_|_|"
echo -e "${RESET}"
echo -e "${CYAN}${BOLD}OtakuSoul Linux Installer & Launcher Setup${RESET}"
echo "---------------------------------------------------------"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_INSTALL_DIR="${HOME}/.local/bin"
APP_INSTALL_DIR="${HOME}/.local/share/applications"
ICON_INSTALL_DIR="${HOME}/.local/share/icons/hicolor/512x512/apps"
DATA_DIR="${HOME}/.local/share/otakusoul"

mkdir -p "${BIN_INSTALL_DIR}"
mkdir -p "${APP_INSTALL_DIR}"
mkdir -p "${ICON_INSTALL_DIR}"
mkdir -p "${DATA_DIR}"

# 1. Locate or build the binary
TARGET_BIN=""
if [ -f "${SCRIPT_DIR}/src-tauri/target/release/otakusoul" ]; then
    TARGET_BIN="${SCRIPT_DIR}/src-tauri/target/release/otakusoul"
elif [ -f "${SCRIPT_DIR}/target/release/otakusoul" ]; then
    TARGET_BIN="${SCRIPT_DIR}/target/release/otakusoul"
elif [ -f "${SCRIPT_DIR}/otakusoul" ]; then
    TARGET_BIN="${SCRIPT_DIR}/otakusoul"
fi

if [ -z "${TARGET_BIN}" ]; then
    echo -e "${YELLOW}Keine vorkompilierte Release-Binary gefunden. Baue OtakuSoul jetzt...${RESET}"
    cd "${SCRIPT_DIR}"
    
    if command -v npm >/dev/null 2>&1; then
        echo -e "${CYAN}[1/2] Baue Frontend...${RESET}"
        npm run build
        echo -e "${CYAN}[2/2] Kompiliere Rust Backend (Tauri Release)...${RESET}"
        npm run tauri build -- --bundles appimage,deb || (cd src-tauri && cargo build --release)
        
        if [ -f "${SCRIPT_DIR}/src-tauri/target/release/otakusoul" ]; then
            TARGET_BIN="${SCRIPT_DIR}/src-tauri/target/release/otakusoul"
        fi
    else
        echo -e "${YELLOW}Hinweis: npm/cargo nicht gefunden. Bitte lade das offizielle Release-Paket herunter.${RESET}"
        exit 1
    fi
fi

if [ ! -f "${TARGET_BIN}" ]; then
    echo -e "${YELLOW}Fehler: Konnte keine ausführbare 'otakusoul' Binärdatei finden.${RESET}"
    exit 1
fi

echo -e "${CYAN}Gefundene Binärdatei:${RESET} ${TARGET_BIN}"

# 2. Copy binary to ~/.local/bin/otakusoul
echo -e "${CYAN}[1/4] Kopiere Binärdatei nach ${BIN_INSTALL_DIR}/otakusoul...${RESET}"
cp -f "${TARGET_BIN}" "${BIN_INSTALL_DIR}/otakusoul"
chmod +x "${BIN_INSTALL_DIR}/otakusoul"

# 3. Install Icon
echo -e "${CYAN}[2/4] Installiere Anwendungs-Icon...${RESET}"
SOURCE_ICON="${SCRIPT_DIR}/src-tauri/icons/icon.png"
if [ ! -f "${SOURCE_ICON}" ]; then
    SOURCE_ICON="${SCRIPT_DIR}/src/assets/brand/otakusoul-icon.png"
fi

if [ -f "${SOURCE_ICON}" ]; then
    cp -f "${SOURCE_ICON}" "${ICON_INSTALL_DIR}/otakusoul.png"
    # Also copy directly into data dir for reference
    cp -f "${SOURCE_ICON}" "${DATA_DIR}/icon.png"
fi

# 4. Generate .desktop launcher entry
echo -e "${CYAN}[3/4] Erstelle Desktop-Verknüpfung (${APP_INSTALL_DIR}/otakusoul.desktop)...${RESET}"
cat > "${APP_INSTALL_DIR}/otakusoul.desktop" <<EOF
[Desktop Entry]
Name=OtakuSoul
GenericName=Local Anime AI & Roleplay Studio
Comment=AI anime companion and visual novel roleplay studio with local llama.cpp acceleration
Exec=${BIN_INSTALL_DIR}/otakusoul %U
Icon=${ICON_INSTALL_DIR}/otakusoul.png
Terminal=false
Type=Application
Categories=Game;RolePlaying;AudioVideo;Utility;
Keywords=anime;ai;roleplay;companion;vrm;live2d;llm;waifu;otaku;
MimeType=x-scheme-handler/otakusoul;
StartupWMClass=otakusoul
EOF

chmod +x "${APP_INSTALL_DIR}/otakusoul.desktop"

# Optionally place a link on ~/Desktop if directory exists
if [ -d "${HOME}/Desktop" ]; then
    cp -f "${APP_INSTALL_DIR}/otakusoul.desktop" "${HOME}/Desktop/otakusoul.desktop"
    chmod +x "${HOME}/Desktop/otakusoul.desktop"
    # Try trusting desktop file on GNOME/KDE
    gio set "${HOME}/Desktop/otakusoul.desktop" metadata::trusted true 2>/dev/null || true
fi

# 5. Update Desktop Databases & Icon Caches
echo -e "${CYAN}[4/4] Aktualisiere System-Caches...${RESET}"
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "${HOME}/.local/share/applications" 2>/dev/null || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t "${HOME}/.local/share/icons/hicolor" 2>/dev/null || true
fi

# Check PATH
PATH_NOTICE=""
if [[ ":$PATH:" != *":${BIN_INSTALL_DIR}:"* ]]; then
    PATH_NOTICE="Hinweis: Füge '${BIN_INSTALL_DIR}' zu deinem PATH in ~/.bashrc oder ~/.zshrc hinzu, falls noch nicht geschehen."
fi

echo ""
echo -e "${GREEN}${BOLD}✔ OtakuSoul wurde erfolgreich installiert!${RESET}"
echo "---------------------------------------------------------"
echo -e "• ${BOLD}Startmenü:${RESET} OtakuSoul ist nun in deinem Anwendungsmenü verfügbar (GNOME, KDE, XFCE etc.)"
echo -e "• ${BOLD}Terminal:${RESET}  Kann direkt über '${BOLD}otakusoul${RESET}' gestartet werden"
if [ -n "${PATH_NOTICE}" ]; then
    echo -e "• ${YELLOW}${PATH_NOTICE}${RESET}"
fi
echo ""
echo -e "Möchtest du OtakuSoul jetzt starten? [J/n]"
read -r -t 10 response || response="n"
if [[ "$response" =~ ^([yY][eE][sS]|[yY]|j|J|"")$ ]]; then
    echo -e "${PURPLE}Starte OtakuSoul...${RESET}"
    nohup "${BIN_INSTALL_DIR}/otakusoul" >/dev/null 2>&1 &
fi
