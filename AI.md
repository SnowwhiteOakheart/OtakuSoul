# 🧠 AI.md – System Memory & Architekturguide für KI-Assistenten

> **Hinweis für KI-Assistenten:** Dieses Dokument dient als permanentes Langzeitgedächtnis, architektonischer Leitfaden und Regelwerk für jedes KI-System, das an **OtakuSoul** arbeitet. Lies dieses Dokument vor jedem Eingriff sorgfältig.

---

## 📌 1. Projekt-Identität & Vision

- **Name:** OtakuSoul
- **GitHub Repository:** [https://github.com/SnowwhiteOakheart/OtakuSoul](https://github.com/SnowwhiteOakheart/OtakuSoul) (Remote: `origin`, Branch: `main`)
- **Ursprung:** Neuentwicklung und vollständige Portierung von *Soul of Waifu* (`/home/deathtrap/development/Soul-of-Waifu-linux`).
- **Kernziel:** Vollständige Eliminierung des Python-Interpreter-Overheads. Alle Kernfunktionen laufen in **nativem Rust (Tauri v2)** und modernstem **React 19 / TypeScript / Vite / Tailwind CSS v4 / WebGL (Three.js VRM + Pixi.js Live2D)**.

---

## 📜 2. Unveränderliche Projekt-Regeln (Strikte Befolgung!)

1. **Benutzer-Anrede (Informell):**
   Sprich den Benutzer **immer mit „Du“** an, niemals mit „Sie“.
2. **Git-Disziplin nach jeder Phase:**
   Nach jedem Meilenstein, jeder Phase oder größeren Feature-Fertigstellung wird ein sauberer Git-Commit erstellt und direkt auf GitHub (`origin main`) gepusht (`git push origin main`).
3. **Lebendige Dokumentation (`README.md` & `AI.md`):**
   Sowohl `README.md` als auch `AI.md` müssen **stets aktuell gehalten werden**. Sobald neue Module, Typen oder Features hinzukommen, werden beide Dokumente synchronisiert.
4. **Fehler- und Warnungsfreiheit:**
   Es dürfen **keine Compiler- oder Linter-Warnungen** existieren.
   Vor jedem Commit muss geprüft werden:
   - `cargo check` (0 Warnungen, 0 Fehler)
   - `cargo test` (alle Unit-Tests grün)
   - `npm run build` (TypeScript-Kompilierung & Vite-Bundle fehlerfrei)
5. **Cross-Platform-Konformität:**
   OtakuSoul ist von Anfang an für **Linux**, **Windows**, **macOS** sowie vorbereitend für **Mobile (iOS & Android)** ausgelegt:
   - Keine hartcodierten OS-Pfade verwenden. Nutze `directories::ProjectDirs` für Standardpfade (`%APPDATA%`, `~/.local/share`, `~/Library/Application Support`).
   - Plattformspezifischer Code (z.B. Linux `PR_SET_PDEATHSIG`) muss sauber mit `#[cfg(target_os = "...")]` gekapselt werden.
6. **Autarke Audio- & Asset-Pipelines:**
   - Soundeffekte werden über die Web Audio API synthetisiert (`src/services/soundFx.ts`), um externe Abhängigkeiten zu minimieren.
   - Binärdaten (VRM, PNG-Karten) werden via nativer IPC-Befehle (`read_file_binary`) als Byte-Array übertragen (CORS-frei).

---

## 🏗️ 3. Technische Architektur

```
+-------------------------------------------------------------------------------+
|                                   OtakuSoul                                   |
+-------------------------------------------------------------------------------+
| FRONTEND: React 19 + TypeScript + Vite 8 + Tailwind CSS v4                   |
| ├─ Avatar Engine: Three.js + @pixiv/three-vrm (LipSync, Blinzeln, Atmung)     |
| ├─ 2D Engine: PixiJS Live2D Display                                          |
| ├─ Audio Synthesizer: Procedural Web Audio API (Würfel, Fanfaren, Lagerfeuer)|
| ├─ State Management: Zustand (useAppStore.ts)                                 |
| ├─ UI Views: ChatView, StageView, CompanionView, SettingsView                |
| └─ Safety: Human-in-the-Loop 25s Countdown Banner                            |
+-------------------------------------------------------------------------------+
                                      ▲
                           Tauri IPC (Async / Events)
                                      ▼
+-------------------------------------------------------------------------------+
| BACKEND: Rust (Tauri v2 + Tokio)                                              |
| ├─ hardware.rs: GPU/VRAM Probe, automatische n_gpu_layers Zuteilung           |
| ├─ llama_manager.rs: Child-Prozesssteuerung mit PR_SET_PDEATHSIG              |
| ├─ inference.rs: SSE Streaming Proxy mit <think> Reasoning Filter             |
| ├─ characters.rs: SillyTavern V2 Parser (PNG tEXt Chunks & JSON)              |
| ├─ lorebook.rs: Regex- & Keyword-Kontextaktivierung                           |
| ├─ prompt_builder.rs: System-Prompt Generator mit {{char}}/{{user}} Makros   |
| ├─ memory.rs: SQLite Soul Memory (4 Layer, Emotional Decay, Deduplizierung)   |
| ├─ stage.rs: Tabletop RPG Engine (d20/d100/2d6, DC-Check, Clocks, Kampf)      |
| └─ companion.rs: Neurohormone (Dopamin, Cortisol, Oxytocin) & Tool Calling   |
+-------------------------------------------------------------------------------+
```

---

## 📂 4. Wichtige Dateipfade & Modulübersicht

### Backend (`src-tauri/`)
| Pfad | Zweck |
|---|---|
| `src-tauri/src/modules/hardware.rs` | Hardware-Probe, NVIDIA VRAM/RAM Ermittlung & Layer-Rechner |
| `src-tauri/src/modules/llama_manager.rs` | `llama-server` Prozessmanager, Zombie-Schutz, `/health` Polling |
| `src-tauri/src/modules/inference.rs` | SSE Token-Streaming & `<think>` Gedanken-Trennung |
| `src-tauri/src/modules/characters.rs` | SillyTavern V2 Character Card Parser, PNG tEXt Chunk Injector/Exporter & Personas |
| `src-tauri/src/modules/paths.rs` | Standardpfade (`directories::ProjectDirs`), Asset-Scans (Karten, Modelle, VRM) |
| `src-tauri/src/modules/settings.rs` | Persistente Konfiguration (`settings.json`) mit atomarem Speichern |
| `src-tauri/src/modules/lorebook.rs` | Lorebook / World Info Keyword-Scanner |
| `src-tauri/src/modules/prompt_builder.rs` | Dynamischer Prompt-Builder inkl. Seelen-Zustand |
| `src-tauri/src/modules/memory.rs` | SQLite Kognitives Seelen-Gedächtnis, Markdown Sync (MEMORY.md/USER.md), Backups & SoW-Importer |
| `src-tauri/src/modules/soul_memory_pipeline.rs` | Kognitive Pipeline: Router-Agent, Archivist-Agent, Diary-Agent, JSON-Patch-Parser & No-Op Detection |
| `src-tauri/src/modules/stage.rs` | RPG Würfel-Engine, Kampagnen-Clocks & Taktischer Kampf |
| `src-tauri/src/modules/companion.rs` | Neurohormone & Tool-Calling mit Sicherheitsabfrage |
| `src-tauri/src/modules/providers.rs` | LLM Provider Abstraktion (OpenRouter, Anthropic Messages API, OpenAI, DeepSeek, Gemini, Mistral, Custom) |
| `src-tauri/src/modules/llm_presets.rs` | LLM Sampler Presets Engine mit 5 Built-in Profilen & JSON-Persistenz |
| `src-tauri/src/modules/models_hub.rs` | Hugging Face GGUF API-Suche, Quants-Inspektion & Async File Downloader |
| `src-tauri/src/modules/voice.rs` | TTS-Provider, natives whisper.cpp-STT, OpenAI-kompatible Transkription, RVC-Sidecar & Stimmenprofile |
| `src-tauri/src/state.rs` | Globaler Tokio/Tauri `AppState` |
| `src-tauri/src/commands.rs` | Alle Tauri IPC Commands |
| `src-tauri/src/lib.rs` | App Builder, Dialog-Plugin & Handler-Registrierung |

### Frontend (`src/`)
| Pfad | Zweck |
|---|---|
| `src/types/index.ts` | Shared TypeScript Typdefinitionen |
| `src/services/api.ts` | Getypte Wrapper für alle Tauri IPC-Commands |
| `src/services/soundFx.ts` | Autarker Web Audio SFX-Synthesizer |
| `src/store/useAppStore.ts` | Zentraler Zustand State Store mit initApp, dyn. Pfaden & Scans |
| `src/components/Header.tsx` | VRAM-Monitor, Server-Status Header & Tab-Navigation |
| `src/components/chat/ChatView.tsx` | Split-Screen Chat & 3D Avatar mit Swipes `< 1/3 >`, Inline-Edit, Continue & Regenerate |
| `src/components/chat/ChatSidebar.tsx` | Slide-out Drawer: Multi-Chat Sitzungen, Author's Note mit Tiefe, 11 HUD-Presets & JSONL Import/Export |
| `src/components/chat/RoleplayMessage.tsx` | Trennung von Handlungen (*...*) und gesprochenem Wort ("...") |
| `src/components/chat/AdaptiveHud.tsx` | Charakter-Switcher, Persona-Badge & Zuneigungs-/Statusleiste |
| `src/components/chat/CognitiveMemoryDrawer.tsx` | Seelenspeicher-Inspektor (SQLite) |
| `src/constants/hudPresets.ts` | 11 Rollenspiel-HUD Presets (Romance, RPG, Survival, Horror, Cyberpunk, Slice of Life, etc.) |
| `src/utils/stateParser.ts` | Regex-Extractor für `<state>{...}</state>`, Tag-Stripper & State-Variable Merger |
| `src/components/characters/CharacterLibraryView.tsx` | Charakterbibliothek mit Kachel-Galerie, Suche & Tag-Filtern |
| `src/components/characters/CharacterEditorModal.tsx` | SillyTavern V2 Editor mit PNG/JSON Export & Avatar-Picker |
| `src/components/characters/PersonaManagerModal.tsx` | User-Personas Verwaltung ({{user}}-Makro) |
| `src/components/avatar/VrmViewer.tsx` | Three.js 3D VRM Player mit LipSync |
| `src/components/stage/StageView.tsx` | Tabletop RPG Dashboard & World State |
| `src/components/stage/ClockWidget.tsx` | SVG Tortendiagramm für Spannungs-Uhren |
| `src/components/stage/DiceRoller.tsx` | Interaktiver Würfelroller mit SG-Prüfung |
| `src/components/stage/EncounterTracker.tsx` | Initiativleiste, Kampfbegegnung & HP-Tracker |
| `src/components/companion/CompanionView.tsx` | Desktop-Agent Dashboard & Hormon-Monitor |
| `src/components/companion/SafetyCountdownBanner.tsx` | 25s Human-in-the-Loop Sicherheitsbanner |
| `src/components/settings/SettingsView.tsx` | Hardware-, Modell- und Server-Konfiguration mit Dateidialogen |
| `src/components/voice/CharacterVoiceModal.tsx` | Charakterbezogene TTS/STT-, Audiogeräte-, VAD- und RVC-Konfiguration |
| `src/components/voice/VoiceCallControls.tsx` | Push-to-talk und Voice-Call-Zustandsautomat mit Unterbrechung |
| `src/services/audioPlayer.ts` | Unterbrechungssichere Web-Audio-Warteschlange, Geräteauswahl, Gain & FFT-Amplitude |
| `src/services/streamingTts.ts` | Satzsegmentierung während des LLM-Streams und geordnete TTS-Synthese |
| `src/services/voiceCapture.ts` | Mikrofonaufnahme, Resampling auf 16 kHz und lokale RMS-VAD |

---

## 🗃️ 5. Lokale Assets & Verzeichnisse (Vollständig autark in OtakuSoul)

Alle benötigten Daten sind eigenständig in diesem Projektverzeichnis gekapselt:
- **LLM GGUF-Modelle:** `assets/models/` (im Repo per `.gitignore` ignoriert, lokal vorhanden)
  - `Gemma4-12B-QAT-Uncensored-HauhauCS-Balanced-Q4_K_M.gguf`
  - `Qwen3.8-27B-Heretic-Q4_K_M.gguf`
- **Vorkompilierte llama-server Binary & CUDA-Libs:** `bin/cuda/llama-server`
- **3D VRM Avatare:** `assets/vrm/` (u. a. `Anime Girl.vrm`, `Mikku.vrm`, `2B.vrm`)
- **Charakterkarten & Lorebooks:** `presets/`
  - V2 JSON-Karten & Lorebooks: `presets/sakura-succubus-3/`, `presets/no-game-no-life/`
  - SillyTavern V2 PNG-Karten: `presets/cards/` (15 Karten: Akane, Kurisu, Cosmos, Vivy, etc.)
- **Benutzerverzeichnis (automatisch angelegt):** `~/.local/share/otakusoul/` (`characters/`, `lorebooks/`, `personas/`, `scenes/`, `.trash/`)
- **Hardware des Benutzers:** NVIDIA GeForce RTX 4070 Ti SUPER (16.376 MB VRAM), CUDA 13.4, Vulkan 1.4, Arch Linux.

---

## 🧭 6. Phasen-Statusübersicht

- [x] **Phase 1: Projekt-Setup, Toolchain & GitHub Bootstrap** (Commit `70b2e84`)
- [x] **Phase 2: Hardware-Erkennung & llama-server Prozessmanager** (Commit `56dbfb2`)
- [x] **Phase 3: Character Cards V2, Lorebooks & Adaptive HUD** (Commit `012c490`)
- [x] **Phase 4: 3D VRM & 2D Avatar WebGL Engine mit LipSync** (Commit `a349ee0`)
- [x] **Phase 5: Kognitive Soul Memory mit SQLite & Emotional Decay** (Commit `05d9fa4`)
- [x] **Phase 6: Soul Stage Tabletop RPG & Procedural Web Audio SFX** (Commit `59f3792`)
- [x] **Phase 7: Soul Companion, Neurohormone & 25s Tool Safety** (Commit `aa9a8e5`)
- [x] **Technische Schulden & Phase 8: Datenfundament & Charakterbibliothek** (Commit `5cb5819`)
  - Native Dateidialoge (`tauri-plugin-dialog`), dynamische Pfade & Asset-Scans
  - Persistente `settings.json`, anpassbares Sampling & konfigurierbare Antwortsprache
  - SillyTavern V2 PNG tEXt Chunk Injection & Export, Charakter-Editor, Galerie-Bibliothek, User-Personas
- [x] **Phase 9: Vollwertiger Chat, Swipes & HUD-Presets** (Commit `d8c2bde`)
  - **SQLite Chat-Persistenz:** Tabellen `chat_sessions` & `chat_messages` mit Multi-Chat-Unterstützung pro Charakter
  - **SillyTavern Swipes (Antwortvarianten):** Beliebig viele Varianten pro Nachricht in `swipes_json`, browsbar via `< 1/3 >` Pagination
  - **Nachrichten-Aktionen:** Inline-Editing mit Textarea, Löschen, Fortsetzen (Continue), Neu generieren (Swipe anlegen)
  - **Author's Note & System-Steering:** Dedizierte Regieanweisung pro Chat mit frei wählbarer Injektionstiefe ($N$ Nachrichten vor Ende der Historie)
  - **Reaktives State Parsing:** Regex-Extraktion von `<state>{...}</state>`, automatische Aktualisierung der HUD-Variablen und Tag-Stripping aus Chatblasen
  - **11 Rollenspiel-HUD-Presets:** Romance, RPG, Survival, Horror, Cyberpunk, Slice-of-Life, Detektiv, Space Opera, Cultivation, Comedy, Tabletop Tactical
  - **SillyTavern & SoW JSONL Import/Export:** Volle Kompatibilität inkl. aller Metadaten und Swipes-Historie
- [x] **Phase 10: LLM-Provider & llama.cpp-Tuning** (Commit `bf00643`)
  - **Provider-Abstraktion in Rust:** `LlmProviderType` und `ProviderRegistry` unterstützen LocalLlama, OpenRouter, Anthropic (natives Messages-API Format), OpenAI, DeepSeek, Gemini, Mistral & Custom OpenAI-kompatible Endpunkte.
  - **Natives Anthropic-Protokoll:** Eigene Header (`x-api-key`, `anthropic-version`), oberstes `system`-Prompt Feld (keine System-Rollen im Nachrichten-Array), rollen-alternierende Normalisierung und SSE-Event-Streaming für `content_block_delta`.
  - **OpenRouter Modellkatalog:** Automatisches Abrufen aller Modelle von OpenRouter mit Kontextlänge & Preisinformationen, Volltext-Suchfilter und 1-Klick-Übernahme.
  - **Fortgeschrittene Sampler-Engine:** Dynamic Temperature (`dynatemp_range`, `dynatemp_exponent`), DRY (`dry_multiplier`, `dry_base`, `dry_allowed_length`, `dry_penalty_last_n`), XTC (`xtc_threshold`, `xtc_probability`), Min-P, Top-P, Top-K, Repeat Penalty und Stop Strings.
  - **LLM-Presets System:** 5 vordefinierte Presets (Storytelling/Kreativ, Rollenspiel Standard, Stage GM / Logik, XTC Wild, Fast Chat) + CRUD für eigene Presets mit Persistenz in `llm_presets.json`.
  - **llama-server Hardware-Tuning:** Batch Size (`-b`), UBatch Size (`-ub`), KV-Cache Quantisierung (`--cache-type-k`, `--cache-type-v` z. B. `q8_0` für 50% VRAM-Ersparnis bei großen Kontexten), Memory-Lock (`--mlock`), no-mmap (`--no-mmap`), CPU MoE Offloading (`--cpu-moe`).
  - **Models Hub (Hugging Face):** Direkte GGUF-Suche via Hugging Face API, Repo-Dateien-Inspektion mit Quantisierungs-Erkennung (Q4_K_M, Q8_0 etc.), asynchroner Downloader mit Live-Fortschrittsbalken und Download-Geschwindigkeit in MB/s (`model-download-progress`).
  - **Moderne Einstellungs-Tabs:** Unterteilung in Server Tuning, Cloud Provider & OpenRouter Katalog, Sampler & Presets sowie Models Hub.
- [x] **Phase 11: Soul Memory 2.0 (Kognitive Pipeline & Agenten)** (Commit `436469c`)
  - **Autonome Kognitive Pipeline (`soul_memory_pipeline.rs`):**
    - **Router-Agent:** Analysiert Konversationsabschnitte deterministisch, erkennt belanglose Turns via `{"no_significant_change": true}`, generiert partielle JSON-Field-Patches für Charakter- und Nutzerzustand, löst Widersprüche auf (`healing_log_add`) und plant Themen-Notizen (`topic_plan`).
    - **Archivist-Agent:** Erstellt und komprimiert thematische Lore-Einträge (<300 Wörter) auf Basis des Topic-Plans in das episodische Gedächtnis.
    - **Diary-Agent:** Verfasst intime Ich-Perspektiven-Tagebucheinträge (4–6 Sätze) über Gefühle gegenüber `{user_name}` ohne Rollenspiel-Fluff oder Dialogfetzen.
  - **Bidirektionaler Markdown-Sync (`MEMORY.md` & `USER.md`):**
    - Vollständiges Rendern des SQLite-Seelenzustands in sauberes, strukturiertes Markdown (`# SOUL CACHE: {CHAR}`, `# USER PROFILE & RELATIONSHIP MEMORY: {USER}`).
    - Robuster Regex-basierter Markdown-Parser (`parse_and_sync_character_markdown`, `parse_and_sync_user_markdown`), der Änderungen am Markdown direkt in die SQLite-Tabellen synchronisiert.
    - Integrierter Markdown-Editor mit Tab-Umschaltung und 1-Klick-Speicherung in `CognitiveMemoryDrawer.tsx`.
  - **Rolling Snapshots & Backup-Manager:**
    - Automatisches Erstellen von JSON-Snapshots vor jedem Patch-Vorgang in `characters/<char_id>/backups/`.
    - Übersicht aller Backups mit Datum und Dateigröße sowie 1-Klick-Rollback.
  - **Soul of Waifu Memory-Importer:**
    - 1-Klick-Import vorhandener `MEMORY.md`, `USER.md`, `topics/*.md` und `DIARY.md` Dateien aus beliebigen SoW-Ordnern über den nativen Verzeichnisdialog.
  - **Prompt-Builder-Erweiterung:** Kernidentität, ungelöste Dissonanzen, Story-Rolle und Beziehungsdynamik werden nun direkt in den Rollenspiel-Prompt injiziert.
- [x] **Phase 12: Lorebook 2.0 (Editor, Multi-Binding, Scene Tension & Chain Dependencies)**
  - **Erweiterte Trigger-Engine (`lorebook.rs`):**
    - Primärschlüssel (ODER), Sekundärschlüssel (UND-Bedingung), Ausschlusswörter (NOT-Bedingung), Reguläre Ausdrücke (`regex_keys`), Wortgrenzen-Regex (`\b`), Case-Sensitivity Toggle und Always-On.
    - **Wahrscheinlichkeits-Roll:** Prozentuale Auslöserate (`probability: 0..100%`) und Prioritäts-Sortierung (`priority: i32`, höhere Werte zuerst).
  - **Scene Tension Accumulator:**
    - Dynamische Szenenspannung wächst pro Turn (+2) und bei Konflikt-/Gefahren-Keywords (+10) bis 100%.
    - Bei Erreichen des Schwellenwerts (`tension_threshold`) triggern spezielle Zufalls-/Krisen-Lorebook-Einträge und bauen Spannung ab (-25).
    - Interaktiver Tension-Gauge im UI mit Live-Anzeige, Schwellenwerten und manuellem Reset.
  - **Chain Dependencies:**
    - `chain_activates`: Zwingt abhängige Folge-Einträge zur gemeinsamen Aktivierung.
    - `chain_requires`: Filtert Einträge heraus, falls deren Voraussetzungen nicht aktiv sind.
  - **Getrennte Injektions-Modi im System-Prompt (`prompt_builder.rs`):**
    - `passive`: Fließt als Hintergrundwissen in `## Weltwissen & Kontext (Lorebook)` ein.
    - `active` / `directive`: Fließt als strikte Handlungsregel in `## Wichtige Handlungs- & Regie-Anweisungen (Lore-Direktiven)` ein.
  - **Multi-Binding & globale Lorebooks:**
    - Beliebig viele Lorebooks können einzelnen Charakteren zugewiesen werden (`bound_lorebooks` im Charakter-Editor).
    - Universelle Lorebooks können als `global` markiert werden und sind automatisch in jedem Chat aktiv.
  - **Eigenständiger Lorebook-Manager & Editor (`LorebookView.tsx`):**
    - Neuer Hauptreiter *Lorebooks* in der Navigation.
    - Volle CRUD-Funktionalität, Eintrags-Filter, Tag-Chips, SillyTavern- / World-Info-kompatibler JSON-Import und -Export.
- [x] **Phase 13: Stimme, TTS/STT & Voice Call**
  - **TTS-Streaming & Audio (`voice.rs`, `streamingTts.ts`, `audioPlayer.ts`):** Fertige Sätze werden bereits während der LLM-Ausgabe synthetisiert und in stabiler Reihenfolge abgespielt; Abbruch, Gain, Ausgabegerätewahl und FFT-LipSync sind integriert.
  - **Provider:** Edge-TTS, ElevenLabs mit Live-Stimmenliste sowie OpenAI-kompatible Cloud-/Sidecar-Endpunkte. Kokoro, Qwen3-TTS, XTTSv2, Silero und AllTalk werden über diesen einheitlichen Sidecar-Vertrag angebunden, ohne Python zur Kernlaufzeit hinzuzufügen.
  - **STT:** Offline-Transkription über `whisper-rs`/whisper.cpp mit frei wählbarem GGML/GGUF-Modell sowie OpenAI-kompatible `/v1/audio/transcriptions`-Endpunkte.
  - **Voice Activity Detection:** Lokale RMS-VAD in der Web-Audio-Aufnahme mit einstellbarer Schwelle und Stillezeit; Mono-Resampling auf 16 kHz vor der Transkription.
  - **Voice Call:** Zustände Listening → Transcribing → Thinking → Speaking, automatischer Turn-Wechsel, Push-to-talk und Unterbrechung laufender Generierung/Wiedergabe.
  - **RVC:** Optionales Audio-Postprocessing über einen neutralen Multipart-Sidecar-Vertrag mit Modell, Pitch, Index-Rate und Protect.
  - **Cross-Platform:** Ein-/Ausgabegerätewahl und macOS-Mikrofonbeschreibung in `Info.plist`; bestehende Konfigurationen werden durch Serde-Defaults migriert.

**Offene Phasen 14–18** (Live2D, Stage-GM, echter Companion, Ökosystem, i18n & Auslieferung) sind in [`Roadmap.md`](Roadmap.md) dokumentiert. **Vor neuen Features dort nachsehen und erledigte Punkte mit Commit-Hash abhaken.**

---

## 💡 7. Tipps für zukünftige Erweiterungen & Best Practices

- **SillyTavern Swipes-Prinzip:** Swipes werden im SQLite-Feld `swipes_json` als Array von `{ content, thought }` gespeichert. Ein `swipe_index` markiert die aktive Variante. Das Erzeugen eines neuen Swipes („Neu generieren“) überschreibt niemals die bisherigen Varianten, sondern hängt eine neue an und setzt den Index auf das Ende.
- **State Parsing (`<state>` Tags):** Rollenspiel-Modelle können via System-Prompt angewiesen werden, Status-Änderungen am Ende der Nachricht als `<state>{"Affection": 55}</state>` auszugeben. Der Parser in `src/utils/stateParser.ts` fängt diese Tags ab, aktualisiert die Zustand-Variablen und entfernt den Tag restlos aus der sichtbaren Blase, damit der Rollenspielfluss unberührt bleibt.
- **Reasoning-Unterdrückung im Rollenspiel:** Wie in *Soul of Waifu* ist der Reasoning-Modus standardmäßig **deaktiviert**, um lästige interne Denkmonologe zu unterbinden und die Generierung maximal zu beschleunigen. Bei `reasoning_mode = false` übergibt `llama_manager` die Flags `--reasoning off --reasoning-budget 0`, sendet `enable_thinking: false` und der System-Prompt untersagt `<think>`-Tags explizit. Umschaltbar über den Schnellschalter im Chat-HUD (`AdaptiveHud.tsx`) oder in den Einstellungen.
- **KV-Cache Quantisierung:** Mit `--cache-type-k q8_0` und `--cache-type-v q8_0` lässt sich der VRAM-Bedarf für lange Kontextfenster (16k–32k Tokens) auf der RTX 4070 Ti SUPER fast halbieren, ohne spürbare Einbußen bei der Generierungsqualität.
- **Anthropic Messages Streaming:** Anthropic nutzt SSE Events (`content_block_delta`), bei denen das Text-Delta unter `delta.text` liegt, während OpenAI/v1/chat/completions das Delta unter `choices[0].delta.content` platziert. Die `ProviderRegistry` normalisiert beide Formate transparent auf das einheitliche `llm-token` Event in Tauri.
- **Streaming-Listener & React-Lifecycle:** Asynchrone Tauri-Listener (`listen(...)`) müssen zwingend mit einem `isSubscribed`-Guard gekapselt werden, damit bei unmounted Components / React StrictMode keine Geister-Listener verbleiben, die Tokens doppelt empfangen.
- **Mobile Viewports (iOS/Android):** Alle UI-Container nutzen Flex/Grid und sind vorbereitet für Touch-Gesten und responsive Breakpoints (`sm:`, `lg:`).
- **Tool Calling Erweiterung:** Neue Tools können direkt in `src-tauri/src/modules/companion.rs` in `execute_internal` registriert werden. Deklariere gefährliche Operationen in `is_dangerous`, damit der 25s Sicherheits-Countdown automatisch greift.
