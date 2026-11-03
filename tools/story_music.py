#!/usr/bin/env python3
"""Musik der Geschichten ohne die App erzeugen und ausliefern (ACE-Step 1.5).

Dasselbe wie das Musik-Fenster der Stage, nur von der Kommandozeile: Plan einer Szene, fehlende Titel
mit dem `ace-server` der App-Laufzeit erzeugen und fertige Titel als OGG ins Daten-Repo legen. Schema
und Ablauf: `docs/stage_music.md`, Abschnitt „Script `tools/story_music.py`“.

    python tools/story_music.py plan     SZENE.json ...   # Plan zeigen: Set, Captions, was fehlt
    python tools/story_music.py generate SZENE.json ...   # fehlende Titel erzeugen (App-Ordner)
    python tools/story_music.py ship     SZENE.json ...   # OGG ins Daten-Repo, `tracks` eintragen

`SZENE.json` ist eine Szenen-Datei (`presets/stories/scenes/*.json`, `stages_gateway/*.json`) oder ein
gespeicherter Spielstand. Szenen derselben Geschichte teilen ein Set; `generate` und `ship` arbeiten
je Set einmal. Der Plan entspricht dem der App: Klangwelt der Szene (sonst des ersten Lorebooks mit
Klangwelt) + Caption der Stimmung + Leitmotive der Gruppe (Karten als JSON oder PNG).

Titel entstehen im App-Datenordner (`<Daten>/music/sets/<set>/<stimmung>/`), die App findet sie dort
sofort; Herkunft liegt als `<datei>.json` daneben. `generate` zählt vorhandene Titel mit, erzeugt also
nur, was laut `count` fehlt. Nur die Standardbibliothek; `ship` braucht `ffmpeg` (mit libvorbis).
"""

from __future__ import annotations

import argparse
import base64
import datetime
import email.parser
import email.policy
import hashlib
import json
import os
import shutil
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

MOODS = ["calm", "tavern", "adventure", "tension", "mystery", "combat", "boss", "romance", "sorrow"]
THEME_MOODS = ["calm", "romance", "sorrow"]
INSTRUMENTAL = "[Instrumental]"
DEFAULT_DURATION = 120
CODES_PER_SECOND = 5
MAX_SECONDS = 600
MUSIC_EXT = "otakusoul_music"
AUDIO_SUFFIXES = {".ogg", ".opus", ".mp3", ".wav", ".flac"}
# Eigener Port, damit der `ace-server` der App (48598) weiterlaufen kann.
DEFAULT_PORT = 48600

# Muss zu `TIERS` in `src-tauri/src/modules/music_gen.rs` passen.
TIERS = {
    "standard": {"synth": "acestep-v15-sft-Q8_0.gguf", "lm": "acestep-5Hz-lm-0.6B-Q8_0.gguf", "vram_mb": 6000, "steps": 50},
    "quality": {"synth": "acestep-v15-sft-Q8_0.gguf", "lm": "acestep-5Hz-lm-1.7B-Q8_0.gguf", "vram_mb": 8000, "steps": 50},
    "xl": {"synth": "acestep-v15-xl-sft-Q8_0.gguf", "lm": "acestep-5Hz-lm-1.7B-Q8_0.gguf", "vram_mb": 12000, "steps": 50},
}
COMMON_MODELS = ["vae-BF16.gguf", "Qwen3-Embedding-0.6B-Q8_0.gguf"]
LANGUAGES = {
    "en": "English", "de": "German", "fr": "French", "es": "Spanish", "it": "Italian",
    "pt": "Portuguese", "ja": "Japanese", "ko": "Korean", "zh": "Chinese", "ru": "Russian",
}


def fail(message: str) -> None:
    sys.exit(f"Fehler: {message}")


# ---------------------------------------------------------------------------------------------
# Ordner
# ---------------------------------------------------------------------------------------------

def app_data_dir() -> Path:
    """Datenordner der App (wie `paths::base_dirs`): `$OTAKUSOUL_HOME/data` oder der Plattformordner."""
    home = os.environ.get("OTAKUSOUL_HOME")
    if home:
        return Path(home) / "data"
    if sys.platform == "win32":
        return Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming")) / "snowwhite" / "otakusoul" / "data"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "com.snowwhite.otakusoul"
    base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / "otakusoul"


def default_card_dirs() -> list[Path]:
    data = REPO.parent / "otakusoul-data"
    return [REPO / "presets", data / "cards_gateway", data / "presets"]


def default_lorebook_dirs() -> list[Path]:
    data = REPO.parent / "otakusoul-data"
    return [REPO / "presets", data / "lorebooks_gateway", data / "presets"]


# ---------------------------------------------------------------------------------------------
# Szenen, Karten, Lorebooks
# ---------------------------------------------------------------------------------------------

def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def scene_definition(path: Path) -> dict:
    """Die Szenen-Definition: die Datei selbst oder `definition` eines Spielstands."""
    data = read_json(path)
    definition = data.get("definition") if isinstance(data.get("definition"), dict) else data
    if not isinstance(definition, dict):
        fail(f"{path} ist keine Szene")
    return definition


def valid_set(set_id: str) -> bool:
    return 0 < len(set_id) <= 64 and all(c in "abcdefghijklmnopqrstuvwxyz0123456789-_" for c in set_id)


def scene_set(definition: dict) -> str | None:
    """Set der Geschichte: `set`, sonst die Szenen-ID (nur für Szenen mit Musik-Abschnitt)."""
    music = (definition.get("extensions") or {}).get(MUSIC_EXT)
    if not isinstance(music, dict):
        return None
    for candidate in (music.get("set", ""), definition.get("id", "")):
        candidate = str(candidate).strip().lower()
        if valid_set(candidate):
            return candidate
    return None


def png_chara(path: Path) -> dict | None:
    """Kartendaten aus dem `chara`/`ccv3`-Textchunk einer PNG-Karte."""
    found = None
    with path.open("rb") as f:
        if f.read(8) != b"\x89PNG\r\n\x1a\n":
            return None
        while header := f.read(8):
            length, kind = struct.unpack(">I4s", header)
            if kind == b"tEXt":
                keyword, _, text = f.read(length).partition(b"\0")
                if keyword in (b"chara", b"ccv3") and (found is None or keyword == b"ccv3"):
                    try:
                        found = json.loads(base64.b64decode(text))
                    except ValueError:
                        pass
                f.seek(4, 1)
            else:
                f.seek(length + 4, 1)
            if kind == b"IEND":
                break
    return found


class Library:
    """Karten (Leitmotive) und Lorebooks (Klangwelten) aus den gegebenen Ordnern, nach Namen."""

    def __init__(self, card_dirs: list[Path], lorebook_dirs: list[Path]) -> None:
        self.card_dirs = card_dirs
        self.lorebook_dirs = lorebook_dirs
        self._themes: dict[str, dict] | None = None
        self._styles: dict[str, str] | None = None

    @staticmethod
    def _files(dirs: list[Path], suffixes: tuple[str, ...]):
        seen = set()
        for root in dirs:
            if root.is_dir():
                for path in sorted(root.rglob("*")):
                    if path.suffix.lower() in suffixes and path not in seen and "expressions" not in path.parts:
                        seen.add(path)
                        yield path

    def theme(self, name: str) -> dict | None:
        if self._themes is None:
            self._themes = {}
            for path in self._files(self.card_dirs, (".json", ".png")):
                try:
                    card = png_chara(path) if path.suffix.lower() == ".png" else read_json(path)
                except (OSError, ValueError):
                    continue
                data = (card or {}).get("data")
                if not isinstance(data, dict) or not data.get("name"):
                    continue
                theme = (data.get("extensions") or {}).get(MUSIC_EXT)
                if isinstance(theme, dict) and str(theme.get("theme", "")).strip():
                    self._themes.setdefault(data["name"].strip().lower(), theme)
        return self._themes.get(name.strip().lower())

    def style(self, name: str) -> str:
        if self._styles is None:
            self._styles = {}
            for path in self._files(self.lorebook_dirs, (".json",)):
                try:
                    book = read_json(path)
                except (OSError, ValueError):
                    continue
                if not isinstance(book, dict) or "entries" not in book:
                    continue
                music = (book.get("extensions") or {}).get(MUSIC_EXT)
                style = str(music.get("style", "")) if isinstance(music, dict) else ""
                for key in (book.get("name"), book.get("id"), path.stem):
                    if key:
                        self._styles.setdefault(str(key).strip().lower(), style)
        return self._styles.get(name.strip().lower(), "")


# ---------------------------------------------------------------------------------------------
# Plan (wie `story_music::plan`)
# ---------------------------------------------------------------------------------------------

def has_vocals(lyrics: str) -> bool:
    lyrics = lyrics.strip()
    return bool(lyrics) and lyrics.lower() != INSTRUMENTAL.lower()


def join_caption(parts: list[str]) -> str:
    cleaned = [p.strip().rstrip(",.").strip() for p in parts]
    return ", ".join(p for p in cleaned if p)


def count_music(folder: Path) -> int:
    if not folder.is_dir():
        return 0
    return sum(1 for p in folder.iterdir() if p.is_file() and p.suffix.lower() in AUDIO_SUFFIXES)


def build_plan(definition: dict, library: Library, sets_dir: Path) -> dict | None:
    set_id = scene_set(definition)
    if set_id is None:
        return None
    music = definition["extensions"][MUSIC_EXT]
    style = str(music.get("style", "")).strip()
    if not style:
        for wanted in definition.get("lorebook") or []:
            found = library.style(str(wanted)).strip()
            if found:
                style = found
                break
    themes = []
    for name in definition.get("party") or []:
        theme = library.theme(str(name))
        if theme:
            themes.append(theme)
    moods = []
    specs = music.get("moods") or {}
    for mood in MOODS:
        spec = specs.get(mood)
        if not isinstance(spec, dict):
            continue
        motifs = [
            str(t["theme"])
            for t in themes
            if (mood in t["moods"] if t.get("moods") else mood in THEME_MOODS)
        ]
        lyrics = str(spec.get("lyrics", ""))
        vocals = has_vocals(lyrics)
        bpm = spec.get("bpm")
        moods.append({
            "mood": mood,
            "caption": join_caption([style, str(spec.get("caption", "")), *motifs]),
            "lyrics": lyrics.strip() if vocals else INSTRUMENTAL,
            "vocal_language": str(spec.get("vocal_language", "")).strip() if vocals else "",
            "has_vocals": vocals,
            "bpm": bpm if isinstance(bpm, int) and 30 <= bpm <= 300 else None,
            "keyscale": str(spec.get("keyscale", "")).strip(),
            "duration": min(max(int(spec.get("duration") or DEFAULT_DURATION), 10), MAX_SECONDS),
            "count": min(max(int(spec.get("count") or 1), 1), 8),
            "seed": spec.get("seed"),
            "installed": count_music(sets_dir / set_id / mood),
        })
    return {"set": set_id, "style": style, "moods": moods}


def print_plan(title: str, plan: dict) -> None:
    missing = sum(max(m["count"] - m["installed"], 0) for m in plan["moods"])
    print(f"\n{title}: Set „{plan['set']}“, {len(plan['moods'])} Stimmungen, {missing} fehlen")
    print(f"  Klangwelt: {plan['style'] or '(keine)'}")
    for m in plan["moods"]:
        vocal = f" · Gesang ({m['vocal_language'] or '?'})" if m["has_vocals"] else ""
        print(f"  {m['mood']:<10} {m['installed']}/{m['count']} · {m['duration']} s{vocal}")
        print(f"             {m['caption']}")


def collect_plans(args: argparse.Namespace) -> list[tuple[Path, dict, dict]]:
    """Ein Eintrag je Set (die erste Szene, die es nennt): (Datei, Definition, Plan)."""
    library = Library(args.cards or default_card_dirs(), args.lorebooks or default_lorebook_dirs())
    sets_dir = Path(args.data_dir) / "music" / "sets"
    plans: list[tuple[Path, dict, dict]] = []
    seen: set[str] = set()
    for scene in args.scenes:
        path = Path(scene)
        definition = scene_definition(path)
        plan = build_plan(definition, library, sets_dir)
        if plan is None:
            print(f"{path.name}: kein Musik-Abschnitt (`extensions.{MUSIC_EXT}`), übersprungen")
        elif plan["set"] in seen:
            print(f"{path.name}: Set „{plan['set']}“ kommt schon von einer früheren Szene")
        else:
            seen.add(plan["set"])
            plans.append((path, definition, plan))
    return plans


# ---------------------------------------------------------------------------------------------
# ace-server
# ---------------------------------------------------------------------------------------------

def installed_runtime(data_dir: Path) -> dict:
    current = data_dir / "runtimes" / "acestep" / "current.json"
    if not current.is_file():
        fail(f"Keine ACE-Step-Laufzeit gefunden ({current}). In der App unter Stage → Musik installieren.")
    return read_json(current)


def free_vram_mb() -> int | None:
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.free", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=10, check=True,
        ).stdout
        return max(int(line) for line in out.split())
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


class AceServer:
    """Startet den `ace-server` der Laufzeit und spricht seine Job-Schnittstelle an."""

    def __init__(self, data_dir: Path, port: int) -> None:
        self.runtime = installed_runtime(data_dir)
        self.models = data_dir / "music-models"
        self.port = port
        self.process: subprocess.Popen | None = None

    @property
    def base(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def start(self) -> None:
        binary = Path(self.runtime["server_path"])
        libs = [*self.runtime.get("library_dirs", []), str(binary.parent)]
        var = "PATH" if sys.platform == "win32" else "LD_LIBRARY_PATH"
        env = dict(os.environ)
        env[var] = os.pathsep.join([*libs, env.get(var, "")])
        print(f"Starte ace-server ({self.runtime.get('backend')}, Port {self.port}) …")
        self.process = subprocess.Popen(
            [str(binary), "--models", str(self.models), "--host", "127.0.0.1", "--port", str(self.port), "--max-batch", "1"],
            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        started = time.time()
        while time.time() - started < 120:
            time.sleep(0.5)
            if self.process.poll() is not None:
                fail("ace-server ist beim Start beendet (läuft schon ein anderer auf diesem Port?)")
            try:
                with urllib.request.urlopen(f"{self.base}/health", timeout=2) as response:
                    if response.status == 200:
                        return
            except OSError:
                pass
        self.stop()
        fail("ace-server wurde nicht rechtzeitig bereit")

    def stop(self) -> None:
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                self.process.kill()
        self.process = None

    def request(self, url: str, body: dict | None = None) -> tuple[str, bytes]:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"} if data else {})
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                return response.headers.get("Content-Type", ""), response.read()
        except urllib.error.HTTPError as error:
            fail(f"{url}: HTTP {error.code} {error.read()[:300]!r}")

    def job(self, endpoint: str, body: dict) -> tuple[str, bytes]:
        _, raw = self.request(f"{self.base}/{endpoint}", body)
        job_id = str(json.loads(raw)["id"])
        status_url = f"{self.base}/job?id={urllib.parse.quote(job_id)}"
        started = time.time()
        try:
            while time.time() - started < 45 * 60:
                state = str(json.loads(self.request(status_url)[1]).get("status", "")).lower()
                if state == "done":
                    return self.request(status_url + "&result=1")
                if any(word in state for word in ("err", "fail", "cancel")):
                    fail(f"{endpoint}-Job fehlgeschlagen: {state}")
                time.sleep(1.5)
        except KeyboardInterrupt:
            self.request(status_url + "&cancel=1")
            raise
        fail(f"{endpoint}-Job dauert zu lange")


def audio_of(content_type: str, body: bytes) -> bytes:
    """Das Audio eines `/synth`-Ergebnisses: der Körper selbst oder der Audio-Teil einer Multipart-Antwort."""
    if content_type.startswith("audio/"):
        return body
    message = email.parser.BytesParser(policy=email.policy.default).parsebytes(
        b"Content-Type: " + content_type.encode() + b"\r\n\r\n" + body
    )
    for part in message.iter_parts() if message.is_multipart() else []:
        if part.get_content_type().startswith("audio/"):
            return part.get_payload(decode=True)
    fail("Die Antwort von /synth enthält kein Audio")


def make_track(server: AceServer, planned: dict, tier: dict, seed: int, model: str) -> bytes:
    lm_body = {
        "caption": planned["caption"], "lyrics": planned["lyrics"], "duration": planned["duration"], "seed": seed,
        "use_cot_caption": False, "lm_model": tier["lm"], "synth_model": tier["synth"],
    }
    if planned["bpm"]:
        lm_body["bpm"] = planned["bpm"]
    if planned["keyscale"]:
        lm_body["keyscale"] = planned["keyscale"]
    if planned["has_vocals"] and planned["vocal_language"] in LANGUAGES:
        lm_body["vocal_language"] = LANGUAGES[planned["vocal_language"]]
    _, raw = server.job("lm", lm_body)
    enriched = json.loads(raw)
    if isinstance(enriched, list):
        enriched = enriched[0]
    codes = [c for c in str(enriched.get("audio_codes", "")).split(",") if c.strip()]
    if not codes:
        fail("Das Sprachmodell hat keine Audio-Codes geliefert")
    enriched["audio_codes"] = ",".join(codes[: planned["duration"] * CODES_PER_SECOND])
    if planned["has_vocals"] and planned["vocal_language"]:
        enriched["vocal_language"] = planned["vocal_language"]
    enriched.update({
        "output_format": "mp3", "mp3_bitrate": 192, "peak_clip": 0,
        "synth_model": tier["synth"], "inference_steps": tier["steps"],
    })
    content_type, body = server.job("synth", enriched)
    return audio_of(content_type, body)


def next_file_name(folder: Path, mood: str) -> str:
    for n in range(1, 1000):
        if not any((folder / f"{mood}_{n:02d}{s}").exists() for s in AUDIO_SUFFIXES):
            return f"{mood}_{n:02d}.mp3"
    fail(f"zu viele Titel in {folder}")


def cmd_plan(args: argparse.Namespace) -> None:
    for path, _, plan in collect_plans(args):
        print_plan(path.name, plan)


def cmd_generate(args: argparse.Namespace) -> None:
    data_dir = Path(args.data_dir)
    tier = TIERS[args.model]
    missing_models = [m for m in [*COMMON_MODELS, tier["synth"], tier["lm"]] if not (data_dir / "music-models" / m).is_file()]
    if missing_models:
        fail(f"Modelle fehlen in {data_dir / 'music-models'}: {', '.join(missing_models)} (in der App unter Stage → Musik laden)")
    jobs: list[tuple[str, dict, int]] = []
    for path, _, plan in collect_plans(args):
        print_plan(path.name, plan)
        for planned in plan["moods"]:
            if args.mood and planned["mood"] not in args.mood:
                continue
            jobs += [(plan["set"], planned, i) for i in range(planned["installed"], planned["count"])]
    if not jobs:
        print("\nNichts zu erzeugen.")
        return
    print(f"\n{len(jobs)} Titel mit „{args.model}“ erzeugen.")
    if args.dry_run:
        return
    free = free_vram_mb()
    if free is not None and free < tier["vram_mb"]:
        print(f"Warnung: nur {free} MB VRAM frei, „{args.model}“ braucht etwa {tier['vram_mb']} MB. Chat-Modell der App beenden?")
    server = AceServer(data_dir, args.port)
    server.start()
    done = 0
    try:
        for number, (set_id, planned, index) in enumerate(jobs, 1):
            seed = planned["seed"] + index if isinstance(planned["seed"], int) else int.from_bytes(os.urandom(4), "big") >> 1
            began = time.time()
            print(f"[{number}/{len(jobs)}] {set_id}/{planned['mood']} …", end=" ", flush=True)
            audio = make_track(server, planned, tier, seed, args.model)
            folder = data_dir / "music" / "sets" / set_id / planned["mood"]
            folder.mkdir(parents=True, exist_ok=True)
            name = next_file_name(folder, planned["mood"])
            (folder / name).write_bytes(audio)
            origin = {
                "set": set_id, "mood": planned["mood"],
                "generator": "ACE-Step 1.5 (acestep.cpp, " + str(server.runtime.get("build", "")) + ")",
                "model": tier["synth"].removesuffix(".gguf"), "lm_model": tier["lm"].removesuffix(".gguf"),
                "caption": planned["caption"], "lyrics": planned["lyrics"], "vocal_language": planned["vocal_language"],
                "seed": seed, "steps": tier["steps"], "generated": datetime.date.today().isoformat(),
                "license": "KI-generiert mit ACE-Step 1.5 (MIT), selbst erzeugt",
            }
            (folder / f"{name}.json").write_text(json.dumps(origin, indent=2, ensure_ascii=False), encoding="utf-8")
            done += 1
            print(f"{name} ({time.time() - began:.0f} s)")
    except KeyboardInterrupt:
        print("\nAbgebrochen.")
    finally:
        server.stop()
    print(f"\n{done} Titel gespeichert in {data_dir / 'music' / 'sets'}")


# ---------------------------------------------------------------------------------------------
# Ausliefern
# ---------------------------------------------------------------------------------------------

def to_ogg(source: Path, target: Path, quality: float) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        fail("`ffmpeg` fehlt (mit libvorbis). Windows: `winget install Gyan.FFmpeg`, Linux/macOS: Paketverwaltung.")
    target.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [ffmpeg, "-v", "error", "-y", "-i", str(source), "-vn", "-map_metadata", "-1", "-c:a", "libvorbis", "-q:a", str(quality), str(target)],
        capture_output=True, text=True,
    )
    if result.returncode != 0 or not target.is_file():
        fail(f"ffmpeg konnte {source.name} nicht umwandeln: {result.stderr.strip()}")


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def bump_registry_revision(scene_path: Path) -> str | None:
    """Hub-Szenen (`stages_gateway/<id>.json`): `revision` + 1 und `updated` in `stages_registry.json`."""
    if scene_path.parent.name != "stages_gateway":
        return None
    registry_path = scene_path.parent.parent / "stages_registry.json"
    if not registry_path.is_file():
        return None
    registry = read_json(registry_path)
    for entry in registry.get("scenes", []):
        if str(entry.get("download_url", "")).endswith("/" + scene_path.name):
            entry["revision"] = int(entry.get("revision", 0)) + 1
            entry["updated"] = datetime.date.today().isoformat()
            registry_path.write_text(json.dumps(registry, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            return f"{entry.get('id')} → Revision {entry['revision']}"
    return None


def cmd_ship(args: argparse.Namespace) -> None:
    data_dir = Path(args.data_dir)
    repo = Path(args.data_repo).resolve()
    if not repo.is_dir():
        fail(f"Daten-Repo nicht gefunden: {repo} (mit --data-repo angeben)")
    by_set: dict[str, list[Path]] = {}
    for scene in args.scenes:
        path = Path(scene)
        set_id = scene_set(scene_definition(path))
        if set_id is None:
            print(f"{path.name}: kein Musik-Abschnitt, übersprungen")
        else:
            by_set.setdefault(set_id, []).append(path)
    for set_id, scenes in by_set.items():
        source_dir = data_dir / "music" / "sets" / set_id
        sources = sorted(
            (p for p in source_dir.glob("*/*") if p.suffix.lower() in AUDIO_SUFFIXES and p.parent.name in MOODS),
            key=lambda p: (MOODS.index(p.parent.name), p.name),
        )
        if not sources:
            print(f"Set „{set_id}“: keine Titel in {source_dir}, übersprungen")
            continue
        tracks = []
        for source in sources:
            mood = source.parent.name
            target = repo / "music" / set_id / mood / (source.stem + ".ogg")
            if source.suffix.lower() == ".ogg":
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target)
            elif not target.is_file() or target.stat().st_mtime < source.stat().st_mtime:
                to_ogg(source, target, args.quality)
            origin_file = source.with_name(source.name + ".json")
            origin = read_json(origin_file) if origin_file.is_file() else {}
            tracks.append({
                "mood": mood, "file": target.name, "path": f"music/{set_id}/{mood}/{target.name}",
                "sha256": sha256_of(target),
                "generator": origin.get("generator", "ACE-Step 1.5 (acestep.cpp)"),
                "model": origin.get("model", ""), "caption": origin.get("caption", ""),
                "lyrics": origin.get("lyrics", INSTRUMENTAL), "seed": origin.get("seed", 0),
                "generated": origin.get("generated", datetime.date.today().isoformat()),
                "license": origin.get("license", "KI-generiert mit ACE-Step 1.5 (MIT), selbst erzeugt"),
            })
            print(f"  {set_id}/{mood}/{target.name}  {target.stat().st_size / 1024:.0f} KB")
        for scene_path in scenes:
            raw = scene_path.read_text(encoding="utf-8")
            data = json.loads(raw)
            definition = data["definition"] if isinstance(data.get("definition"), dict) else data
            definition["extensions"][MUSIC_EXT]["tracks"] = tracks
            newline = "\r\n" if "\r\n" in raw else "\n"
            scene_path.write_text(json.dumps(data, indent=2, ensure_ascii=False).replace("\n", newline) + (newline if raw.endswith("\n") else ""), encoding="utf-8", newline="")
            note = bump_registry_revision(scene_path.resolve())
            print(f"{scene_path.name}: {len(tracks)} Titel eingetragen" + (f" ({note})" if note else ""))
    print("\nNoch von Hand: im Daten-Repo (und bei Preset-Szenen in der App) committen und pushen;"
          " bei Szenen aus dem App-Repo `revision` nur erhöhen, wenn sie eine hat.")


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    for name, handler, help_text in [
        ("plan", cmd_plan, "Plan der Szenen zeigen"),
        ("generate", cmd_generate, "fehlende Titel erzeugen"),
        ("ship", cmd_ship, "Titel als OGG ins Daten-Repo legen und `tracks` eintragen"),
    ]:
        p = sub.add_parser(name, help=help_text)
        p.set_defaults(handler=handler)
        p.add_argument("scenes", nargs="+", metavar="SZENE.json")
        p.add_argument("--data-dir", default=str(app_data_dir()), help="Datenordner der App (Standard: Plattformordner oder $OTAKUSOUL_HOME/data)")
        p.add_argument("--cards", action="append", type=Path, help="Ordner mit Karten (JSON/PNG) für Leitmotive; mehrfach möglich")
        p.add_argument("--lorebooks", action="append", type=Path, help="Ordner mit Lorebooks für Klangwelten; mehrfach möglich")
        if name == "generate":
            p.add_argument("--model", choices=sorted(TIERS), default="xl", help="Modellstufe (Standard: xl)")
            p.add_argument("--mood", action="append", choices=MOODS, help="nur diese Stimmung (mehrfach möglich)")
            p.add_argument("--port", type=int, default=DEFAULT_PORT)
            p.add_argument("--dry-run", action="store_true", help="nur zeigen, was erzeugt würde")
        if name == "ship":
            p.add_argument("--data-repo", default=str(REPO.parent / "otakusoul-data"), help="Ordner von otakusoul-data")
            p.add_argument("--quality", type=float, default=5, help="Vorbis-Qualität 0–10 (Standard 5, etwa 160 kbit/s)")
    args = parser.parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()
