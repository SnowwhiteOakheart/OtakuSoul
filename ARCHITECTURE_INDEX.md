# 📑 OtakuSoul Architektur- & Modul-Index (Tokensparende Schnellreferenz)

> **Zweck für AI-Agenten:** Dieses Dokument dient als tokensparende Schnellreferenz für die gesamte OtakuSoul-Applikation (`OtakuSoul`). Die ausführlichen technischen Stolperfallen liegen modular in [`docs/ai/`](docs/ai/), während [`AI.md`](AI.md) nur noch die kompakten Kernregeln, Befehle und eine Modul-Übersicht enthält – so lädt ein Agent gezielt nur das jeweils betroffene Subsystem.

---

## ⚡ Kernregeln auf einen Blick

* **Architektur:** Tauri 2 (Rust-Backend) + React 19 / TypeScript / Vite / Tailwind 4 / Zustand.
* **ONNX:** `modules/onnx_runtime.rs` verwaltet die von `AppState` gehaltene gemeinsame Umgebung für Kokoro, VAD und Porträts. Kokoros rc.15-Portierung liegt in `src-tauri/vendor/kokoro-en/` mit Herkunfts- und Patchdokumentation.
* **PDF-Anhänge:** `vendor/pdf-extract` behält die bisherige Extraktion bei und verwendet lopdf 0.47 ohne ttf-parser. Herkunft und minimale Portierung stehen in `OTAKUSOUL-PATCH.md`; Kokoros altes Bincode-Format wird durch `cu-bincode` gelesen.
* **Kein Python in der App:** Die Desktop-App ist 100 % Rust & TypeScript (Portierung von *Soul of Waifu* ist vollständig entkoppelt).
* **Benutzer-Anrede & Sprache:** Nutzer immer mit **„Du“** ansprechen. Antworten, Commits und Dokumentation auf Deutsch.
* **Pfade:** Niemals feste Systempfade hardcoden – ausschließlich `paths::base_dirs()` nutzen (`ProjectDirs` bzw. `$OTAKUSOUL_HOME/config|data`). Betriebssystemspezifischen Code immer mit `#[cfg]` absichern.
* **Git & Commits:** Thematische Commits direkt auf `main` (`feat(bereich): …` auf Deutsch), danach sofort `git push`. Keine fremden, uncommitteten Änderungen mitcommitten.
* **Roadmap-Pflege:** Erledigte Punkte in `roadmap.md` abhaken und nach `roadmap_abgeschlossen.md` verschieben (nur lokal, gitignored).
* **Modell-Downloads:** Modelle von der Quelle laden (SHA-256), Lizenzen beachten (`license_kind`). Ausnahme: 1–2 Avatare/Puppen je Art dürfen mitgeliefert werden, wenn Lizenz und Größe es erlauben (mit `lizenzen.txt` + README-Hinweis); der Rest kommt als Registry-Eintrag ins Daten-Repo. LLM-/TTS-/Bild-Gewichte nie.

---

## 🛠️ Wichtigste Entwickler-Befehle

| Zweck | Befehl | Bemerkung |
|---|---|---|
| **App starten (Dev)** | `npm run tauri dev` (Linux: `npm run tauri:linux`) | Startet Vite-Frontend + Rust-Backend |
| **Alle Prüfungen** | `npm run check` | Führt Oxlint, TypeScript TypeCheck, Vitest, Rustfmt, Clippy und Cargo Test aus |
| **Schneller Pre-Check** | `npm run check:fast` | Nur `docs:check`, Oxlint, `tsc --noEmit` und `cargo check --message-format=short` |
| **Doku-Links prüfen** | `npm run docs:check` | Prüft Verweise in `AI.md` & `ARCHITECTURE_INDEX.md` auf `docs/ai/*.md` |
| **Übersetzungen prüfen** | `npm run i18n:check [-- datei.json]` | Fehlende/unbekannte Schlüssel, Platzhalter gegen `de.json` |
| **Typen synchronisieren** | `npm run types:gen` | Generiert TS-Typen aus Rust via `ts-rs` nach `src/types/generated/` |
| **E2E-Rauchtest (Mock-LLM)** | `npm run e2e` (`npm run e2e:run` ohne Build) | Baut nach `target/e2e`, nutzt tauri-driver + Mock-LLM; gezielt: `npm run e2e:filter -- [--build\|--list] <muster>` |
| **Perf-Messung** | `npm run e2e:perf` | Langchat-Stresstest (1.000 Nachrichten) |
| **Screenshots erstellen** | `xvfb-run -a node e2e/readme-screenshots.mjs de\|en\|ru` | Erstellt UI-Screenshots unter `docs/assets/screenshots/<lang>/` |
| **README-Animation** | `node e2e/readme-demo.mjs de\|en\|ru` | GIF-Rundgang nach `docs/assets/demo/<lang>.gif` (braucht `ffmpeg`; Linux mit `xvfb-run -a`, Windows mit `tauri-driver` + passendem `msedgedriver` im PATH) |
| **Story-Musik ohne App** | `python tools/story_music.py plan\|generate\|ship SZENE.json …` | Plan, ACE-Step-Erzeugung und MP3-Auslieferung nach `otakusoul-data`; siehe `docs/stage_music.md` |
| **GPU-Tests (Real)** | `cargo test --test gpu_e2e -- --ignored --nocapture` in `src-tauri/` | Nur auf Wunsch, lädt reale Modelle aus `assets/models` |

---

## 🗺️ System-Architektur & Modul-Landkarte

### 1. Rust-Backend (`src-tauri/src/`)
* **Einstieg & Zustand:** `lib.rs` (Plugins, Handler-Registrierung), `state.rs` (`AppState`), `paths.rs` (`base_dirs`, Daten- und Konfigpfade).
* **IPC-Befehle (`commands/`):** Schnittstelle zum Frontend über `tauri::command` (z. B. `chat.rs`, `characters.rs`, `stage.rs`, `runtimes.rs`, `memory.rs`, `settings.rs`, `lorebook.rs`, `hub.rs`).

| Bereich | Kern-Module (`modules/`) | Aufgabe / Verantwortung |
|---|---|---|
| **Inferenz & Chat** | `inference.rs`, `providers.rs`, `prompt_builder.rs`, `context_window.rs`, `chat_summary.rs`, `attachments.rs`, `translate.rs`, `chat_tools.rs` | LLM-Streaming (SSE, `<think>`-Filter), Provider-Routing (llama-server, Anthropic, OpenAI), Prompt-Zusammenbau, Token-Zählung. |
| **Lokale Server & Runtimes** | `runtimes.rs`, `llama_manager.rs`, `local_image.rs`, `tts_local/` (`catalog.rs`, `engine.rs`, `downloads.rs`, `cloning.rs`, `models.rs`), `model_files.rs`, `segmented_download.rs`, `gguf.rs`, `hardware.rs`, `image_loras.rs` | Verwaltung, Download und Ausführung lokaler Binaries (llama.cpp, sd.cpp, CrispASR, PrismML), VRAM-Schätzung, GPU-Zuweisung. |
| **Gedächtnis & Daten** | `memory/` (`chats.rs`, `soul.rs`, SQLite), `memory_pipeline/` (`prompts.rs`, `models.rs`, `json.rs`, `runner.rs`, `cleanup.rs`), `settings.rs`, `characters/` (`models.rs`, `png.rs`, `storage.rs`, `wizard.rs`), `lorebook.rs`, `profile_backup.rs`, `device_sync.rs`, `secrets.rs` | SQLite-Datenbank (`otakusoul.db`), Kognitives Gedächtnis, Episodisches Gedächtnis, V2-Charakterkarten (PNG/JSON), Lorebooks, Backups und Sync zwischen Geräten (Ordner/WebDAV). |
| **Stage & 5e Engine** | `stage/` (`director.rs`, `engine.rs`, `turn/`, `scenes.rs`, `combat5e.rs`, `explore5e.rs`, `party.rs`, `npc.rs`, `world.rs`); Regeln und deterministischer Kampf-/Erkundungsablauf (`fight/`, `exploration.rs`, Sicht `Table`) im Crate `crates/otakusoul-rules5e` (als `stage::rules5e` re-exportiert; `combat5e.rs`/`explore5e.rs` behalten LLM, Erzählung, Speichern) | Game-Master-Modus, Spielleiter-Orchestrierung, D&D 5e-Regelsystem (Klassen, Zauber, Kampf, Erkundung, Spielbrett). Das Regel-Crate nutzt auch OtakuSoul-Android über UniFFI (fester Commit). |
| **VRoid Hub** | `vroid_hub.rs` | Anmeldung (OAuth/PKCE, Secret nur im Release-Build), eigene und gelikte VRM-Modelle als `vroid:<id>`, verschlüsselt gespeichert (AES-GCM, Schlüssel im Schlüsselbund), Nutzungsbedingungen je Modell. |
| **Inochi2D-Puppen** | `inochi2d.rs` | Suche, Import, Kopf-Metadaten und Beispiel-Katalog (Aka/Midori, SHA-256) für `.inp`/`.inx`; gerendert wird im Frontend (`src/services/inochi2d/`, Portierung von Inox2D). |
| **Audio, Bild & Begleiter** | `voice/` (`edge.rs`, `tts.rs`, `stt.rs`, `filter.rs`, `config.rs`, `models.rs`), `kokoro.rs`, `stage_music.rs`, `story_music.rs`, `image_generator.rs`, `companion.rs`, `companion_tools.rs`, `mcp_client.rs` | TTS/STT-Audioverarbeitung, Sprachklonen, Bildgenerierung (SD/Flux), MCP-Client und Werkzeuge des Desktop-Gefährten. |
| **Sprachen & Lokalisierung** | `ui_locales.rs`, `content_lang.rs` | 3-Ebenen-Auflösung für UI-Sprachen (Presets, Hub-Cache, User-Verzeichnis mit Hot-Reload), `_template.json`, Trennung von UI- und Inhalts-/Spieltexten (`content_lang`), Tray-Lokalisierung. |
| **Hub, NSFW & Synchronisation** | `hub/` (`catalog.rs`, `characters.rs`, `chub.rs`, `http.rs`, `models.rs`, `pins.rs`), `hub_installed.rs`, `models_hub.rs`, `updater.rs`, `nsfw.rs`, `web_server.rs`, `discord.rs` | Online-Abgleich mit `otakusoul-data` (und NSFW-Hub `otakusoul-data-nsfw`), Revisionsprüfung von Inhalten, FSK18/NSFW-Tagging & Filterung, Web-Server, Discord Rich Presence. |

### 2. React-Frontend (`src/`)
* **API-Brücke:** `services/api.ts` (Re-Export über Domänenmodule `services/api/*.ts` mit typsicheren Wrappern um alle Tauri `invoke`-Befehle).
* **Zustandsverwaltung (Zustand):** `store/slices/*.ts` (`chatSlice.ts` komponiert über `store/slices/chat/*.ts`, plus `stageSlice.ts`, `characterSlice.ts`, `settingsSlice.ts`, `avatarSlice.ts`, `memorySlice.ts`). Zugriff per `useStoreFields('fieldA', 'fieldB')`.
* **Prompt & Lore Hilfsfunktionen:** `store/helpers.ts` (`resolvePromptWithLore`, `llmTarget`).
* **Internationalisierung & 3-Ebenen-Sprachauflösung:**
  * **Ebene 1 (Mitgelieferte Presets):** `presets/locales/ui/{de,en,ru,ja}.json` (fest im App-Bundle integriert, Deutsch dient als TypeScript-Typquelle `TranslationKey`).
  * **Ebene 2 (Hub-Cache):** `<Daten>/locales/ui-hub/*.json` (beim Start synchronisiert aus `otakusoul-data/locales/ui/` per `locales/ui_registry.json`; aktualisiert mitgelieferte Sprachen nur bei höherer `__meta.version`; Event `ui-languages-changed` stößt `refreshLanguages` an).
  * **Ebene 3 (Eigene/Community-Sprachen):** `<Daten>/locales/ui/*.json` (Hot-Discovery ohne Build, Import über `import_ui_language` in Einstellungen, Löschen per `remove_ui_language` in Papierkorb; übersteuert Ebenen 1 & 2).
  * **Format & Fallback-Kette:** Flache JSON-Paare mit Pflicht-Header `__meta` (`id`, `name`, `englishName`, `author`, `version`, optional `fallback`). Fallback-Kette: `Aktive Sprache → __meta.fallback → Englisch (en) → Deutsch (de) → Schlüsselname`. Inhalte (Karten, Szenen, NPCs, Lorebooks, Hub-Einträge) fallen ohne eigene Übersetzung ebenfalls auf Englisch zurück, nur in ihrer Ausgangssprache bleibt der Grundtext. Dynamisches Laden über `i18n/registry.ts` (`loadLocale`), `availableLanguages` aus Store.
  * **Trennung UI vs. Spieltexte:** UI-Texte in `presets/locales/ui/` vs. Inhalts-/Spiel-/D&D-Texte in `presets/locales/<kürzel>.json` (vom Backend per `content_lang.rs` verwaltet und mit `<Daten>/locales/` synchronisiert).
  * **Werkzeuge:** `npm run i18n:check [-- datei.json]` prüft Vollständigkeit & Parameter; `open_ui_locales_folder` legt automatisch `_template.json` als Vorlage im User-Verzeichnis an.

| UI-Bereich | Komponenten (`components/`) | Beschreibung |
|---|---|---|
| **Chat** | `chat/` (`ChatView.tsx`, `MessageList.tsx`, `ChatComposer.tsx`, `ChatSidebar.tsx`, `PromptHitsView.tsx`) | Haupt-Chatansicht, virtualisierte Nachrichtenliste, Eingabefeld, Modell-Auswahl, Swipes. |
| **Stage (Rollenspiel)** | `stage/` (`StageView.tsx`, `Combat5ePanel.tsx`, `StageBattleMap.tsx`, `Explore5ePanel.tsx`, `StoryGallery.tsx`) | Rollenspiel-Interface, interaktives Spielbrett (Battlemap), 5e-Kampfpanel, Erkundungs-HUD. |
| **Avatare & 3D** | `avatar/` (`AvatarCanvas.tsx`, `VrmViewer.tsx`, `GltfViewer.tsx`, `MmdViewer.tsx`) & `avatars/` (`AvatarManagerView.tsx`) | 3D-Bühne (`avatar/avatarStage.ts`), VRM, GLB/glTF, MMD (PMX/VMD), Gesten, Gesichts-Morphs & Knochen. |
| **Inochi2D-Laufzeit** | `services/inochi2d/` (`inp.ts`, `puppet.ts`, `renderer.ts`, `controls.ts`), `avatar/Inochi2dViewer.tsx` | Eigene WebGL2-Laufzeit für Inochi2D-Puppen: Masken, Composites, Mesh-Gruppen, Physik, Lippen/Blick/Emotionen über Parameternamen. |
| **Charaktere** | `characters/` (`CharacterPreviewModal.tsx`, `CharacterVoiceModal.tsx`, `Character5eSheet.tsx`) | Charakterkarten-Vorschau, Stimmzuweisung, 5e-Charakterbogen. |
| **Einstellungen & Hub** | `settings/` (`sections/*`), `hub/` (`HubView.tsx`), `onboarding/` (`OnboardingParts.tsx`) | Expertenmodus, Server- & Provider-Tuning, Hub-Katalog, Ersteinrichtungs-Assistent. |

---

## 🧭 Themen-Navigator: Modulare Subsystem-Dokus (`docs/ai/`)

Wenn Du an einem bestimmten Subsystem arbeitest, lies gezielt die zugehörige Datei unter [`docs/ai/`](docs/ai/) statt unnötigen Gesamtkontext zu laden:

| Thema / Subsystem | Relevante Quellcode-Dateien | Detail-Dokument | Wichtigste Aspekte |
|---|---|---|---|
| **Sprachdateien, UI-Regeln & Lifecycle** | `src-tauri/src/modules/ui_locales.rs`<br>`src-tauri/src/modules/content_lang.rs`<br>`src-tauri/src/lib.rs`<br>`presets/locales/ui/*.json`<br>`src/i18n/` | [`docs/ai/app-ui-i18n.md`](docs/ai/app-ui-i18n.md) | 3-Ebenen-i18n, `ContentLang::t`, Store-Fehler, WCAG-Kontrast, `ModalOverlay`, `close_to_tray`, `target/e2e`, `commandCheck` & `wireCheck`, `read_file_binary`. |
| **Chat-Pipeline, Prompt & Proaktivität** | `src-tauri/src/modules/inference.rs`<br>`src-tauri/src/modules/group_chat.rs`<br>`src/store/slices/chatSlice.ts`<br>`src/store/slices/chat/` | [`docs/ai/chat-pipeline.md`](docs/ai/chat-pipeline.md) | Streaming-Lifecycle, `generationId`, Gruppen-Chats, JSONL, Regex/ST-Presets, Makros, `stable_cut`, Abbrüche (`with_abort`), Proaktivität/Träume/Off-Screen. |
| **Lokale Server, GPU/VRAM, Audio & TTS** | `src-tauri/src/modules/llama_manager.rs`<br>`src-tauri/src/modules/runtimes.rs`<br>`src-tauri/src/modules/tts_local/`<br>`src-tauri/src/modules/voice/` | [`docs/ai/hardware-models-audio.md`](docs/ai/hardware-models-audio.md) | VRAM-Planer, KV-Cache (`q8_0`), `acestep.cpp`, LoRAs, `mmproj`, Downloads (`segmented_download`), Onboarding, ONNX/Kokoro, Edge-TTS, Stimmklonen, Barge-In, Silero VAD. |
| **Stage, GM, D&D 5e, Replay & Webtoon** | `src-tauri/src/modules/stage/`<br>`crates/otakusoul-rules5e/`<br>`src/components/stage/` | [`docs/ai/stage-and-5e.md`](docs/ai/stage-and-5e.md) | `stage-stream`, Musik, `director.rs`, NPCs, Story-Galerie, deterministische 5e-Engine (UniFFI-Vertrag für Android), Spielbrett, Zauber, Erkundung, HTML/EPUB-Replay, Webtoon. |
| **3D-Avatare, Inochi2D & 2D-Porträts** | `src/components/avatar/`<br>`src/components/avatars/`<br>`src/components/avatar/avatarStage.ts`<br>`src/services/inochi2d/`<br>`src-tauri/src/modules/inochi2d.rs` | [`docs/ai/avatars-and-inochi2d.md`](docs/ai/avatars-and-inochi2d.md) | VRM, glTF-Eigenanimationen & `clipFit`, MMD, Avatar-Manager & Cache, VRoid Hub, `MorphingPortrait` (keine CSS-Endlosanimationen), Inochi2D-WebGL2, Avatar-Berührung. |
| **Gedächtnis, SQLite & Device-Sync** | `src-tauri/src/modules/memory/`<br>`src-tauri/src/modules/memory_pipeline/`<br>`src-tauri/src/modules/device_sync.rs`<br>`src/store/slices/memorySlice.ts` | [`docs/ai/memory-sqlite.md`](docs/ai/memory-sqlite.md) | Transaktionen & `*_on`-Helfer, FTS5 (`recall.rs`), Migrationen v4–v11, `superseded_at`, Vorhaben, Cleanup, Atlas, Tagebuch, Zweige (`@branch-`), `lenient`-Router-JSON. |
| **Hub, NSFW & Beiträge** | `src-tauri/src/modules/hub/`<br>`src-tauri/src/modules/nsfw.rs`<br>`src-tauri/src/modules/contribution.rs`<br>`src/components/hub/` | [`docs/ai/hub-nsfw-import.md`](docs/ai/hub-nsfw-import.md) | `pin_latest_commits`, 18+/NSFW-Ausblendung, `[emotion: NAME]` & Cues, Hub-Updates, Sammlungen & Virtualizer-Performance, Charakter-Importe, Beitrag (B4). |
| **Companion, Desktop-Pet & Overlay** | `src-tauri/src/modules/companion.rs`<br>`src-tauri/src/modules/desktop_windows.rs`<br>`src-tauri/src/modules/web_server.rs`<br>`src/components/companion/DesktopPet.tsx`<br>`src/components/companion/pet/` | [`docs/ai/companion-pet-overlay.md`](docs/ai/companion-pet-overlay.md) | `execute_code`, Befehlspalette, Companion-HITL, Desktop-Pet (Sitz-/Gehposen, Fenster-Scan, XWayland/KWin-Bridge), OBS-Streaming-Overlay (`/overlay`). |

---

## 🔄 Cross-Repository Synchronisation (`OtakuSoul` ↔ `otakusoul-data`)

Einige Inhalte in `OtakuSoul` sind gebündelte Standard-Kopien (Bundles) aus dem Inhalts-Repository [`otakusoul-data`](../otakusoul-data/). Vor Änderungen an diesen Inhalten immer prüfen, wo die primäre Quelle gepflegt wird:

| Datei / Verzeichnis in `OtakuSoul` | Primäre Quelle (`otakusoul-data` / `otakusoul-data-nsfw`) | Synchronisations- & Update-Mechanismus |
|---|---|---|
| `presets/locales/{de,ru,ja}.json` (Spieltexte; jede Datei = Sprache) | `locales/<kürzel>.json` | `content_lang::refresh_locales` lädt bei App-Start nach `<Daten>/locales/` |
| `presets/locales/ui/*.json` (Oberflächensprachen) | `locales/ui/*.json` + `locales/ui_registry.json` | `ui_locales::refresh_hub` lädt beim Start nach `<Daten>/locales/ui-hub/` (mitgelieferte Sprachen nur bei höherer `version`) |
| `presets/recommended_models.json` | `recommended_models.json` | `model_catalog::refresh` lädt bei App-Start neuere Versionen nach |
| `presets/inochi2d_registry.json` | `inochi2d_registry.json` | `inochi2d::refresh_registry` lädt bei App-Start neuere Versionen nach (Puppen nur per Quelle + SHA-256) |
| `presets/characters/*` | – (nur in der App: Einsteigerfiguren Shiori Amane, Sota Minase, Lirwen, Faelion) | Frühere Presets liegen nur noch im Hub: Ayu Ikue und Cosmos (`presets/sakura-succubus-3/`), Emilia (`presets/re-zero/`), jeweils über `soul_registry.json` / `cards_gateway/` |
| `presets/stories/scenes/*` | `stages_gateway/*.json` | Werden im Hub über `stages_registry.json` bezogen |
| NSFW-Karten, Stages & Lorebooks | `otakusoul-data-nsfw` (`cards_gateway/`, `stages_gateway/`) | Werden nur bei aktiver 18+-Freigabe über `hub::nsfw_registry_items` eingebunden |
