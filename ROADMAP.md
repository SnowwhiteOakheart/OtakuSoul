# 🗺️ OtakuSoul – Verbesserungs-Roadmap

> Stand: 2026-10-01 (zuletzt aktualisiert) · Ursprüngliche Analyse: Commit `8507fb8` (main)
> Grundlage: Code-Review von `src/` und `src-tauri/`, `npm outdated`, `cargo outdated`, `npm audit`,
> `cargo clippy`, `tsc`, Vitest/Cargo-Tests und eine Sichtprüfung der Oberfläche bei 1280×840 und 960×640 (Mindestgröße).
> Abgeschlossene Feature-Phasen stehen in `Roadmap_abgeschlossen.md`.

**Fortschritt:** P0, Abhängigkeiten, Navigation samt Befehlspalette, i18n, Dialoge/Feedback, Barrierefreiheit und Fenster-Plugins sind erledigt.
Offen sind vor allem Ersteinrichtung, Design-Bausteine, Store-/Komponenten-Aufteilung, Rust-Fehlertypen und Tests.

**Gesamtbild (Ausgangslage):** Funktional ist das Projekt weit. `tsc` läuft sauber, 63 Vitest- sowie 104 aktive Cargo-Tests sind grün
(zwei weitere Cargo-Tests benötigen Netzwerk bzw. lokale Modelldateien und bleiben standardmäßig ignoriert).
Die Schwächen liegen vor allem hier:

1. **Ein echter Laufzeit-Bug:** Das Web-Fetch-Tool des Companions stürzt ab.
2. **Veraltete Abhängigkeiten:** Einige Pakete sind hinterher, das Live2D-Paket ist ein Blocker mit Sicherheitslücke.
3. **Uneinheitliche Oberfläche:** i18n greift kaum, Themes wirken nur teilweise, es gibt keine Barrierefreiheit, der Header läuft über.

---

### CI → lokale Checks

GitHub Actions wurden bewusst entfernt (Commit `11597c2`). Stattdessen gibt es jetzt:

---

### Barrierefreiheit (a11y)


### Fenster & Desktop-Integration

- [ ] Command-Wrapper in `api.ts` typsicher erzeugen, sobald `tauri-specta` eine stabile 2.0 hat.

### Tests

- [x] Frontend-Abdeckung ausbauen: Store-Tests mit API-Mock (`src/test/mockApi.ts`) und Komponenten-Tests mit Testing
  Library/jsdom für UI-Primitive, Dialoge, Einrichtungsassistent, Chat (Generierung, Stream, Sitzungen, Bearbeiten),
  Memory, Stage (`stageTurns`: Runden, Flüstern, Vorlesen, Auto-Play; `stageWorldEditor`) und Charakter-Editor –
  220 Tests in 38 Suites. Dabei behoben: Speicherfehler der Stage gingen verloren (Weltzustand-Editor meldete
  „gespeichert“ und verwarf den Entwurf); Feldbeschriftungen im Charakter-Editor sind jetzt mit den Feldern verknüpft.

---

## 🖼️ Lokale Bildgenerierung (offline, mit VRAM-Handling)

  | Modell | Zeit (Tausch) | VRAM nur Bild (gemessen) | Modus „Chat verkleinern“ |
  |---|---|---|---|
  | Animagine XL 4.0 (SDXL) | 28 s | ~7,6 GB | 44 GPU-Layer, 31 s |
  | FLUX.1 dev Q5_K_S | 48 s | ~9 GB | 26 GPU-Layer |
  | Qwen-Image 2.1 Q4_K (`--offload-to-cpu`) | 73 s | ~5,6 GB (Schätzung 9,5 → 7 GB) | parallel, 72 s |
  | FLUX.2 dev Q4_K_S | 248 s | ~14,4 GB (mit Auslagerung) | Tausch (passt nicht) |

  Der Chat antwortet nach jedem Bild 1–4 s nach dem Neustart; FLUX.2 entlädt gestuft erst das Sprachmodell, dann
  das Chat-Modell; bei SDXL bleibt das Sprachmodell geladen. Die Bilder wurden gesichtet.

  **Gefundener und behobener Fehler:** Mit zwei GPUs verteilen sd.cpp und llama.cpp (Vulkan) nach freiem Speicher –
  die iGPU meldet 52 GB geteilten RAM und bekam FLUX.1 ab (350 s statt 48 s). `sd-server` bekommt jetzt per
  `--backend` und `llama-server` per `--device` die größte dedizierte GPU, wenn mehr als ein Gerät gelistet ist.

  Noch offen: Parallelbetrieb auf 24 GB (keine Karte vorhanden).
- [x] Anime-LoRAs und SD-1.5-Stufe (`image_loras.rs`, `LocalLoraSettings.tsx`): Katalog mit SHA-256 (SDXL: Anime
  Detailer, Style Enhancer, Pastel Anime; FLUX.1: GHIBSKY, nicht-kommerziell) plus eigene Dateien in `loras/`, Auswahl
  mit Stärke je Modellfamilie, Auslösewörter automatisch. Counterfeit V3.0 (SD 1.5, 2,1 GB) als 4-GB-Stufe.
  Auf RTX 4070 Ti SUPER getestet (`gpu_e2e loras`): SD 1.5 in 15 s, alle LoRA-Tensoren angewendet, fremde Familie
  wird nicht mitgeschickt. Gefunden: `sd-server` ignoriert `<lora:…>` im Prompt und kennt neue Dateien erst nach
  `GET /sdapi/v1/loras`; XLabs' FLUX-Anime-LoRA wirkt im Original gar nicht und konvertiert verwaschen (nicht im
  Katalog). Pony V6 bleibt draußen (nur über Civitai mit Login).

---

## 🎲 Stage: Modulare TTRPG-Bühne

Die Stage verbindet die Stärken lokaler Bildgenerierung, Lorebook-Engine, Kampf-Tracker mit Stress und Zuständen,
Tabs Abenteuer/Taktik/Kampagne sowie JSON/MD-Export mit interaktiven TTRPG-Mechaniken.

---

## ✨ P3 – Nice-to-have

- [x] E2E-Isolation: Mit `OTAKUSOUL_HOME` bekommt das Hauptfenster (in `lib.rs` erzeugt, `create: false`) einen
  eigenen Webview-Datenordner `<home>/webview`; `localStorage` wird nicht mehr zwischen Testläufen und mit der echten
  App geteilt. Der Harness prüft das bei jedem Start per Marker (macOS: WKWebView ignoriert den Ordner).

- [ ] Apple Metal: `recommendedMaxWorkingSetSize` statt des gesamten Arbeitsspeichers als GPU-Speicher.
- [ ] Vision lokal auf echter Hardware testen (Gemma/Qwen-VL mit passender `mmproj`, z. B. aus dem Modell-Hub).
- [x] Bundle-Analyse (`npm run analyze` → `target/bundle-stats.html`): Der Start-Chunk enthielt alle drei Sprachen
  (~450 kB Rohtext). Englisch und Russisch laden jetzt bei Bedarf (`i18n/registry.ts`), Deutsch bleibt als Rückfall:
  Start-Chunk 552 → 247 kB (gzip 160 → 74 kB). `chunkSizeWarningLimit: 800` bleibt begründet für den nur bei
  sichtbarem Avatar geladenen three.js-Chunk (nicht weiter teilbar).

---

## ✅ Empfohlene Reihenfolge

5. **Store-Slices + Selektoren**, Komponenten aufteilen.
7. P3 nach Bedarf.
