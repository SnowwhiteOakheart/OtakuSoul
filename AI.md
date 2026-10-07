# AI.md – Wegweiser für KI-Assistenten

OtakuSoul: Desktop-App für KI-Rollenspiel-Charaktere (Tauri 2, Rust-Backend, React 19/TS/Vite/Tailwind 4/Zustand).
Port des Python-Projekts *Soul of Waifu* (vollständig eigenständig und entkoppelt); **kein Python in der App**. Repo öffentlich: github.com/SnowwhiteOakheart/OtakuSoul.
Nutzer mit „Du“ ansprechen. Antworten, Commits und Doku auf Deutsch.
`CLAUDE.md` (Claude Code) und `AGENTS.md` (Codex, Cursor u. a.) verweisen nur hierher – Inhalte nur in dieser Datei pflegen.

## Regeln

- Tests nur bei Bedarf ausführen; der Assistent entscheidet anhand der Änderung über Umfang und Zeitpunkt.
  Erforderliche Checks vor dem Commit ausführen und den Commit an deren erfolgreichen Exit-Code koppeln.
  Die vollständige Suite (`npm run check` bzw. `npm run e2e`) nur bei sinnvoller Abdeckung breiter Änderungen
  oder konkretem Regressionsverdacht ausführen. UI-Verhalten gezielt per E2E prüfen und relevante Screenshots
  in `e2e/screenshots/` ansehen. Bereits bestandene Prüfungen nur bei relevanten Änderungen erneut starten.
- Thematische Commits direkt auf `main`, `feat(bereich): …` auf Deutsch, danach sofort `git push`. Kein GitHub-CI.
  Der Nutzer erlaubt Commit und Push für die beauftragte Projektarbeit dauerhaft; keine erneute Rückfrage nötig.
- Der Nutzer arbeitet parallel im Repo: fremde uncommittete Änderungen nie mitcommitten.
- `roadmap.md` (offene Punkte) im selben Commit abhaken, Erledigtes nach `roadmap_abgeschlossen.md` verschieben; `README.md`/`AI.md` bei neuen Modulen/Features anpassen.
- Pfade nur über `paths::base_dirs()` (ProjectDirs bzw. `$OTAKUSOUL_HOME/config|data`); OS-Code mit `#[cfg]`.
- Modelle nie mitliefern, nur von der Quelle laden (SHA-256); nicht-kommerzielle Sprachmodelle gesperrt, bis freigeschaltet;
  Bildmodelle und LoRAs nur gekennzeichnet (Bilder bleiben privat in der App, Entscheidung des Nutzers).
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
| Lokale Server | `runtimes.rs` (Download/Prüfung llama.cpp, PrismML, sd.cpp, CrispASR; vorheriger Build für Rollback), `llama_manager.rs` (llama-server), `local_image.rs` (sd-server + VRAM-Planer, LoRAs in `image_loras.rs`), `tts_local.rs` (crispasr --server), `model_files.rs` (HF-Downloads), `gguf.rs`, `hardware.rs` (GPU-Probe) |
| Daten | `memory/` (SQLite: Kognitives Gedächtnis, `chats.rs`, Snapshots), `settings.rs` (`settings.json`), `paths.rs`, `secrets.rs` (Schlüsselbund), `characters.rs` (V2-Karten PNG/JSON, Personas), `lorebook.rs`, `profile_backup.rs` |
| Features | `memory_pipeline.rs` (Router/Archivist/Diary), `stage/` (Game-Master; `stage/rules5e/` = 5e-Regel-Engine, SRD-Daten in `presets/srd5/`), `companion.rs` + `companion_tools.rs` + `mcp_client.rs`, `voice.rs`/`kokoro.rs` (TTS/STT), `image_generator.rs`, `models_hub.rs`, `hub.rs`, `web_server.rs`, `discord.rs`, `updater.rs`, `logger.rs` |

Frontend `src/`: `services/api.ts` (ein Wrapper je Command), `store/slices/*.ts` (Zustand, Zugriff per
`useStoreFields('a','b')`), `store/helpers.ts` (`resolvePromptWithLore`, `llmTarget`), `components/<bereich>/`,
`i18n/locales/{de,en,ru}.ts` (en/ru laden bei Bedarf über `i18n/registry.ts`, Tests registrieren alle in `src/test/setup.ts`), `types/index.ts` (+ `generated/`), `utils/errors.ts`.
Chat-UI: `ChatView.tsx` → `MessageList.tsx` (virtualisiert, `ChatMessageItem`) + `ChatComposer.tsx` + `ChatSidebar.tsx`.
Ansichtsvorlieben pro Gerät über `hooks/usePersistentFlag.ts` (Kompakt = `data-density="compact"`, CSS in `App.css` über
`.chat-row`/`.chat-bubble`; HUD-Zustandswerte einklappbar). Heller Modus kehrt Slate um und dunkelt Statusfarben 100–300 ab
(900/950 werden helle Flächen) – neue Farbtöne dort ergänzen.
Einstellungen: `components/settings/sections/*` (Server inkl. Laufzeiten/`mmproj`, Provider, Sampler, Prompt, Bilder =
`ImageSettings` mit lokalen Bildmodellen/LoRAs, Stimme = `VoiceSettings` bettet `CharacterVoiceModal` mit `embedded` ein,
Hub). Integrationen → Bildgenerierung enthält nur Studio und Galerie.

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
- **Fehler im Store:** Aktion mit eigener Rückmeldung im Aufrufer (Erfolgs-Toast, Formular) → `throw e`; Knopf ohne eigene
  Rückmeldung → `reportFailure` (`store/reportFailure.ts`, Toast mit Ursache); reine Hintergrundabrufe → nur Log. Ausnahme `saveCurrentSettings`: Fehler einmalig melden, erneut erst nach einem
  zwischenzeitlich erfolgreichen Speichern.
- **Fehler:** Backend `crate::err!("backend.x.y", key = wert)` → JSON-Code → Frontend `errorMessage()` übersetzt über
  i18n; jeder neue Code braucht Einträge in allen Locales. (Dynamisches i18n-Backend ladet z.B. de.json und ru.json aus otakusoul-data/locales/)

## Stolperfallen

- Beenden: Schließen-X richtet sich nach `close_to_tray` (Standard an): beim ersten Mal Hinweis per Event
  `close-to-tray-hint` (`hooks/useCloseToTray.ts`), danach verstecken; aus → `exit(0)`. E2E schließt über
  `e2e/tools/wmclose.py` (WM_DELETE_WINDOW, erzwingt X11). „Beenden“ (Tray) bzw. Updater-Neustart lösen `RunEvent::Exit` aus →
  `stop_model_servers` (llama, sd, TTS, max. 8 s). Linux beendet Kindprozesse zusätzlich per `PR_SET_PDEATHSIG`;
  neue Kindprozesse brauchen `kill_on_drop(true)` und unter Linux `PR_SET_PDEATHSIG`.
- Mehrere GPUs: iGPUs melden Dutzende GB geteilten Speicher; sd.cpp/llama.cpp würden sie wählen (FLUX.1 350 s statt
  48 s). Deshalb `--backend`/`--device` via `hardware::primary_gpu()` + `same_gpu()`.
- Linux-CUDA-Builds bringen keine CUDA-Laufzeit mit und fallen still auf CPU zurück → `runtimes` empfiehlt CUDA nur bei
  passender System-CUDA (`ldconfig`), sonst Vulkan. Unter Windows (cudart liegt bei) wird der neueste Build empfohlen,
  den der Treiber laut `nvidia-smi`-Kopf („CUDA [UMD] Version“) kann; Blackwell (Compute Capability ≥ 12.0) braucht
  Builds ab CUDA 12.8 (Builds nur mit Major-Version wie bei CrispASR ausgenommen), sonst Vulkan.
- `cargo test`/`clippy` überschreiben `target/debug/otakusoul` mit einer Version ohne eingebettetes Frontend → E2E nutzt
  `target/e2e`.
- Das Hauptfenster steht in `tauri.conf.json` mit `create: false` und wird in `lib.rs` (`create_main_window`) gebaut,
  damit `OTAKUSOUL_HOME` auch den Webview-Speicher umlenkt (`<home>/webview`); der E2E-Harness prüft das per Marker.
- Bei gesperrter Desktop-Sitzung können WebKit-Screenshots und Animationsabfragen hängen. E2E dann unter
  einem separaten Xvfb-Display ausführen (`xvfb-run npm run e2e`); die Desktop-Sperre nicht verändern.
- Befehlsaufrufe: `src/test/commandCheck.test.ts` gleicht jedes `invoke('…', {…})` mit den Rust-Signaturen und
  `generate_handler!` ab (camelCase-Argumente, Pflichtargumente) – neue Befehle immer registrieren.
- Neue Rust-Felder in Typen, die auch handgeschrieben in `src/types/index.ts` stehen: `src/types/wireCheck.ts` meldet
  Abweichungen; dort und in `index.ts` nachziehen.
- Tauri-Listener mit `isSubscribed`-Guard (StrictMode), sonst doppelte Tokens.
- Stage streamt über `stage-stream` (`InferenceClient::stream_text`), nicht über `llm-token` (das hört der Chat).
  `stage/history.rs` passt alle Sprecher-Anfragen ins Kontextfenster ein und speichert Zusammenfassungen getrennt
  nach Publikum (`history_summaries`); Änderungen am Verlauf müssen diese verwerfen.
  `stage/npc.rs`: szenengebundene NPCs, gefilterte Erinnerungen mit Quellen-ID und Abruf nach Textrelevanz,
  Beförderung zu V2-PNG + Cognitive Memory. Neue öffentliche Ereignisse außerhalb der Runde ebenfalls mit
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
  „[STAGE — ARC ARCHIVE]“/„[STAGE — CONSISTENCY]“.
  Overlays (`overlay_block` nur für die Figur selbst) und Lorekarten (`relevant_lore_cards`: `party` → Snippets,
  `gm` → nur Planer). `take_memory_sync_batches` (Rundenende, je Mitglied die gefilterte Sicht) → Memory-Pipeline
  mit `transcript` im Hintergrund; Mock erkennt sie an „=== RECENT MESSAGES ===“.
  `stage/director.rs`: Sprecherfolge = Spielerwahl > Flüsterziel > direkte Ansprache > Planer; danach pro Beitrag
  Ansprache-Erkennung, sonst Routing-LLM (Mock erkennt „[STAGE — ROUTING]“). `turn_mode: "continue"` = Runde ohne
  Spieleraktion (Weiter/Auto-Play).
  Der Abbruch-Merker wird nur am Runden-/Chat-Start zurückgesetzt (`reset_abort`), damit „Stopp“ die ganze Runde beendet.
- Lokale TTS (`tts_local.rs`, `crispasr --server`): F5 bekommt unter CUDA `CRISPASR_F5_EMBED_GPU=1` (sonst ~20× langsamer).
  VoiceDesign-Modelle (`voice_design`) brauchen eine Beschreibung (`openai_instructions` der Stimme → `instructions`).
  TADA: `CRISPASR_TADA_WAV_CLONE=1` (WAV-Klon, Encoder/Aligner neben dem Modell), `CRISPASR_TADA_NUM_CANDIDATES=4`.
  Chatterbox Turbo (`speaks_sound_tags`): `voice::actions_to_sound_tags` macht *lacht* zu `[laugh]` vor dem Aktionsfilter.
- 3D-Avatar: gemeinsame Bühne `avatarStage.ts` (Kamera, Licht, gespeicherte Ansicht, Renderschleife), Overlay
  `AvatarViewerChrome.tsx`, Bewegungen über `useAvatarMotions`; `AvatarCanvas` wählt nach Endung `VrmViewer`,
  `GltfViewer` (`.glb`, Mixamo-artige Knochennamen, ARKit-/Oculus-Morphs über `gltfRig.ts` `MorphFace`, Mixamo-FBX per
  `retargetToRig` mit Ruhepose-Ausgleich; Höhe aus Grundpositionen, da Geometrie-Bounds Morphs einrechnen) oder
  `MmdViewer` (`.pmx`/`.pmd`, `@moeru/three-mmd`, Spring-Bone-Physik, Morphs あいうえお/まばたき/笑い …, nur VMD-Bewegungen).
  MMD-Reihenfolge pro Bild: `beforeUpdate` → eigene Knochen auf Ruhe → Mixer → Zusätze → `mmd.update`. Texturen über
  `LoadingManager`-URL-Modifier, Groß-/Kleinschreibung per `list_avatar_model_files`. Import (`avatar_models.rs`): ZIP
  (Shift_JIS-Namen) oder PMX mit Ordner (max. 1 GB/5000 Dateien). E2E: `e2e/tools/make-mmd.mjs` (PMX + VMD), `make-glb.mjs` (GLB über three.js-Exporter).
  Echte Fremdmodelle nur lokal in `assets/test-avatars/` (gitignored); `xvfb-run -a node e2e/local-avatars.mjs` importiert
  jedes davon und legt Screenshots in `assets/test-avatars/screenshots/` ab (nicht Teil von `npm run e2e`).
  glTF: Knochen-Aliase für Mixamo/RPM, MakeHuman, Unreal, Blender, VRoid (`gltfRig.ts`); Größe außerhalb 0,5–3 m wird
  auf 1,6 m gebracht; Bounds über das Skelett nach `updateMatrixWorld` (nicht `updateWorldMatrix`, sonst doppelter
  Maßstab); PBR-Materialien bekommen `useStudioEnvironment` (ohne Umgebung werden metallische Teile schwarz).
- 3D-Avatar (`VrmViewer.tsx`): Startansicht aus Kopf-Knochen und Modellhöhe (`frameUpperBody` in `services/avatarViewState.ts`);
  gespeichert wird nur eine vom Nutzer bewegte Kamera, „Ansicht zurücksetzen“ löscht sie.
  Bewegungen: `.vrma` und Mixamo-`.fbx` (`mixamoRetarget.ts`: Mixamo-Ruhepose → normalisierte VRM-Knochen) in `<Daten>/animations/` (`avatar_motions.rs`, Verwendung in `roles.json`, aus dem Dateinamen
  geraten); `vrmMotions.ts` (`VrmMotionPlayer`: Ruhe-Schleife + Gesten mit Überblendung), die prozedurale Haltung füllt
  nur den Anteil, den keine Animation steuert (`bodyWeight`). Gesten löst `ChatView` nach jeder Antwort über
  `gestureForReply` aus (`utils/avatarGestures.ts`: Rollenspiel-Aktion vor Gefühl) → `avatarSlice.playAvatarGesture`.
  Mundformen aa/ih/ou/ee/oh aus Formanten (`services/lipSync.ts`, `audioPlayer.onAudioFrame(amplitude, visemes)`).
  E2E: `e2e/tools/make-vrma.mjs` und `make-fbx.mjs` (ASCII-FBX im Mixamo-Format) bauen Test-Animationen; der Viewer zeigt `data-motions`/`data-gesture`,
  das Mock antwortet mit `stats.chatReply`.
- 5e-Regeln (`stage/rules5e/`, Plan in `Roadmap_DND.md`): reine Funktionen mit injiziertem Zufall (`impl Rng`, Tests mit
  `StdRng::seed_from_u64`); die Engine entscheidet alle Zahlen, das LLM erzählt nur aus `CombatEvent`s. Gespeichert werden
  nur Grundwerte (`Stats5e` an `Combatant`), Modifikatoren/Übungsbonus werden berechnet. Monster/Klassen kommen aus
  `presets/srd5/*.json` (per `include_str!`, Namen de/en/ru); SRD-Namensnennung (CC-BY-4.0) steht in den READMEs.
  Ablauf in `stage/combat5e.rs`: `SceneDefinition.rules` (`SceneRules`: `ruleset "5e"`, `hero_classes`, `control_companions`)
  → `ensure_party_stats` (in `ensure_party_vitals`) gibt der Gruppe Klassenwerte; der Planer startet Kämpfe nur mit
  Monster-IDs (`PlanCombatant.monster/count`), `hp_updates`/`resource_delta.hp_delta` werden in 5e ignoriert.
  `run_stage_combat(scene_id, action)` (Sperre `stage_turn`, Snapshot) führt die Spieleraktion aus und spielt Monster
  (Engine-KI) und Gefährten (LLM wählt eine Aktions-ID, „[STAGE — COMBAT ACTION]“, sonst Ersatzwahl) bis zum nächsten
  Spielerzug; Ereignisse landen in `combat.events`, der GM erzählt sie („[STAGE — COMBAT REPORT]“) ohne sie zu ändern.
  Frontend: `Combat5ePanel.tsx` (Abenteuer-Reiter), `stageSlice.runStageCombat` + `combatAwaitsEngine` (nach einem
  Rundenzug spielt die Engine automatisch weiter), Log-Texte in `utils/combatEvents.ts` (`fight.*`), Bogen
  `Character5eSheet.tsx`, Regeln im `SceneCreateModal` (`sceneRules.*`). Mock: `stats.stageEncounter` startet einen
  Kampf, „[STAGE — COMBAT ACTION]“ antwortet mit der ersten `attack:`-ID (mit `stats.preferCast` mit der ersten `cast:`-ID).
  Spielbrett (Schritt 2): Karten in `presets/srd5/maps/*.json` (Zeilen + Legende, in `rules5e/data.rs` eingetragen),
  `rules5e/map.rs` (Wegfindung `reachable`/`Reach`, Sichtlinie, `attack_reach`; Diagonale 5 ft), `rules5e/board.rs`
  (`walk` mit Gelegenheitsangriffen, `attack_plans`/`monster_board_plan`/`hero_board_plan`, `actions_in_place`).
  `SceneRules.map_id` → `SceneState.map` beim Kampfstart, Platzierung über Zonen `party`/`spawn`; Zugbudget in
  `EncounterState.turn` (Aktionen `move:x:y`, `dash`, `disengage`, `end_turn`; ohne Karte wie Schritt 1).
  `get_stage_combat_options` liefert erreichbare Felder und Angriffe in Reichweite (`stageSlice.stageCombatOptions`).
  UI: Reiter „Spielbrett“ (`StageBoardView`, öffnet sich bei Kampf mit Karte), `StageBattleMap.tsx` (Kacheln/Tokens aus
  `public/stage/`, Wände abgedunkelt, Raster; Tokens: Monster per SRD-ID, klassische Helden per Name, sonst Porträt).
  Grafiken nach `todo_assets.md`, Regeln geprüft von `stageAssets.test.ts`. E2E `stage-board.mjs` wartet auf `data-busy`.
  Magie (Schritt 3): Zauber in `presets/srd5/spells.json`, `rules5e/spells.rs` (`check_cast` → `cast_spell`, Flächen
  `area_squares` – gespiegelt in `utils/spellArea.ts`, Konzentration, wiederholte Rettungswürfe), Zustände mit Wirkung in
  `rules5e/conditions.rs` (GM-Namen per `normalize_condition`), Todesrettung in `combat.rs` (`SceneRules.heroic_death`),
  Fertigkeiten in `rules5e/skills.rs` (`check_bonus` für `dice_check`), Rasten `combat5e::rest_party`.
  Aktion `cast:<zauber>:<grad>:<ziel-id>` bzw. `…:@x:y`; Bonusaktions-Zauber lassen die Aktion offen
  (`TurnBudget.bonus_action_used`). `CombatOptions.spells` (`spell_options`) füllt das Zauberbuch `Combat5eSpells.tsx`;
  Flächenzauber werden über `stageAimedSpell` auf dem Brett gezielt (`data-cast-at`, Vorschau `data-area`).
  Gefährten heilen Sterbende ohne LLM (`urgent_cast`), sonst bis zu drei Zauber aus `spell_plans` als Optionen.
  Zaubernamen fürs Log/den Bogen über `list_srd_spells` (`utils/srdSpells.ts`). E2E `stage-spells.mjs`.
  Erkundung (Schritt 4): Karten-JSON mit `rooms` (Rechteck + englische GM-Beschreibung), `encounters` (Raum → Monster,
  Zone), `exits` (Zone → Karte), `traps`, `locks`; Laufzeitzustand in `BattleMap.revealed` (leer = kein Nebel) und
  `triggered` (Begegnungen, `room:<id>`). Reine Logik `rules5e/explore.rs`, Szene `stage/explore5e.rs`
  (`run_stage_exploration`: `move`/`use`/`pick`/`force:x:y`, ohne Aktion = Start; ein Snapshot je Schritt, auch wenn
  eine Begegnung startet → `combat5e::finish_round`). Geschlossene Türen öffnen sich im Vorbeigehen (`open_doors_on`),
  Schlösser blockieren (`walkable`). Erkundet die Gruppe, behält `place_on_map` Karte und Positionen und setzt nur
  Gegner auf die Zone. Planer: `planner_map_rule` (Räume, Begegnungen, Zonen, Karten), Plan-Felder
  `encounter.encounter`/`encounter.zone`/`map_change` → `apply_planner_map`. Mock erkennt
  „[STAGE — EXPLORATION REPORT]“. UI: `Explore5ePanel.tsx`, Nebel und Klickflächen (`data-explore`, `data-use`) in
  `StageBattleMap`, Log `utils/exploreEvents.ts`. E2E `stage-explore.mjs`.
- Stimmeffekte: `VoiceConfig.effects` (`VoiceEffects`), gerendert in `services/voiceEffects.ts` (OfflineAudioContext, Tonhöhe per
  WSOLA) über `audioPlayer.enqueue(…, effects)`; jeder neue Abspielweg muss `config.effects` mitgeben.
- Bild-LoRAs (`image_loras.rs`): `sd-server` ignoriert `<lora:…>` im Prompt; LoRAs gehen als `lora: [{path, multiplier}]`
  an `txt2img`, und vorher muss `GET /sdapi/v1/loras` den Ordner neu einlesen, sonst „invalid lora path“. Eine LoRA
  fremder Modellfamilie wendet still 0 Tensoren an → Katalog-LoRAs nur an ihre `family` schicken.
- Start: `settingsLoaded` ist erst nach `initApp` wahr. Davor speichert `saveCurrentSettings` nichts (sonst überschreiben
  Standardwerte die Einstellungen) und `refreshCharacters` wählt keinen Charakter; `initApp` öffnet den gespeicherten
  direkt über `refreshCharacters(settings.active_character_id)`. Tests, die Speichern prüfen, setzen `settingsLoaded: true`.
- Charakter-Importe (Datei, Hub, Chub, URL) laufen über `characters::store_imported_card`: gleicher Name →
  `backend.characters.exists`, das Frontend fragt per `services/characterImport.ts` (`importWithOverwrite`) und ruft mit
  `overwrite` erneut auf. Nie umbenennen („_1“); alte Kopien gehen in den Papierkorb, gelöschte werden wieder sichtbar.
- Lokale Vision nur mit gewählter `mmproj`; ohne macht `attachments::prepare` aus Bildern einen Hinweis.
- Swipes: `swipes_json` + `swipe_index`; „Neu generieren“ hängt an, überschreibt nie.
- Neuer Chat: `create_chat_session` legt Sitzung und Begrüßung (`greeting`) in einer Transaktion an.
  Anhänge ohne Nachricht und Ordner gelöschter Chats entfernt der Start im Hintergrund
  (`attachments::remove_orphans`, nur Dateien älter als 1 h). GGUF-Downloads stoppt `cancel_gguf_download`.
- Chat-Zusammenfassung: Änderungen an Nachrichten bis `summary_until` (Bearbeiten, Swipe, Löschen) verwerfen sie
  (`discard_stale_summary` in `memory/chats.rs`, gespiegelt in `chatSlice` `withoutStaleSummary`).
- Chat-Generierung: Upload/Nutzernachricht, Prompt, Anfrage und Antwortspeicherung liegen innerhalb der
  Fehlerbehandlung; `finally` gibt die Sperre frei. `generationFailure` enthält einen sichtbaren Fehler und
  die Quellnachricht für Senden, Swipe oder Fortsetzen. `retryGeneration` verwendet die gespeicherte
  Nutzernachricht, statt sie erneut einzufügen. Fehler vor deren Speicherung werden an den Composer gegeben,
  der Text/Dateien erhält. HUD, Kontextanzeige und Zusammenfassung ändern sich erst nach Antwortspeicherung.
  `generationChatId` begrenzt native Stream-Anzeigen auf den zugehörigen Chat. Abbruch stoppt auch eine
  noch laufende Promptvorbereitung: Jeder Lauf besitzt einen AbortController für Datei-Lesen und Promptaufbau.
  Nach erfolgreichem nativen Abbruch beendet `waitWithAbort` das Warten sofort; späte Lore-Ergebnisse dürfen
  weder Spannung ändern noch Ersatzabfragen starten. Anhänge werden nacheinander verarbeitet.
  Native Inferenz und bereits gestartete Datei-/Nachrichten-Schreibvorgänge behalten ihre Sperre bis zum Abschluss.
  Ein bereits laufender Datenbankschreibvorgang wird durch Abbruch nicht rückgängig gemacht.
- Native Chat-Streams: Senden, Swipe, Fortsetzen und Wiederholen erzeugen je eine neue `generationId`.
  `send_chat_message` erhält sie als eigenes Argument und gibt sie als `generation_id` in Text-, Gedanken-
  und Abschlussereignissen sowie im Ergebnis zurück. Listener prüfen ID und aktiven Chat, bevor sie Verlauf,
  Sprachausgabe oder Emotion beeinflussen. Navigation/Abbruch verwerfen die ID; eine verspätete Emotionserkennung
  prüft den Kontext nach ihrem Await erneut. Die zuletzt beendete ID bleibt bis zum nächsten Vorgang erhalten.
- Chat-Laden: Nur der neueste Sitzungsabruf im passenden Charakter-Kontext darf den Verlauf setzen.
  Auswahl startet mit leerem Verlauf, `isChatLoading` und zurückgesetztem `chatLoadError`; Fehler sind sichtbar
  und über `retryChatLoad` wiederholbar. Senden bleibt ohne aktiven Chat und während Laden/Lesefehlern gesperrt (E2E klickt über `clickSend` aus `harness.mjs`). Navigation fordert
  Abbruch der laufenden Generierung an und stoppt Chat-Sprachausgabe; eine Abrufnummer schützt auch Wechsel A → B → A vor alten Resultaten.
  Späte Sitzungslisten und Stimmenkonfigurationen eines anderen Kontexts dürfen nichts überschreiben.
- Abbruchbereiche: `AppState.inference_client` gehört zum Chat, `stage_inference_client` zu Stage.
  Stage-Runde, Neu-Generieren und Rast erhalten den Stage-Client. `abort_chat_generation` und
  `abort_stage_turn` beeinflussen nur ihren Bereich; `stopStageTurn` nutzt ausschließlich den Stage-Befehl.
  Jeder Client hat einen eigenen Merker und Watch-Signalzähler. Native Chat-Anfragen halten außerdem
  `AppState.chat_generation`; Stage-Runde, Neu-Generieren und Rast teilen `AppState.stage_turn`.
  `try_lock` lehnt zusätzliche Aufrufe vor Abbruch-Reset oder Zustandsänderungen mit übersetzbarem Fehler ab.
  Die Guards bleiben bis zum Command-Ende bestehen und werden auch bei Fehler/Abbruch freigegeben.
  Stage-Verlaufsänderungen (Bearbeiten, Löschen, Rückgängig, Zurücksetzen) nehmen ebenfalls `stage_turn`.
  Direkte interne Generierungen und andere Stage-Editor-/Navigationsbefehle nutzen diese Sperren nicht.
- Stage-Planungsabbruch: `history::prepare` liefert bei Abbruch `None` und umfasst Kontextzählung,
  Kontextanpassung und interne Zusammenfassung. Der Planer-Aufruf liegt ebenfalls in `with_abort`.
  Abbruch vor einem Plan beendet die Runde über `finish_turn`: Spielerzeile und bereits abgeschlossene
  Arbeit bleiben gespeichert, weitere Planmechanik/Erzählung werden nicht gestartet. Sprecher-Vorbereitung
  endet ebenso bei Abbruch. Routing beendet die Runde bei Abbruch ohne Ersatzsprecher.
  Archivierung und Konsistenzprüfung liegen ebenfalls in `with_abort`: abgebrochene Archive bleiben
  offen, die fällige Faktenprüfung behält ihren Zähler für die nächste Runde. Ein bereits gesetzter
  Stage-Abbruch startet keine Faktenprüfung und erhöht deren Zähler nicht.
- Backend-Abbruch: `with_abort` beendet wartende asynchrone Vorbereitung, HTTP-Header und SSE-Lesen über
  ein Watch-Signal. Im Chat umschließt `with_abort` nur die Vorbereitung; der Stream endet bei Stopp selbst und
  liefert den Teiltext mit `DoneEvent.aborted`, den das Frontend (`keepsPartial`) als Antwort speichert. `send_chat_message` setzt den Merker vor der Vorbereitung zurück, `stream_chat` nicht erneut.
  Eine neue Runde setzt nur den Merker zurück; der Signalzähler lässt alte Wartevorgänge abgebrochen.
  Synchrone Datei-/SQLite-Vorgänge und direkte interne `generate_direct`-Aufrufe werden dadurch nicht abgebrochen.
- Nachrichten bearbeiten: `editChatMessage` gibt Schreibfehler weiter; der Inline-Editor schließt erst nach Erfolg.
  Während des Schreibens sind Text, Speichern und Abbrechen gesperrt; bei offener Bearbeitung auch die Swipe-Navigation.
  Verspätete Speicherergebnisse eines anderen Chats dürfen den aktuellen Verlauf nicht aktualisieren.
- Löschen ohne Rückfrage, mit „Rückgängig“ (8 s): Nachrichten und Chats (`chatSlice`, `pendingChatDeletes` filtert
  neu geladene Listen), Erinnerungen (`memorySlice`, `pendingForgets`), Stage-Nachrichten (Szenen-Snapshot per `undoStageTurn`).
- Entwürfe über Neustarts: `utils/drafts.ts` (localStorage); Composer je Chat (`composer:<id>`), Seitenleiste als `sidebar`,
  Memory-Drawer als `memory` (nur Inhalte, keine Speicher-/Lade-Merker).
- Chat-Seitenleiste: Notiz- und Zusammenfassungsentwürfe werden nach Chat-ID getrennt im Sidebar
  gehalten (und gesichert); Änderungen an Sitzungsdaten überschreiben offene Entwürfe nicht. Nur erfolgreiches Speichern oder
  Zurücksetzen entfernt den jeweiligen Entwurf. Laufende Vorgänge sperren die Felder auch nach Wiederöffnen.
  Umbenennen und Author's Note geben Schreibfehler weiter und aktualisieren nach Erfolg nur die betreffende
  Sitzung im Store; kein erneutes Listenladen nach dem Schreiben. Die Notiztiefe 0 muss erhalten bleiben.
- Hintergrundaufgaben: `store/slices/taskSlice.ts` (`trackTask` → erledigt/abgebrochen (Code `…Cancelled`)/fehlgeschlagen),
  Anzeige `components/TaskCenter.tsx` (hört Download-Fortschritt und `local-image-status`). Modellstart endet über
  `fetchServerStatus`; Bild-/LoRA-/TTS-Downloads laufen über `services/downloadTasks.ts`. Neue lange Vorgänge dort eintragen.
- Chat-Gestaltung: `ChatSession.style` (`ChatStyle`, Spalte `style_json`, Migration v5; leer = Standard) über
  `update_chat_style`; Panel `components/chat/ChatStylePanel.tsx` (Stage-Bibliothek für Bilder/Klänge), Anzeige in `ChatView`
  (`data-text-size`, `data-bubbles`, CSS in `App.css`), Klang über `hooks/useAmbientSound.ts`.
- Chat-Werkzeuge (`chat_tools.rs`, Schalter `chatTools`): Text-Protokoll `<tool_call>{name, arguments}</tool_call>` statt
  nativer Tool-Calls; `InferenceClient::stream_chat_with_tools` filtert die Tags (`ToolCallFilter`), führt aus und fragt mit
  `[TOOL RESULT]` erneut (max. 3 Runden). Anbieter fassen System-Nachrichten zusammen; das Mock erkennt „# Tools“ im Text.
- Prompt-Log: `send_chat_message` legt den gekürzten Prompt in `AppState.last_prompt` ab (`modules/prompt_log.rs`,
  ohne API-Schlüssel); Anzeige `components/chat/PromptLogModal.tsx` über das Chat-Menü.
- `<state>{…}</state>` am Antwortende aktualisiert HUD-Variablen (`utils/stateParser.ts`) und wird ausgeblendet.
- Memory: `addManualMemory`, `addManualDiary`, `generateManualDiary` und `createMemoryBackup` geben Fehler an
  ihre Aufrufer weiter. Formulare müssen diese anzeigen; Eingaben erst nach erfolgreichem Speichern leeren.
  Der Memory-Drawer rendert per Portal in `document.body`, damit der `backdrop-filter` des HUD seine Größe nicht begrenzt.
  Psychologie und Beziehung nutzen Entwürfe im Drawer (nach Charakter und Persona getrennt), die Reiterwechsel
  und Schließen überleben. Erst explizites Speichern schreibt; währenddessen bleiben die Felder auch nach
  Wiederöffnen gesperrt. `updatePsychology`, `updateRelationship` und `triggerEmotionalDecay` geben Fehler weiter.
  Verspätete Übersichten für einen anderen Charakter/eine andere Persona dürfen den aktuellen Zustand nicht ersetzen.
  Auch Markdown-Entwürfe und laufende Vorgänge liegen im Drawer. `fetchMemoryMarkdown` wirft bei Lesefehlern;
  nur erfolgreiches manuelles Nachladen darf einen Entwurf verwerfen. Hintergrund-Nachladen nach einer
  bereits erfolgreichen Reflexion/Wiederherstellung/Import protokolliert Lesefehler, ohne den Schreibvorgang als fehlgeschlagen zu melden.
- Memory-Lesen: `memoryOverviewError` und `memoryBackupsError` halten sichtbare Ladefehler fest; bestehende
  Daten bleiben erhalten. Nur der neueste Abruf im passenden Kontext darf Daten, Fehler und Ladezustand setzen.
  Charakterwechsel leert auch die Snapshot-Liste; Personawechsel leert Übersicht und deren Fehler.
  Nach erfolgreichem Schreiben melden fehlgeschlagene Nachladevorgänge keinen Schreibfehler, sondern den
  separaten Ladehinweis im Drawer. Wiederholen lädt ausschließlich die Übersicht bzw. Snapshot-Liste neu.
  Snapshot-Auflistung behandelt nur ein fehlendes Verzeichnis als leer; Verzeichnis- und Metadatenfehler werden weitergegeben.
- Memory-Vorgänge: Import und Snapshot-Wiederherstellung schreiben einschließlich Heilungsprotokoll in einer
  SQLite-Transaktion. Verbindungsgebundene `*_on`-Helfer vermeiden erneutes Sperren des Datenbank-Mutex.
  Import liest alle Dateien vor der Transaktion; fehlende optionale Dateien sind erlaubt, Lesefehler nicht.
  `restore_memory_backup` erhält `char_id` und löst einzelne Dateinamen im Backup-Verzeichnis dieser Figur auf.
  Snapshot-Erstellung bricht bei Lesefehlern ab und schreibt kein unvollständiges Backup.
  `memoryOperation` sperrt Import, Wiederherstellung, Snapshot-Erstellung und Reflexion gegenseitig, auch nach
  Schließen/Reiterwechsel. Reflexionsfehler werden weitergegeben und in `memoryReflectionError` angezeigt.
  Die Reflexion holt erst alle Modellantworten (Router, Archivar, Tagebuch) und schreibt dann alles in einer
  Transaktion (`apply_reflection`); ein Fehler ändert nichts.
  `memoryMarkdownError` zeigt auch fehlgeschlagenes Hintergrund-Nachladen nach erfolgreichem Schreiben an;
  Wiederholen lädt nur Markdown und erhält offene Entwürfe. Alte Kontextergebnisse dürfen nichts überschreiben.
- Companion `execute_code`: nur mit `allow_code_execution` (Standard aus, Companion-Einstellungen werden nicht gespeichert
  → gilt bis Neustart); geprüft in `request_tool_call` und in `execute_internal_sync`. Neue Werkzeuge in
  `components/companion/toolEffects.ts` mit ihren Wirkungen eintragen (sonst „extern, unbekannt“).
- Episodische Erinnerungen (Migration v4): Quelle (`source_chat_id`, `source_message_ids`), Herkunft (`origin`:
  auto/manual/edited, '' = alt), `pinned` (zuerst im Kontext), `needs_review`. Neue Erinnerungen mit Quelle über
  `add_episodic_memory_from` + `MemorySource`. Nachrichtenänderungen in `memory/chats.rs` rufen
  `flag_memories_from_messages`; jede Änderung landet in `soul_memory_history` (`log_memory_change`).
- Lange Chats: Sprung zu einer Nachricht über `chatSlice.requestChatJump` → `MessageList` (`jumpTo`, scrollt die
  virtualisierte Liste, Klasse `message-flash`). Lesezeichen in `chat_bookmarks` (per Join an Nachrichten gebunden),
  „Ab hier neu“ = `branch_chat` (kopiert Verlauf, Varianten, Anhänge per `attachments::copy_to_chat`, Lesezeichen).
- Einrichtungsassistent: `components/onboarding/OnboardingParts.tsx` (Cloud-Test, lokaler Weg, erste Antwort) nutzt
  `quick_reply` (eine kurze Antwort außerhalb eines Chats, 90 s) und `list_starter_models` (`models_hub::STARTERS`,
  Empfehlung = `preferred`-Modell (Ternary Bonsai 2 27B), wenn es in VRAM − 1,5 GB passt, sonst das größte passende).
  Starter mit `runtime: "prism"` blenden im Assistenten zusätzlich die PrismML-Laufzeitkarte ein.
- Befehlspalette: Einträge für Einstellungen/Optionen/Integrationen in `CommandPalette.tsx`; Optionen brauchen eine
  `id="setting-…"` und springen per `utils/revealSetting.ts`. `SettingsView` folgt `openSettingsSection` auch offen.
- Companion-Tools: nur ausdrücklich geprüfte interne Tools in `companion.rs` → `tool_allows_auto_approval`
  dürfen automatisch freigegeben werden. MCP-/unbekannte Tools, Screenshots, Zwischenablage und schreibende
  Dateiaktionen laufen über den Bestätigungsbanner; ausgeführt wird in `execute_internal_sync`.

## Stand

Erledigtes (Portierung Phasen 1–18, Verbesserungen, TTS, Neutralisierung, Inhalte, Qualität) steht in
`roadmap_abgeschlossen.md`, alles Offene in `roadmap.md`. Daten: `<Daten>` = `~/.local/share/otakusoul` (Linux) mit `runtimes/`, `image-models/`, `tts-models/`,
`voices/`, `attachments/`, `otakusoul.db`; Entwickler-Modelle in `assets/models/` (gitignored).
