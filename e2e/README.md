# End-to-End-Testsuite (E2E)

`npm run e2e` baut die App im Debug-Modus nach `target/e2e/` und führt die vollständige E2E-Suite aus. Die App startet dabei mit einem isolierten Wegwerfprofil (`OTAKUSOUL_HOME` in einem temporären Verzeichnis), sodass echte Chats, Einstellungen und Datenbanken unberührt bleiben (selbst wenn eine OtakuSoul-Instanz parallel geöffnet ist). Die Tests kommunizieren mit einem integrierten Mock-LLM (`mock-llm.mjs`) anstelle echter Modelle. Screenshots werden in `e2e/screenshots/` abgelegt (gitignored).

`npm run e2e:run` überspringt den Build-Schritt und führt die Tests direkt gegen das bestehende Test-Binary aus.

## Voraussetzungen (Linux)

- `tauri-driver`: `cargo install tauri-driver --locked`
- `WebKitWebDriver`: Arch `webkitgtk-6.0`, Debian/Ubuntu `webkit2gtk-driver`, Fedora `webkitgtk6.0` (unter Windows funktioniert `msedgedriver`; für macOS gibt es keinen WebDriver für WKWebView).
- Display / X11: Bei headless-Umgebungen oder gesperrter Desktop-Sitzung per `xvfb-run npm run e2e` ausführen, da WebKit-Bildaufnahmen und Animationsabfragen sonst hängen können.
- `sqlite3` CLI für die Fehler- und Rollback-Tests (temporäre Trigger ausschließlich im Wegwerfprofil).

## Abgedeckte Testbereiche

Die Suite umfasst über 90 spezialisierte Testmodule:

1. **Rauchtest, Chat & Gruppenchat:**
   - `smoke.mjs`: Start, Kontextzähler, automatische Zusammenfassungen im System-Prompt, Verlaufsnavigation.
   - `chat-navigation.mjs`, `chat-return.mjs`, `chat-tools.mjs`, `chat-style.mjs`, `prompt-log.mjs`, `partial-reply.mjs`, `chat-jsonl.mjs`.
   - `chat-reply-ideas.mjs`, `chat-direction.mjs`, `chat-repeats.mjs`, `chat-reply-length.mjs`, `chat-reply-filters.mjs`, `chat-quick-replies.mjs`, `chat-prompt-hits.mjs`, `chat-remember.mjs`.
   - `chat-group.mjs`, `chat-memory-guests.mjs`, `chat-proactive.mjs`, `chat-dream.mjs`, `chat-offscreen.mjs`, `chat-scene-image.mjs`, `chat-selfie.mjs`, `chat-emotion-tag.mjs`, `chat-narrator-voice.mjs`.

2. **Fehlertoleranz & Entwurfsschutz (SQLite-Trigger im Wegwerfprofil):**
   - `chat-edit-errors.mjs`, `chat-generation-errors.mjs`, `chat-sessions-abort.mjs`, `chat-sidebar-errors.mjs`.
   - `markdown-errors.mjs`, `error-fixes.mjs`: Entwürfe bleiben bei Schreib-/Lesefehlern erhalten; Lösungsknöpfe und Fehlerhinweise greifen korrekt.

3. **Kognitives Gedächtnis:**
   - `memory-save-errors.mjs`, `memory-read-errors.mjs`, `memory-operations.mjs`, `memory-drafts.mjs`, `memory-sources.mjs`.
   - `memory-recall.mjs`, `memory-supersede.mjs`, `memory-intentions.mjs`, `memory-cleanup.mjs`: FTS5-Relevanzabruf, Ablösen überholter Erinnerungen, Vorhaben & Versprechen mit Fälligkeit sowie Aufräumen überlappender Einträge.

4. **Soul Stage & 5e-Regelsystem:**
   - `stage-context.mjs`, `stage-npcs.mjs`, `stage-editor.mjs`, `stage-director.mjs`, `stage-voice.mjs`, `stage-world.mjs`, `stage-memory.mjs`, `stage-offscreen.mjs`, `stage-upkeep-abort.mjs`.
   - `stage-5e.mjs`, `stage-board.mjs`, `stage-spells.mjs`, `stage-explore.mjs`, `stage-adventure.mjs`, `stage-gallery.mjs`: Spielbrett, Wegfindung, Sichtlinie, Zauberflächen, Nebel des Krieges, Meilensteine, mehraktige Abenteuer und Story-Sammlungen.

5. **Avatare, 3D-Bühne & Inochi2D:**
   - `avatar-motions.mjs`, `avatar-mmd.mjs`, `avatar-gltf.mjs`, `avatar-gltf-clips.mjs`, `avatar-gltf-folder.mjs`, `avatar-gltf-face.mjs`, `avatar-portraits.mjs`: VRM-, MMD-, glTF-Animationen, Morph-/Knochen-Gesichter und 15 Emotionsporträts.
   - `avatar-library.mjs`, `avatar-manager.mjs`, `avatar-inochi2d.mjs`: Avatar-Bibliothek, Manager, WebGL2-Inochi2D-Puppen samt Animationen, Parameter-Zuordnung und Hub-Katalog.

6. **Stimme, Bildgenerierung, Modelle & Begleiter:**
   - `voice-effects.mjs`, `voice-clone-trim.mjs`, `voice-mic-check.mjs`, `voice-barge-in.mjs`, `voice-gallery.mjs`: Audioeffekte, Wellenform-Zuschnitt für Stimmklone, Audio-Prüfstand, Ins-Wort-Fallen im Sprachanruf und Stimmgalerie.
   - `image-loras.mjs`: Modellfamilien-Zuordnung lokaler Bild-LoRAs.
   - `chat-loras.mjs`: LoRA-Adapter fürs Chat-Modell (Katalog je Modell, „Meine Modelle“, Startseite, 18+-Sperre, Stärke).
   - `llm-benchmark.mjs`: Geschwindigkeitstest des Chat-Modells (gespeicherte Ergebnisse, Verlauf, Sperre ohne Modell).
   - `companion-safety.mjs`, `pet-inochi2d.mjs`: HITL-Bestätigungsbanner bei sensiblen Aktionen und Desktop-Pet-Oberfläche mit Klick-Durchlass.

7. **Oberfläche, Zugänglichkeit & Hub:**
   - `onboarding.mjs`, `home.mjs`, `character-library.mjs`, `character-traits.mjs`, `character-import.mjs`, `startup-character.mjs`, `settings-palette.mjs`, `settings-reset.mjs`, `settings-hints.mjs`, `close-to-tray.mjs`, `background-tasks.mjs`, `ui-layout.mjs`, `hub-updates.mjs`, `hub-collections.mjs`, `hub-nsfw.mjs`, `adult-content-hiding.mjs`, `languages.mjs`, `help.mjs`, `a11y-sweep.mjs`, `contrast.mjs`, `keyboard.mjs`, `beginner-journey.mjs`.

## Weitere E2E-Werkzeuge

- **Langchat-Messung (1000 Nachrichten):** `npm run e2e:perf`
- **README-Screenshots:** `xvfb-run -a node e2e/readme-screenshots.mjs de|en|ru`
- **Porträt-Dev-Test:** `npm run e2e:portraits:dev`
- **Lokale Fremd-Avatare prüfen:** `xvfb-run -a node e2e/local-avatars.mjs` (aus `assets/test-avatars/`)
