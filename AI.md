# 🧠 AI.md – System Memory & Architekturguide für KI-Assistenten

> **Hinweis für KI-Assistenten:** Dieses Dokument dient als permanentes Langzeitgedächtnis, architektonischer Leitfaden und Regelwerk für jedes KI-System, das an **OtakuSoul** arbeitet. Lies dieses Dokument vor jedem Eingriff sorgfältig.

---

## 📌 1. Projekt-Identität & Vision

- **Name:** OtakuSoul
- **GitHub Repository:** [https://github.com/SnowwhiteOakheart/OtakuSoul](https://github.com/SnowwhiteOakheart/OtakuSoul) (Remote: `origin`, Branch: `main`)
- **Ursprung:** Neuentwicklung und vollständige Portierung von *Soul of Waifu* (Python-Vorgänger).
- **Kernziel:** Vollständige Eliminierung des Python-Interpreter-Overheads. Alle Kernfunktionen laufen in **nativem Rust (Tauri v2)** und modernstem **React 19 / TypeScript / Vite / Tailwind CSS v4 / WebGL (Three.js VRM + Pixi.js Live2D)**.

---

## 📜 2. Unveränderliche Projekt-Regeln (Strikte Befolgung!)

1. **Benutzer-Anrede (Informell):**
   Sprich den Benutzer **immer mit „Du“** an, niemals mit „Sie“.
2. **Git-Disziplin nach jeder Phase:**
   Thematisch getrennte Commits direkt auf `main`, Commit-Messages auf Deutsch mit Conventional-Commit-Präfix
   (`feat(chat): …`, `fix(gpu): …`). Nach jedem Commit wird direkt gepusht (`git push origin main`). Der Nutzer arbeitet
   parallel im selben Verzeichnis: fremde uncommittete Änderungen nie mitcommitten. `ROADMAP.md` (und ggf.
   `Roadmap_TTS.md`) im selben Commit abhaken. Kein GitHub-CI – geprüft wird lokal.
3. **Lebendige Dokumentation (`README.md` & `AI.md`):**
   Sowohl `README.md` als auch `AI.md` müssen **stets aktuell gehalten werden**. Sobald neue Module, Typen oder Features hinzukommen, werden beide Dokumente synchronisiert.
4. **Fehler- und Warnungsfreiheit:**
   Es dürfen **keine Compiler- oder Linter-Warnungen** existieren.
   Vor jedem Commit muss `npm run check` grün sein (oxlint, `tsc --noEmit`, Vitest, `cargo fmt --check`,
   `cargo clippy --all-targets -D warnings`, `cargo test`); Commit und Push an dessen Exit-Code koppeln.
   UI-Änderungen zusätzlich mit `npm run e2e` (Rauchtest über `tauri-driver`) prüfen und die Screenshots in
   `e2e/screenshots/` ansehen.
5. **Cross-Platform-Konformität:**
   OtakuSoul ist von Anfang an für **Linux**, **Windows**, **macOS** sowie vorbereitend für **Mobile (iOS & Android)** ausgelegt:
   - Keine hartcodierten OS-Pfade verwenden. Konfigurations- und Datenordner kommen ausschließlich aus
     `paths::base_dirs()` (`directories::ProjectDirs`, bzw. `$OTAKUSOUL_HOME/config|data` für isolierte Testprofile).
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
| ├─ 2D Engine: PixiJS Live2D Cubism Display (Auto-Blink, Web Audio LipSync)    |
| ├─ Audio Synthesizer: Procedural Web Audio API & AudioPlayer (SFX & TTS)      |
| ├─ Stage Engine: Two-Tier GM Orchestrator, Party HUD, Scenes Lobby & Dices   |
| ├─ State Management: Zustand (useAppStore.ts)                                 |
| ├─ UI Views: ChatView, StageView, CompanionView, SettingsView, LorebookView   |
| ├─ Overlay: FloatingCompanionOverlay (Transparent Always-On-Top Desktop Widget)|
| └─ Safety: Human-in-the-Loop 25s Countdown Banner                            |
+-------------------------------------------------------------------------------+
                                      ▲
                           Tauri IPC (Async / Events)
                                      ▼
+-------------------------------------------------------------------------------+
| BACKEND: Rust (Tauri v2 + Tokio)                                              |
| ├─ hardware.rs: GPU-Probe (nvidia-smi + Vulkan: NVIDIA/AMD/Intel, iGPU-Flag)  |
| ├─ runtimes.rs: Laufzeiten laden (llama.cpp, PrismML, sd.cpp, CrispASR)       |
| ├─ llama_manager.rs: Child-Prozesssteuerung, --device/--mmproj               |
| ├─ local_image.rs / tts_local.rs: sd-server & crispasr --server, VRAM-Planer |
| ├─ inference.rs: SSE Streaming Proxy mit <think> Reasoning Filter             |
| ├─ context_window.rs / chat_summary.rs: Kontext kürzen & zusammenfassen       |
| ├─ attachments.rs / translate.rs: Anhänge (Vision) & Übersetzung             |
| ├─ characters.rs: SillyTavern V2 Parser (PNG tEXt Chunks & JSON)              |
| ├─ paths.rs: Standardpfade, Asset-Scans (Karten, GGUF, VRM, Live2D)           |
| ├─ lorebook.rs: Regex-, Keyword-, Tension- & Chain-Kontextaktivierung         |
| ├─ prompt_builder.rs: System-Prompt Generator mit {{char}}/{{user}} Makros   |
| ├─ memory/: SQLite Soul Memory (4 Layer, Chats, Zusammenfassung, Anhänge)    |
| ├─ stage/: Two-Tier GM Engine (Action-Planner, Storyteller, Rest, Dice)       |
| ├─ voice.rs / kokoro.rs: TTS/STT, Edge-TTS, Kokoro ONNX, Whisper STT & RVC    |
| ├─ tts_local.rs: CrispASR-TTS (Qwen3-TTS, Chatterbox, Kokoro DE), Stimmklone |
| ├─ companion.rs: Neurohormone, EmotionState, Scratchpad & Goals-Manager      |
| ├─ companion_tools.rs: Echte Tools (Web, Screen, Clip, MPRIS, GUI, Sandbox)   |
| └─ mcp_client.rs: Standard MCP JSON-RPC 2.0 Client & Plugin-Loader           |
+-------------------------------------------------------------------------------+
```

---

## 📂 4. Wichtige Dateipfade & Modulübersicht

### Backend (`src-tauri/`)
| Pfad | Zweck |
|---|---|
| `src-tauri/src/modules/hardware.rs` | Hardware-Probe: `nvidia-smi` plus Vulkan (`ash`, Loader zur Laufzeit) für AMD/Intel, iGPU-Erkennung, `primary_gpu()` (größte dedizierte), `same_gpu()` für Gerätenamen, Layer-/Kontext-Rechner |
| `src-tauri/src/modules/runtimes.rs` | Laufzeiten aus GitHub-Releases laden und prüfen (SHA-256): llama.cpp, PrismML, stable-diffusion.cpp, CrispASR; Backend-Empfehlung (CUDA nur mit passender System-CUDA unter Linux, sonst Vulkan) |
| `src-tauri/src/modules/model_files.rs` | Gemeinsamer fortsetzbarer, geprüfter Hugging-Face-Download für Bild- und TTS-Modelle |
| `src-tauri/src/modules/gguf.rs` | GGUF-Header lesen (Layer-Zahl für den VRAM-Planer) |
| `src-tauri/src/modules/llama_manager.rs` | `llama-server` Prozessmanager, Zombie-Schutz, `/health` Polling, `--device` auf die dedizierte GPU bei mehreren Geräten, `--mmproj` für Vision |
| `src-tauri/src/modules/local_image.rs` | `sd-server` (stable-diffusion.cpp), Bildmodell-Katalog, gestufter VRAM-Planer (parallel → TTS entladen → Chat-Modell verkleinern/tauschen), `--backend`-Gerätefestlegung |
| `src-tauri/src/modules/tts_local.rs` | `crispasr --server` (Port 48598): TTS-Katalog, Stimmklone unter `voices/` mit Einwilligung, KI-Kennzeichnung |
| `src-tauri/src/modules/inference.rs` | SSE Token-Streaming & `<think>` Gedanken-Trennung; `ChatMessage` mit optionalen Anhängen |
| `src-tauri/src/modules/context_window.rs` | Verlauf ans Kontextfenster anpassen (älteste Nachrichten raus, System-Prompt/letzte Nachricht bleiben); lokal exakt über `/props` + `/tokenize` (gecacht), Cloud geschätzt |
| `src-tauri/src/modules/chat_summary.rs` | Laufende Zusammenfassung herausgefallener Nachrichten pro Chat („Story So Far“) |
| `src-tauri/src/modules/attachments.rs` | Chat-Anhänge unter `attachments/<chat>/`: Bilder (verkleinert, Bild-Blöcke), PDF/Text (als Text), `prepare()` vor dem Senden |
| `src-tauri/src/modules/translate.rs` | Übersetzung einzelner Nachrichten mit dem Chat-Modell |
| `src-tauri/src/modules/characters.rs` | SillyTavern V2 Character Card Parser, PNG tEXt Chunk Injector/Exporter & Personas |
| `src-tauri/src/modules/paths.rs` | Standardpfade (`directories::ProjectDirs`), Asset-Scans (Karten, Modelle, VRM, Live2D) |
| `src-tauri/src/modules/settings.rs` | Persistente Konfiguration (`settings.json`) mit atomarem Speichern |
| `src-tauri/src/modules/lorebook.rs` | Lorebook / World Info Keyword-Scanner |
| `src-tauri/src/modules/prompt_builder.rs` | Prompt-Builder inkl. Seelen-Zustand; bearbeitbare `PromptTemplate` (Rolle, Stil, Nachspann) mit Vorlagen Rollenspiel/Erzähler/Companion; `system_prompt`/`post_history_instructions` der Karte mit `{{original}}` |
| `src-tauri/src/modules/memory/` | SQLite: Seelen-Gedächtnis, Chats (`chats.rs`, inkl. `summary`/`summary_until`, `attachments_json`), Markdown Sync (MEMORY.md/USER.md), Snapshots & SoW-Importer |
| `src-tauri/src/modules/soul_memory_pipeline.rs` | Kognitive Pipeline: Router-Agent, Archivist-Agent, Diary-Agent, JSON-Patch-Parser & No-Op Detection |
| `src-tauri/src/modules/stage/` | Tabletop RPG Engine (Two-Tier GM Pipeline: Action Planner & Storyteller, Szenen-Manager, Party HUD, Rest-Mechanik, d20/d100/2d6, DC-Check, Clocks, Kampf & Markdown-Export) |
| `src-tauri/src/modules/companion.rs` | Neurohormone (EMA), EmotionState, Schlaf/Einsamkeit, Scratchpad & Goals mit Safety-Countdown |
| `src-tauri/src/modules/companion_tools.rs` | Echte Desktop-Tools: DuckDuckGo-Suche, URL-Opener, xcap Screenshot, Clipboard, MPRIS, GUI-Actions, Web-Reader, Sandboxing & File-Organizer |
| `src-tauri/src/modules/mcp_client.rs` | Model Context Protocol (MCP) JSON-RPC 2.0 Client (stdio & HTTP/SSE) & Skript-/Binary-Pluginloader |
| `src-tauri/src/modules/providers.rs` | LLM Provider Abstraktion (OpenRouter, Anthropic Messages API, OpenAI, DeepSeek, Gemini, Mistral, Custom) |
| `src-tauri/src/modules/llm_presets.rs` | LLM Sampler Presets Engine mit 5 Built-in Profilen & JSON-Persistenz |
| `src-tauri/src/modules/models_hub.rs` | Hugging Face GGUF API-Suche, Quants-Inspektion & Async File Downloader |
| `src-tauri/src/modules/voice.rs` | TTS-Provider, natives whisper.cpp-STT, OpenAI-kompatible Transkription, RVC-Sidecar & Stimmenprofile |
| `src-tauri/src/modules/kokoro.rs` | Native Offline-Kokoro-82M-Inferenz via ONNX Runtime, Engine-Cache, WAV-Encoding, Stimmen-Scan und atomarer Modell-Installer |
| `src-tauri/src/modules/soul_hub.rs` | Soul Hub Backend (Soul Gateway, Chub AI Integration mit Lorebook-Extraktion, Lorebooks- & Szenarien-Registries) |
| `src-tauri/src/state.rs` | Globaler Tokio/Tauri `AppState` |
| `src-tauri/src/commands/` | Tauri IPC Commands, nach Bereichen (`chat.rs`, `llm.rs`, `voice.rs`, …) |
| `src-tauri/tests/gpu_e2e.rs` | GPU-Tests mit echten Modellen (`--ignored`): TTS mit Whisper-Rückerkennung, Bildmodelle mit VRAM-Messung |
| `src-tauri/src/lib.rs` | App Builder, Dialog-Plugin & Handler-Registrierung |

### Frontend (`src/`)
| Pfad | Zweck |
|---|---|
| `src/types/index.ts` | Shared TypeScript Typdefinitionen |
| `src/services/api.ts` | Getypte Wrapper für alle Tauri IPC-Commands |
| `src/services/soundFx.ts` | Autarker Web Audio SFX-Synthesizer |
| `src/store/useAppStore.ts` | Zentraler Zustand State Store mit initApp, dyn. Pfaden & Scans |
| `src/components/Header.tsx` | VRAM-Monitor, Server-Status und globale Aktionen |
| `src/components/Sidebar.tsx` / `src/components/navigation.ts` | Gruppierte Hauptnavigation, Tastaturkürzel und gemeinsame Navigationskonfiguration |
| `src/components/CommandPalette.tsx` | Durchsuchbare globale Befehlspalette (`Strg/Cmd+K`) für Ansichten, Logs und Updates |
| `src/components/ui/` | Theme-fähige UI-Primitive: Button, IconButton, Tabs, Select, Toggle, Slider, Tooltip, Dialoge und Feedback |
| `src/components/chat/ChatView.tsx` | Split-Screen Chat & Avatar, Streaming-Blase |
| `src/components/chat/MessageList.tsx` | Virtualisierter, memoisierter Verlauf (`@tanstack/react-virtual`); `ChatMessageItem` mit Swipes, Edit, Continue, Regenerate, Übersetzung, Anhängen |
| `src/components/chat/ChatComposer.tsx` | Eingabefeld mit eigenem Entwurf, Anhänge (Büroklammer/Einfügen), Kontextanzeige |
| `src/components/chat/ChatSidebar.tsx` | Slide-out Drawer: Multi-Chat Sitzungen, Author's Note mit Tiefe, „Bisherige Handlung“ (Zusammenfassung), 11 HUD-Presets & JSONL Import/Export |
| `src/components/chat/RoleplayMessage.tsx` | Trennung von Handlungen (*...*) und gesprochenem Wort ("...") |
| `src/components/chat/AdaptiveHud.tsx` | Charakter-Switcher, Persona-Badge & Zuneigungs-/Statusleiste |
| `src/components/chat/CognitiveMemoryDrawer.tsx` | Seelenspeicher-Inspektor (SQLite) |
| `src/constants/hudPresets.ts` | 11 Rollenspiel-HUD Presets (Romance, RPG, Survival, Horror, Cyberpunk, Slice of Life, etc.) |
| `src/utils/stateParser.ts` | Regex-Extractor für `<state>{...}</state>`, Tag-Stripper & State-Variable Merger |
| `src/components/characters/CharacterLibraryView.tsx` | Charakterbibliothek mit Kachel-Galerie, Suche & Tag-Filtern |
| `src/components/characters/CharacterEditorModal.tsx` | SillyTavern V2 Editor mit PNG/JSON Export & Avatar-Picker |
| `src/components/characters/PersonaManagerModal.tsx` | User-Personas Verwaltung ({{user}}-Makro) |
| `src/components/lorebook/LorebookView.tsx` | Lorebook-Manager & Editor mit JSON-Import/Export, Filtern und Tag-Verwaltung |
| `src/components/avatar/VrmViewer.tsx` | Three.js 3D VRM Player mit LipSync |
| `src/components/avatar/Live2DViewer.tsx` | PixiJS Live2D Cubism Viewer mit automatischer Skalierung, Blinzeln und Voice-LipSync via AudioPlayer FFT |
| `src/components/stage/StageView.tsx` | Tabletop RPG Dashboard, Two-Tier GM Feed, Würfel-Integration & Welten-Zustand |
| `src/components/stage/PartyHeader.tsx` | Party HUD mit HP-, MP-, Level- und Zustands-Badges für bis zu 4 Charaktere |
| `src/components/stage/SceneLobbyModal.tsx` | Szenen-Lobby zur Auswahl, Neuanlage und Löschung von RPG-Szenen |
| `src/components/stage/SceneCreateModal.tsx` | Erstellungs-Modal für Szenen (Titel, Genre, Ziel, Schwierigkeit, Party-Auswahl) |
| `src/components/stage/StageChatLog.tsx` | Ereignis- & Narrations-Feed des GM mit Würfelwürfen und Aktions-Karten |
| `src/components/stage/StageEventCardView.tsx` | Interaktive Aktions- und Entscheidungskarten für Spielerzüge |
| `src/components/stage/TurnControlBar.tsx` | Runden- & Aktionsleiste (Angriff, Fertigkeit, Zauber, Rast, Flucht) |
| `src/components/stage/ClockWidget.tsx` | SVG Tortendiagramm für Spannungs-Uhren |
| `src/components/stage/DiceRoller.tsx` | Interaktiver Würfelroller mit SG-Prüfung |
| `src/components/stage/EncounterTracker.tsx` | Initiativleiste, Kampfbegegnung & HP-Tracker |
| `src/components/stage/StageCampaignPanel.tsx` | Kampagnen-Übersicht, Inventar & Beziehungsübersicht |
| `src/components/hub/SoulHubView.tsx` | 4-teiliger Community-Hub (Soul Gateway, Chub AI, Welt-Lorebooks, Soul Stage Szenarien) |
| `src/components/companion/CompanionView.tsx` | Desktop-Agent Dashboard (6 Tabs: Bio, Scratchpad, Ziele, Tools, MCP/Plugins, Overlay) |
| `src/components/companion/FloatingCompanionOverlay.tsx` | Transparentes, rahmenloses Floating-Companion-Widget mit Sprechblase, Mini-Gauges & Click-Through |
| `src/components/companion/SafetyCountdownBanner.tsx` | 25s Human-in-the-Loop Sicherheitsbanner |
| `src/components/settings/SettingsView.tsx` | Einstellungs-Tabs: Erscheinungsbild, llama-server (inkl. Laufzeiten, `mmproj`), Cloud-Anbieter (inkl. Kontextgröße), Sampler, Prompt (`PromptSettings.tsx`), Modell-Hub |
| `src/components/integrations/tabs/LocalImageSettings.tsx` | Lokale Bildgenerierung: Laufzeit, Modellkatalog, VRAM-Strategie |
| `src/components/voice/LocalTtsSettings.tsx` | Lokale TTS: Laufzeit, Modelle, Stimmklone (Aufnahme/Upload, Einwilligung) |
| `src/components/voice/CharacterVoiceModal.tsx` | Charakterbezogene TTS/STT-, Audiogeräte-, VAD- und RVC-Konfiguration |
| `src/components/voice/VoiceCallControls.tsx` | Push-to-talk und Voice-Call-Zustandsautomat mit Unterbrechung |
| `src/services/audioPlayer.ts` | Unterbrechungssichere Web-Audio-Warteschlange, Geräteauswahl, Gain & FFT-Amplitude |
| `src/services/streamingTts.ts` | Satzsegmentierung während des LLM-Streams und geordnete TTS-Synthese |
| `src/services/voiceCapture.ts` | Mikrofonaufnahme, Resampling (16 kHz STT, 24 kHz Stimmklone) und lokale RMS-VAD |
| `src/store/helpers.ts` | `resolvePromptWithLore` (System-Prompt + Nachspann), `llmTarget` (Endpunkt der aktuellen Modellwahl) |
| `e2e/` | Rauchtest (`smoke.mjs`), Langchat-Messung (`perf-long-chat.mjs`), Mock-LLM und Harness mit Wegwerf-Profil |

---

## 🗃️ 5. Assets & Verzeichnisse

- **Lokale GGUF-Modelle (Entwicklung):** `assets/models/` (gitignored). Installierte Apps laden Modelle über den
  Modell-Hub nach `<Daten>/models/`; Ternary-Bonsai-Modelle (`PQ2_0`/`PTQ1_0`) brauchen die PrismML-Laufzeit.
- **Laufzeiten:** werden in der App nach `<Daten>/runtimes/` geladen (`llama.cpp`, `prism`, `sd.cpp`, `crispasr`);
  `bin/cuda/` und `bin/prism-cuda/` (gitignored) sind nur noch Entwickler-Fallbacks.
- **Bild- und TTS-Modelle:** `<Daten>/image-models/`, `<Daten>/tts-models/`, Stimmklone in `<Daten>/voices/`.
- **Mitgelieferte Inhalte:** `presets/` (V2-Karten als PNG/JSON, Lorebooks, Stage-Szenen), `assets/vrm/`,
  `assets/live2d/`, `assets/emotions/`; Lizenzen der VRMs in `assets/vrm/lizenzen.txt`.
- **Datenverzeichnis `<Daten>`:** `directories::ProjectDirs` (Linux `~/.local/share/otakusoul/`), mit `OTAKUSOUL_HOME`
  stattdessen `$OTAKUSOUL_HOME/data`. Darin u. a. `characters/`, `lorebooks/`, `personas/`, `scenes/`, `attachments/`,
  `runtimes/`, `otakusoul.db`, `.trash/`; natives Kokoro unter `models/kokoro/`.
- **Testhardware:** Die GPU-Tests liefen mit einer 16-GB-NVIDIA-Karte neben einer AMD-iGPU. Solche iGPUs melden
  Dutzende GB geteilten Speicher – Modelle deshalb immer auf die dedizierte Karte festlegen (siehe Tipps).

---

## 🧭 6. Stand

Die Phasen 1–18 der ursprünglichen Roadmap sind abgeschlossen; Details und Commits stehen in
`Roadmap_abgeschlossen.md`. Kurz: Toolchain & Hardware-Erkennung (1–2), Character Cards V2 & Lorebooks (3, 12),
VRM/Live2D-Avatare (4, 14), Soul Memory mit kognitiver Pipeline (5, 11), Soul Stage als KI-Game-Master (6, 15),
Soul Companion als Desktop-Agent mit MCP (7, 16), Datenfundament & Bibliothek (8), Chat mit Swipes & HUD-Presets (9),
LLM-Provider & Sampler (10), Stimme/TTS/STT/Voice Call (13), Web-Client, Discord, Bilder, Soul Hub & Backups (17),
i18n, Themes, Logging, Updater & Paketierung (18).

Die laufende Weiterentwicklung steht in `ROADMAP.md` (Detailstand je Punkt) und `Roadmap_TTS.md`; die wichtigsten
Ergebnisse nach Phase 18:

- [x] **Laufzeiten in der App:** llama.cpp, PrismML-Fork (Ternary Bonsai), stable-diffusion.cpp und CrispASR werden aus
  den GitHub-Releases geladen und per SHA-256 geprüft; signierte In-App-Updates (`tauri-plugin-updater`).
- [x] **Lokale Bildgenerierung (stable-diffusion.cpp):** Katalog SDXL/FLUX.1/Qwen-Image/FLUX.2 mit gestuftem VRAM-Planer
  und Tausch des Chat-Modells; auf einer 16-GB-Karte getestet (SDXL 28 s, FLUX.1 48 s, Qwen-Image 73 s, FLUX.2 248 s).
- [x] **Lokale Sprachausgabe (CrispASR):** Qwen3-TTS CustomVoice/1.7B-Klon, Chatterbox, Kokoro DE, F5-TTS (nur
  nicht-kommerziell); Stimmklonen mit Einwilligung, KI-Kennzeichnung; mit Whisper-Rückerkennung getestet.
- [x] **Hardware:** AMD/Intel über Vulkan, iGPU-Erkennung, Festlegung von `sd-server`/`llama-server` auf die dedizierte GPU.
- [x] **Chat:** Kontextfenster-Management, automatische Zusammenfassung, System-Prompt-Editor mit Vorlagen und
  V2-Karten-Overrides, Datei-Anhänge mit Vision (`mmproj`), Übersetzung, virtualisierter Verlauf (1000 Nachrichten flüssig).
- [x] **Tests:** E2E-Rauchtest mit `tauri-driver` und Mock-LLM, Langchat-Messung, GPU-Tests mit echten Modellen.

---

## 💡 7. Tipps für zukünftige Erweiterungen & Best Practices

- **SillyTavern Swipes-Prinzip:** Swipes werden im SQLite-Feld `swipes_json` als Array von `{ content, thought }` gespeichert. Ein `swipe_index` markiert die aktive Variante. Das Erzeugen eines neuen Swipes („Neu generieren“) überschreibt niemals die bisherigen Varianten, sondern hängt eine neue an und setzt den Index auf das Ende.
- **State Parsing (`<state>` Tags):** Rollenspiel-Modelle können via System-Prompt angewiesen werden, Status-Änderungen am Ende der Nachricht als `<state>{"Affection": 55}</state>` auszugeben. Der Parser in `src/utils/stateParser.ts` fängt diese Tags ab, aktualisiert die Zustand-Variablen und entfernt den Tag restlos aus der sichtbaren Blase, damit der Rollenspielfluss unberührt bleibt.
- **Reasoning-Unterdrückung im Rollenspiel:** Wie in *Soul of Waifu* ist der Reasoning-Modus standardmäßig **deaktiviert**, um lästige interne Denkmonologe zu unterbinden und die Generierung maximal zu beschleunigen. Bei `reasoning_mode = false` übergibt `llama_manager` die Flags `--reasoning off --reasoning-budget 0`, sendet `enable_thinking: false` und der System-Prompt untersagt `<think>`-Tags explizit. Umschaltbar über den Schnellschalter im Chat-HUD (`AdaptiveHud.tsx`) oder in den Einstellungen.
- **KV-Cache Quantisierung:** Mit `--cache-type-k q8_0` und `--cache-type-v q8_0` lässt sich der VRAM-Bedarf für lange Kontextfenster (16k–32k Tokens) etwa halbieren, ohne spürbare Einbußen bei der Generierungsqualität.
- **Anthropic Messages Streaming:** Anthropic nutzt SSE Events (`content_block_delta`), bei denen das Text-Delta unter `delta.text` liegt, während OpenAI/v1/chat/completions das Delta unter `choices[0].delta.content` platziert. Die `ProviderRegistry` normalisiert beide Formate transparent auf das einheitliche `llm-token` Event in Tauri.
- **Streaming-Listener & React-Lifecycle:** Asynchrone Tauri-Listener (`listen(...)`) müssen zwingend mit einem `isSubscribed`-Guard gekapselt werden, damit bei unmounted Components / React StrictMode keine Geister-Listener verbleiben, die Tokens doppelt empfangen.
- **Mobile Viewports (iOS/Android):** Alle UI-Container nutzen Flex/Grid und sind vorbereitet für Touch-Gesten und responsive Breakpoints (`sm:`, `lg:`).
- **VRAM & mehrere GPUs:** Vor jedem Bild prüft `local_image::plan`, ob alles passt (gemessen per `nvidia-smi`/Vulkan,
  sonst geschätzt); entladen wird nur, wenn nötig – erst das kleine TTS-Modell, dann das Chat-Modell. Bei iGPU +
  dedizierter Karte verteilen sd.cpp und llama.cpp sonst nach freiem Speicher, und die iGPU gewinnt (FLUX.1: 350 s statt
  48 s) – deshalb `--backend`/`--device` über `hardware::primary_gpu()` und `same_gpu()`.
- **Kontextfenster:** Gekürzt wird im Command `send_chat_message`, nicht im Frontend. System-Nachrichten (Prompt, Author's
  Note, Nachspann) bleiben immer, ebenso die letzte Nicht-System-Nachricht; Bilder zählen pauschal 1000 Tokens. Die
  Zusammenfassung startet erst ab 6 herausgefallenen Nachrichten und läuft im Hintergrund.
- **Anhänge:** `attachments::prepare` macht vor dem Senden aus Text/PDF Nachrichtentext und behält Bilder nur in den
  letzten drei Nachrichten mit Bildern; ohne `mmproj` (lokal) werden Bilder zum Hinweis statt zum Serverfehler.
- **E2E-Tests:** Die Testversion liegt in `target/e2e` (`npm run e2e:build`), weil `cargo test` das normale
  `target/debug/otakusoul` ohne eingebettetes Frontend überschreibt. Das Mock-LLM erkennt Chat-Anfragen an „# Role &
  Identity“ – neue Prompt-Vorlagen müssen mit dieser Überschrift beginnen oder das Mock anpassen.
- **Lizenzen & Veröffentlichung:** Das Repo ist öffentlich. Modelle werden nie mitgeliefert, sondern von der Quelle geladen;
  nicht-kommerzielle Modelle bleiben ausgeblendet/gesperrt, bis man sie freischaltet. Kein Python in der App.
- **Tool Calling Erweiterung:** Neue Tools können direkt in `src-tauri/src/modules/companion.rs` in `execute_internal` registriert werden. Deklariere gefährliche Operationen in `is_dangerous`, damit der 25s Sicherheits-Countdown automatisch greift.
