#!/usr/bin/env bash
# ==============================================================================
# OtakuSoul – macOS Installer & App Setup
# ==============================================================================
# Installiert OtakuSoul.app nach /Applications oder ~/Applications,
# entfernt Quarantäne-Attribute und macht es über Spotlight und Launchpad startbar.
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
echo -e "${CYAN}${BOLD}OtakuSoul macOS Installer & Setup${RESET}"
echo "---------------------------------------------------------"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Target Applications folder
if [ -w "/Applications" ]; then
    TARGET_APP_DIR="/Applications"
else
    TARGET_APP_DIR="${HOME}/Applications"
    mkdir -p "${TARGET_APP_DIR}"
fi

# Locate .app bundle
find_app_bundle() {
    local candidates=(
        "${SCRIPT_DIR}/target/release/bundle/macos/OtakuSoul.app"
        "${SCRIPT_DIR}/target/release/bundle/osx/OtakuSoul.app"
        "${SCRIPT_DIR}/src-tauri/target/release/bundle/macos/OtakuSoul.app"
        "${SCRIPT_DIR}/src-tauri/target/release/bundle/osx/OtakuSoul.app"
        "${SCRIPT_DIR}/OtakuSoul.app"
    )
    for c in "${candidates[@]}"; do
        if [ -d "$c" ]; then
            echo "$c"
            return 0
        fi
    done
    return 1
}

APP_BUNDLE="$(find_app_bundle || true)"

if [ -z "${APP_BUNDLE}" ]; then
    echo -e "${YELLOW}Kein vorkompiliertes OtakuSoul.app Bundle gefunden. Baue OtakuSoul...${RESET}"
    cd "${SCRIPT_DIR}"
    if command -v npm >/dev/null 2>&1; then
        echo -e "${CYAN}[1/2] Baue Web Frontend...${RESET}"
        npm run build
        echo -e "${CYAN}[2/2] Kompiliere macOS App Bundle...${RESET}"
        npm run tauri build -- --bundles dmg,app
        APP_BUNDLE="$(find_app_bundle || true)"
    else
        echo -e "${YELLOW}Fehler: npm nicht gefunden. Bitte lade die .dmg oder .app Release-Datei herunter.${RESET}"
        exit 1
    fi
fi

if [ -z "${APP_BUNDLE}" ] || [ ! -d "${APP_BUNDLE}" ]; then
    echo -e "${YELLOW}Fehler: Konnte 'OtakuSoul.app' nicht finden.${RESET}"
    exit 1
fi

DEST_APP="${TARGET_APP_DIR}/OtakuSoul.app"

echo -e "${CYAN}[1/3] Kopiere OtakuSoul nach ${DEST_APP}...${RESET}"
rm -rf "${DEST_APP}"
cp -R "${APP_BUNDLE}" "${DEST_APP}"

echo -e "${CYAN}[2/3] Entferne macOS Gatekeeper Quarantäne-Attribute...${RESET}"
xattr -dr com.apple.quarantine "${DEST_APP}" 2>/dev/null || true

echo -e "${CYAN}[3/3] Registriere Anwendung im Launchpad...${RESET}"
chmod -R +x "${DEST_APP}/Contents/MacOS"

echo ""
echo -e "${GREEN}${BOLD}✔ OtakuSoul wurde erfolgreich installiert!${RESET}"
echo "---------------------------------------------------------"
echo -e "• ${BOLD}Installationsort:${RESET} ${DEST_APP}"
echo -e "• ${BOLD}Starten:${RESET}          Über Spotlight (Cmd+Leertaste 'OtakuSoul'), Launchpad oder 'open -a OtakuSoul'"
echo ""

echo -e "Möchtest du OtakuSoul jetzt starten? [J/n]"
read -r -t 10 response || response="n"
if [[ "$response" =~ ^([yY][eE][sS]|[yY]|j|J|"")$ ]]; then
    echo -e "${PURPLE}Starte OtakuSoul...${RESET}"
    open -a "${DEST_APP}"
fi
