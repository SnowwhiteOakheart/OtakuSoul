#!/usr/bin/env bash
# OtakuSoul macOS Installer Build Script
# Builds .dmg and .app bundle via Tauri CLI

set -euo pipefail

echo "========================================="
echo " Building OtakuSoul macOS Installers     "
echo "========================================="

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${PROJECT_DIR}"

echo "[1/3] Running tests..."
npm run test
cd src-tauri && cargo test && cd ..

echo "[2/3] Building Web Frontend..."
npm run build

echo "[3/3] Building macOS DMG and App Bundle..."
npm run tauri build -- --bundles dmg,app

echo "DMG installer generated in src-tauri/target/release/bundle/dmg/"
ls -la src-tauri/target/release/bundle/dmg/
