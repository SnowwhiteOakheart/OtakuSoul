#!/usr/bin/env bash
# Builds signed Linux bundles (AppImage, deb) and the updater manifest latest.json.
#
# The updater signing key is read from TAURI_SIGNING_PRIVATE_KEY(_PASSWORD) or, if unset, from
# .tauri-signing/ (never committed; see README). Without it the bundles are unsigned and the
# in-app updater cannot install them.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${PROJECT_DIR}"

if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" && -f .tauri-signing/otakusoul.key ]]; then
    export TAURI_SIGNING_PRIVATE_KEY="$(cat .tauri-signing/otakusoul.key)"
    export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat .tauri-signing/password.txt)"
fi
if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
    echo "Warning: no updater signing key – bundles will not be installable via the in-app updater." >&2
fi

echo "[1/3] Running checks (lint, types, tests)..."
npm run check

echo "[2/3] Building Tauri bundles (AppImage, deb)..."
npm run tauri build -- --bundles appimage,deb

echo "[3/3] Writing updater manifest..."
if [[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
    python3 tools/make_latest_json.py ${RELEASE_NOTES:+--notes "$RELEASE_NOTES"}
else
    echo "Skipped (unsigned build)."
fi
