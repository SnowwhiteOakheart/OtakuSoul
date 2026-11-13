# End-to-End-Testsuite (E2E)

`npm run e2e` baut die App im Debug-Modus nach `target/e2e/` und führt die vollständige E2E-Suite aus. Die App startet dabei mit einem isolierten Wegwerfprofil (`OTAKUSOUL_HOME` in einem temporären Verzeichnis), sodass echte Chats, Einstellungen und Datenbanken unberührt bleiben (selbst wenn eine OtakuSoul-Instanz parallel geöffnet ist). Die Tests kommunizieren mit einem integrierten Mock-LLM (`mock-llm.mjs`) anstelle echter Modelle. Screenshots werden in `e2e/screenshots/` abgelegt (gitignored).

`npm run e2e:run` überspringt den Build-Schritt und führt die Tests direkt gegen das bestehende Test-Binary aus.

`npm run e2e:filter -- [--build|--list|--keep-going|--json|--verbose] <muster>` führt gezielt passende Skripte aus `e2e:run` aus (standardmäßig kompakt: 1 Statuszeile je bestandenem Test, Fehlerdiagnose nur bei Fehlschlag; `harness.mjs` puffert `tauri-driver`-Logs, sofern nicht `OTAKUSOUL_E2E_VERBOSE=1` gesetzt ist).

Die Suite verwendet WebdriverIO 10 mit strengen Selektoren: `$` muss genau ein Element finden; für eine bewusst gewählte erste Karte `$$` verwenden. Asynchrone Seitenskripte über `execute(async () => …)` ausführen und Navigation über `browser.refresh()` abwarten. Ein sichtbares Eingabefeld garantiert noch keine angelegte Chat-Sitzung; dafür auf den entsprechenden Zustand warten. Die unterstützten Node-Versionen stehen in `package.json` unter `engines`.

`close-to-tray.mjs` prüft native X11-Fensterereignisse und wird außerhalb von Linux ausdrücklich übersprungen; dadurch ist das native Schließen unter Windows/macOS nicht mitgeprüft.

## Voraussetzungen (Linux)

- `tauri-driver`: `cargo install tauri-driver --locked`
- `WebKitWebDriver`: Arch `webkitgtk-6.0`, Debian/Ubuntu `webkit2gtk-driver` (Ubuntu 26.04+: `webkitgtk-webdriver`), Fedora `webkitgtk6.0` (unter Windows funktioniert `msedgedriver`; für macOS gibt es keinen WebDriver für WKWebView).
- Display / X11: Bei headless-Umgebungen oder gesperrter Desktop-Sitzung per `xvfb-run npm run e2e` ausführen, da WebKit-Bildaufnahmen und Animationsabfragen sonst hängen können.
- `sqlite3` CLI für die Fehler- und Rollback-Tests (temporäre Trigger ausschließlich im Wegwerfprofil).

## Voraussetzungen (Windows)

- `tauri-driver` wie oben.
- `msedgedriver.exe` in genau der Version der installierten WebView2-Laufzeit (Registry
  `HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`, Wert `pv`),
  von `https://msedgedriver.microsoft.com/<version>/edgedriver_win64.zip`, in einem Ordner im `PATH`. Nach einem
  WebView2-Update passend nachziehen.
- `sqlite3`: `winget install SQLite.SQLite`.
- Kein `xvfb` nötig; die Sitzung sollte aber nicht gesperrt sein.

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
   - `memory-atlas.mjs`, `memory-journal.mjs`, `memory-branches.mjs`: Beziehungs-Atlas, Tagebuch-Modus (Abend-Reflexion, Gute-Nacht-Nachricht, Monatsrückblick) und Zweige mit eigenem Gedächtnis.

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
   - `onboarding.mjs`, `home.mjs`, `character-library.mjs`, `character-traits.mjs`, `character-import.mjs`, `startup-character.mjs`, `settings-palette.mjs`, `settings-reset.mjs`, `settings-hints.mjs`, `close-to-tray.mjs`, `background-tasks.mjs`, `ui-layout.mjs`, `hub-updates.mjs`, `hub-collections.mjs`, `hub-nsfw.mjs`, `adult-content-hiding.mjs`, `languages.mjs`, `help.mjs`, `a11y-sweep.mjs`, `dialogs-and-boxes.mjs`, `contrast.mjs`, `keyboard.mjs`, `beginner-journey.mjs`.

## Weitere E2E-Werkzeuge

- **PDF-Anhänge:** `node e2e/pdf-attachments.mjs` prüft den echten Import, gespeicherten Text und Fehlerfälle. Eigene synthetische Fixtures unter `e2e/fixtures/pdf/`; Bestandteil der regulären Suite (jetzt 102 Szenarien).
- **Alte Kokoro-Sammelstimmen:** Für `onnx-local.mjs` optional `OTAKUSOUL_KOKORO_TEST_LEGACY_VOICES` auf eine vorhandene Bincode-2-Stimmdatei setzen; zusätzlich wird damit echte Synthese über den gepflegten Decoder geprüft.
- **Echte ONNX-Inferenz in der gebauten App:** `node e2e/onnx-local.mjs`. Benötigt `OTAKUSOUL_KOKORO_TEST_MODEL` (ONNX-Datei), `OTAKUSOUL_KOKORO_TEST_VOICES` (Stimmenordner mit `af_heart` und `am_michael`) und `OTAKUSOUL_TEST_SILERO` (Silero-ONNX-Datei). Prüft Kokoro-Audio einschließlich Dekodierung im Webview und wiederholte VAD-Sessions im selben Prozess auf CPU; keine Downloads und keine Wiedergabe. Wegen der lokalen Modelle bewusst außerhalb der regulären Mock-Suite.
- **Langchat-Messung (1000 Nachrichten):** `npm run e2e:perf`
- **README-Screenshots:** `xvfb-run -a node e2e/readme-screenshots.mjs de|en|ru`
- **Porträt-Dev-Test:** `npm run e2e:portraits:dev`
- **Lokale Fremd-Avatare prüfen:** `xvfb-run -a node e2e/local-avatars.mjs` (aus `assets/test-avatars/`)
