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
| **Übersetzungen prüfen** | `npm run i18n:check [-- datei.json]` | Fehlende/unbekannte Schlüssel, Platzhalter gegen `de.json` |
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
| **Lokale Server & Runtimes** | `runtimes.rs`, `llama_manager.rs`, `local_image.rs`, `tts_local.rs`, `model_files.rs`, `segmented_download.rs`, `gguf.rs`, `hardware.rs`, `image_loras.rs` | Verwaltung, Download und Ausführung lokaler Binaries (llama.cpp, sd.cpp, CrispASR, PrismML), VRAM-Schätzung, GPU-Zuweisung. |
| **Gedächtnis & Daten** | `memory/` (`chats.rs`, `soul.rs`, SQLite), `memory_pipeline.rs`, `settings.rs`, `characters.rs`, `lorebook.rs`, `profile_backup.rs`, `secrets.rs` | SQLite-Datenbank (`otakusoul.db`), Kognitives Gedächtnis, Episodisches Gedächtnis, V2-Charakterkarten (PNG/JSON), Lorebooks. |
| **Stage & 5e Engine** | `stage/` (`director.rs`, `engine.rs`, `scenes.rs`, `combat5e.rs`, `explore5e.rs`, `party.rs`, `npc.rs`, `world.rs`, `rules5e/`) | Game-Master-Modus, Spielleiter-Orchestrierung, D&D 5e-Regelsystem (Klassen, Zauber, Kampf, Erkundung, Spielbrett). |
| **Audio, Bild & Begleiter** | `voice.rs`, `kokoro.rs`, `image_generator.rs`, `companion.rs`, `companion_tools.rs`, `mcp_client.rs` | TTS/STT-Audioverarbeitung, Sprachklonen, Bildgenerierung (SD/Flux), MCP-Client und Werkzeuge des Desktop-Gefährten. |
| **Sprachen & Lokalisierung** | `ui_locales.rs`, `content_lang.rs` | 3-Ebenen-Auflösung für UI-Sprachen (Presets, Hub-Cache, User-Verzeichnis mit Hot-Reload), `_template.json`, Trennung von UI- und Inhalts-/Spieltexten (`content_lang`), Tray-Lokalisierung. |
| **Hub, NSFW & Synchronisation** | `hub.rs`, `hub_installed.rs`, `models_hub.rs`, `updater.rs`, `nsfw.rs`, `web_server.rs`, `discord.rs` | Online-Abgleich mit `otakusoul-data` (und NSFW-Hub `otakusoul-data-nsfw`), Revisionsprüfung von Inhalten, FSK18/NSFW-Tagging & Filterung, Web-Server, Discord Rich Presence. |

### 2. React-Frontend (`src/`)
* **API-Brücke:** `services/api.ts` (Typsichere Wrapper um alle Tauri `invoke`-Befehle).
* **Zustandsverwaltung (Zustand):** `store/slices/*.ts` (z. B. `chatSlice.ts`, `stageSlice.ts`, `characterSlice.ts`, `settingsSlice.ts`, `avatarSlice.ts`, `memorySlice.ts`). Zugriff per `useStoreFields('fieldA', 'fieldB')`.
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
| **Avatare & 3D** | `avatars/` (`AvatarCanvas.tsx`, `VrmViewer.tsx`, `GltfViewer.tsx`, `MmdViewer.tsx`, `AvatarManagerView.tsx`) | 3D-Bühne (`avatarStage.ts`), VRM, GLB/glTF, MMD (PMX/VMD), Gesten, Gesichts-Morphs & Knochen. |
| **Charaktere** | `characters/` (`CharacterPreviewModal.tsx`, `CharacterVoiceModal.tsx`, `Character5eSheet.tsx`) | Charakterkarten-Vorschau, Stimmzuweisung, 5e-Charakterbogen. |
| **Einstellungen & Hub** | `settings/` (`sections/*`), `hub/` (`HubView.tsx`), `onboarding/` (`OnboardingParts.tsx`) | Expertenmodus, Server- & Provider-Tuning, Hub-Katalog, Ersteinrichtungs-Assistent. |

---

## 🧭 Themen-Navigator: Stolperfallen & Details in `AI.md`

Wenn Du an einem bestimmten Subsystem arbeitest, lies gezielt die angegebenen Zeilen in [`AI.md`](AI.md), anstatt die gesamte Datei zu laden:

| Thema / Subsystem | Relevante Quellcode-Dateien | H3-Abschnitt in `AI.md` | Wichtigste Aspekte |
|---|---|---|---|
| **Sprachdateien & Dynamisches i18n** | `src-tauri/src/modules/ui_locales.rs`<br>`src-tauri/src/modules/content_lang.rs`<br>`presets/locales/ui/*.json`<br>`src/i18n/`<br>`src/components/settings/sections/GeneralSettings.tsx` | `## Richtlinien für Code und Oberfläche` (Zeilen 167–188) | 3-Ebenen-Auflösung (Presets → Hub-Cache → User-Verzeichnis), `__meta`-Header & Versionierung, Fallback-Kette (`fallback → en → de`), Trennung UI- vs. Spieltexte (`content_lang`), `_template.json`, Import/Papierkorb, `npm run i18n:check`. |
| **Chat-Pipeline & Prompt** | `src-tauri/src/modules/inference.rs`<br>`src/store/slices/chatSlice.ts` | `### 3. Chat-Pipeline, Streaming, Abbrüche & Verlauf` | Streaming-Lifecycle, `generationId`, Abbrüche via `with_abort`, Kontextfenster-Einpassung, Swipes, Entwürfe. |
| **Stage, GM & Story-Galerie** | `src-tauri/src/modules/stage/`<br>`src/components/stage/` | `### 4. Stage (Rollenspiel), GM-Director, NPCs & Story-Galerie` | Separater `stage-stream`, Sprecherreihenfolge (`director.rs`), NPC-Gedächtnis, dynamische Hintergründe, Story-Galerie. |
| **D&D 5e Regelsystem** | `src-tauri/src/modules/stage/rules5e/`<br>`src/components/stage/Combat5e*.tsx` | `### 5. D&D 5e-Regelsystem (Kampf, Spielbrett, Magie, Erkundung)` | Engine entscheidet Regeln deterministisch (`CombatEvent`), LLM erzählt nur; Spielbrett-Wegfindung, Zauber, Nebel. |
| **3D-Avatare (VRM, glTF, MMD)** | `src/components/avatars/`<br>`src/services/avatarStage.ts` | `### 6. 3D-Avatare (VRM, GLB, MMD), Gesten & 2D-Porträts` | Knochen-Retargeting (`gltfRig.ts`), Morphs vs. Knochen im Gesicht, MMD-Physik-Reihenfolge, Gesten & Formanten-Lipsync. |
| **Lokale Server & GPU/VRAM** | `src-tauri/src/modules/llama_manager.rs`<br>`src-tauri/src/modules/runtimes.rs` | `### 2. Hardware, GPU-Auswahl & Lokale Modell-Server` | VRAM-Vorabprüfung, iGPU-Filterung (`primary_gpu`), Linux-CUDA ohne UMD vs. Vulkan, Starter-Modell-Katalog. |
| **Lokale TTS & Stimmklonen** | `src-tauri/src/modules/tts_local.rs`<br>`src/services/voiceEffects.ts` | `### 7. Audio, Lokale TTS, Stimmklonen & Effekte` | CrispASR / F5 / Chatterbox-Klonen (24-kHz-WAV), Pitch-Effekte via WebAudio WSOLA, Stimm-Audioschnitt (`CloneTrimmer`). |
| **Gedächtnis & SQLite (Memory)** | `src-tauri/src/modules/memory/`<br>`src/store/slices/memorySlice.ts` | `### 8. Kognitives Gedächtnis, SQLite & Reflexion` | Transaktionen für Snapshots/Importe, gegenseitige Sperrung bei Reflexionen, Entwürfe im Drawer, Herkunft episodischer Fakten. |
| **Hub-Synchronisation & Updates** | `src-tauri/src/modules/hub.rs`<br>`src/components/hub/` | `### 9. Hub-Synchronisation, Registries & Daten-Pakete` | Versionsprüfung via `revision`, Übersetzungsschlüssel, automatische Asset-Downloads (`backgrounds`), Konfliktbehandlung. |
| **NSFW, FSK18 & Content-Filter** | `src-tauri/src/modules/nsfw.rs`<br>`src-tauri/src/modules/hub.rs`<br>`src/store/slices/settingsSlice.ts`<br>`src/components/settings/sections/NsfwSettings.tsx` | `### 9. Hub-Synchronisation, Registries & Daten-Pakete` | Altersfreigabe (`nsfw_enabled` + `adult_confirmed`), Multi-Hub (`otakusoul-data-nsfw`), Tagging per `extensions.otakusoul_nsfw`, Ausblenden ohne Datenverlust, 4 Romance-Zusatzemotionen. |
| **Fenster, Tray & Lifecycles** | `src-tauri/src/lib.rs`<br>`src/hooks/useCloseToTray.ts` | `### 1. App-Lifecycle, Fenster, IPC & E2E-Harness` | `close_to_tray`, `PR_SET_PDEATHSIG` für Server-Kindprozesse, `target/e2e` gegen Überschreiben durch `cargo test`. |
| **Begleiter & Sicherheit** | `src-tauri/src/modules/companion.rs`<br>`src/components/companion/` | `### 10. Begleiter (Companion) & Befehlspalette` | `execute_code`-Sicherheitsflag, HITL-Bestätigungsbanner für Tools/Dateizugriffe, Befehlspalette-Verknüpfung. |

---

## 🔄 Cross-Repository Synchronisation (`OtakuSoul` ↔ `otakusoul-data`)

Einige Inhalte in `OtakuSoul` sind gebündelte Standard-Kopien (Bundles) aus dem Inhalts-Repository [`otakusoul-data`](../otakusoul-data/). Vor Änderungen an diesen Inhalten immer prüfen, wo die primäre Quelle gepflegt wird:

| Datei / Verzeichnis in `OtakuSoul` | Primäre Quelle (`otakusoul-data` / `otakusoul-data-nsfw`) | Synchronisations- & Update-Mechanismus |
|---|---|---|
| `presets/locales/{de,ru,ja}.json` (Spieltexte; jede Datei = Sprache) | `locales/<kürzel>.json` | `content_lang::refresh_locales` lädt bei App-Start nach `<Daten>/locales/` |
| `presets/locales/ui/*.json` (Oberflächensprachen) | `locales/ui/*.json` + `locales/ui_registry.json` | `ui_locales::refresh_hub` lädt beim Start nach `<Daten>/locales/ui-hub/` (mitgelieferte Sprachen nur bei höherer `version`) |
| `presets/recommended_models.json` | `recommended_models.json` | `model_catalog::refresh` lädt bei App-Start neuere Versionen nach |
| `presets/characters/*` | – (nur in der App: Einsteigerfiguren Shiori Amane, Sota Minase, Lirwen, Faelion) | Frühere Presets liegen nur noch im Hub: Ayu Ikue und Cosmos (`presets/sakura-succubus-3/`), Emilia (`presets/re-zero/`), jeweils über `soul_registry.json` / `cards_gateway/` |
| `presets/stories/scenes/*` | `stages_gateway/*.json` | Werden im Hub über `stages_registry.json` bezogen |
| NSFW-Karten, Stages & Lorebooks | `otakusoul-data-nsfw` (`cards_gateway/`, `stages_gateway/`) | Werden nur bei aktiver 18+-Freigabe über `hub::nsfw_registry_items` eingebunden |

