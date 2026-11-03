# Musik der Geschichten (`otakusoul_music`)

Jede Geschichte kann ihre eigene Stimmungsmusik beschreiben und mitbringen. Die Stage spielt
zuerst die Musik der Geschichte, dann den allgemeinen Pool (`<Daten>/music/<stimmung>/`), dann
eine verwandte Stimmung. Die Titel werden **vor** dem Spielen erzeugt (später in der App mit
ACE-Step 1.5, bis dahin außerhalb) und für mitgelieferte Geschichten aus `otakusoul-data` geladen.

## Ablage

| Wo | Was |
|---|---|
| `<Daten>/music/sets/<set>/<stimmung>/<datei>` | Titel einer Geschichte (fester Ort, steht nicht im JSON) |
| `<Daten>/music/sets/<set>/<stimmung>/<datei>.json` | Herkunft: Generator, Modell, Caption, Lyrics, Seed, Lizenz |
| `<Daten>/music/<stimmung>/` | allgemeiner Pool (eigene Dateien, Musikpakete) |
| `otakusoul-data/music/<set>/<stimmung>/<datei>` | ausgelieferte Titel im Daten-Repo |

`<set>` besteht aus `a–z`, `0–9`, `-` und `_` (höchstens 64 Zeichen). **Ein Set pro Geschichte:**
Alle Szenen einer Geschichte nennen dasselbe Set (z. B. die drei Akte von `crypt_of_shadows`).
Ohne `set` gilt die Szenen-ID. Stimmungen: `calm`, `tavern`, `adventure`, `tension`, `mystery`,
`combat`, `boss`, `romance`, `sorrow`. Formate: MP3 (so erzeugt und ausgeliefert), OGG, OPUS, WAV, FLAC.

## Szene: `extensions.otakusoul_music`

```json
"otakusoul_music": {
  "set": "frozen_bells",
  "style": "fairytale celtic folk, harp, fiddle, wooden flute, warm and wintry",
  "moods": {
    "calm":    { "caption": "gentle harp and flute, snowy village at dusk, slow tempo", "bpm": 72, "duration": 150, "count": 2 },
    "mystery": {
      "caption": "celesta and distant bells, soft wordless female choir far away, airy",
      "lyrics": "[Intro]\n[Verse]\nooh, aah\nooh, aah\n[Outro]",
      "vocal_language": "en"
    }
  },
  "tracks": [
    {
      "mood": "calm", "file": "calm_01.mp3", "path": "music/frozen_bells/calm/calm_01.mp3",
      "sha256": "…64 Kleinbuchstaben-Hex…",
      "generator": "ACE-Step 1.5 (acestep.cpp)", "model": "acestep-v15-sft-Q8_0",
      "caption": "…vollständige Caption…", "lyrics": "[Instrumental]", "seed": 1234,
      "generated": "2026-11-02", "license": "CC0-1.0"
    }
  ]
}
```

| Feld | Bedeutung |
|---|---|
| `set` | Ordner der Geschichte, siehe oben |
| `style` | Klangwelt der ganzen Geschichte; steht vor jeder Caption |
| `moods.<stimmung>.caption` | ACE-Step-Caption: Stil, Instrumente, Stimmung, Klangfarbe, Tempo (Englisch) |
| `lyrics` | leer oder `[Instrumental]` = ohne Gesang; sonst Lyrics mit Struktur-Tags |
| `vocal_language` | Sprache des Gesangs (`en`, `de`, `ja` …), nur mit `lyrics` |
| `bpm`, `keyscale`, `duration` (s, 10–600, Standard 120), `count` (1–8), `seed` | optional |
| `tracks` | fertige Titel im Daten-Repo; Pfad unter `music/` oder `presets/`, SHA-256 Pflicht |
| `tracks[].nsfw` | aus `otakusoul-data-nsfw`, nur bei aktiver 18+-Freigabe geladen |

**Leiser Gesang im Hintergrund:** Gesang braucht `lyrics` (sonst rendert ACE-Step instrumental).
Für Summen oder Chor ohne Text reichen Silben wie `ooh, aah` mit Struktur-Tags; die Caption sagt,
wie der Gesang klingt („soft wordless female choir far away“, „distant humming“). Zu viele Tags
werden mitgesungen, also knapp halten. Solche Titel brauchen beim Erzeugen das Sprachmodell von
ACE-Step (5Hz-LM); reine Instrumentaltitel kommen ohne aus.

## Eigene Geschichten: Schritt „Musik“ im Story-Assistenten

Der Assistent füllt den Abschnitt für neue Geschichten: Er schlägt je Genre einen Klang und vier bis
fünf Stimmungen mit Captions vor, die Du ändern, ergänzen oder abwählen kannst. „Vorschlag vom
Chatmodell“ schickt Genre, Titel, Ort, Ausgangslage und Gefährten an das eingestellte Chatmodell und
übernimmt dessen Klang und Captions (nur für die gewählten Stimmungen). „Leiser Gesang im Hintergrund“
setzt Summ-Lyrics für `calm`, `mystery`, `romance` und `sorrow`. Das Set ist die ID der Geschichte;
die Titel entstehen danach im Musik-Fenster der Stage.

## Lorebook: `extensions.otakusoul_music.style`

Die Klangwelt einer Welt. Szenen ohne eigenen `style`, die das Lorebook binden, erben sie.

```json
"otakusoul_music": { "style": "celtic folk, harp, fiddle, misty highlands" }
```

## Charakterkarte: `extensions.otakusoul_music.theme`

Ein Leitmotiv. Steht die Figur in der Gruppe (`party`), wird es an die Captions passender
Stimmungen angehängt (ohne `moods`: `calm`, `romance`, `sorrow`).

```json
"otakusoul_music": { "theme": "tender solo violin", "moods": ["romance", "sorrow"] }
```

## Pflege in den Daten-Repos

`otakusoul-data` und `otakusoul-data-nsfw` halten die Musik-Angaben aller Szenen, Lorebooks und Karten in
`tools/music_settings.json` (eine Klangwelt je Sammlung, ein Leitmotiv je Figur) und schreiben sie mit
`tools/set_music.py` in Gateway- und Preset-Dateien samt PNG-Karten; das Werkzeug erhöht die Registry-Revisionen.
Die Karten der App selbst (`presets/characters`, `presets/crypt-of-shadows`) haben ihr Leitmotiv direkt im JSON.

## Script `tools/story_music.py`: Titel ohne die App erzeugen und ausliefern

Wenn eine neue Geschichte dazukommt, geht es ohne Klicken in der App. Voraussetzungen: ACE-Step-Laufzeit
und Modelle sind einmal in der App geladen (Stage → Musik). Nur die Python-Standardbibliothek; `ffmpeg`
(Windows: `winget install Gyan.FFmpeg`) braucht nur `ship --format ogg`.

```bash
python tools/story_music.py plan     presets/stories/scenes/story_neu.json
python tools/story_music.py generate presets/stories/scenes/story_neu.json                  # Modell xl
python tools/story_music.py generate presets/stories/scenes/story_neu.json --model standard --mood calm
python tools/story_music.py ship     presets/stories/scenes/story_neu.json
```

| Befehl | Was er tut |
|---|---|
| `plan` | Zeigt je Set die Klangwelt, die fertige Caption je Stimmung (mit Lorebook-Stil und Leitmotiven der Gruppe, wie im Musik-Fenster) und wie viele Titel fehlen |
| `generate` | Startet den `ace-server` der Laufzeit (Port 48600, die App darf weiterlaufen), erzeugt die fehlenden Titel nach `<Daten>/music/sets/<set>/<stimmung>/` und schreibt die Herkunft daneben; `--dry-run` zeigt nur den Umfang |
| `ship` | Kopiert die Titel eines Sets unverändert als MP3 (`--format ogg` wandelt mit ffmpeg um), legt sie nach `otakusoul-data/music/<set>/<stimmung>/`, trägt `tracks` mit SHA-256 und Herkunft in alle genannten Szenen ein und erhöht bei Hub-Szenen (`stages_gateway/`) `revision` und `updated` in `stages_registry.json` |

Mehrere Szenen derselben Geschichte dürfen zusammen übergeben werden (ein Set wird einmal bearbeitet,
`ship` schreibt die Titel in jede Szene). Wichtige Schalter: `--data-dir` (Datenordner der App, Standard
der Plattformordner oder `$OTAKUSOUL_HOME/data`), `--cards` und `--lorebooks` (weitere Ordner für
Leitmotive und Klangwelten; Standard: `presets/` und die Ordner von `otakusoul-data`), `--model`
(`standard`, `quality`, `xl`), `--data-repo` (Standard `../otakusoul-data`). `generate` zählt vorhandene
Titel mit und erzeugt nur, was laut `count` fehlt. Reicht der VRAM nicht neben dem Chat-Modell, dieses
vorher in der App beenden (das Script warnt). Der Plan ist eine Kopie von `story_music::plan` und die
Modellstufen von `music_gen.rs`: Wer dort etwas ändert, zieht das Script nach.

## Titel ausliefern (Daten-Repo)

1. Titel erzeugen: im Musik-Fenster der Stage oder mit `generate`. Anhören; was nicht passt, aus dem
   Set-Ordner löschen und neu erzeugen.
2. `python tools/story_music.py ship <Szenen>` legt die Titel nach
   `otakusoul-data/music/<set>/<stimmung>/<datei>.mp3`, bildet die Prüfsummen und trägt `tracks` in die
   Szenen ein (bei Hub-Szenen in `stages_gateway/…`, bei mitgelieferten Geschichten in
   `presets/…/scenes/*.json` der App) und erhöht bei Hub-Szenen die `revision`. Von Hand geht es genauso:
   Datei ablegen, `sha256sum` bilden, `tracks` ergänzen, `revision` der Szene erhöhen.
3. In beiden Repos committen und pushen (Daten-Repo zuerst, damit die Dateien erreichbar sind).
4. Beim Öffnen der Szene lädt die App fehlende Titel nach (`story_music::ensure_scene_music`),
   prüft die Prüfsumme und legt die Herkunft daneben; im Musik-Fenster geht es auch von Hand.
   Eine schon begonnene Geschichte bekommt beim Fortsetzen fehlende Angaben des mitgelieferten Presets
   (`otakusoul_music`, später dazugekommene `tracks`) still dazu; eigene Werte bleiben.

Herkunft und KI-Kennzeichnung gehören immer dazu: ACE-Step bittet darum, erzeugte Werke auf
Ähnlichkeit zu prüfen und KI-Beteiligung offenzulegen.
