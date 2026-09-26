#!/usr/bin/env bash
set -euo pipefail

# Installs the PrismML llama.cpp fork used by Bonsai PQ2_0/PTQ1_0 models.
# It stays separate from bin/cuda so ordinary GGUFs keep using upstream llama.cpp.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/bin/prism-cuda"
API_URL="https://api.github.com/repos/PrismML-Eng/llama.cpp/releases/latest"

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
    echo "This installer currently supports Linux x86_64."
    echo "See https://github.com/PrismML-Eng/llama.cpp/releases for other platforms."
    exit 1
fi

backend="${OTAKUSOUL_PRISM_BACKEND:-}"
if [[ -z "$backend" ]]; then
    if command -v nvidia-smi >/dev/null 2>&1 || lspci 2>/dev/null | grep -qi nvidia; then
        backend="cuda"
    else
        backend="cpu"
    fi
fi

echo "Querying the latest PrismML llama.cpp release..."
release_json="$(curl -fsSL -H 'Accept: application/vnd.github+json' "$API_URL")"
tag="$(printf '%s' "$release_json" | grep -o '"tag_name": *"[^"]*"' | head -1 | cut -d'"' -f4)"

if [[ "$backend" == "cuda" ]]; then
    cuda_major="$( (nvcc --version 2>/dev/null || true) | sed -n 's/.*release \([0-9][0-9]*\)\..*/\1/p' | head -1)"
    if [[ "$cuda_major" == "13" ]]; then
        asset_pattern='bin-linux-cuda-13.3-x64.tar.gz'
    elif [[ "$cuda_major" == "12" ]]; then
        asset_pattern='bin-linux-cuda-12.8-x64.tar.gz'
    else
        asset_pattern='bin-linux-cuda-12.4-x64.tar.gz'
    fi
else
    asset_pattern='bin-ubuntu-x64.tar.gz'
fi

url="$(printf '%s' "$release_json" \
    | grep -o '"browser_download_url": *"[^"]*"' \
    | cut -d'"' -f4 \
    | grep "$asset_pattern" \
    | head -1)"

if [[ -z "$url" ]]; then
    echo "No suitable $backend asset found in PrismML release $tag."
    exit 1
fi

tmp_dir="$(mktemp -d -t otakusoul-prism.XXXXXX)"
trap 'rm -rf -- "$tmp_dir"' EXIT
archive="$tmp_dir/prism-runtime.tar.gz"
unpack="$tmp_dir/unpack"
mkdir -p "$unpack" "$DEST"

echo "Downloading PrismML $tag ($backend)..."
curl -L --fail --retry 2 --progress-bar -o "$archive" "$url"
tar -xzf "$archive" --strip-components=1 -C "$unpack"

cp -a "$unpack"/. "$DEST"/
chmod +x "$DEST/llama-server"
printf '%s\n' "$tag" > "$DEST/OTAKUSOUL_PRISM_VERSION"

echo "Installed: $DEST/llama-server"
LD_LIBRARY_PATH="$DEST${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" \
    "$DEST/llama-server" --version 2>&1 | tail -3 || true
echo "OtakuSoul now selects this runtime automatically for PQ2_0/PTQ1_0 models."
