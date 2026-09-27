#!/usr/bin/env bash
# OtakuSoul Linux Packaging Helper Script
# Builds .deb and AppImage bundles via Tauri CLI

set -euo pipefail

echo "========================================="
echo " Building OtakuSoul Linux Packages       "
echo "========================================="

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${PROJECT_DIR}"

echo "[1/4] Running tests..."
npm run test
cd src-tauri && cargo test && cd ..

echo "[2/4] Building web frontend..."
npm run build

echo "[3/4] Building Tauri bundles (AppImage, deb)..."
npm run tauri build -- --bundles appimage,deb

echo "[4/4] Packages built successfully in target/release/bundle/"
ls -la src-tauri/target/release/bundle/
