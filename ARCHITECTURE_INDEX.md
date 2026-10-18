# 📑 OtakuSoul Architektur- & Modul-Index (Tokensparende Schnellreferenz)

> **Zweck für AI-Agenten:** Dieses Dokument dient als tokensparende Schnellreferenz für die gesamte OtakuSoul-Applikation (`OtakuSoul`). Anstatt die vollständige 61 KB große `AI.md` (~15.000 Tokens) bei jeder Aufgabe einzulesen, bietet dieser Index eine strukturierte Übersicht: Kernregeln, Entwicklerbefehle, Modul-Landkarte und einen gezielten Themen-Navigator zu den Stolperfallen in `AI.md`.

---

## ⚡ Kernregeln auf einen Blick

* **Architektur:** Tauri 2 (Rust-Backend) + React 19 / TypeScript / Vite / Tailwind 4 / Zustand.
* **Kein Python in der App:** Die Desktop-App ist 100 % Rust & TypeScript (Portierung von *Soul of Waifu* ist vollständig entkoppelt).
* **Benutzer-Anrede & Sprache:** Nutzer immer mit **„Du“** ansprechen. Antworten, Commits und Dokumentation auf Deutsch.
* **Pfade:** Niemals feste Systempfade hardcoden – ausschließlich `paths::base_dirs()` nutzen (`ProjectDirs` bzw. `$OTAKUSOUL_HOME/config|data`). Betriebssystemspezifischen Code immer mit `#[cfg]` absichern.
* **Git & Commits:** Thematische Commits direkt auf `main` (`feat(bereich): …` auf Deutsch), danach sofort `git push`. Keine fremden, uncommitteten Änderungen mitcommitten.
* **Roadmap-Pflege:** Erledigte Punkte in `roadmap.md` abhaken und nach `roadmap_abgeschlossen.md` verschieben (nur lokal, gitignored).
* **Modell-Downloads:** Keine Modelle im Repository mitliefern; nur von der Quelle laden (SHA-256). Lizenzen beachten (`license_kind`).

---

## 🛠️ Wichtigste Entwickler-Befehle

| Zweck | Befehl | Bemerkung |
|---|---|---|
| **App starten (Dev)** | `npm run tauri dev` (Linux: `npm run tauri:linux`) | Startet Vite-Frontend + Rust-Backend |
| **Alle Prüfungen** | `npm run check` | Führt Oxlint, TypeScript TypeCheck und Cargo Clippy aus |
| **Typen synchronisieren** | `npm run types:gen` | Generiert TS-Typen aus Rust via `ts-rs` nach `src/types/generated/` |
| **E2E-Tests (Mock-LLM)** | `npm run e2e` (`npm run e2e:run` ohne Build) | Baut nach `target/e2e`, nutzt tauri-driver + Mock-LLM |
| **Perf-Messung** | `npm run e2e:perf` | Langchat-Stresstest (1.000 Nachrichten) |
| **Screenshots erstellen** | `xvfb-run -a node e2e/readme-screenshots.mjs de\|en\|ru` | Erstellt UI-Screenshots unter `docs/assets/screenshots/<lang>/` |
| **GPU-Tests (Real)** | `cargo test --test gpu_e2e -- --ignored --nocapture` in `src-tauri/` | Nur auf Wunsch, lädt reale Modelle aus `assets/models` |

---

## 🗺️ System-Architektur & Modul-Landkarte

### 1. Rust-Backend (`src-tauri/src/`)
* **Einstieg & Zustand:** `lib.rs` (Plugins, Handler-Registrierung), `state.rs` (`AppState`), `paths.rs` (`base_dirs`, Daten- und Konfigpfade).
* **IPC-Befehle (`commands/`):** Schnittstelle zum Frontend über `tauri::command` (z. B. `chat.rs`, `characters.rs`, `stage.rs`, `runtimes.rs`, `memory.rs`, `settings.rs`, `lorebook.rs`, `hub.rs`).

| Bereich | Kern-Module (`modules/`) | Aufgabe / Verantwortung |
|---|---|---|
| **Inferenz & Chat** | `inference.rs`, `providers.rs`, `prompt_builder.rs`, `context_window.rs`, `chat_summary.rs`, `attachments.rs`, `translate.rs`, `chat_tools.rs` | LLM-Streaming (SSE, `<think>`-Filter), Provider-Routing (llama-server, Anthropic, OpenAI), Prompt-Zusammenbau, Token-Zählung. |
| **Lokale Server & Runtimes** | `runtimes.rs`, `llama_manager.rs`, `local_image.rs`, `tts_local.rs`, `model_files.rs`, `gguf.rs`, `hardware.rs`, `image_loras.rs` | Verwaltung, Download und Ausführung lokaler Binaries (llama.cpp, sd.cpp, CrispASR, PrismML), VRAM-Schätzung, GPU-Zuweisung. |
| **Gedächtnis & Daten** | `memory/` (`chats.rs`, `soul.rs`, SQLite), `memory_pipeline.rs`, `settings.rs`, `characters.rs`, `lorebook.rs`, `profile_backup.rs`, `secrets.rs` | SQLite-Datenbank (`otakusoul.db`), Kognitives Gedächtnis, Episodisches Gedächtnis, V2-Charakterkarten (PNG/JSON), Lorebooks. |
| **Stage & 5e Engine** | `stage/` (`director.rs`, `engine.rs`, `scenes.rs`, `combat5e.rs`, `explore5e.rs`, `party.rs`, `npc.rs`, `world.rs`, `rules5e/`) | Game-Master-Modus, Spielleiter-Orchestrierung, D&D 5e-Regelsystem (Klassen, Zauber, Kampf, Erkundung, Spielbrett). |
| **Audio, Bild & Begleiter** | `voice.rs`, `kokoro.rs`, `image_generator.rs`, `companion.rs`, `companion_tools.rs`, `mcp_client.rs` | TTS/STT-Audioverarbeitung, Sprachklonen, Bildgenerierung (SD/Flux), MCP-Client und Werkzeuge des Desktop-Gefährten. |
| **Hub & Synchronisation** | `hub.rs`, `hub_installed.rs`, `models_hub.rs`, `updater.rs`, `web_server.rs`, `discord.rs` | Online-Abgleich mit `otakusoul-data`, Revisionsprüfung von Karten/Stages/Lorebooks, Web-Server, Discord Rich Presence. |

### 2. React-Frontend (`src/`)
* **API-Brücke:** `services/api.ts` (Typsichere Wrapper um alle Tauri `invoke`-Befehle).
* **Zustandsverwaltung (Zustand):** `store/slices/*.ts` (z. B. `chatSlice.ts`, `stageSlice.ts`, `characterSlice.ts`, `settingsSlice.ts`, `avatarSlice.ts`, `memorySlice.ts`). Zugriff per `useStoreFields('fieldA', 'fieldB')`.
* **Prompt & Lore Hilfsfunktionen:** `store/helpers.ts` (`resolvePromptWithLore`, `llmTarget`).
* **Internationalisierung:** `i18n/locales/{de,en,ru}.ts` (de ist Standard, en/ru laden bedarfsgesteuert via `i18n/registry.ts`).

| UI-Bereich | Komponenten (`components/`) | Beschreibung |
|---|---|---|
| **Chat** | `chat/` (`ChatView.tsx`, `MessageList.tsx`, `ChatComposer.tsx`, `ChatSidebar.tsx`, `PromptHitsView.tsx`) | Haupt-Chatansicht, virtualisierte Nachrichtenliste, Eingabefeld, Modell-Auswahl, Swipes. |
| **Stage (Rollenspiel)** | `stage/` (`StageView.tsx`, `Combat5ePanel.tsx`, `StageBattleMap.tsx`, `Explore5ePanel.tsx`, `StoryGallery.tsx`) | Rollenspiel-Interface, interaktives Spielbrett (Battlemap), 5e-Kampfpanel, Erkundungs-HUD. |
| **Avatare & 3D** | `avatars/` (`AvatarCanvas.tsx`, `VrmViewer.tsx`, `GltfViewer.tsx`, `MmdViewer.tsx`, `AvatarManagerView.tsx`) | 3D-Bühne (`avatarStage.ts`), VRM, GLB/glTF, MMD (PMX/VMD), Gesten, Gesichts-Morphs & Knochen. |
| **Charaktere** | `characters/` (`CharacterPreviewModal.tsx`, `CharacterVoiceModal.tsx`, `Character5eSheet.tsx`) | Charakterkarten-Vorschau, Stimmzuweisung, 5e-Charakterbogen. |
| **Einstellungen & Hub** | `settings/` (`sections/*`), `hub/` (`HubView.tsx`), `onboarding/` (`OnboardingParts.tsx`) | Expertenmodus, Server- & Provider-Tuning, Hub-Katalog, Ersteinrichtungs-Assistent. |

---

## 🧭 Themen-Navigator: Stolperfallen & Details in `AI.md`

Wenn Du an einem bestimmten Subsystem arbeitest, lies gezielt die angegebenen Zeilen in [`AI.md`](AI.md), anstatt die gesamte Datei zu laden:

| Thema / Subsystem | Relevante Quellcode-Dateien | H3-Abschnitt in `AI.md` | Wichtigste Aspekte |
|---|---|---|---|
| **Chat-Pipeline & Prompt** | `src-tauri/src/modules/inference.rs`<br>`src/store/slices/chatSlice.ts` | `### 3. Chat-Pipeline, Streaming, Abbrüche & Verlauf` | Streaming-Lifecycle, `generationId`, Abbrüche via `with_abort`, Kontextfenster-Einpassung, Swipes, Entwürfe. |
| **Stage, GM & Story-Galerie** | `src-tauri/src/modules/stage/`<br>`src/components/stage/` | `### 4. Stage (Rollenspiel), GM-Director, NPCs & Story-Galerie` | Separater `stage-stream`, Sprecherreihenfolge (`director.rs`), NPC-Gedächtnis, dynamische Hintergründe, Story-Galerie. |
| **D&D 5e Regelsystem** | `src-tauri/src/modules/stage/rules5e/`<br>`src/components/stage/Combat5e*.tsx` | `### 5. D&D 5e-Regelsystem (Kampf, Spielbrett, Magie, Erkundung)` | Engine entscheidet Regeln deterministisch (`CombatEvent`), LLM erzählt nur; Spielbrett-Wegfindung, Zauber, Nebel. |
| **3D-Avatare (VRM, glTF, MMD)** | `src/components/avatars/`<br>`src/services/avatarStage.ts` | `### 6. 3D-Avatare (VRM, GLB, MMD), Gesten & 2D-Porträts` | Knochen-Retargeting (`gltfRig.ts`), Morphs vs. Knochen im Gesicht, MMD-Physik-Reihenfolge, Gesten & Formanten-Lipsync. |
| **Lokale Server & GPU/VRAM** | `src-tauri/src/modules/llama_manager.rs`<br>`src-tauri/src/modules/runtimes.rs` | `### 2. Hardware, GPU-Auswahl & Lokale Modell-Server` | VRAM-Vorabprüfung, iGPU-Filterung (`primary_gpu`), Linux-CUDA ohne UMD vs. Vulkan, Starter-Modell-Katalog. |
| **Lokale TTS & Stimmklonen** | `src-tauri/src/modules/tts_local.rs`<br>`src/services/voiceEffects.ts` | `### 7. Audio, Lokale TTS, Stimmklonen & Effekte` | CrispASR / F5 / Chatterbox-Klonen (24-kHz-WAV), Pitch-Effekte via WebAudio WSOLA, Stimm-Audioschnitt (`CloneTrimmer`). |
| **Gedächtnis & SQLite (Memory)** | `src-tauri/src/modules/memory/`<br>`src/store/slices/memorySlice.ts` | `### 8. Kognitives Gedächtnis, SQLite & Reflexion` | Transaktionen für Snapshots/Importe, gegenseitige Sperrung bei Reflexionen, Entwürfe im Drawer, Herkunft episodischer Fakten. |
| **Hub-Synchronisation & Updates** | `src-tauri/src/modules/hub.rs`<br>`src/components/hub/` | `### 9. Hub-Synchronisation, Registries & Daten-Pakete` | Versionsprüfung via `revision`, Übersetzungsschlüssel, automatische Asset-Downloads (`backgrounds`), Konfliktbehandlung. |
| **Fenster, Tray & Lifecycles** | `src-tauri/src/lib.rs`<br>`src/hooks/useCloseToTray.ts` | `### 1. App-Lifecycle, Fenster, IPC & E2E-Harness` | `close_to_tray`, `PR_SET_PDEATHSIG` für Server-Kindprozesse, `target/e2e` gegen Überschreiben durch `cargo test`. |
| **Begleiter & Sicherheit** | `src-tauri/src/modules/companion.rs`<br>`src/components/companion/` | `### 10. Begleiter (Companion) & Befehlspalette` | `execute_code`-Sicherheitsflag, HITL-Bestätigungsbanner für Tools/Dateizugriffe, Befehlspalette-Verknüpfung. |

---

## 🔄 Cross-Repository Synchronisation (`OtakuSoul` ↔ `otakusoul-data`)

Einige Inhalte in `OtakuSoul` sind gebündelte Standard-Kopien (Bundles) aus dem Inhalts-Repository [`otakusoul-data`](../otakusoul-data/). Vor Änderungen an diesen Inhalten immer prüfen, wo die primäre Quelle gepflegt wird:

| Datei / Verzeichnis in `OtakuSoul` | Primäre Quelle (`otakusoul-data`) | Synchronisations- & Update-Mechanismus |
|---|---|---|
| `presets/locales/{de,ru}.json` | `locales/{de,ru}.json` | `content_lang::refresh_locales` lädt bei App-Start nach `<Daten>/locales/` |
| `presets/recommended_models.json` | `recommended_models.json` | `model_catalog::refresh` lädt bei App-Start neuere Versionen nach |
| `presets/characters/*` | `cards_gateway/*.png` / `presets/*` | Werden im Hub über `soul_registry.json` als V2-Karten bereitgestellt |
| `presets/stories/scenes/*` | `stages_gateway/*.json` | Werden im Hub über `stages_registry.json` bezogen |

