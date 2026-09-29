#!/usr/bin/env bash
set -euo pipefail

# Builds the optional avatar pack for a GitHub release: every VRM in assets/vrm except the two
# models shipped with the app, plus the license list. Users unzip it into OtakuSoul's avatar
# folder (Settings → Appearance → "Open avatar folder").
#
# Only include models whose licenses allow redistribution; the script refuses VRMs that have
# no entry in assets/vrm/lizenzen.txt.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VRM_DIR="$ROOT/assets/vrm"
LICENSES="$VRM_DIR/lizenzen.txt"
OUT="${1:-$ROOT/dist/OtakuSoul-Avatare.zip}"
BUNDLED=("Anime Girl.vrm" "Anime Man.vrm")


pack=()
missing=()
shopt -s nullglob
for file in "$VRM_DIR"/*.vrm; do
    name="$(basename "$file")"
    [[ " ${BUNDLED[*]} " == *" $name "* ]] && continue
    # The license list names models with or without the .vrm extension.
    if grep -qiF -- "${name%.vrm}" "$LICENSES"; then
        pack+=("$name")
    else
        missing+=("$name")
    fi
done

if ((${#missing[@]})); then
    echo "No license entry in assets/vrm/lizenzen.txt for:" >&2
    printf '  %s\n' "${missing[@]}" >&2
    echo "Add the source and license first (only models that may be redistributed)." >&2
    exit 1
fi
((${#pack[@]})) || { echo "No additional VRM models found in $VRM_DIR." >&2; exit 1; }

mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
if command -v zip >/dev/null; then
    (cd "$VRM_DIR" && zip -q -9 "$OUT" "${pack[@]}" lizenzen.txt)
else
    (cd "$VRM_DIR" && python3 -m zipfile -c "$OUT" "${pack[@]}" lizenzen.txt)
fi
echo "Packed ${#pack[@]} models into $OUT ($(du -h "$OUT" | cut -f1))."
