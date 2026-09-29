#!/usr/bin/env python3
"""Writes latest.json, the manifest the in-app updater reads, from the signed bundles of a build.

Usage: tools/make_latest_json.py [--notes FILE] [--bundle-dir target/release/bundle]

Upload latest.json together with the listed files to the GitHub release tagged v<version>;
the app looks for it at releases/latest/download/latest.json.
"""
import argparse
import datetime
import json
import pathlib
import platform

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPO = "SnowwhiteOakheart/OtakuSoul"
# (bundle folder, file suffix, updater installer name) — see tauri-plugin-updater's Installer.
BUNDLES = [
    ("appimage", ".AppImage", "appimage"),
    ("deb", ".deb", "deb"),
    ("rpm", ".rpm", "rpm"),
    ("nsis", ".exe", "nsis"),
    ("msi", ".msi", "msi"),
    ("macos", ".app.tar.gz", "app"),
]
OS_NAMES = {"Linux": "linux", "Windows": "windows", "Darwin": "darwin"}
ARCH_NAMES = {"x86_64": "x86_64", "amd64": "x86_64", "arm64": "aarch64", "aarch64": "aarch64"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--notes", type=pathlib.Path, help="Markdown file with the release notes")
    parser.add_argument("--bundle-dir", type=pathlib.Path, default=ROOT / "target" / "release" / "bundle")
    args = parser.parse_args()

    version = json.loads((ROOT / "src-tauri" / "tauri.conf.json").read_text())["version"]
    target = f"{OS_NAMES[platform.system()]}-{ARCH_NAMES[platform.machine().lower()]}"
    platforms = {}
    uploads = []
    for folder, suffix, installer in BUNDLES:
        for sig in sorted((args.bundle_dir / folder).glob(f"*{suffix}.sig")):
            bundle = sig.with_suffix("")  # strip .sig
            if version not in bundle.name:
                continue  # leftover from an older build
            platforms[f"{target}-{installer}"] = {
                "signature": sig.read_text().strip(),
                "url": f"https://github.com/{REPO}/releases/download/v{version}/{bundle.name}",
            }
            uploads.append(bundle)

    if not platforms:
        raise SystemExit(
            f"No signed bundles for {version} in {args.bundle_dir}. "
            "Build with TAURI_SIGNING_PRIVATE_KEY set (createUpdaterArtifacts is on)."
        )

    manifest = {
        "version": version,
        "notes": args.notes.read_text() if args.notes else f"OtakuSoul {version}",
        "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": platforms,
    }
    out = args.bundle_dir / "latest.json"
    out.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {out} for {', '.join(platforms)}.")
    print(f"Upload to the GitHub release v{version}:")
    for path in [*uploads, out]:
        print(f"  {path}")


if __name__ == "__main__":
    main()
