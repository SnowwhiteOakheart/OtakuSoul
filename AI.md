# AI.md – Wegweiser für KI-Assistenten

OtakuSoul: Desktop-App für KI-Rollenspiel-Charaktere (Tauri 2, Rust-Backend, React 19/TS/Vite/Tailwind 4/Zustand).
Port des Python-Projekts *Soul of Waifu*; **kein Python in der App**. Repo öffentlich: github.com/SnowwhiteOakheart/OtakuSoul.
Nutzer mit „Du“ ansprechen. Antworten, Commits und Doku auf Deutsch.
`CLAUDE.md` (Claude Code) und `AGENTS.md` (Codex, Cursor u. a.) verweisen nur hierher – Inhalte nur in dieser Datei pflegen.

## Regeln

- Vor jedem Commit `npm run check` (oxlint, tsc, vitest, cargo fmt --check, clippy -D warnings, cargo test); Commit an
  den Exit-Code koppeln. UI-Änderungen zusätzlich `npm run e2e` und Screenshots in `e2e/screenshots/` ansehen.
- Thematische Commits direkt auf `main`, `feat(bereich): …` auf Deutsch, danach sofort `git push`. Kein GitHub-CI.
- Der Nutzer arbeitet parallel im Repo: fremde uncommittete Änderungen nie mitcommitten.
- `ROADMAP.md` (bzw. `Roadmap_TTS.md`) im selben Commit abhaken; `README.md`/`AI.md` bei neuen Modulen/Features anpassen.
- Pfade nur über `paths::base_dirs()` (ProjectDirs bzw. `$OTAKUSOUL_HOME/config|data`); OS-Code mit `#[cfg]`.
- Modelle nie mitliefern, nur von der Quelle laden (SHA-256); nicht-kommerzielle Modelle gesperrt, bis freigeschaltet.
  Stimmklonen nur mit Einwilligung.

## Befehle

| Zweck | Befehl |
|---|---|
| Entwickeln | `npm run tauri dev` (Linux: `npm run tauri:linux`) |
| Alle Checks | `npm run check` |
| TS-Typen aus Rust (ts-rs → `src/types/generated/`, mit einchecken) | `npm run types:gen` |
| E2E-Rauchtest (baut nach `target/e2e`, tauri-driver + Mock-LLM) | `npm run e2e` (`e2e:run` ohne Build) |
| Langchat-Messung (1000 Nachrichten) | `npm run e2e:perf` |
| GPU-Tests mit echten Modellen (lädt GBs, nur auf Wunsch) | `cargo test --test gpu_e2e -- --ignored --nocapture` in `src-tauri/` |

## Karte

Backend `src-tauri/src/`: `lib.rs` (Plugins, Command-Registrierung), `state.rs` (`AppState`), `commands/<bereich>.rs`
(IPC), Logik in `modules/`:

| Bereich | Module |
|---|---|
| Chat-Pipeline | `inference.rs` (SSE-Streaming, `<think>`-Filter), `providers.rs` (OpenAI-Format/llama-server, Anthropic, …), `prompt_builder.rs` (System-Prompt, `PromptTemplate`), `context_window.rs`, `chat_summary.rs`, `attachments.rs`, `translate.rs` |
| Lokale Server | `runtimes.rs` (Download/Prüfung llama.cpp, PrismML, sd.cpp, CrispASR), `llama_manager.rs` (llama-server), `local_image.rs` (sd-server + VRAM-Planer), `tts_local.rs` (crispasr --server), `model_files.rs` (HF-Downloads), `gguf.rs`, `hardware.rs` (GPU-Probe) |
| Daten | `memory/` (SQLite: Seelen-Gedächtnis, `chats.rs`, Snapshots), `settings.rs` (`settings.json`), `paths.rs`, `secrets.rs` (Schlüsselbund), `characters.rs` (V2-Karten PNG/JSON, Personas), `lorebook.rs`, `profile_backup.rs` |
| Features | `soul_memory_pipeline.rs` (Router/Archivist/Diary), `stage/` (Game-Master), `companion.rs` + `companion_tools.rs` + `mcp_client.rs`, `voice.rs`/`kokoro.rs` (TTS/STT), `image_generator.rs`, `models_hub.rs`, `soul_hub.rs`, `web_server.rs`, `discord.rs`, `updater.rs`, `logger.rs` |

Frontend `src/`: `services/api.ts` (ein Wrapper je Command), `store/slices/*.ts` (Zustand, Zugriff per
`useStoreFields('a','b')`), `store/helpers.ts` (`resolvePromptWithLore`, `llmTarget`), `components/<bereich>/`,
`i18n/locales/{de,en,ru}.ts`, `types/index.ts` (+ `generated/`), `utils/errors.ts`.
Chat-UI: `ChatView.tsx` → `MessageList.tsx` (virtualisiert, `ChatMessageItem`) + `ChatComposer.tsx` + `ChatSidebar.tsx`.
Einstellungen: `components/settings/sections/*` (Server inkl. Laufzeiten/`mmproj`, Provider, Sampler, Prompt, Hub).

## Abläufe

- **Nachricht senden:** `chatSlice.sendMessage` → Anhänge `save_attachment` → `add_chat_message` → `resolvePromptWithLore`
  (Lorebooks, `assemble_prompt` = System-Prompt + Nachspann) → Payload (+ Author's Note in Tiefe N, Nachspann am Ende)
  → `send_chat_message`: `attachments::prepare` → `context_window::fit` (kürzt von vorn) → `stream_chat` (Events
  `llm-token`/`llm-thought`/`llm-done`) → Antwort speichern → ggf. `summarizeDroppedMessages` im Hintergrund.
- **Prompt:** `PromptTemplate` (Rolle/Stil/Nachspann, Vorlagen in `builtin_prompt_templates`); Karten-`system_prompt`/
  `post_history_instructions` ersetzen Rolle/Nachspann, `{{original}}` bindet die Vorlage ein. Abschnitte beginnen mit
  „# Role & Identity“ (das E2E-Mock erkennt Chat-Anfragen daran).
- **Kontext:** lokal exakt über llama-server `/props` + `/tokenize` (gecacht), Cloud geschätzt (Bytes/3) mit
  `cloud_context_tokens`. System-Nachrichten und letzte Nicht-System-Nachricht bleiben immer; Bild = 1000 Tokens.
- **Bilder lokal:** `local_image::plan` prüft VRAM (nvidia-smi/Vulkan) und entlädt nur bei Bedarf gestuft: TTS → Chat-Modell
  verkleinern/tauschen; danach Neustart im Hintergrund.
- **Fehler:** Backend `crate::err!("backend.x.y", key = wert)` → JSON-Code → Frontend `errorMessage()` übersetzt über
  i18n; jeder neue Code braucht Einträge in allen drei Locales.

## Stolperfallen

- Mehrere GPUs: iGPUs melden Dutzende GB geteilten Speicher; sd.cpp/llama.cpp würden sie wählen (FLUX.1 350 s statt
  48 s). Deshalb `--backend`/`--device` via `hardware::primary_gpu()` + `same_gpu()`.
- Linux-CUDA-Builds bringen keine CUDA-Laufzeit mit und fallen still auf CPU zurück → `runtimes` empfiehlt CUDA nur bei
  passender System-CUDA (`ldconfig`), sonst Vulkan.
- `cargo test`/`clippy` überschreiben `target/debug/otakusoul` mit einer Version ohne eingebettetes Frontend → E2E nutzt
  `target/e2e`.
- Neue Rust-Felder in Typen, die auch handgeschrieben in `src/types/index.ts` stehen: `src/types/wireCheck.ts` meldet
  Abweichungen; dort und in `index.ts` nachziehen.
- Tauri-Listener mit `isSubscribed`-Guard (StrictMode), sonst doppelte Tokens.
- Soul Stage streamt über `stage-stream` (`InferenceClient::stream_text`), nicht über `llm-token` (das hört der Chat).
  `stage/history.rs` passt alle Sprecher-Anfragen ins Kontextfenster ein und speichert Zusammenfassungen getrennt
  nach Publikum (`history_summaries`); Änderungen am Verlauf müssen diese verwerfen.
  `stage/npc.rs`: szenengebundene NPCs, gefilterte Erinnerungen mit Quellen-ID und Abruf nach Textrelevanz,
  Beförderung zu V2-PNG + Soul Memory. Neue öffentliche Ereignisse außerhalb der Runde ebenfalls mit
  `observe_npcs` erfassen; Verlaufsänderungen brauchen `reconcile_npc_memories` und `rebuild_private_knowledge`.
  Archetyp-Avatare unter `public/npc/` (SVG-Quellen, PNGs per `rsvg-convert`, im Backend eingebettet).
  `stage/scenes.rs`: `update_scene_definition` ändert nur die Konfiguration (Fortschritt bleibt erhalten),
  `list_stage_assets`/`import_stage_asset` verwalten Startbilder und Ambient-Dateien. Ein dynamischer
  Hintergrund gehört in `current_bg`, niemals in `definition.starting_bg`; ebenso Ambient in `current_ambient`.
  Vorlesen: `services/stageVoice.ts` (Gefährte = Charakterstimme, GM/NPC = Profil `stage_narrator`), Ambient-Schleife
  `components/stage/useStageAmbient.ts`. E2E-Mock bietet `/v1/audio/speech` (stille WAV).
  `stage/world.rs`: Fakten (`fact_updates`, Schlüssel normalisiert) und Chronik gehen in den Planer-Kontext;
  Weltzustand-Editor `StageWorldEditor.tsx` speichert per `save_stage_scene` (in den neuesten Zustand gemischt).
  Rundenende: `archive_resolved_arcs` und `audit_facts` (alle `AUDIT_INTERVAL` Runden); Mock erkennt
  „[SOUL STAGE — ARC ARCHIVE]“/„[SOUL STAGE — CONSISTENCY]“.
  Overlays (`overlay_block` nur für die Figur selbst) und Lorekarten (`relevant_lore_cards`: `party` → Snippets,
  `gm` → nur Planer). `take_memory_sync_batches` (Rundenende, je Mitglied die gefilterte Sicht) → Soul-Memory-Pipeline
  mit `transcript` im Hintergrund; Mock erkennt sie an „=== RECENT MESSAGES ===“.
  `stage/director.rs`: Sprecherfolge = Spielerwahl > Flüsterziel > direkte Ansprache > Planer; danach pro Beitrag
  Ansprache-Erkennung, sonst Routing-LLM (Mock erkennt „[SOUL STAGE — ROUTING]“). `turn_mode: "continue"` = Runde ohne
  Spieleraktion (Weiter/Auto-Play).
  Der Abbruch-Merker wird nur am Runden-/Chat-Start zurückgesetzt (`reset_abort`), damit „Stopp“ die ganze Runde beendet.
- Lokale Vision nur mit gewählter `mmproj`; ohne macht `attachments::prepare` aus Bildern einen Hinweis.
- Swipes: `swipes_json` + `swipe_index`; „Neu generieren“ hängt an, überschreibt nie.
- `<state>{…}</state>` am Antwortende aktualisiert HUD-Variablen (`utils/stateParser.ts`) und wird ausgeblendet.
- Memory: `addManualMemory`, `addManualDiary`, `generateManualDiary` und `createMemoryBackup` geben Fehler an
  ihre Aufrufer weiter. Formulare müssen diese anzeigen; Eingaben erst nach erfolgreichem Speichern leeren.
  Der Memory-Drawer rendert per Portal in `document.body`, damit der `backdrop-filter` des HUD seine Größe nicht begrenzt.
- Companion-Tools: nur ausdrücklich geprüfte interne Tools in `companion.rs` → `tool_allows_auto_approval`
  dürfen automatisch freigegeben werden. MCP-/unbekannte Tools, Screenshots, Zwischenablage und schreibende
  Dateiaktionen laufen über den Bestätigungsbanner; ausgeführt wird in `execute_internal_sync`.

## Stand

Phasen 1–18 abgeschlossen (`Roadmap_abgeschlossen.md`); laufende Arbeit und Testergebnisse in `ROADMAP.md` und
`Roadmap_TTS.md`. Daten: `<Daten>` = `~/.local/share/otakusoul` (Linux) mit `runtimes/`, `image-models/`, `tts-models/`,
`voices/`, `attachments/`, `otakusoul.db`; Entwickler-Modelle in `assets/models/` (gitignored).
