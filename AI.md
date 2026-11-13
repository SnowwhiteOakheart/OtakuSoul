# AI.md – Wegweiser für KI-Assistenten

OtakuSoul: Desktop-App für KI-Rollenspiel-Charaktere (Tauri 2, Rust-Backend, React 19/TS/Vite/Tailwind 4/Zustand).
Port des Python-Projekts *Soul of Waifu* (vollständig eigenständig und entkoppelt); **kein Python in der App**. Repo öffentlich: github.com/SnowwhiteOakheart/OtakuSoul.
Nutzer mit „Du“ ansprechen. Antworten, Commits und Doku auf Deutsch.
`CLAUDE.md` (Claude Code) und `AGENTS.md` (Codex, Cursor u. a.) verweisen hierher – verbindliche Kernregeln stehen in dieser Datei, ausführliche Subsystem-Details liegen modular in [`docs/ai/`](docs/ai/), damit Agenten nur das jeweils relevante Thema laden. Eine kompakte Schnellreferenz bietet [`ARCHITECTURE_INDEX.md`](ARCHITECTURE_INDEX.md).

## Regeln

- Tests nur bei Bedarf ausführen; der Assistent entscheidet anhand der Änderung über Umfang und Zeitpunkt.
  Erforderliche Checks vor dem Commit ausführen und den Commit an deren erfolgreichen Exit-Code koppeln.
  Die vollständige Suite (`npm run check` bzw. `npm run e2e`) nur bei sinnvoller Abdeckung breiter Änderungen
  oder konkretem Regressionsverdacht ausführen. UI-Verhalten gezielt per E2E prüfen und relevante Screenshots
  in `e2e/screenshots/` ansehen. Bereits bestandene Prüfungen nur bei relevanten Änderungen erneut starten.
- Thematische Commits direkt auf `main`, `feat(bereich): …` auf Deutsch, danach sofort `git push`. Kein GitHub-CI.
  Der Nutzer erlaubt Commit und Push für die beauftragte Projektarbeit dauerhaft; keine erneute Rückfrage nötig.
- Der Nutzer arbeitet parallel im Repo: fremde uncommittete Änderungen nie mitcommitten.
- `roadmap.md` (offene Punkte) im selben Commit abhaken, Erledigtes nach `roadmap_abgeschlossen.md` verschieben (nur lokal, in `.gitignore`, nie committen); `README.md` und betroffene Doku in `AI.md` / `docs/ai/` bei neuen Modulen/Features anpassen.
- Pfade nur über `paths::base_dirs()` (ProjectDirs bzw. `$OTAKUSOUL_HOME/config|data`); OS-Code mit `#[cfg]`.
- Modelle grundsätzlich von der Quelle laden (SHA-256). Ausnahme: Avatare/Puppen dürfen zu 1–2 je Art mitgeliefert
  werden, wenn Lizenz (Weitergabe erlaubt) und Größe es zulassen – mit `lizenzen.txt` im Asset-Ordner und Hinweis in
  den READMEs (Beispiele: `assets/vrm/`, `assets/inochi2d/Aka.inx`); alle weiteren gehören als Registry-Eintrag ins
  Daten-Repo (`otakusoul-data`). Gewichte von LLM-, TTS- und Bildmodellen nie mitliefern. Nicht-kommerzielle Stimmmodelle (TTS) gesperrt, bis freigeschaltet;
  Chat-Modelle (LLM) nur ohne Login an der Quelle, eingeschränkte oder fehlende Lizenzen nur gekennzeichnet (`license_kind`,
  automatische Empfehlung nur frei lizenziert); Bildmodelle und LoRAs nur gekennzeichnet (Bilder bleiben privat in der App,
  Entscheidung des Nutzers).
  Stimmklonen nur mit Einwilligung.

## Befehle

| Zweck | Befehl |
|---|---|
| Entwickeln | `npm run tauri dev` (Linux: `npm run tauri:linux`) |
| Alle Checks | `npm run check` |
| Schneller Pre-Check | `npm run check:fast` |
| Doku-Links prüfen | `npm run docs:check` |
| TS-Typen aus Rust (ts-rs → `src/types/generated/`, mit einchecken) | `npm run types:gen` |
| E2E-Rauchtest (baut nach `target/e2e`, tauri-driver + Mock-LLM) | `npm run e2e` (`e2e:run` ohne Build, `npm run e2e:filter -- <muster>` gezielt) |
| Langchat-Messung (1000 Nachrichten) | `npm run e2e:perf` |
| README-Screenshots (nach `e2e:build`, nicht Teil von `e2e`) | `xvfb-run -a node e2e/readme-screenshots.mjs de\|en\|ru` → `docs/assets/screenshots/<lang>/` |
| GPU-Tests mit echten Modellen (lädt GBs, nur auf Wunsch; GPU muss frei sein) | `cargo test --test gpu_e2e -- --ignored --nocapture` in `src-tauri/` (`llm` = Chat-Modelle aus `assets/models` mit empfohlenem Kontext) |

## Karte

Backend `src-tauri/src/`: `lib.rs` (Plugins, Command-Registrierung), `state.rs` (`AppState`), `commands/<bereich>.rs`
(IPC), Logik in `modules/`:

| Bereich | Module |
|---|---|
| Chat-Pipeline | `inference.rs` (SSE-Streaming, `<think>`-Filter), `providers.rs` (OpenAI-Format/llama-server, Anthropic, …), `prompt_builder.rs` (System-Prompt, `PromptTemplate`), `context_window.rs`, `chat_summary.rs`, `attachments.rs`, `translate.rs` |
| Lokale Server | `runtimes.rs` (Download/Prüfung llama.cpp, PrismML, sd.cpp, CrispASR; vorheriger Build für Rollback), `llama_manager.rs` (llama-server), `local_image.rs` (sd-server + VRAM-Planer, LoRAs in `image_loras.rs`), `tts_local.rs` (crispasr --server), `model_files.rs` (HF-Downloads), `segmented_download.rs` (parallele Range-Abschnitte), `gguf.rs`, `hardware.rs` (GPU-Probe) |
| Daten | `memory/` (SQLite: Kognitives Gedächtnis, `chats.rs`, Snapshots), `settings.rs` (`settings.json`), `paths.rs`, `secrets.rs` (Schlüsselbund), `characters.rs` (V2-Karten PNG/JSON, Personas), `lorebook.rs`, `profile_backup.rs`, `device_sync.rs` (Sync über Ordner/WebDAV) |
| Dateianhänge | `attachments.rs`; PDF-Extraktion über die dokumentierte Kompatibilitätskopie `vendor/pdf-extract` mit lopdf 0.47 ohne Font-Einbettung/ttf-parser. Bei passendem Upstream-Release wieder auf die Registry wechseln. |
| Features | `memory_pipeline.rs` (Router/Archivist/Diary), `stage/` (Game-Master; 5e-Regel-Engine im Crate `crates/otakusoul-rules5e`, als `stage::rules5e` re-exportiert, SRD-Daten in `presets/srd5/`), `companion.rs` + `companion_tools.rs` + `mcp_client.rs`, `voice.rs`/`kokoro.rs` (TTS/STT), `image_generator.rs`, `models_hub.rs`, `hub.rs`, `web_server.rs`, `discord.rs`, `updater.rs`, `logger.rs` |

Frontend `src/`: `services/api.ts` (Barrel über Domänenmodule `services/api/*.ts`, ein Wrapper je Command), `store/slices/*.ts` (Zustand, Zugriff per
`useStoreFields('a','b')`), `store/helpers.ts` (`resolvePromptWithLore`, `llmTarget`), `components/<bereich>/`,
`presets/locales/ui/*.json` (Oberflächentexte, siehe [app-ui-i18n.md](docs/ai/app-ui-i18n.md)), `types/index.ts` (+ `generated/`), `utils/errors.ts`.
Expertenmodus `AppSettings.expert_mode` (`expertMode`): blendet Server-Tuning, Sampler-Regler, „Als Vorlage speichern“,
Prompt-Reiter, Voice-ID/RegEx/RVC, GPU-Anzeige und Protokoll in der Kopfzeile, im Chat Lokal/Cloud-Umschalter, Werkzeuge,
Prompt-Protokoll und Token-Zahlen der Kontextanzeige ein; neue Fachoptionen dort einordnen (E2E: `launch({ expert_mode: true })`).
Figuren-Vorschau `characters/CharacterPreviewModal.tsx` (`isStarterCharacter` = Pfad unter `presets/characters`).
Startseite `components/HomeView.tsx` (Reiter `home`, `AppSettings.start_tab` = `home`/`chat`, E2E-Harness setzt `chat`).
Chat-UI: `ChatView.tsx` → `MessageList.tsx` (virtualisiert, `ChatMessageItem`) + `ChatComposer.tsx` + `ChatSidebar.tsx`.
Ansichtsvorlieben pro Gerät über `hooks/usePersistentFlag.ts` (Kompakt = `data-density="compact"`, CSS in `App.css` über
`.chat-row`/`.chat-bubble`; HUD-Zustandswerte einklappbar). Heller Modus kehrt Slate um und dunkelt Statusfarben 100–300 ab
(900/950 werden helle Flächen) – neue Farbtöne dort ergänzen.
Einstellungen: `components/settings/sections/*` (Server inkl. Laufzeiten/`mmproj`, Provider, Sampler, Prompt, Bilder =
`ImageSettings` mit lokalen Bildmodellen/LoRAs, Stimme = `VoiceSettings` bettet `CharacterVoiceModal` mit `embedded` ein,
Hub). Integrationen → Bildgenerierung enthält nur Studio und Galerie.

Begriffe der Oberfläche (de): Knöpfe, Titel und Navigation sagen „Charakter“ (Fließtext darf „Figur“), „Geschichte“ ist,
was man in Stage spielt, „Szene“ die technische Einheit (Akt, Datei, „Szenen verwalten“); en „character/story/scene“,
ru „персонаж/история/сцена“. Fachbegriffe nur im Expertenmodus oder mit Erklärung (Glossar).

## Themen-Module (`docs/ai/`)

Lies bei Aufgaben in einem Subsystem **nur** die zugehörige Moduldatei (siehe auch den detaillierten Navigator in [`ARCHITECTURE_INDEX.md`](ARCHITECTURE_INDEX.md)):

| Modul | Inhalt |
|---|---|
| [`docs/ai/app-ui-i18n.md`](docs/ai/app-ui-i18n.md) | Store-Fehler, WCAG-Kontrast/Barrierefreiheit, Hilfe, 3-Ebenen-i18n, Spieltexte, App-Lifecycle, IPC, E2E-Harness |
| [`docs/ai/chat-pipeline.md`](docs/ai/chat-pipeline.md) | Senden/Streaming, Gruppen-Chats, JSONL, Lorebooks, OpenRouter-OAuth, Regex/Quick-Replies/ST-Presets, Makros, Kontextfenster, Abbrüche, Proaktivität/Träume |
| [`docs/ai/hardware-models-audio.md`](docs/ai/hardware-models-audio.md) | GPU/VRAM, KV-Cache, llama.cpp/sd.cpp/ACE-Step, LoRAs, Vision/`mmproj`, Onboarding, ONNX/Kokoro, lokale TTS, Edge-TTS, Stimmklonen, Barge-In, Silero VAD |
| [`docs/ai/stage-and-5e.md`](docs/ai/stage-and-5e.md) | Stage-Rollenspiel, Musik, GM-Director, NPCs, Story-Galerie/Wizard, D&D-5e-Crate (`otakusoul-rules5e`), Spielbrett, Magie, Erkundung, HTML/EPUB-Replay, Webtoon |
| [`docs/ai/avatars-and-inochi2d.md`](docs/ai/avatars-and-inochi2d.md) | 3D-Avatare (VRM, glTF, MMD), Eigenanimationen, Avatar-Manager, VRoid Hub, 2D-Porträts (`MorphingPortrait`), Inochi2D-WebGL2-Laufzeit, Avatar-Berührung |
| [`docs/ai/memory-sqlite.md`](docs/ai/memory-sqlite.md) | Kognitives Gedächtnis, SQLite-Transaktionen & Migrationen (v4–v11), FTS5-Recall, Supersede, Vorhaben, Aufräumen, Atlas, Tagebuch, Zweige, Sync, tolerantes Router-JSON |
| [`docs/ai/hub-nsfw-import.md`](docs/ai/hub-nsfw-import.md) | Hub-Synchronisation (`pin_latest_commits`), 18+/NSFW-Filter, `[emotion: NAME]` & Cues, Hub-Updates, Sammlungen, Charakter-Importe, Beitrag zum Hub (B4) |
| [`docs/ai/companion-pet-overlay.md`](docs/ai/companion-pet-overlay.md) | Companion-Tools & `execute_code`, Befehlspalette, Desktop-Pet (Physik, Sitz-/Gehposen, Fenster-Scan, XWayland/KWin), OBS-Streaming-Overlay |

## Stand

Erledigtes (Portierung Phasen 1–18, Verbesserungen, TTS, Neutralisierung, Inhalte, Qualität) steht in
`roadmap_abgeschlossen.md` (nur lokal, nicht im Repository), alles Offene in `roadmap.md`. Aktueller Schwerpunkt: Bedienbarkeit für Einsteiger und
Story-Einstieg (Plan lokal in `roadmap_abgeschlossen.md`, Abschnitt 10; die Leitlinien für neue Oberflächen stehen oben in `roadmap.md`). Mitgelieferte Figuren: `presets/characters/` (Shiori Amane,
Sota Minase, Lirwen, Faelion) und `presets/crypt-of-shadows/`; weitere Figuren/Pakete (NGNL, Sakura Succubus 3 mit Ayu und Cosmos, Re:Zero mit Emilia, Einzelkarten) liegen in
`SnowwhiteOakheart/otakusoul-data` (Hub-Registries in `hub.rs`). Karten pflegen Übersetzungen in `otakusoul_i18n` und
verwenden `custom_*`-Schlüssel (`sow_*` wird nur noch gelesen). Daten: `<Daten>` = `~/.local/share/otakusoul` (Linux) mit `runtimes/`, `image-models/`, `tts-models/`,
`voices/`, `attachments/`, `otakusoul.db`; Entwickler-Modelle in `assets/models/` (gitignored).
