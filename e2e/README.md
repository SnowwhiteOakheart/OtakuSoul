# End-to-end smoke test

`npm run e2e` builds the app in debug mode and runs `smoke.mjs`: the app starts with a throwaway
profile (`OTAKUSOUL_HOME` in a temp folder, so real chats and settings stay untouched, even with
OtakuSoul open) and talks to a mock LLM (`mock-llm.mjs`) instead of a model. The test chats until
older messages leave the context window, then checks the context meter, the automatic summary in
the chat sidebar and that the summary reaches the system prompt. Screenshots land in
`e2e/screenshots/`. `npm run e2e:run` skips the build. The build goes to `target/e2e/` so `cargo test` cannot replace
it with a binary that expects the Vite dev server.

Requirements (Linux; Windows works with `msedgedriver`, macOS has no WebDriver for WKWebView):

- `cargo install tauri-driver --locked`
- `WebKitWebDriver`: Arch `webkitgtk-6.0`, Debian/Ubuntu `webkit2gtk-driver`, Fedora `webkitgtk6.0`
- A display; headless CI runs it under `xvfb-run npm run e2e`.
- Bei gesperrtem Desktop ebenfalls Xvfb verwenden: WebKit-Bildaufnahmen und Animationsabfragen können sonst hängen.
- `sqlite3` CLI for the memory write-error test (temporary triggers in the throwaway profile only).

`stage-context.mjs` prüft zusätzlich lange Stage-Verläufe: Kontextbudget, getrennte Zusammenfassungen für
Planer/Erzähler/Gefährten, Geheimhaltung, Wiederladen, Undo, Bearbeiten/Löschen und Wiederholung nach LLM-Fehlern.

`stage-npcs.mjs` bedient die NPC-Verwaltung und prüft private Dialoge, Abwesenheit/Rückkehr, Spielleiter-NPCs,
Beförderung zu V2-PNG samt Soul Memory sowie die Mindestfenstergröße (960×640). Screenshots 13–18 zeigen den Ablauf.

`companion-safety.mjs` prüft bei aktivierter automatischer Freigabe sicherer Tools, dass ein
Zwischenablagezugriff vor der Ausführung im Bestätigungsbanner landet und abgelehnt werden kann.
Dabei wird die Zwischenablage nicht gelesen. Screenshot 28 zeigt den Freigabedialog.

`memory-save-errors.mjs` erzwingt mit temporären SQLite-Triggern im Wegwerfprofil je einen fehlgeschlagenen Schreibvorgang
für eine Erinnerung und einen Tagebucheintrag. Die Formulare behalten ihre Eingaben, melden keinen
Erfolg und speichern beim Wiederholen genau einen Eintrag im echten Backend.
Screenshot 29 zeigt den Speicherfehler mit erhaltenem Erinnerungsentwurf.

`memory-drafts.mjs` prüft Psychologie- und Beziehungsentwürfe: Tastatureingaben schreiben nicht in die Datenbank,
Reiterwechsel und Schließen erhalten Änderungen. Echte SQLite-Schreibfehler lassen die Entwürfe stehen;
Wiederholen speichert und Verwerfen stellt den gespeicherten Wert wieder her. Screenshots 30–31 zeigen die Fehlerzustände.

`markdown-errors.mjs` erzwingt einen Lesefehler durch einen temporär ungültigen Datentyp und einen Schreibfehler
durch einen SQLite-Trigger ausschließlich im Wegwerfprofil. Der Entwurf bleibt erhalten, Erfolgsanzeigen bleiben aus;
nach Wiederholung werden die Werte tatsächlich gespeichert und wieder geladen. Screenshot 32 zeigt den Lesefehler mit erhaltenem Entwurf.
