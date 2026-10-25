# End-to-End-Testsuite (E2E)

`npm run e2e` baut die App im Debug-Modus nach `target/e2e/` und führt die vollständige E2E-Suite aus. Die App startet dabei mit einem isolierten Wegwerfprofil (`OTAKUSOUL_HOME` in einem temporären Verzeichnis), sodass echte Chats, Einstellungen und Datenbanken unberührt bleiben (selbst wenn eine OtakuSoul-Instanz parallel geöffnet ist). Die Tests kommunizieren mit einem integrierten Mock-LLM (`mock-llm.mjs`) anstelle echter Modelle. Screenshots werden in `e2e/screenshots/` abgelegt (gitignored).

`npm run e2e:run` überspringt den Build-Schritt und führt die Tests direkt gegen das bestehende Test-Binary aus.

## Voraussetzungen (Linux)

- `tauri-driver`: `cargo install tauri-driver --locked`
- `WebKitWebDriver`: Arch `webkitgtk-6.0`, Debian/Ubuntu `webkit2gtk-driver`, Fedora `webkitgtk6.0` (unter Windows funktioniert `msedgedriver`; für macOS gibt es keinen WebDriver für WKWebView).
- Display / X11: Bei headless-Umgebungen oder gesperrter Desktop-Sitzung per `xvfb-run npm run e2e` ausführen, da WebKit-Bildaufnahmen und Animationsabfragen sonst hängen können.
- `sqlite3` CLI für die Fehler- und Rollback-Tests (temporäre Trigger ausschließlich im Wegwerfprofil).

## Abgedeckte Testbereiche

Die Suite umfasst über 45 spezialisierte Testmodule:

1. **Rauchtest & Chat-Grundlagen:**
   - `smoke.mjs`: Start, Kontextzähler, automatische Zusammenfassungen im System-Prompt, Verlaufsnavigation.
   - `chat-navigation.mjs`, `chat-tools.mjs`, `chat-style.mjs`, `prompt-log.mjs`, `partial-reply.mjs`.

2. **Fehlertoleranz & Entwurfsschutz (SQLite-Trigger im Wegwerfprofil):**
   - `chat-edit-errors.mjs`, `chat-generation-errors.mjs`, `chat-sessions-abort.mjs`, `chat-sidebar-errors.mjs`.
   - `markdown-errors.mjs`, `error-fixes.mjs`: Entwürfe bleiben bei Schreib-/Lesefehlern erhalten; Lösungsknöpfe und Fehlerhinweise greifen korrekt.

3. **Kognitives Gedächtnis:**
   - `memory-save-errors.mjs`, `memory-read-errors.mjs`, `memory-operations.mjs`, `memory-drafts.mjs`, `memory-sources.mjs`.
   - Prüft Transaktionssicherheit, Rollbacks bei Import/Snapshot-Wiederherstellung, Mehrschichten-Reflexion und Quellennachweise.

4. **Soul Stage & 5e-Regelsystem:**
   - `stage-context.mjs`, `stage-npcs.mjs`, `stage-editor.mjs`, `stage-director.mjs`, `stage-voice.mjs`, `stage-world.mjs`, `stage-memory.mjs`, `stage-upkeep-abort.mjs`.
   - `stage-5e.mjs`, `stage-board.mjs`, `stage-spells.mjs`, `stage-explore.mjs`, `stage-adventure.mjs`, `stage-gallery.mjs`: Spielbrett, Wegfindung, Sichtlinie, Zauberflächen, Nebel des Krieges, Meilensteine und mehraktige Abenteuer.

5. **Avatare & 3D-Bühne:**
   - `avatar-motions.mjs`, `avatar-mmd.mjs`, `avatar-gltf.mjs`, `avatar-gltf-clips.mjs`, `avatar-gltf-folder.mjs`, `avatar-gltf-face.mjs`, `avatar-portraits.mjs`: VRM-, MMD-, glTF-Animationen, Morph-/Knochen-Gesichter und Emotionsporträts.

6. **Stimme, Bildgenerierung & Begleiter:**
   - `voice-effects.mjs`, `voice-clone-trim.mjs`: Audioeffekte und Wellenform-Zuschnitt für Stimmklone.
   - `image-loras.mjs`: Modellfamilien-Zuordnung lokaler Bild-LoRAs.
   - `chat-loras.mjs`: LoRA-Adapter fürs Chat-Modell (Katalog je Modell, 18+-Sperre, Stärke).
   - `companion-safety.mjs`: Bestätigungsbanner bei sensiblen Aktionen (HITL-Sicherheitsabfrage).

7. **Oberfläche, Zugänglichkeit & Hub:**
   - `onboarding.mjs`, `home.mjs`, `character-library.mjs`, `character-traits.mjs`, `character-import.mjs`, `startup-character.mjs`, `settings-palette.mjs`, `close-to-tray.mjs`, `background-tasks.mjs`, `ui-layout.mjs`, `hub-updates.mjs`, `languages.mjs`, `help.mjs`, `a11y-sweep.mjs`, `beginner-journey.mjs`.

## Weitere E2E-Werkzeuge

- **Langchat-Messung (1000 Nachrichten):** `npm run e2e:perf`
- **README-Screenshots:** `xvfb-run -a node e2e/readme-screenshots.mjs de|en|ru`
- **Porträt-Dev-Test:** `npm run e2e:portraits:dev`
