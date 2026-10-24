# AI.md – Wegweiser für KI-Assistenten

OtakuSoul: Desktop-App für KI-Rollenspiel-Charaktere (Tauri 2, Rust-Backend, React 19/TS/Vite/Tailwind 4/Zustand).
Port des Python-Projekts *Soul of Waifu* (vollständig eigenständig und entkoppelt); **kein Python in der App**. Repo öffentlich: github.com/SnowwhiteOakheart/OtakuSoul.
Nutzer mit „Du“ ansprechen. Antworten, Commits und Doku auf Deutsch.
`CLAUDE.md` (Claude Code) und `AGENTS.md` (Codex, Cursor u. a.) verweisen hierher – Inhalte und Regeln nur in dieser Datei pflegen. Für eine tokensparende Schnellreferenz der Module, Befehle und Themenbereiche existiert `ARCHITECTURE_INDEX.md`.

## Regeln

- Tests nur bei Bedarf ausführen; der Assistent entscheidet anhand der Änderung über Umfang und Zeitpunkt.
  Erforderliche Checks vor dem Commit ausführen und den Commit an deren erfolgreichen Exit-Code koppeln.
  Die vollständige Suite (`npm run check` bzw. `npm run e2e`) nur bei sinnvoller Abdeckung breiter Änderungen
  oder konkretem Regressionsverdacht ausführen. UI-Verhalten gezielt per E2E prüfen und relevante Screenshots
  in `e2e/screenshots/` ansehen. Bereits bestandene Prüfungen nur bei relevanten Änderungen erneut starten.
- Thematische Commits direkt auf `main`, `feat(bereich): …` auf Deutsch, danach sofort `git push`. Kein GitHub-CI.
  Der Nutzer erlaubt Commit und Push für die beauftragte Projektarbeit dauerhaft; keine erneute Rückfrage nötig.
- Der Nutzer arbeitet parallel im Repo: fremde uncommittete Änderungen nie mitcommitten.
- `roadmap.md` (offene Punkte) im selben Commit abhaken, Erledigtes nach `roadmap_abgeschlossen.md` verschieben (nur lokal, in `.gitignore`, nie committen); `README.md`/`AI.md` bei neuen Modulen/Features anpassen.
- Pfade nur über `paths::base_dirs()` (ProjectDirs bzw. `$OTAKUSOUL_HOME/config|data`); OS-Code mit `#[cfg]`.
- Modelle nie mitliefern, nur von der Quelle laden (SHA-256); nicht-kommerzielle Stimmmodelle (TTS) gesperrt, bis freigeschaltet;
  Chat-Modelle (LLM) nur ohne Login an der Quelle, eingeschränkte oder fehlende Lizenzen nur gekennzeichnet (`license_kind`,
  automatische Empfehlung nur frei lizenziert); Bildmodelle und LoRAs nur gekennzeichnet (Bilder bleiben privat in der App,
  Entscheidung des Nutzers).
  Stimmklonen nur mit Einwilligung.

## Befehle

| Zweck | Befehl |
|---|---|
| Entwickeln | `npm run tauri dev` (Linux: `npm run tauri:linux`) |
| Alle Checks | `npm run check` |
| TS-Typen aus Rust (ts-rs → `src/types/generated/`, mit einchecken) | `npm run types:gen` |
| E2E-Rauchtest (baut nach `target/e2e`, tauri-driver + Mock-LLM) | `npm run e2e` (`e2e:run` ohne Build) |
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
| Daten | `memory/` (SQLite: Kognitives Gedächtnis, `chats.rs`, Snapshots), `settings.rs` (`settings.json`), `paths.rs`, `secrets.rs` (Schlüsselbund), `characters.rs` (V2-Karten PNG/JSON, Personas), `lorebook.rs`, `profile_backup.rs` |
| Features | `memory_pipeline.rs` (Router/Archivist/Diary), `stage/` (Game-Master; `stage/rules5e/` = 5e-Regel-Engine, SRD-Daten in `presets/srd5/`), `companion.rs` + `companion_tools.rs` + `mcp_client.rs`, `voice.rs`/`kokoro.rs` (TTS/STT), `image_generator.rs`, `models_hub.rs`, `hub.rs`, `web_server.rs`, `discord.rs`, `updater.rs`, `logger.rs` |

Frontend `src/`: `services/api.ts` (ein Wrapper je Command), `store/slices/*.ts` (Zustand, Zugriff per
`useStoreFields('a','b')`), `store/helpers.ts` (`resolvePromptWithLore`, `llmTarget`), `components/<bereich>/`,
`presets/locales/ui/*.json` (Oberflächentexte, siehe „Oberflächensprachen“), `types/index.ts` (+ `generated/`), `utils/errors.ts`.
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

## Abläufe

- **Nachricht senden:** `chatSlice.sendMessage` → Anhänge `save_attachment` → `add_chat_message` → `resolvePromptWithLore`
  (Lorebooks, `assemble_prompt` = System-Prompt + Nachspann) → Payload (+ Author's Note in Tiefe N, Nachspann am Ende)
  → `send_chat_message`: `attachments::prepare` → `context_window::fit` (kürzt von vorn) → `stream_chat` (Events
  `llm-token`/`llm-thought`/`llm-done`) → Antwort speichern → ggf. `summarizeDroppedMessages` im Hintergrund.
- **Gruppen-Chats:** Ein Chat einer Figur (Gastgeberin, `character_id`) lädt bis zu `MAX_CHAT_GUESTS` = 4 Gäste ein
  (`chat_sessions.members_json`, `set_chat_members`, Reiter „Gruppe“ = `ChatGuestsPanel`; Knopf „Gruppenchat“ im Reiter
  „Chats“ legt einen Chat an und öffnet die Einladung per `startPicking`). Antworten tragen
  `chat_messages.speaker_id` ('' = Gastgeberin; Swipe/Fortsetzen/Zweig behalten ihn). `chatSlice.writeReply` schreibt eine
  Antwort je Sprecher: `speakerSetup` → eigene Karte, eigenes Gedächtnis, `PromptContext.group` (andere Anwesende) und
  `utils/groupChat.ts` `groupHistory` (eigene Zeilen `assistant`, fremde als `user` mit „Name: “). Runde nach einer
  Nutzernachricht: `nextSpeaker` → `route_group_chat` (`modules/group_chat.rs`: Ansprache in der letzten Zeile, dann noch
  nicht drangewesene Angesprochene aus `user_text`, sonst Routing-Prompt aus Stage mit „[CHAT — ROUTING]“). Ansprache
  (`director.rs` `detect_direct_addresses`) zählt auch „…! Name, …“ am Satzanfang; wer eine Frage bekommt, antwortet zuerst, höchstens `GROUP_MAX_REPLIES` = 3, Ende bei `PLAYER`, „Stopp“ beendet die Runde; „Jetzt antwortet …“
  = `replyAs` (Nachspann „It is X's turn“). Auto-Reflexion je Figur (`triggerMemoryPipeline(n, characterId)`, Transkript mit
  `speaker_names`), Stimme je Gast (`loadSpeakerVoice`). Avatar: `ChatView` zeigt den Sprecher (`generationSpeakerId`, bleibt bis
  zum nächsten; Chatwechsel setzt ihn zurück), jede Figur behält ihren Ausdruck (`avatarSlice.speakerEmotions`), Gesten nur
  für die gerade gezeigte, laufende Antwort. Kopfleiste „Alle zeigen“ (`usePersistentFlag` `otakusoul.chat.groupEveryone`) =
  `avatar/GroupPortraits.tsx`: alle als 2D-Porträt (3D/Live2D nur in der Einzelansicht), Sprecher hervorgehoben. JSONL: `name` = Sprecher,
  Import erkennt Gäste über `speaker_id` oder bekannte Namen. Mock: `stats.chatRoutes`. E2E `chat-group.mjs`.
  Memory-Drawer: Auswahl „Gedächtnis von“ setzt `memorySlice.memoryCharacterId`; `utils/groupChat.ts` `memoryCharacter(state)`
  liefert die angezeigte Figur (Gast nur, solange er Gast im offenen Chat ist, sonst die aktive) – alle Memory-Aktionen nutzen
  sie, `cognitiveOverview` gehört dann dem Gast (Host-Prompt holt sein Gedächtnis in `speakerSetup` selbst). Schließen setzt
  zurück. E2E `chat-memory-guests.mjs`.
- **Chat-Export/-Import (SillyTavern-JSONL):** Seitenleiste → `export_chat_jsonl` (mit `target_path` schreibt das Backend die
  Datei; der Webview kann nicht herunterladen) / `import_chat_jsonl`. Export schreibt eigene Felder (`role`, `swipe_variants`,
  `author_note`) plus ST-Felder (`extra.reasoning`, `swipe_info[i].extra.reasoning`, `chat_metadata.note_prompt/note_depth`);
  Import liest beide, übernimmt `send_date` (`send_date_secs`: Zahl in ms/s, ST-Text, ISO) und lässt ST-`is_system`-Zeilen
  ohne `role` weg (dort für die KI ausgeblendet).
- **Szenenbild:** HUD „Foto“ = `generateSceneImage('chat')` (Porträt), Nachrichtenmenü „Diesen Moment als Bild“ =
  `generateSceneImage('chat', { kind: 'moment', upToMessageId })` (Verlauf bis zu dieser Antwort; `image_generator::image_kind`).
  Bild erscheint in `SceneImageCard` (nur Sitzung) und der Galerie; „Als Chat-Hintergrund“ = `setSceneImageAsBackground`
  (`save_stage_background` + `ChatStyle.background`). `DEFAULT_CHAT_STYLE` liegt in `utils/settingDefaults.ts`. Mock bietet
  `/sdapi/v1/txt2img` (Anbieter `automatic1111`), E2E `chat-scene-image.mjs`.
- **Nachricht merken:** Aktion im Nachrichtenmenü (Gehirn) → `chat/RememberMessageDialog.tsx` (Vorschlag `memorySuggestion` ohne
  `*…*`/`((…))`, Kategorie, Wichtigkeit) → `addManualMemory(…, source)` → `add_episodic_memory` mit optionalem `chat_id`/
  `message_ids` (Herkunft `manual`, Quelle markiert die Erinnerung bei späteren Änderungen). E2E `chat-remember.mjs`.
- **Treffer je Antwort:** `resolvePromptWithLore` liefert `ResolvedPrompt` mit `hits` (`PromptHits`: Lorebook-Einträge mit Buch und
  Anweisungs-Kennung, Erinnerungen aus `recent_memories`, Zusammenfassung ja/nein); `chatSlice.promptHits` hält sie je
  `hitKey(messageId, swipeIndex)` nur für die laufende Sitzung (Fortsetzen über `mergeHits`). Anzeige `chat/PromptHitsView.tsx`
  (Knopf in der Kopfzeile der Antwort, `data-prompt-hits`). E2E `chat-prompt-hits.mjs`.
- **Mit OpenRouter anmelden** (`modules/openrouter_auth.rs`, Befehle `openrouter_login`/`openrouter_login_cancel`): OAuth mit
  PKCE (S256), Rückruf auf `http://localhost:<freier Port>/callback` (OpenRouter erlaubt jeden Port; gelauscht wird auf
  127.0.0.1 und ::1), `state` gegen fremde Antworten, 5 min Zeitlimit. Code → `POST /api/v1/auth/keys`; `GET /api/v1/key`
  `is_free_tier` → kostenloses Modell per `pick_free_model` (Vorzugsliste nach Präfix, die `:free`-Liste ändert sich oft).
  Die Browserseite spricht die Oberflächensprache (`ui_locales::ui_text`). Knopf `settings/OpenRouterLoginButton.tsx` im
  Assistenten (nur bei OpenRouter, übernimmt auch die Entwürfe) und in den Anbieter-Einstellungen. Kein E2E (öffnet den
  echten Browser) → Rust-Test für den Rückruf, Komponententest `openRouterLogin.test.tsx`.
- **Wörter & Wendungen:** `AppSettings.avoid_phrases` (`avoidPhrases`) → `PromptContext.avoid_phrases` → `avoid_rule` im Nachspann
  (vor der Antwortlänge); `AppSettings.reply_replacements` = Regex-Skripte (`ReplyReplacement`: find/replace/regex, `name`,
  `disabled`, `on_input`/`on_output`, `mode` save|display|prompt; nur Expertenmodus). `utils/replyFilters.ts`: `save` für
  Antworten vor `extractStateUpdates` (Senden, Swipe, Fortsetzen) und für Nutzernachrichten vor `addChatMessage`; `display`
  in `MessageList`/Live-Text; `prompt` per `forPrompt` an allen drei `sendChatMessage`-Stellen. `find` darf `/muster/flags`
  sein (sonst `gu`); ungültige RegEx überspringt `ruleError`. ST-Import `importSillyTavernScripts` (placement 1/2,
  `markdownOnly`/`promptOnly` – beide gesetzt = zwei Regeln; `{{match}}` in jeder Schreibweise und `$0` → `$&`, per Funktion,
  sonst setzt `replace` `$&` selbst ein; geprüft gegen `public/scripts/extensions/regex/engine.js`). Alte Regeln ohne
  neue Felder gelten weiter für Antworten (`Default` von `ReplyReplacement`). UI `settings/RegexScriptSettings.tsx` im Antwortstil,
  Textfelder speichern beim Verlassen. Logit-Bias/gesperrte Tokens bewusst nicht (llama.cpp sperrt nur Einzeltokens).
  E2E `chat-reply-filters.mjs`.
- **Quick-Replies:** `AppSettings.quick_replies` (`QuickReply`: label/message/mode `send`|`insert`) → `QuickReplyBar` in
  `ChatComposer` (nur wenn Einträge da sind, `data-quick-replies`); `utils/quickReplies.ts` füllt `{{char}}`/`{{user}}`/`{{input}}`
  und importiert ST-Sets (`qrList` bzw. alte `quickReplySlots`; Einträge mit `/…` = STscript werden ausgelassen und gezählt).
  `handleSend(override)` – nie `onClick={handleSend}`, sonst landet das Klick-Event als Text. UI `settings/QuickReplySettings.tsx`
  im Antwortstil, E2E `chat-quick-replies.mjs` (Feld leeren mit `clearValue`, `setValue('')` lehnt WebDriver ab).
- **SillyTavern-Presets:** `utils/sillyTavernPresets.ts` `importSillyTavernPreset` erkennt Chat-Completion-Preset (Sampler +
  `prompts` `main`/`jailbreak` → `PromptTemplate.main`/`post_history`), Text-Completion-Preset (`temp`, `rep_pen`, Dynatemp
  min/max → Mitte + `dynatemp_range`, DRY/XTC nur wenn an), Systemprompt (`name`+`content`), Instruct (nur altes
  `system_prompt`), Kontextvorlage und Master-Export (`instruct`/`context`/`sysprompt`). Instruct-Sequenzen und Kontextvorlage
  werden nur gemeldet (Chat-Vorlage des Modells), ebenso aktive Sampler ohne Gegenstück (`unsupported`: Typical-P, TFS, Mirostat …).
  Geprüft am 20.10.2026 mit allen 99 Presets aus `SillyTavern/default/content/presets` (leerer Systemprompt „Blank“ = erkannt,
  nichts zu übernehmen; das mitgelieferte Quick-Reply-Set enthält nur Slash-Befehle → Hinweis statt Erfolgsmeldung). Knopf `settings/SillyTavernPresetImport.tsx` in der Preset-Leiste,
  Zusammenfassung per `confirmDialog`; ohne eigene Vorlage ist die erste eingebaute die Basis. Dateiauswahl lässt sich im E2E
  nicht bedienen → Komponententest `sillyTavernPresetImport.test.tsx`.
- **Antwortlänge pro Chat:** `ChatStyle.reply_length` (`short`/`medium`/`long`, leer = Vorlage), Auswahl `ReplyLengthPicker` unter dem
  Eingabefeld; `ChatStylePanel` behält den Wert beim Speichern/Zurücksetzen. Prompt: `PromptContext.reply_length` →
  `reply_length_rule` am Ende des Nachspanns; `helpers.ts` `chatSampling` begrenzt `max_tokens` (400/900, ausführlich ≥ 2048,
  nicht bei Denkmodus). E2E `chat-reply-length.mjs`.
- **Wiederholungen:** Antwortstil → „Abwechslung“: `settingDefaults.ts` `VARIETY_SAMPLING` (DRY, XTC, Presence/Frequency;
  an = `varietyOn`, d. h. DRY > 0) und `AppSettings.reroll_repeats` (`rerollRepeats`, Standard an): `chatSlice.sendMessage`
  prüft die gespeicherte Antwort mit `utils/repetition.ts` `isRepeat` (Wort-Tripel gegen die letzten 3 Antworten) und ruft
  danach einmal `regenerateMessageSwipe` (Kopie bleibt Swipe). DRY/XTC/Dynatemp gehen nur an `local_llama`/`custom`
  (`providers.rs`). E2E-Harness setzt `reroll_repeats: false` (Mock antwortet immer gleich), Test `chat-repeats.mjs`.
- **Regieanweisungen:** Text in `((…))` ist eine Anweisung an die KI außerhalb der Geschichte (`modules/ooc.rs`): Regel
  `ooc::prompt_rule` steht immer in den Formatierungsregeln, `ooc::strip` hält sie aus Chat-Zusammenfassung und
  Memory-Pipeline heraus. Composer-Umschalter (Filmklappe, `asDirection`), Anzeige `RoleplayMessage` `splitDirections`
  (`data-ooc`). E2E `chat-direction.mjs`.
- **Makros:** `modules/macros.rs` (`expand`, Eingabe `MacroInput`) füllt `{{char}}`/`{{user}}`, `{{random:a,b}}` (jede Antwort neu),
  `{{pick:a,b}}` (stabil je Chat über `PromptContext.macro_seed` = Chat-ID), `{{roll:2d6+1}}`, `{{time}}`/`{{date}}`/`{{weekday}}`/
  `{{isodate}}`/`{{isotime}}`, `{{idle_duration}}` (`PromptContext.idle_seconds`, `helpers.ts` `idleSeconds`), `{{newline}}`, `{{trim}}`,
  `{{// Notiz}}`, `{{noop}}`; Unbekanntes bleibt stehen. Im Prompt überall über `replace_macros`; Begrüßungen einmalig beim Anlegen
  über den Befehl `expand_macros`. Vorschauen (Bibliothek) nutzen nur `fillCardMacros` (Namen). Zufall/Uhrzeit im System-Prompt
  ändern ihn je Antwort (lokal kein Prompt-Cache-Treffer) – wie in SillyTavern.
- **Prompt:** `PromptTemplate` (Rolle/Stil/Nachspann, Vorlagen in `builtin_prompt_templates`); Karten-`system_prompt`/
  `post_history_instructions` ersetzen Rolle/Nachspann, `{{original}}` bindet die Vorlage ein. Abschnitte beginnen mit
  „# Role & Identity“ (das E2E-Mock erkennt Chat-Anfragen daran).
- **Kontext:** lokal exakt über llama-server `/props` + `/tokenize` (gecacht), Cloud geschätzt (Bytes/3) mit
  `cloud_context_tokens`. System-Nachrichten und letzte Nicht-System-Nachricht bleiben immer; Bild = 1000 Tokens.
  Größe je Modell: `gguf::model_shape` liest Schichten, gelernte Länge (`<arch>.context_length`) und den KV-Bedarf pro
  Token aus dem Header (KV-Köpfe je Schicht, `full_attention_interval` bei Hybrid-Modellen, Gleitfenster-Schichten mit
  festem Block `window + ub`; MLA → unbekannt, dann Schätzung). `hardware::MemoryProfile::context_mb` nutzt das;
  `selectLocalModel` setzt Kontext und GPU-Layer per `get_layer_recommendation` (bis 32K, Bonsai so viel wie passt,
  nie über die gelernte Länge – `llama_manager` begrenzt beim Start zusätzlich). Auch `initApp` passt an (`fitServerToModel`):
  ein selbst gewähltes Modell (kein gespeichertes) und – außer im Expertenmodus – ein Profil noch auf `DEFAULT_CONTEXT_SIZE`
  (4096, nie angepasst); erst nach `refreshCharacters`, sonst wählt die Chat-Ansicht zwischendurch die erste Figur. llama-server läuft mit `--parallel 1`
  (Hintergrundanfragen warten, statt sich den KV-Cache zu teilen). Lokale KI startet bei Bedarf: `ensureLocalAi` vor
  Chat-Senden/Swipe/Fortsetzen und Stage-Aktionen (Fehler ohne Toast an den Aufrufer, `startServer({ quiet })`).
- **Bilder lokal:** `local_image::plan` prüft VRAM (nvidia-smi/Vulkan) und entlädt nur bei Bedarf gestuft: TTS → Chat-Modell
  verkleinern/tauschen; danach Neustart im Hintergrund.
- **Fehler im Store:** Aktion mit eigener Rückmeldung im Aufrufer (Erfolgs-Toast, Formular) → `throw e`; Knopf ohne eigene
  Rückmeldung → `reportFailure` (`store/reportFailure.ts`, Toast mit Ursache); reine Hintergrundabrufe → nur Log. Ausnahme `saveCurrentSettings`: Fehler einmalig melden, erneut erst nach einem
  zwischenzeitlich erfolgreichen Speichern.
- **Zurücksetzen & Kontrast:** Standardwerte je Bereich in `utils/settingDefaults.ts` (Sampler wie `SamplingParams::default`,
  Server-Tuning, Theme; Bonsai eigene), Anzeige/Knopf `settings/ResetSection.tsx`. Theme-Farben müssen WCAG AA halten:
  `e2e/contrast.mjs` (Teil von `npm run e2e`) misst alle Themes hell/dunkel; neue Farbtöne für weiße Schrift mindestens
  Stufe 700 (bzw. `accent-600`), Hinweistext `slate-500` ist in `App.css` je Modus angepasst.
  Neue Einstellungen brauchen einen Satz darunter (`OptionHint` + `aria-describedby`); `e2e/settings-hints.mjs` prüft das.
  Auswahlkarten mit `role="radio"` bekommen `radioGroupKeyDown`/`radioTabIndex` (`utils/radioGroup.ts`, Pfeiltasten, ein
  Tab-Halt); Dialoge immer über `ModalOverlay` (Fokus-Falle, Escape, Fokus-Rückgabe) – `e2e/keyboard.mjs` prüft das.
- **Hilfe:** `components/HelpDialog.tsx` (`GUIDE_STEPS`, `GLOSSARY_TERMS`, Texte `help.*`/`glossary.*`), geöffnet über
  `appSlice.isHelpOpen` (Kopfzeile, Befehlspalette); Anleitung `docs/guide-getting-started{,.de,.ru}.md` bei neuen
  Abläufen nachziehen.
- **Lösungsknöpfe:** `utils/errorFixes.ts` `errorFix(error, store)` ordnet häufige Codes einem Schritt zu (Chat-Banner über
  `generationFailure.cause`, Toasts über `reportFailure`); neue Codes mit klarer Abhilfe dort ergänzen.
- **Oberflächensprachen:** je Sprache eine JSON-Datei, damit neue Sprachen ohne neuen Build gehen. Drei Ebenen, spätere
  gewinnen je Schlüssel: mitgeliefert `presets/locales/ui/{de,en,ru,ja}.json` (Japanisch seit 21.10.2026, `__meta.fallback: en`) → Daten-Repo (`locales/ui_registry.json` +
  `locales/ui/<kürzel>.json`, beim Start nach `<Daten>/locales/ui-hub/`, für mitgelieferte Sprachen nur mit höherer
  `__meta.version`; Event `ui-languages-changed` → `refreshLanguages`) → eigene Dateien in `<Daten>/locales/ui/`
  (Import über die Einstellungen `import_ui_language`, Entfernen `remove_ui_language` in den Papierkorb; überleben Updates).
  Import-ID: `__meta.id`, sonst Dateiname. Flache `"schlüssel": "text"`-Paare plus `__meta` (`name`,
  `englishName`, `author`, `version`, `fallback`); Dateiname = Sprachkürzel (`is_language_id`, `_template.json` wird
  ignoriert). Backend `modules/ui_locales.rs` (`list_ui_languages`, `load_ui_language`, `open_ui_locales_folder` legt
  `_template.json` aus Englisch an; `ui_text` für das Tray-Menü). Frontend: Deutsch ist eingebaut und Typquelle
  (`i18n/types.ts` → `TranslationKey` aus `de.json`), andere Sprachen lädt `loadLocale` über das Backend;
  `t()` fällt `Sprache → __meta.fallback → Englisch → Deutsch → Schlüssel` zurück (Englisch lädt `loadLocale` mit; Backend `ui_text` gleich). Inhalte mit `otakusoul_i18n` nehmen ohne eigene Übersetzung die englische (`characters::i18n_translation` / `cardI18n.pickTranslation`), außer in der angegebenen `source_language`; Hub-Registry-Texte (Grundtext Deutsch) ebenso (`registryText`), Startvorschläge `choices[lang] → en`. Sprachlisten nie hart verdrahten, sondern
  `availableLanguages` aus dem Store nutzen; `refreshLanguages` liest Dateien neu (`localeRevision` rendert neu).
  Neue Schlüssel in **allen drei** mitgelieferten JSON-Dateien ergänzen (`src/test/i18n.test.ts` prüft Vollständigkeit
  und Platzhalter); `npm run i18n:check [-- datei.json]` prüft fremde Übersetzungen.
- **Fehler:** Backend `crate::err!("backend.x.y", key = wert)` → JSON-Code → Frontend `errorMessage()` übersetzt über
  i18n; jeder neue Code braucht Einträge in allen Locales.
- **Spieltexte** (was die App selbst in Geschichten schreibt, `ContentLang::t("englischer Text")`, Sprache = Antwortsprache):
  Übersetzungen in `otakusoul-data/locales/<kürzel>.json`; die App liefert eine Kopie in `presets/locales/` mit und lädt beim
  Start im Hintergrund die aktuelle Fassung nach (`content_lang::refresh_locales` → `<Daten>/locales/`, überschreibt die Kopie).
  Jede Datei dort zählt als Spielsprache; nachgeladen werden die bekannten plus alle installierten Oberflächensprachen.
  `language_code` erkennt auch Namen installierter Oberflächensprachen („Polski“ → `pl`).
  `load_locales` erst in `setup` nach `set_resource_dir`. Neue `t()`-Texte im Daten-Repo ergänzen und die Kopie hier aktualisieren.

## Stolperfallen

### 1. App-Lifecycle, Fenster, IPC & E2E-Harness

- Beenden: Schließen-X richtet sich nach `close_to_tray` (Standard an): beim ersten Mal Hinweis per Event
  `close-to-tray-hint` (`hooks/useCloseToTray.ts`), danach verstecken; aus → `exit(0)`. E2E schließt über
  `e2e/tools/wmclose.py` (WM_DELETE_WINDOW, erzwingt X11). „Beenden“ (Tray) bzw. Updater-Neustart lösen `RunEvent::Exit` aus →
  `stop_model_servers` (llama, sd, TTS, max. 8 s). Linux beendet Kindprozesse zusätzlich per `PR_SET_PDEATHSIG`;
  neue Kindprozesse brauchen `kill_on_drop(true)` und unter Linux `PR_SET_PDEATHSIG`.
- `cargo test`/`clippy` überschreiben `target/debug/otakusoul` mit einer Version ohne eingebettetes Frontend → E2E nutzt
  `target/e2e`.
- Tauri kopiert `presets/` beim Build nach `target/e2e/debug/presets/`, löscht dort aber nie Dateien, die im Repository
  entfernt wurden. Nach dem Entfernen oder Umbenennen von Presets (Figuren, Geschichten, Pakete) den Ordner vor
  `npm run e2e:build` löschen, sonst sehen E2E-Tests und README-Screenshots noch die alten Inhalte.
- Das Hauptfenster steht in `tauri.conf.json` mit `create: false` und wird in `lib.rs` (`create_main_window`) gebaut,
  damit `OTAKUSOUL_HOME` auch den Webview-Speicher umlenkt (`<home>/webview`); der E2E-Harness prüft das per Marker.
- Bei gesperrter Desktop-Sitzung können WebKit-Screenshots und Animationsabfragen hängen. E2E dann unter
  einem separaten Xvfb-Display ausführen (`xvfb-run npm run e2e`); die Desktop-Sperre nicht verändern.
- Befehlsaufrufe: `src/test/commandCheck.test.ts` gleicht jedes `invoke('…', {…})` mit den Rust-Signaturen und
  `generate_handler!` ab (camelCase-Argumente, Pflichtargumente) – neue Befehle immer registrieren.
- Neue Rust-Felder in Typen, die auch handgeschrieben in `src/types/index.ts` stehen: `src/types/wireCheck.ts` meldet
  Abweichungen; dort und in `index.ts` nachziehen.
- Tauri-Listener mit `isSubscribed`-Guard (StrictMode), sonst doppelte Tokens.
- Große Dateien (Avatare, Bewegungen) über `read_file_binary` als `tauri::ipc::Response` (Rohbytes → `ArrayBuffer`); ein
  `Vec<u8>` ginge als JSON-Zahlenliste über die Brücke (17-MB-VRM: 2,9 s statt 45 ms).
- E2E, die Einstellungen direkt schreiben: `saveSettingsAndReload` aus `harness.mjs` (wartet auf das Startspeichern der App,
  das sonst die geschriebenen Werte überschreibt, und lädt danach neu).
- Start: `settingsLoaded` ist erst nach `initApp` wahr. Davor speichert `saveCurrentSettings` nichts (sonst überschreiben
  Standardwerte die Einstellungen) und `refreshCharacters` wählt keinen Charakter; `initApp` öffnet den gespeicherten
  direkt über `refreshCharacters(settings.active_character_id)`. Tests, die Speichern prüfen, setzen `settingsLoaded: true`.

### 2. Hardware, GPU-Auswahl & Lokale Modell-Server

- Vision-Dateien der Startmodelle: Katalogeintrag `mmproj` (Datei, Größe, SHA-256, gleiches Repo; geprüft in `usable`).
  Gespeichert als `<Modelldatei ohne .gguf>-mmproj-F16.gguf` (`CatalogModel::mmproj_target`), weil Repos dieselben Namen
  nutzen; der Scan erkennt sie am „mmproj“. `StarterModel.mmproj`/`mmproj_installed`; Assistent lädt sie standardmäßig mit
  (Haken „Auch Bilder verstehen“), Server-Einstellungen bieten „Passende Vision-Datei laden“ (`downloadVisionProjector`,
  stoppt den Server, setzt `mmproj_path`). `selectLocalModel` wählt per `utils/visionProjector.ts` die eigene Datei des
  Modells und entfernt die eines anderen Modells (sonst startet llama-server nicht); von Hand gewählte bleiben.
- Lokale Vision (GPU-Test 21.10.2026, RTX 4070 Ti SUPER, llama.cpp b11669): Qwen3-VL-8B Q4 + mmproj Q8_0 und Gemma 4 12B
  + mmproj-F16 beschreiben ein Porträt treffend auf Deutsch (~1 s; 8,9 bzw. 10,7 GB bei 8K). Gemma 4 denkt standardmäßig
  vorher nach (~1.800 Zeichen Reasoning): mit knappem `max_tokens` bleibt `content` leer – Nachdenken aus oder genug Tokens.
- Grafikspeicher beim Chat-Modell: `llama_manager::vram_shortage` vergleicht vor dem Start (nur bei voller GPU-Auslagerung)
  `hardware::estimate_llm_vram_mb` (+ mmproj) mit dem freien VRAM und meldet `backend.server.notEnoughVram` samt
  Belegern (`hardware::gpu_memory_users`, nvidia-smi); bricht llama.cpp trotzdem mit Speichermangel ab
  (`is_vram_failure`), wird daraus dieselbe Meldung. Server-Fehler im UI über `errorMessage()` anzeigen.
- Chat-Modell neben lokaler TTS: `llama_manager::fit_beside_speech` reserviert beim Start den VRAM der in dieser Sitzung
  genutzten Stimme (`tts_local::engine().reserved_vram_mb()`) – passt es mit f16 nicht, startet es mit q8_0-KV-Cache
  (nur mit Flash-Attention, Hinweis `ServerStatus.notice`), sonst wird `crispasr` entladen. Startet `crispasr` neben einem
  laufenden f16-Modell, wartet `make_room_for_speech` auf freie `/slots` und startet das LLM mit q8_0 neu.
  Neue Profile starten bei Bildern mit dem Anbieter `local` (stable-diffusion.cpp); gespeicherte Wahl bleibt.
- Mehrere GPUs: iGPUs melden Dutzende GB geteilten Speicher; sd.cpp/llama.cpp würden sie wählen (FLUX.1 350 s statt
  48 s). Deshalb `--backend`/`--device` via `hardware::primary_gpu()` + `same_gpu()`.
- Linux-CUDA-Builds bringen keine CUDA-Laufzeit mit und fallen still auf CPU zurück → `runtimes` empfiehlt CUDA nur bei
  passender System-CUDA (`ldconfig`), sonst Vulkan. Unter Windows (cudart liegt bei) wird der neueste Build empfohlen,
  den der Treiber laut `nvidia-smi`-Kopf („CUDA [UMD] Version“) kann; Blackwell (Compute Capability ≥ 12.0) braucht
  Builds ab CUDA 12.8 (Builds nur mit Major-Version wie bei CrispASR ausgenommen), sonst Vulkan.
- Bild-LoRAs (`image_loras.rs`): `sd-server` ignoriert `<lora:…>` im Prompt; LoRAs gehen als `lora: [{path, multiplier}]`
  an `txt2img`, und vorher muss `GET /sdapi/v1/loras` den Ordner neu einlesen, sonst „invalid lora path“. Eine LoRA
  fremder Modellfamilie wendet still 0 Tensoren an → Katalog-LoRAs nur an ihre `family` schicken.
- Wiedererkennbare Figuren (`CharacterReference` an `generate_image_action`, nur lokale Engine): das Porträt der Karte
  wird als PNG ≤ 1024 px geschickt (sd.cpp liest kein WebP). FLUX.2 bekommt es als `extra_images` (Referenzbild, beste
  Wiedererkennung, ~3 min auf 16 GB); andere Familien nur bei Porträt/Selfie per `img2img` (`init_images`,
  `denoising_strength` 0,7 – 0,55 hielt die Pose), bei „Moment“ gar nicht (sonst Porträt-Komposition). Qwen-Image 2.1
  liest Referenzbilder nur mit seinen Vision-Gewichten: Katalog-`extras` (`Role::LlmVision` → `--llm_vision`, mmproj Q8_0
  reicht), standardmäßig mitgeladen (`ImageGenConfig.reference_extras`, Frontend reicht die Formularwahl an
  `list_image_models`/`download_image_model` durch); `sd-server` startet neu, wenn Extras nachträglich dazukommen
  (`SdProcess.with_extras`). GPU-Test `selfies` (21.10.2026, RTX 4070 Ti SUPER): SD 1.5 img2img 7 s, Qwen-Image mit Vision
  87 s; bei img2img muss der Prompt das Aussehen nennen (das Chat-Modell bekommt die Figurenbeschreibung). Selfie = `generateSceneImage('chat', {kind: 'selfie'})`
  + `chatSlice.sendSelfie` (Nachricht der Figur „📸“ mit Bildanhang). `attachments::prepare` macht Bilder in Nachrichten
  der Figur immer zu „[Picture sent: …]“ – OpenAI/Anthropic nehmen Bilder nur in Nutzer-Nachrichten.
- Lokale Vision nur mit gewählter `mmproj`; ohne macht `attachments::prepare` aus Bildern einen Hinweis.
- VRAM-Planer (`local_image.rs`, `plan`): ein noch geladenes *anderes* Bildmodell zählt als frei, denn `ensure_server`
  stoppt es vor dem neuen; sonst wird das Chat-Modell unnötig entladen. GPU-Test `images` (23.10.2026, RTX 5090 Laptop
  24 GB, Bonsai 27B im Chat mit 16K = 8,1 GB): Animagine XL 17–26 s, Qwen-Image ~50 s und FLUX.1 Q5 38 s laufen parallel
  (Spitze ≤ 17,3 GB), FLUX.2 Q4 tauscht (Spitze 20,9 GB, 200–216 s, Chat 8 s später wieder bereit).
- Modell-Downloads (`model_files.rs` für Bild/Sprache, `models_hub::download_part` für GGUF) setzen nach Verbindungsabbruch
  per `Range` an derselben Stelle fort; `MAX_RESUMES` zählt nur Versuche ohne neue Daten. Vor jedem neuen Versuch den
  `tokio::fs::File` flushen: er schreibt im Hintergrund, ein verspätetes Stück landete sonst hinter den fortgesetzten Daten
  (falsche Prüfsumme). Hugging Face drosselt je Verbindung (23.10.2026: ~2 MB/s), daher laden Dateien ab 64 MB über
  `segmented_download` in 8 Abschnitten parallel (Test in der App: ~105–175 MB/s): jeder Abschnitt in eigener Datei
  `<part>.<start>-<end>.seg` (nie in eine vorbelegte Datei schreiben – NTFS füllt sonst alles davor erst mit Nullen),
  fortsetzbar auch nach Neustart; am Ende ein Durchgang Anhängen + SHA-256. Server ohne Range → eine Verbindung.
  GGUF: Abbruch durch den Nutzer löscht Teil- und Abschnittsdateien, ein Verbindungsabbruch lässt sie für den nächsten
  Versuch liegen. Aufräumen nur über `model_files::remove_partial` (nimmt die Abschnitte mit).
- GPU-Test `llm` (23.10.2026, RTX 5090 Laptop 24 GB, llama.cpp b11669/PrismML b10787, Kontext wie empfohlen): VRAM-Schätzung
  −1 bis −4 % genau; Antwort Gemma 4 12B 75 t/s, 26B-A4B 121 t/s, 31B 32 t/s, Qwen3.6 35B-A3B 132 t/s (21,8 GB),
  Cydonia/Hearthfire 24B 43 t/s, Bonsai 27B 69–71 t/s (262K Kontext, 12,1 GB). `memory`: Gemma 4 12B/26B alles richtig,
  Qwen3.6 ohne Geschichts-Vorhaben, Cydonia erkennt Erledigtes nicht und fasst Gewohnheiten nicht zusammen.
- Einrichtungsassistent: `components/onboarding/OnboardingParts.tsx` (Cloud-Test, lokaler Weg, erste Antwort) nutzt
  `quick_reply` (eine kurze Antwort außerhalb eines Chats, 90 s) und `list_starter_models` (Katalog `model_catalog.rs`:
  mitgeliefert `presets/recommended_models.json`, beim Start lädt `model_catalog::refresh` die Fassung aus `otakusoul-data`
  nach `<Daten>/recommended_models.json`; die höhere `version` gilt, Einträge nur mit SHA-256, Hugging-Face-Datei, angegebener
  Lizenz und bekannter Laufzeit; `license_kind` = open (Apache/MIT/BSD) | restricted | noncommercial, nicht offene zeigt der
  Assistent mit `license_note` und Link; bei neuen Releases die mitgelieferte Kopie mit dem Daten-Repo abgleichen;
  Empfehlung = `preferred`-Modell, wenn es in VRAM − 1,5 GB passt, sonst das größte passende – nur unter frei lizenzierten
  mit `auto_pick` (Standard `true`); seit Katalog 3.5.0 ist keins bevorzugt, Ternary Bonsai 2 27B hat wegen schwächeren
  Deutschs `auto_pick: false`: nur gelistet, nie automatisch gewählt).
  Starter mit `runtime: "prism"` blenden im Assistenten zusätzlich die PrismML-Laufzeitkarte ein.
  Einfacher Weg: `LocalModelSetup` „Alles automatisch einrichten“ (fehlende Laufzeiten mit empfohlener Variante, dann Starter
  laden/auswählen; Details unter „Selbst auswählen“), Modellnamen über `prettyModelName`, Ampel `ModelFit`/`modelFit`.
  Cloud-Anbieter als Karten (`CLOUD_PROVIDERS` mit `keyUrl`), Abschluss wahlweise in Chat oder Stage.
  Schritt „Stimme & Bilder“ (nach „Charakter“) bettet `CharacterVoiceModal` (gewählte Figur) und `ImageSettings` mit
  `autoSave` ein: Änderungen speichern sich nach kurzer Pause selbst, der Speichern-Knopf entfällt.
  Neue Profile zeigen den Avatar als Bild (`avatar_mode` Standard `2d`); 3D/Live2D ist eine Wahl, gespeicherte bleibt.

### 3. Chat-Pipeline, Streaming, Abbrüche & Verlauf

- Swipes: `swipes_json` + `swipe_index`; „Neu generieren“ hängt an, überschreibt nie.
- Neuer Chat: `create_chat_session` legt Sitzung und Begrüßung (`greetings`: `first_mes`, dann `alternate_greetings` als Swipes) in einer Transaktion an.
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
- Antwortvorschläge („Was könnte ich sagen?“, Glühbirne im `ChatComposer`): `chatSlice.suggestReplies` → `suggest_chat_replies`
  (`modules/reply_ideas.rs`: letzte 12 Nachrichten, JSON-Liste mit 3 Ideen, sonst zeilenweise); Vorschläge gehören zum Chat,
  in dem sie angefragt wurden, ein Klick übernimmt ins Eingabefeld. Mock erkennt „[CHAT — REPLY IDEAS]“ (`stats.replyIdeas`).
  „Schreib für mich“ (Stift): `draftReply` → `draft_chat_reply` (`reply_ideas::draft`, Stichworte im Eingabefeld = `notes`,
  `clean_draft` entfernt „Name:“/Zitatklammer); Eingabefeld währenddessen `readOnly`, „Rückgängig“-Toast stellt Stichworte her,
  Ergebnis nach Chatwechsel landet im Entwurf des alten Chats. Mock: „[CHAT — USER DRAFT]“ (`stats.userDraft`).
- Prompt-Log: `send_chat_message` legt den gekürzten Prompt in `AppState.last_prompt` ab (`modules/prompt_log.rs`,
  ohne API-Schlüssel); Anzeige `components/chat/PromptLogModal.tsx` über das Chat-Menü.
- `<state>{…}</state>` am Antwortende aktualisiert HUD-Variablen (`utils/stateParser.ts`) und wird ausgeblendet.
- Lange Chats: Sprung zu einer Nachricht über `chatSlice.requestChatJump` → `MessageList` (`jumpTo`, scrollt die
  virtualisierte Liste, Klasse `message-flash`). Lesezeichen in `chat_bookmarks` (per Join an Nachrichten gebunden),
  „Ab hier neu“ = `branch_chat` (kopiert Verlauf, Varianten, Anhänge per `attachments::copy_to_chat`, Lesezeichen).
- Von selbst melden (`AppSettings.proactive`, Standard aus): `hooks/useProactiveMessages.ts` prüft 15 s nach dem Start,
  dann minütlich, nur den offenen Chat; Entscheidung rein in `utils/proactive.ts` (`proactiveReason`: Ruhezeit, Tageslimit
  über `proactive.sent`, stummgeschaltete Figuren, erst nach einer Nutzernachricht, nie zweimal ohne Antwort; fälliges
  `real`-Vorhaben je einmal ab 10 min Pause, sonst nach `idle_minutes`). `chatSlice.writeOnOwn` = `writeReply` mit
  `instruction` statt Nudge; Fehler nur geloggt. Lokale KI wird dafür nicht gestartet. Benachrichtigung über
  `tauri-plugin-notification` (`services/notifications.ts`) nur bei verdecktem Fenster, sonst Toast außerhalb des Chats.
  Der Mock reicht die Anweisung nicht als `system`-Rolle durch: E2E `chat-proactive.mjs` sucht rollenunabhängig.
  Träume (`proactive.dreams`, Standard an): `kind: 'dream'` nur beim ersten Check, der bis zur Entscheidung kommt (mit lokaler
  KI ggf. erst, wenn ihr Server läuft), ab 8 h Pause, nach fälligen Vorhaben; `get_dream_memories` liefert zufällige aktive
  Erinnerungen ohne die 5 neuesten und **nichts unter 3 aktiven Erinnerungen** (`DREAM_MIN_MEMORIES`) – dann wird es höchstens
  eine normale Nachricht. Der Traum geht zusätzlich per `add_diary_entry` ins Tagebuch (Stimmung `dreamy`). Traumbild
  (`proactive.dream_image`, Standard aus): `chatSlice.sendDreamPicture` → `generateSceneImage('chat', {kind: 'dream', story})`
  (Prompt aus dem Traumtext, Referenz der Figur ohne img2img, eigene Komposition), Nachricht „🌙“ mit `Traumbild.png`;
  Selfie und Traumbild teilen `sendPicture`. E2E `chat-dream.mjs`.
  Off-Screen (`proactive.offscreen`, Standard an): beim selben ersten Check nach ≥ 8 h, aber im Gruppen-Chat mit Gästen
  statt des Traums – `kind: 'offscreen'` mit einem zufälligen Gast (`presentedAs`), optional 2 ältere Erinnerungen der
  Figur + 1 des Gastes (`get_dream_memories`, darf leer sein). Danach `add_episodic_memory` bei **beiden** (Kategorie
  `event`, Quelle = die Nachricht, Text `offscreen.memory`), damit der Gast es später auch weiß. E2E `chat-offscreen.mjs`.

### 4. Stage (Rollenspiel), GM-Director, NPCs & Story-Galerie

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
  Umgekehrt bekommen Gefährten mit Karte (auch beförderte NPCs) ihr Soul Memory in den Prompt: `soul_memory_block`
  (`party.rs`) ruft `select_prompt_memories` mit `STAGE_MEMORY_BUDGET` (700 Tokens) und den letzten drei Zeilen aus
  ihrer Sicht (`line_for`, Geflüstertes an andere zählt nicht) als Suchtext, dazu offene Vorhaben. `execute_stage_turn`
  erhält dafür `&MemoryDb`. Szenengebundene NPCs bleiben bei `npc_memory_block` (keine Soul-ID).
  `stage/director.rs`: Sprecherfolge = Spielerwahl > Flüsterziel > direkte Ansprache > Planer; danach pro Beitrag
  Ansprache-Erkennung, sonst Routing-LLM (Mock erkennt „[STAGE — ROUTING]“). `turn_mode: "continue"` = Runde ohne
  Spieleraktion (Weiter/Auto-Play).
  Der Abbruch-Merker wird nur am Runden-/Chat-Start zurückgesetzt (`reset_abort`), damit „Stopp“ die ganze Runde beendet.
  Story-Galerie: `StoryGallery.tsx` ist der Einstieg in Stage, wenn keine Szene gemerkt ist
  (`AppSettings.stage_last_scene`, `stageSlice.rememberStageScene`/`restoreStageScene`; fehlt die gemerkte Szene, bleibt eine
  aktive gespeicherte). Story-Daten in `extensions.otakusoul_story` (`StoryInfo`: Genre fantasy/adventure/slice_of_life/
  comedy/romance/mystery/scifi/horror, Minuten, Schwierigkeit, Hinweise, `beginner`, Startvorschläge je Sprache → ersetzen
  die allgemeinen `pending_choices`); mitgelieferte Geschichten in `presets/stories/scenes/` (Ordner `STORY_FOLDER`).
  Szenen übersetzen auch `starting_location`/`time_of_day`. Lobby = „Szenen verwalten“ aus der Galerie; E2E-Harness setzt
  `stage_last_scene: "default_scene"`, Galerie-Test `stage-gallery.mjs`, Lobby über `openSceneLobby`.
  „Eigene Geschichte“ = `StoryWizard.tsx` (`buildStoryDefinition`; Vorlagen `storyWizard.premise.<genre>.<n>.*` in allen Locales,
  `PREMISES_PER_GENRE`), Kurzanleitung `StageGuide.tsx` in `TurnControlBar` (`usePersistentFlag('stageGuideSeen')`).
  Zwischen den Sitzungen: `stage/offscreen.rs` (`stage_tell_offscreen`, ausgelöst von `StageView` beim Öffnen; Bedingungen
  gespiegelt in `utils/stageOffscreen.ts`): nach ≥ 8 h Pause erzählt ein Gefährte (mit einem zweiten, falls vorhanden) als
  Logzeile mit Karte `offscreen`; ins Soul Memory gelangt es über `sync_party_memory`. Abschaltbar pro Szene
  (`disable_offscreen`); Mock erkennt „[STAGE — OFFSCREEN]“.
  Kampf-Einführung im `Combat5ePanel` (`combat5eGuideSeen`); Hilfeknöpfe tragen `data-fight-help`, E2E-Tests klicken zum
  Weiterlaufen `button:not([disabled]):not([data-fight-help])`. Seltene Stage-Aktionen im Menü „Mehr“ (`DropdownMenu`).
- Stage-Planungsabbruch: `history::prepare` liefert bei Abbruch `None` und umfasst Kontextzählung,
  Kontextanpassung und interne Zusammenfassung. Der Planer-Aufruf liegt ebenfalls in `with_abort`.
  Abbruch vor einem Plan beendet die Runde über `finish_turn`: Spielerzeile und bereits abgeschlossene
  Arbeit bleiben gespeichert, weitere Planmechanik/Erzählung werden nicht gestartet. Sprecher-Vorbereitung
  endet ebenso bei Abbruch. Routing beendet die Runde bei Abbruch ohne Ersatzsprecher.
  Archivierung und Konsistenzprüfung liegen ebenfalls in `with_abort`: abgebrochene Archive bleiben
  offen, die fällige Faktenprüfung behält ihren Zähler für die nächste Runde. Ein bereits gesetzter
  Stage-Abbruch startet keine Faktenprüfung und erhöht deren Zähler nicht.
- Stage-Szenenbild (`generateSceneImage('stage')`): Prompt schreibt das Chat-Modell, solange es läuft; sonst
  `sceneImageTemplatePrompt` (`utils/cardI18n.ts`): `scenery, no humans` + Ort/Tageszeit aus der englischen
  Szenenübersetzung (nie `1girl` mit dem Ortsnamen). Stil: SD 1.5/SDXL Tags, Flux/Qwen-Image Sätze.
- Stage-Nachrichten zeigen `**fett**`/`*kursiv*` über `stage/StageText.tsx` statt Sternchen. Beispiel-Badge im
  Planer-Prompt (`{example_badge}`) steht in der Spielsprache, sonst übernimmt das Modell `Perception (DC 14)` wörtlich.

### 5. D&D 5e-Regelsystem (Kampf, Spielbrett, Magie, Erkundung)

- 5e-Regeln (`stage/rules5e/`, Plan lokal in `roadmap_abgeschlossen.md`, Abschnitt 8): reine Funktionen mit injiziertem Zufall (`impl Rng`, Tests mit
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
  Grafiken nach den Vorgaben in `docs/stage_assets.md`, Regeln geprüft von `stageAssets.test.ts`. E2E `stage-board.mjs` wartet auf `data-busy`.
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
  Starter-Abenteuer (Schritt 5): Paket `presets/crypt-of-shadows/` (Helden-Karten mit `extensions.otakusoul_5e.class`,
  Akte in `scenes/`, von `ensure_adventure_scenes` in den Szenenordner kopiert; Paket auch in `scan_available_characters`).
  Klasse: Szenenwahl (`hero_classes`) > Karte (`combat5e::card_class`, nur beim Beitritt) > Platz in der Gruppe; ohne
  Wahl behält eine Figur ihre Klasse. Akt-Ziele `SceneRules.goals` (`encounter` = vorbereitete Begegnung gewonnen über
  `BattleMap.active_encounter` → `won_fight`, `exit` = Ausgang zur Karte → `reach_goal`), `next_scene` →
  `continue_stage_adventure` (Gruppe, Klassen, Inventar, lange Rast). Abgewählte Gefährten verlassen außerhalb von
  Kämpfen die Gruppe (`ensure_party_vitals`). Einstieg: Knopf „5e-Abenteuer“ in der Stage-Kopfzeile öffnet die Lobby
  mit `initialRules="5e"` (Regelwerk-Filter Alle/Erzählszenen/5e, Banner für den zuletzt gespielten bzw. ersten Akt;
  `ScenePreview.adventure` = Szene mit Zielen). Lobby: `AdventurePartyModal` vor 5e-Szenen mit Gruppe ohne Fortschritt;
  Szenenkarten tragen `data-scene-id`. SRD-Hinweis im `AboutDialog` (`srd-attribution`). E2E `stage-adventure.mjs`.
  Stufen & Merkmale (Schritt 6): `rules5e/features.rs` (Tabelle Klasse → Stufe → Merkmal, `hero_stats_at`, `level_up`
  bis `MAX_LEVEL` 3, Verbrauch in `Stats5e.resources_used`, `short_rest`/`long_rest`, `arcane_recovery`). Meilenstein:
  `continue_adventure` hebt die Gruppe um eine Stufe (`ExploreEvent::LevelUp`). Aktionen `feature:<id>`
  (`feature_options`/`use_feature` in `combat5e.rs`, `TurnDecision::Feature`), Ereignis `CombatEvent::Feature`;
  Hinterhältiger Angriff und Krit ab 19 über `AttackSituation.sneak_dice`/`critical_from`, Vertriebene (`TURNED`)
  weichen zurück und verteidigen sich, Schaden beendet es. Gefährten nutzen Zweiter Atem selbst.
  Reaktion *Schild* (`CastingTime::Reaction`, `SpellEffect::Shield`): `resolve_attack_with` wirkt sie automatisch, wenn
  `AttackSituation.target_can_react` und +5 RK den Treffer abwenden (Zustand `shielded`); Aufrufer tragen die Reaktion
  in `reactions_used` ein. Schwierigkeit `rules5e/difficulty.rs`: EP nach HG aus dem SRD, Gruppenbudget eigene Formel
  (das SRD hat keine Tabelle); vom Planer erfundene Kämpfe werden weit über „tödlich“ gekürzt (`start_encounter_at`
  mit `limit`), vorbereitete nicht; `EncounterState.difficulty` zeigt das Kampfpanel. Jedes Monster in
  `monsters.json` braucht ein Token `public/stage/tokens/monster_<id>.svg` (prüft `stageAssets.test.ts`).
  Ausrüstung: `presets/srd5/equipment.json` + `rules5e/equipment.rs` (`Stats5e.equipped`, `recompute_gear` setzt
  `armor_class` und Waffenangriffe neu, andere Vorlagenangriffe wie Feuerpfeil bleiben; Klassen haben `proficiencies`
  und Startausrüstung `equipment`). Inventar-Einträge tragen `srd_id`; `explore5e::add_items` (Einträge `id`/`id*n`,
  gleiche stapeln), Beute aus `BattleMap.loot` (Truhen) und `MapEncounter.loot` (Sieg), Planer `inventory_add.srd_id`.
  Anlegen/Ablegen nur außerhalb von Kämpfen (`equip_stage_item`/`unequip_stage_item`, Snapshot), Bogen-Abschnitt
  `sheet-gear`, Werte-Text `utils/srdItems.ts` (`itemSummary`, Katalog über `list_srd_items`).

### 6. 3D-Avatare (VRM, GLB, MMD), Gesten & 2D-Porträts

- 3D-Avatar: gemeinsame Bühne `avatarStage.ts` (Kamera, Licht, gespeicherte Ansicht, Renderschleife), Overlay
  `AvatarViewerChrome.tsx`, Bewegungen über `useAvatarMotions`; `AvatarCanvas` wählt nach Endung `VrmViewer`,
  `GltfViewer` (`.glb`, Mixamo-artige Knochennamen, ARKit-/Oculus-Morphs über `gltfRig.ts` `MorphFace`, Mixamo-FBX per
  `retargetToRig` mit Ruhepose-Ausgleich; Höhe aus Grundpositionen, da Geometrie-Bounds Morphs einrechnen) oder
  `MmdViewer` (`.pmx`/`.pmd`, `@moeru/three-mmd`, Spring-Bone-Physik, Morphs あいうえお/まばたき/笑い …, nur VMD-Bewegungen).
  MMD-Reihenfolge pro Bild: `beforeUpdate` → eigene Knochen auf Ruhe → Mixer → Zusätze → `mmd.update`. Texturen über
  `LoadingManager`-URL-Modifier, Groß-/Kleinschreibung per `list_avatar_model_files`. Import (`avatar_models.rs`): ZIP
  (Shift_JIS-Namen) oder PMX mit Ordner (max. 1 GB/5000 Dateien). E2E: `e2e/tools/make-mmd.mjs` (PMX + VMD), `make-glb.mjs` (GLB über three.js-Exporter).
  Echte Fremdmodelle nur lokal in `assets/test-avatars/` (gitignored); `xvfb-run -a node e2e/local-avatars.mjs` importiert
  jedes davon und legt Screenshots in `assets/test-avatars/screenshots/` ab (nicht Teil von `npm run e2e`); es gibt je Modell
  die Ladephasen aus (`avatarTiming.ts`: `performance.measure` `avatar:read|parse|setup|firstFrame`, `stage.timeNextFrame`).
  glTF-Eigenanimationen (Plan lokal in `roadmap_abgeschlossen.md`, Abschnitt 9): `avatar_motions::model_clips` liest Clipnamen nur aus dem JSON-Teil
  der GLB/glTF (unbenannte wie three.js `animation_<n>`), Rollen je Modell-Dateiname in `<Daten>/animations/model_roles.json`
  (sonst `guess_role`). `GltfViewer` spielt sie ohne Retargeting (`withoutRootMotion` hält Hüfte und alle Knoten darüber,
  z. B. Unreal `root` und Biped-`Bip001`, waagerecht auf ihrer Ruheposition, senkrecht bleibt), `useAvatarMotions` `ownClips` haben je Rolle Vorrang vor FBX; Änderungen in
  `ModelClipsSettings` erhöhen `modelClipRevision`. E2E `avatar-gltf-clips.mjs` (`makeGlb({ clips: true })`).
  Stimmung: `MOODS`/`guess_mood` (Bewegungen in `moods.json`, Clips in `model_roles.json` als `{role, mood}`), der
  `AvatarMotionPlayer` wählt per `pickByMood`/`bestByMood` (`utils/avatarGestures.ts`, Stimmung = VRM-Ausdruck) und
  wechselt die Ruhe-Schleife in `setMood`. Clips ohne Verwendung (`extraClips`) startet das Gesten-Menü in
  `AvatarViewerChrome` über `playAvatarClip` (`GestureRequest.clip`); der Viewer zeigt `data-idle-clip`/`data-gesture-clip`.
  Clips eines anders gebauten Skeletts (Spiel-Rips: andere Knochenlängen/Achsen) sortiert `clipFit.ts` `clipFitsRig` beim Laden
  aus (Median der Knochenlängen, Oberschenkelrichtung im ersten Bild); `avatarSlice.clipMisfits` markiert sie in
  `ModelClipsSettings`, der Viewer zeigt `data-clip-misfits`. Prüfen mit echten Modellen: `OTAKUSOUL_AVATAR=<Name> xvfb-run -a node e2e/local-avatars.mjs`.
  Avatar-Manager (Reiter `avatars`, Bibliothek): `components/avatars/AvatarManagerView.tsx` (Raster aller 3D-/Live2D-Modelle,
  Filter/Suche, Live-Vorschau `AvatarPreview`, Standard, Zuweisung per Haken → `characterSlice.assignCharacterAvatar`
  schreibt `custom_vrm` (Pfad) bzw. `custom_live2d` (Ordner-ID) in die Karte und entfernt `sow_*`); „wer nutzt was“ in
  `avatarMatch.ts` (gleiche Regel wie `AvatarCanvas`), Import geteilt mit den Einstellungen in `avatarImport.ts`. E2E `avatar-manager.mjs`.
  Vorschaubilder: `services/avatarSnapshot.ts` – der Manager schickt ein Ereignis an den Viewer-Canvas, `avatarStage` bzw.
  `Live2DViewer` rendern im selben Aufruf neu (`answerSnapshots`, WebGL ohne `preserveDrawingBuffer`); zugeschnitten auf die
  sichtbaren Pixel (oberer Teil, 320×240). Automatisch beim ersten Ansehen ohne Bild (zweiter Treffer in Folge), von Hand
  „Vorschaubild aus aktueller Ansicht“; gespeichert über `save_avatar_thumbnail` in `<Daten>/avatar_thumbs/<art>-<hash>.webp`
  (`avatar_library::save_thumbnail` prüft WebP/PNG, max. 2 MB), geliefert als `ScannedVrm.thumbnail`/`ScannedLive2d.thumbnail`
  (Live2D-eigenes `preview_image` hat Vorrang); `remove` löscht das Bild mit.
  Zwischenspeicher `avatar/avatarCache.ts`: VRM- und glTF-Viewer leihen geparste Modelle (`takeAvatar`/`leaseAvatar`/
  `releaseAvatar`), beim Schließen zurück in die Ladepose (Transformationen + Morphs, VRM: Normalpose, Ausdrücke, Federknochen;
  glTF: Toon aus), höchstens `AVATAR_CACHE_SIZE` wartende; ein geliehenes Modell bekommt kein zweiter Viewer (lädt selbst).
  Import/Entfernen rufen `forgetAvatar`. MMD bleibt ungespeichert (Physik mit Zustand, lädt ohnehin schnell).
  Avatar-Bibliothek (`avatar_library.rs`): eigene Namen in `<Daten>/avatar_names.json` (3D nach Pfad relativ zu
  `avatar_roots`, Live2D nach Ordner-ID; Dateien behalten ihre Namen), `delete_avatar` verschiebt nur Importe aus
  `<Daten>/avatars|live2d` (ganzer Ordner) nach `.trash/avatars`; `ScannedVrm`/`ScannedLive2d.removable`. UI `AvatarActions.tsx`
  (Namensfeld nach Import, Entfernen mit 8 s Rückgängig), Charakterkarten mit entferntem Modell fallen auf den Standard
  zurück (`AvatarCanvas`). E2E `avatar-library.mjs`.
  GLB ohne Skelett (`skins` leer, `avatar_motions::gltf_summary`) lehnt `import_vrm_into` mit `backend.vrm.noSkeleton` ab; von Hand
  abgelegte zeigt `GltfViewer` nicht (`avatar.noSkeleton`). `ScannedVrm.triangles` > 500.000 → Hinweis `settings.vrmHeavy`.
  Gesichts-Editor: `ModelFaceSettings` ↔ `get_model_face`/`set_model_face` (`ModelFace`: `morphs` je Schlüssel aus `FACE_KEYS`,
  `strength` 0–2, in `model_faces.json`, Morph-Namen aus `extras.targetNames`); `MorphFace.configure`/`BoneFace.configure`,
  der Viewer wählt danach Morphs vor Knochen (`data-face`, `data-face-keys`). Vorschau `previewAvatarFace` →
  `avatarFacePreview`; Live-Vorschau = eingebetteter `GltfViewer`. E2E `avatar-gltf-face.mjs` (`makeGlb({ customMorphs })`).
  glTF als Ordner/ZIP: `avatar_models::import_folder_model` (MMD, `.gltf` mit Ordner, ZIP mit MMD/`.gltf`/`.glb`, Skelett-
  Prüfung), Liste `find_gltf_models` (Unterordner); `gltfFile.ts` `loadGltfAvatar` liest `.bin`/Texturen über die App als
  Blob-URLs (case-insensitiv per `list_avatar_model_files`). E2E `avatar-gltf-folder.mjs` (`writeGltfFolder`).
  Gesichter über Knochen (`boneFace.ts`, ohne Morphs): `facePartOf` erkennt Lider/Brauen/Lippen/Mundwinkel/Augäpfel am Namen,
  `BoneFace` verschiebt sie geometrisch (Welt → Elternraum, Augenabstand als Einheit); `restore()` vor dem Mixer, `apply()`
  danach addiert. Viewer zeigt `data-face` (`morphs`/`bones`/`none`); Testmodell `makeGlb({ faceBones: true })`.
  Toon-Look (glTF): `toonLook.ts` `applyToonLook` tauscht Materialien gegen `MeshToonMaterial` (Originale in `userData`),
  `AvatarStage.setToon` schaltet `OutlineEffect`, `NeutralToneMapping` und Umgebungslicht; Schalter `usePersistentFlag`
  `avatarToon:<Pfad>`, Viewer zeigt `data-toon`.
  Nutzeranleitung `docs/guide-3d-avatars{,.de,.ru}.md` (UI-Pfade/Namenslisten bei Änderungen nachziehen); `docs/private/`
  ist gitignored (lokale Notizen, nie committen).
  glTF: Knochen-Aliase für Mixamo/RPM, MakeHuman, Unreal, Blender, VRoid, Bip001, MMD englisch/japanisch (`gltfRig.ts`,
  Rollen für Rumpf, Arme, Hände, Beine, Füße und alle Finger, Mixamo-Name je Rolle zuerst – darunter läuft `retargetToRig`;
  MMD-„Left leg“ = Oberschenkel, wenn „Left knee“ existiert;
  `plainBoneName` behält Buchstaben aller Schriften), MMD-Gesichtsnamen `MMD_MORPHS` geteilt mit `MmdViewer`; Größe außerhalb 0,5–3 m wird
  auf 1,6 m gebracht; Bounds über das Skelett nach `updateMatrixWorld` (nicht `updateWorldMatrix`, sonst doppelter
  Maßstab); PBR-Materialien bekommen `useStudioEnvironment` (ohne Umgebung werden metallische Teile schwarz).
- Porträts/Emotionsbilder: `utils/characterPortraits.ts` wählt das Bild je Emotion und macht Dateipfade über
  `convertFileSrc` zu `asset://`-URLs. Unter `tauri dev` (Seite von `http://localhost:1420`) lädt WebKitGTK solche
  Bilder nicht in `<img>`, `fetch` aber schon → `loadDisplayableImage`/`assetAsBlobUrl` laden sie als Blob-URL;
  `MorphingPortrait` lädt vor dem Überblenden vollständig und trägt die Quelle in `data-portrait`.
  Lebendiges Bild: `MorphingPortrait` atmet und wiegt sich (`.portrait-alive`/`.portrait-breath`, Tempo je Ausdruck
  `utils/portraitMotion.ts` `breathSeconds`, zufällige Phase), beim Sprechen wippt `.portrait-speech` mit dem Pegel aus
  `audioPlayer.onAudioFrame`. Die Transforms setzt ein Takt mit `PORTRAIT_FPS` (12, sprechend 20) aus `portraitPose` direkt
  auf die Ebenen, kein Re-Render. **Keine endlosen CSS-Animationen/Transitions** (Keyframes, `animate-pulse` im Dauerzustand):
  WebKitGTK zeichnet dafür 60×/s das Fenster neu – das 2D-Porträt per CSS hielt einen Kern bei 100 % und ließ das Tippen
  verzögern (gemessen mit E2E-Build unter Xvfb: 100 % → 19 %). Schalter `avatarSlice.portraitMotion` (localStorage,
  Knopf `#setting-portrait-motion` im Bildmodus), `prefers-reduced-motion` hält es still; `data-alive`/`data-breath`. Die Asset-Freigabe
  bleibt eng (`tauri.conf.json` `scope: []`, Laufzeit-Freigabe in `lib.rs` `allow_app_asset_dirs`), niemals `**`.
  Relative Bildpfade einer Karte werden beim Laden/Speichern auf ihren Ordner bezogen
  (`characters::resolve_profile_expression_paths`), fehlende Dateien alter Nutzerkopien ersetzt
  `paths::apply_bundled_expression_fallback`. E2E `avatar-portraits.mjs`; `npm run e2e:portraits:dev` startet denselben
  Test gegen das Dev-Binary (`OTAKUSOUL_E2E_DEV=1`, Vite muss laufen, vorher `cargo build`).
- 3D-Avatar (`VrmViewer.tsx`): Startansicht aus Kopf-Knochen und Modellhöhe (`frameUpperBody` in `services/avatarViewState.ts`);
  gespeichert wird nur eine vom Nutzer bewegte Kamera, „Ansicht zurücksetzen“ löscht sie.
  Bewegungen: `.vrma` und Mixamo-`.fbx` (`mixamoRetarget.ts`: Mixamo-Ruhepose → normalisierte VRM-Knochen) in `<Daten>/animations/` (`avatar_motions.rs`, Verwendung in `roles.json`, aus dem Dateinamen
  geraten); `vrmMotions.ts` (`VrmMotionPlayer`: Ruhe-Schleife + Gesten mit Überblendung), die prozedurale Haltung füllt
  nur den Anteil, den keine Animation steuert (`bodyWeight`). Gesten löst `ChatView` nach jeder Antwort über
  `gestureForReply` aus (`utils/avatarGestures.ts`: Rollenspiel-Aktion vor Gefühl; Aktionswörter de/en, russische als
  Wortstämme über `ru()` mit `\p{L}`-Wortgrenze, da `\b` nur lateinische Buchstaben kennt) → `avatarSlice.playAvatarGesture`.
  Mundformen aa/ih/ou/ee/oh aus Formanten (`services/lipSync.ts`, `audioPlayer.onAudioFrame(amplitude, visemes)`).
  E2E: `e2e/tools/make-vrma.mjs` und `make-fbx.mjs` (ASCII-FBX im Mixamo-Format) bauen Test-Animationen; der Viewer zeigt `data-motions`/`data-gesture`,
  das Mock antwortet mit `stats.chatReply`.

### 7. Audio, Lokale TTS, Stimmklonen & Effekte

- Erzählerstimme für Handlungen (`VoiceConfig.narrator_for_actions`, Schalter im Stimm-Dialog außer beim Erzähler selbst):
  `services/narratorVoice.ts` – `splitActions` trennt `*Handlungen*` (auch `**…**`, offenes Ende) von den eigenen Worten,
  `voiceParts` gibt jedem Teil seine Stimme (Erzähler = Profil `stage_narrator`, gecacht, `forgetNarratorVoice` beim
  Speichern). Genutzt in `StreamingTtsManager` (lokale Teile – Figur **oder** Erzähler – warten bis zum Antwortende,
  danach folgende Teile bleiben in der Reihe), im Vorlese-Knopf (`audioPlayer.stop()` einmal, dann `enqueue`; nicht
  `playDataUrl`, das bricht den vorigen Teil ab) und für Gefährten in `speakStageMessages`. E2E `chat-narrator-voice.mjs`.
  Vorlagen für OpenAI-kompatible Sprachserver im Dialog: Kokoro-FastAPI :8880, AllTalk v2 :7851, openedai-speech :8000
  (GPT-SoVITS hat keinen OpenAI-Endpunkt).
- Lokale TTS (`tts_local.rs`, `crispasr --server`): F5 bekommt unter CUDA `CRISPASR_F5_EMBED_GPU=1` (sonst ~20× langsamer).
  Parallel zum generierenden LLM läuft lokale TTS langsamer als Echtzeit (gemessen 7,3 s für 6,6 s Audio): `streamingTts`
  synthetisiert bei `engine === 'local'` weiter satzweise, hält die Wiedergabe aber bis `flush()` (Antwortende) zurück.
  VoiceDesign-Modelle (`voice_design`) brauchen eine Beschreibung (`openai_instructions` der Stimme → `instructions`).
  Reihenfolge: entworfene Stimme (`voice_id` `design:<id>` → `TtsLocalSettings.designed_voices`) vor eigener Beschreibung
  vor der Karte: `extensions.otakusoul_voice.description` (Englisch, Editor-Feld „Stimmbeschreibung“) füllt eine leere
  `openai_instructions` beim Laden (`services/characterVoice.ts`, `loadCharacterVoiceConfig` – alle Ladestellen einer
  Figurenstimme gehen darüber, auch für OpenAI-TTS). Hub-Karten setzt `otakusoul-data/tools/set_card_voices.py`.
  Sprechstil (`style_control`, Qwen3-TTS 1.7B CustomVoice, Backend `qwen3-tts-1.7b-customvoice`): eingebaute Stimme plus
  `instructions` = `VoiceConfig.local_style` + Gefühl des Satzes (`local_emotion`, Standard an:
  `emotions::classify_emotion` auf dem *ungefilterten* Text, denn Aktionen sind die stärksten Hinweise →
  `emotions::speaking_style`). Nie Alter/Geschlecht in den Stil: Ryan mit Shioris Kartenbeschreibung sprang von 124 auf
  214 Hz; deshalb nicht `openai_instructions`/Karte verwenden. Formulierungen gemäßigt halten: „sadly, quietly and
  slowly“ ließ Wörter verschwimmen (78 % statt 100 %). Gleiche Eingabe gibt gleiches Audio (deterministisch).
  GPU-Test `style_voice` (23.10.2026, RTX 5090): Wut +24 % Tonhöhe, Trauer −12 %, Flüster-Stil 2,1× so lang, alles 100 %
  verständlich, ~1 s je Satz, 3,6 GB VRAM.
  Erzähler (`voice::NARRATOR_VOICE_ID` = `stage_narrator`, liest `*Aktionen*` bei `narrator_for_actions` sowie Spielleiter/
  NPCs): ohne gespeichertes Profil `narrator_default_config` – Edge-TTS-Männerstimme je Antwortsprache (Conrad/Ryan/
  Dmitry/Keita), Filter „alles“, dazu Beschreibung (VoiceDesign/OpenAI) und `local_style` (CustomVoice). Im Stimmdialog
  öffnet „Erzählerstimme einstellen …“ unter der Aktions-Option sein Profil als zweiten Dialog.
- Wiedergabe (`services/audioPlayer.ts`): Clips werden vorab dekodiert, Stille vorn/hinten gekürzt (`utils/audioTrim.ts`,
  30 ms Rand) und auf der Web-Audio-Uhr direkt hintereinander gestartet (`SENTENCE_GAP_SECONDS` = 0,18 s). Früher lud ein
  `<audio>`-Element jeden Satz erst nach dem Ende des vorigen – das gab spürbare Pausen zwischen den Sätzen.
- Edge-TTS (`voice.rs`): Microsoft verlangt `Sec-MS-GEC` Version 2 (`edge_tts_drm.rs`, Port aus edge-tts/LGPL-3.0, gegen
  Referenzwerte getestet; Version `2-<Edge>`), auch für `voices/list`. Das Token hängt am 5-Minuten-Fenster: eine falsch
  gehende PC-Uhr (hier 65 min) gibt HTTP 403 – dann `Date` der Antwort übernehmen (`EDGE_CLOCK_SKEW`) und einmal neu
  versuchen, wie edge-tts. Live-Test: `cargo test --lib test_edge_tts_live_synthesis -- --ignored`.
  TADA: `CRISPASR_TADA_WAV_CLONE=1` (WAV-Klon, Encoder/Aligner neben dem Modell), `CRISPASR_TADA_NUM_CANDIDATES=4`.
  Chatterbox klont nativ nur aus 24-kHz-WAV und braucht im Server die Stimme als `<id>.wav` (`clone_voice_name`);
  Katalog-Feld `clone_experimental` kennzeichnet das in der UI.
  Klon-Dialog: Aufnahme (bis 60 s) oder Datei → `CloneTrimmer` (Wellenform, Anfang/Ende, Vorschlag `utils/audioClip.ts`
  `suggestClip` = Fenster mit meister Sprache, Ränder in Pausen); gespeichert wird nur `trimSamples` (Blenden). E2E
  `voice-clone-trim.mjs`. Geklonte Stimmen (`<Daten>/voices`, ohne Kokoro-`.gguf`) sichert `profile_backup` mit der
  Gruppe „settings“ unter `voices/`.
  Chatterbox Turbo (`speaks_sound_tags`): `voice::actions_to_sound_tags` macht *lacht* zu `[laugh]` vor dem Aktionsfilter.
- Stimmeffekte: `VoiceConfig.effects` (`VoiceEffects`), gerendert in `services/voiceEffects.ts` (OfflineAudioContext, Tonhöhe per
  WSOLA) über `audioPlayer.enqueue(…, effects)`; jeder neue Abspielweg muss `config.effects` mitgeben.

### 8. Kognitives Gedächtnis, SQLite & Reflexion

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
- Episodische Erinnerungen (Migration v4): Quelle (`source_chat_id`, `source_message_ids`), Herkunft (`origin`:
  auto/manual/edited, '' = alt), `pinned` (zuerst im Kontext), `needs_review`. Neue Erinnerungen mit Quelle über
  `add_episodic_memory_from` + `MemorySource`. Nachrichtenänderungen in `memory/chats.rs` rufen
  `flag_memories_from_messages`; jede Änderung landet in `soul_memory_history` (`log_memory_change`).
- Relevanz-Abruf (Migration v7, `memory/recall.rs`): FTS5-Index `soul_episodic_memory_fts` (External Content,
  `trigram remove_diacritics 1`, findet Wortteile/Komposita, Suchbegriffe ab 3 Zeichen), per Trigger synchron –
  bei External Content nur die `'delete'`-Sonderform, nie `DELETE FROM …_fts`. `fts_query` macht aus Freitext eine
  sichere OR-Abfrage (Stoppwörter de/en/ru). `select_prompt_memories` liefert `PromptMemories { core, relevant }`:
  `core` (alle angepinnten + 5 wichtigste) hängt nicht vom Gespräch ab und bleibt im System-Prompt (Abschnitt 6.5);
  `relevant` (FTS-Treffer, aufgefüllt mit den neuesten) hängt `post_history_instruction` hinter den Verlauf, damit
  der Prompt-Cache (llama-server) nicht bei jeder Antwort verfällt. Das Frontend holt sie pro Antwort in
  `resolvePromptWithLore` (`get_prompt_memories`, Query = letzte 2 Nutzer-Nachrichten + letzte Antwort, OOC
  entfernt); bei Fehler gilt `cognitive.recent_memories`. Budget über `MemoryBudget` (Chat 1.500 Tokens; der Router
  zählt nur die gezeigten 300 Zeichen). Der Reflexions-Router bekommt dieselbe Auswahl als `- #id [Kategorie] Text`.
- Überholte Erinnerungen (Migration v8): `superseded_at` gesetzt = überholt (keine eigene `is_active`-Spalte), dazu
  `superseded_by` (Nachfolger oder NULL), `supersede_reason`, `topic_key`. **Jede** Abfrage für Prompt, Router, Suche,
  Drawer-Liste und Duplikatprüfung filtert `superseded_at IS NULL`; nur Snapshots (`get_all_episodic_memories`) und
  `get_superseded_memories` sehen alles. Archivar-Themen haben `topic_key` (`normalize_topic_key` des Dateinamens):
  der Archivar bekommt die aktive Fassung (`topic_body`) zum Zusammenführen, `apply_reflection` löst sie durch die
  neue ab. Die Signifikanz eines Themas vergibt der Router (`topic_plan.actions[].significance`, 1–5, geklemmt);
  fehlt sie, erbt die neue Fassung die der alten, sonst gilt `DEFAULT_TOPIC_SIGNIFICANCE` (4). Router-`memory_supersede` gilt nur für IDs, die er gezeigt bekam (Pipeline prüft), `supersede_memory_on`
  prüft Figur und Aktivität; angepinnte/`manual`/`edited` werden nie abgelöst, sondern `needs_review` + Grund in
  `supersede_reason` (Drawer zeigt `memory.contradictedHint`; „Passt so“/Korrigieren leeren den Grund). Snapshot-
  Wiederherstellung legt überholte Einträge ohne Zusammenlegen mit aktiven an und biegt `superseded_by` per
  Alt→Neu-Zuordnung um (`relink_restored_memories_on`). `forget` setzt Verweise auf den gelöschten Eintrag auf NULL.
- Vorhaben & Versprechen (Migration v9, `memory/intentions.rs`, Tabelle `soul_intentions` je Figur **und Persona**):
  `time_basis` `real` (echte Uhr, optional `due_at`; ganzer Tag = lokale Mitternacht, `due_has_time`) oder `story`
  (nie fällig, Datum wird verworfen). Abgelaufen (`real`, Kulanz 6 h bzw. bis Ende des Folgetags) → `expired`, geprüft
  beim Laden, im Prompt und in jeder Reflexion. Abschluss (`fulfilled`/`expired`/`abandoned`) erzeugt eine Episode
  `category = "promise"` (Spieltexte „Promise kept: {}“ usw. in `presets/locales` **und** `otakusoul-data/locales`)
  und setzt `memory_id`. Router bekommt `CURRENT LOCAL TIME` und `OPEN INTENTIONS` mit IDs; `intentions_patch.due`
  liest `parse_due` (ISO, lokal, Vergangenheit → kein Datum); Stage-Transkripte erzeugen nur `story`; `resolve` nur für
  gezeigte offene IDs. `get_prompt_memories(char_id, user_name, query)` liefert `intentions` mit im Backend berechneter
  Beschriftung (`due_label`, englisch wie der Prompt); `post_history_instruction` hängt sie hinter die passenden
  Erinnerungen. Drawer-Reiter „Vorhaben“ (`IntentionsTab.tsx`) steht hinter „Episoden & Themen“ – E2E/Vitest, die
  Reiter per Index ansprechen, zählen ihn mit.
- Konsolidierung: `preferences_habits` weich auf 12 (`HABITS_SOFT_CAP`), hart 25. Darüber stellt die Pipeline dem
  Router eine `CONSOLIDATION TASK`; `preferences_habits_replace` wird **nur dann** übernommen (`accept_habits_replace`,
  1–12 Einträge), sonst ignoriert – ein Modell darf die Liste nicht ungefragt leeren.
- „Gedächtnis aufräumen“ (`memory/cleanup.rs`, `MemoryCleanup.tsx`): `propose_memory_cleanup` zeigt dem Modell nur
  aktive, ungeschützte Erinnerungen (`cleanup_candidates`, ~6.000 Tokens) und schreibt nichts; `valid_cleanup_groups`
  verlangt je Gruppe ≥ 2 bekannte IDs, jede nur einmal. Erst `apply_memory_cleanup` (nach Snapshot, eine Transaktion)
  legt je Gruppe eine Erinnerung an und löst die Quellen per `supersede_memory_on` ab (wiederherstellbar). Sperre über
  `memoryOperation = 'cleanup'`. Mock-LLM: `stats.cleanupResult`.
- Raw-Strings für Prompts: ein `"#` (z. B. `"#12"`) beendet `r#"…"#` – dann `r##"…"##` nehmen.
- Router-JSON wird tolerant gelesen (`memory_pipeline::lenient`): lokale Modelle (Qwen 3.6, Mistral Nemo) schreiben
  Textfelder wie `known_attributes` als Liste, Listen als einzelnen Text, Zahlen/IDs als String (`"#27"`). Strenge
  Typen verwarfen dafür früher die **ganze** Reflexion. Neue Router-Felder immer mit `deserialize_with = "lenient::…"`.
  Zusammengefasste Gewohnheiten brauchen ≥ 3 Muster à ≤ 160 Zeichen (Cydonia lieferte einen einzigen Absatz).
- Echtmodell-Test: `OTAKUSOUL_E2E_LLMS=a.gguf,b.gguf cargo test --test gpu_e2e memory -- --ignored --nocapture`
  (Wegwerf-Profil, nutzt die installierte llama.cpp-Laufzeit per Symlink, Tabelle je Modell). Stand 19.10.2026:
  Gemma 4 12B alles ✅; Mistral Nemo, Cydonia 24B, Qwen 3.6 35B-A3B je ein Aussetzer (Vorhaben in der Geschichte
  bzw. „erledigt“ übersehen).

### 9. Hub-Synchronisation, Registries & Daten-Pakete

- Hub-Listen: Szenen-/Lorebook-Einträge der Registry können `translations.<sprache>.<feld>` tragen (`hub::entry_translations`,
  Anzeige über `components/hub/registryText.ts`; Name/Titel bleiben Update-Schlüssel), gepflegt im Daten-Repo mit
  `tools/validate_content.py --sync-registry`. Stage findet Karten über `characters::find_by_name` bzw. `findCharacterByName`
  (exakt, sonst Name vor der Klammer).
- Inhalte für Erwachsene: `AppSettings.nsfw_enabled` + `adult_confirmed` (einmalige Bestätigung „mindestens 18“, kein
  Geburtsdatum; UI `settings/NsfwSettings.tsx`, Standard aus). Das Backend prüft selbst (`settings::nsfw_allowed`, liest nur
  die zwei Felder – ein volles `load_app_settings` scannt Charaktere und würde sich rekursiv aufrufen): Erst dann lädt der Hub
  zusätzlich die Registries aus `otakusoul-data-nsfw` (`hub::nsfw_registry_items`, Fehler nur Log; `OTAKUSOUL_NSFW_HUB_BASE`
  für E2E), zeigt `nsfw`-Einträge mit „18+“ (`NsfwBadge`), erlaubt Downloads daraus (`ensure_source_allowed`) und den
  Chub-NSFW-Filter. Importe aus der 18+-Quelle bekommen `extensions.otakusoul_nsfw` (`modules/nsfw.rs`); markierte Karten,
  Lorebooks und Geschichten blenden `scan_available_characters`, `list_all_lorebooks` und `scan_available_scenes` aus,
  solange die Freigabe fehlt (nichts wird gelöscht). Umschalten lädt Hub-Listen und Bibliotheken neu. E2E `hub-nsfw.mjs`.
  Einzelabrufe und Importe prüfen `nsfw::ensure_visible` (`backend.nsfw.disabled`): `load_character_card`, `load_lorebook`,
  `import_lorebook_file`, `store_imported_card` (alle Karten-Importe), `load_scene_by_id`, `import_stage_scene_json`;
  `get_stage_state` setzt eine offene markierte Geschichte auf den Startzustand zurück. Das Frontend schließt offene markierte
  Figuren/Lorebooks/Geschichten, die nach dem Neuladen fehlen (`utils/adultContent.ts`, vergisst `stage_last_scene`);
  Gruppen-Antworten ausgeblendeter Gäste heißen „Ausgeblendeter Charakter“. E2E `adult-content-hiding.mjs`.
  Emotionsbilder: neben den sechs Stimmungen die Plätze `blush`, `teasing`, `fear`, `disgust`, `crying` und (Romance)
  `seductive`, `aroused`, `ecstasy`, `afterglow` (`emotions::EXTRA_PORTRAITS`, `EmotionResult.portrait`; Bildwahl
  `selectCharacterPortrait`: Zusatzplatz → Emotion → Stimmung → neutral) – für alle Karten nutzbar.
  Chat-Antworten enden mit einem Tag `[emotion: NAME]` (`PromptContext.emotion_tags`, Nachspann bietet von allen 15 Plätzen
  nur die an, deren Bild vor jeder Antwort existiert – `prompt_builder::picture_exists`; die sechs Stimmungen auch, wenn
  ein 3D-/Live2D-Avatar sie zeigt: `avatar_moods` aus `helpers.avatarShowsMoods`, nicht bei „Alle zeigen“ im Gruppen-Chat;
  sonst ohne Bild kein Tag; E2E `chat-emotion-tag.mjs`); `utils/replyTags.ts` entfernt ihn vor dem Speichern und im Live-Text, `chatSlice.replyEmotionTags`
  merkt ihn je `hitKey` (nur Sitzung), `voice::clean_text_for_tts` liest ihn (und `<state>`) nicht vor.
  Ohne Tag entscheiden Hinweiswörter aus `presets/cues/<sprache>.json` (+ `common.json` für Emoticons; Abschnitte `emotions`,
  `portraits` = Backend `emotions::Cue`, `gestures` = Frontend `avatarGestures.ts` per `import.meta.glob`). Ganze Wörter,
  `*` am Ende = beliebige Endung, Wortgrenzen für alle Schriften; alle Sprachen gelten gleichzeitig. Neue Sprache = neue Datei,
  kein Code; `language_files_use_known_keys` prüft die Schlüssel.
  Der Ausdruck folgt der angezeigten letzten Antwort auch ohne neue Generierung (Chat öffnen, Swipe, Bearbeiten; Effekt
  in `ChatView`), eine neue Antwort setzt ihn in `onLlmDone` samt Geste. E2E `avatar-portraits.mjs`.
- Hub-Updates: Registry-Einträge tragen `revision`/`updated` (`hub::entry_revision`, fehlend = 1); installierte Inhalte stehen in
  `<Daten>/hub_installed.json` (`hub_installed.rs`, Befehl `list_installed_hub_items`, Schlüssel Art + Registry-ID bzw. Name).
  Szenen-Import behält `extensions` (`scene_definition_from_hub`, `null`-Felder = fehlend) und aktualisiert eine vorhandene Kopie
  per `update_scene_definition` (Spielstand bleibt; alte Importe über Titel-Slug gefunden), neue IDs `hub_<id>`.
  Hintergründe einer Szene stehen in `extensions.otakusoul_assets.backgrounds` (`[{file, path}]`, `path` relativ zum
  Daten-Repo unter `presets/`); `hub::download_scene_assets` lädt fehlende Bilder nach `<Daten>/backgrounds` (Fehler nur Log).
  Lorebook-Import (`import_from_json_string`) behält Buch-`extensions` (Übersetzungen) und wandelt Soul-of-Waifu-Einträge
  um (`upgrade_legacy_entry`: `depends_on` → `chain_requires`, `random` und `chain` mit Voraussetzung → `always_on`,
  `semantic`/`range` → `keyword`); das Daten-Repo steht bereits im App-Format.
  Stage bindet Lorebooks einer Szene über Originalname oder ID (nicht den übersetzten Namen). Karten-Update =
  `overwrite`. Lorebooks behalten ihre ID; lokal veränderte (Hash ≠ `local_sha256`) oder fremde gleichnamige lehnt der Import mit
  `backend.hub.lorebookModified` ab, mit `keep_copy` wird die eigene Fassung als `<id>_own` gesichert. Frontend: `hubStatus`,
  `HubStatusBadge`, `UpdateAllBar`. `OTAKUSOUL_HUB_BASE` lenkt die Registries um (E2E `hub-updates.mjs` über den Mock).
- Charakter-Importe (Datei, Hub, Chub, URL) laufen über `characters::store_imported_card`: gleicher Name →
  `backend.characters.exists`, das Frontend fragt per `services/characterImport.ts` (`importWithOverwrite`) und ruft mit
  `overwrite` erneut auf. Nie umbenennen („_1“); alte Kopien gehen in den Papierkorb, gelöschte werden wieder sichtbar.

### 10. Begleiter (Companion) & Befehlspalette

- Companion `execute_code`: nur mit `allow_code_execution` (Standard aus, Companion-Einstellungen werden nicht gespeichert
  → gilt bis Neustart); geprüft in `request_tool_call` und in `execute_internal_sync`. Neue Werkzeuge in
  `components/companion/toolEffects.ts` mit ihren Wirkungen eintragen (sonst „extern, unbekannt“).
- Befehlspalette: Einträge für Einstellungen/Optionen/Integrationen in `CommandPalette.tsx`; Optionen brauchen eine
  `id="setting-…"` und springen per `utils/revealSetting.ts`. `SettingsView` folgt `openSettingsSection` auch offen.
- Companion-Tools: nur ausdrücklich geprüfte interne Tools in `companion.rs` → `tool_allows_auto_approval`
  dürfen automatisch freigegeben werden. MCP-/unbekannte Tools, Screenshots, Zwischenablage und schreibende
  Dateiaktionen laufen über den Bestätigungsbanner; ausgeführt wird in `execute_internal_sync`.

## Stand

Erledigtes (Portierung Phasen 1–18, Verbesserungen, TTS, Neutralisierung, Inhalte, Qualität) steht in
`roadmap_abgeschlossen.md` (nur lokal, nicht im Repository), alles Offene in `roadmap.md`. Aktueller Schwerpunkt: Bedienbarkeit für Einsteiger und
Story-Einstieg (Plan lokal in `roadmap_abgeschlossen.md`, Abschnitt 10; die Leitlinien für neue Oberflächen stehen oben in `roadmap.md`). Mitgelieferte Figuren: `presets/characters/` (Shiori Amane,
Sota Minase, Lirwen, Faelion) und `presets/crypt-of-shadows/`; weitere Figuren/Pakete (NGNL, Sakura Succubus 3 mit Ayu und Cosmos, Re:Zero mit Emilia, Einzelkarten) liegen in
`SnowwhiteOakheart/otakusoul-data` (Hub-Registries in `hub.rs`). Karten pflegen Übersetzungen in `otakusoul_i18n` und
verwenden `custom_*`-Schlüssel (`sow_*` wird nur noch gelesen). Daten: `<Daten>` = `~/.local/share/otakusoul` (Linux) mit `runtimes/`, `image-models/`, `tts-models/`,
`voices/`, `attachments/`, `otakusoul.db`; Entwickler-Modelle in `assets/models/` (gitignored).
