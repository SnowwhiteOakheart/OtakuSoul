# Native Rust-Oberfläche – Arbeitsplan

Stand: 09.11.2026. Experiment auf `codex/native-rust-gui`, ausdrücklich vom Nutzer beauftragt.
Dieses Dokument ist der Einstieg für spätere Arbeit am Prototyp. Allgemeine Regeln: `../AI.md`.

## Ziel und Zusammenarbeit

Wir entwickeln gemeinsam eine separat startbare native GUI ohne WebView. Zunächst zählt ausschließlich
Windows auf dem vorhandenen Rechner. Der Assistent implementiert und prüft; der Nutzer beurteilt die
laufende Oberfläche. Fortschritt wird an nutzbaren Etappen gemessen, nicht an Personentagen.
Vor jeder Desktopübernahme ausdrücklich fragen und Zustimmung abwarten (Nutzerwunsch 08.11.2026).
Das umfasst die Vorbereitung mit Schließen/Neustarten der GUI-Testinstanz. Keine parallelen Eingaben;
Codearbeit und Prüfungen ohne Desktopsteuerung können währenddessen weiterlaufen.
Aktuell ausdrücklich ohne Sichtprüfung weiterarbeiten; offene Sicht-/Windows-Prüfungen gesammelt
später durchführen. Eine frühere Freigabe gilt nicht als Erlaubnis für einen neuen Durchlauf.
Linux und macOS bleiben Architekturziele, sind bis zu tatsächlichen Tests aber nicht als unterstützt bestätigt.
WSL kann später Linux-Builds/erste WSLg-Tests ermöglichen; es ersetzt weder Linux-Desktopabnahme noch einen Mac.

Aktuelle Nutzerentscheidung (08.11.2026): **Vollständige, funktionierende GUI vor Übersetzungen**.
Übersetzungen integrieren, sobald die wesentlichen Oberflächen und Abläufe stehen; bis dahin Deutsch.
Die native Oberfläche soll der bestehenden Tauri-Oberfläche möglichst nahekommen. Für Vergleiche
die Tauri-Ansicht über `e2e/harness.mjs` im Wegwerfprofil öffnen und mit WebDriver prüfen.
Die aktuellen React- und CSS-Quellen liefern die Gestaltungs- und Verhaltensdetails.
Produktionsreife (Nutzerwunsch 09.11.2026): vorhandene Bausteine und UI-Schlüssel wiederverwenden.
UI-Sprache und Inhaltssprache getrennt behandeln und veränderliche Anzeigetexte von stabilen IDs trennen.

## Verbindlicher Umfang

- Zunächst Navigation, Charakterauswahl, Chatverlauf, Eingabe, grundlegende Einstellungen und echte Chat-Anbindung.
- Kein Desktop-Pet. Animierte Avatare, Audio, Hub-Ausbau, Stage und komplexe Editoren folgen stufenweise.
- Vorhandene Porträts dürfen in der Vorschau verwendet werden; keine neuen Modellgewichte herunterladen.
- Aktuelle Vorschau ist ausdrücklich ohne KI; Laufzeitänderungen bleiben im RAM. Expliziter Kartenexport
  sichert JSON-/PNG-Dateien außerhalb des produktiven und geladenen Profils.
- Tauri bleibt baubar. Keine vorschnelle Ablösung und keine großflächige Backend-Umschreibung.
- Keine Änderungen am produktiven Profil oder Datenformat. Vor echten Datenzugriffen isolierte Profilkopie
  über `OTAKUSOUL_HOME` vorbereiten. Ein Branch schützt keine Datenbank.

## Architektur und Git

- Framework: Iced **0.14.0** (stabile Registry-Version zum Start), Rust Edition 2024; kein HTML/JS zur Laufzeit.
- Eigenes Workspace-Paket `otakusoul-native` unter `native-ui/`; gemeinsamer Root-`Cargo.lock`.
- `default-members = ["src-tauri"]` bewahrt das bisherige Ziel bei Cargo-Aufrufen ohne Paketauswahl.
- `src/main.rs`: Iced-Ansichten, Darstellung und UI-Ereignisse. `src/model.rs`: flüchtiger Vorschauzustand.
  `src/profile.rs`: begrenzte lesende Projektion von Karten und SQLite-Verläufen; keine Migrationen.
- `src/views.rs`: Layout und Oberflächenansichten; `src/appearance.rs`: gemeinsame Slate-/Violett-Stile.
  `src/icons.rs` + `assets/icons/`: eingebettete Lucide-SVGs derselben Bibliothek wie im React-Frontend.
  `src/message_content.rs`: einmalig geparste Rollenspielsegmente bzw. native Markdown-Elemente;
  Cache wird bei Chatwechsel, Import, geladenem Verlauf und hinzugefügter Testnachricht aktualisiert.
- `crates/otakusoul-stream`: GUI-/HTTP-unabhängiger Decoder für OpenAI-kompatible und Anthropic-SSEs,
  UTF-8-Zeilen und `<think>`-Trennung. Der vorhandene Tauri-Inferenzcode und die native Diagnose
  verwenden denselben Decoder; die bisherige Parsingkopie im Tauri-Code wurde entfernt.
- `src/connection.rs`: gemeinsamer nativer HTTP-Transport für Verbindungstest und Modellchat.
  Eigener Tokio-Hintergrunddienst mit Abbruch, begrenzter Antwort und Verbindungsfehlern.
  `src/chat_request.rs` übernimmt die providerabhängige Aufbereitung des Textverlaufs.
- `crates/otakusoul-paths`: gemeinsame Funktionen `base_dirs`, `isolated_home`, `production_dirs`.
  Das Tauri-Modul re-exportiert die bisherigen Namen, die Standardpfade bleiben unverändert.
- Ressourcen über `include_bytes!`, keine absoluten Rechnerpfade. Keine derzeitige Verbindung zum Tauri-Crate.
- Vier gebündelte Charakterkarten mit Porträts, Beschreibung, Begrüßung und unverändertem Karten-JSON.
  Importierte Karten werden ebenfalls vollständig als JSON behalten; das ist noch keine Portierung der
  produktiven Kartenlogik (Lorebook-/Expressions-Auflösung, fremde Exportsonderformate, Übersetzungen).
- Später: gemeinsame Rust-Kernbibliothek mit typisierten Requests/Ereignissen. Tauri und Iced als Adapter.
  Fachlogik nicht in zwei Oberflächen duplizieren und keine Tauri-Commands direkt aus Iced aufrufen.
- Echte Laufzeitzustände werden asynchron angebunden. Kein blockierendes Netzwerk/SQLite auf dem UI-Thread.
- Änderungen auf **diesem Branch**, Ausnahme von der allgemeinen main-Regel. Kleine thematische deutsche
  Commits, danach Push. Fremde Änderungen niemals aufnehmen. Nicht automatisch nach main mergen.
- Zur bestehenden Entwicklung: sauberer Arbeitsbaum und `git switch main`; zurück mit
  `git switch codex/native-rust-gui`. Gleichzeitige Checkouts bei Bedarf über einen zusätzlichen Worktree.

## Starten und prüfen

Aus dem Repository-Stamm:

```powershell
cargo run -p otakusoul-native
cargo fmt -p otakusoul-native --check
cargo clippy -p otakusoul-native --all-targets -- -D warnings
cargo test -p otakusoul-native
cargo build -p otakusoul-native
```

Debug-Datei: `target/debug/otakusoul-native.exe`. Erster Build lädt GUI-/Grafikabhängigkeiten.
Release später: `cargo build -p otakusoul-native --release`.
Bestehende App weiterhin über `npm run tauri dev`. Kein neuer Installer in der ersten Etappe.

Beispiel ohne persönliche Daten, einmalig aus dem Repository-Stamm anlegen:

```powershell
cargo run -p otakusoul-native -- --create-demo-profile ./output/native-ui-demo
cargo run -p otakusoul-native -- --check-profile ./output/native-ui-demo
cargo run -p otakusoul-native -- --profile ./output/native-ui-demo
```

Alternativ in Einstellungen den Pfad eintragen und „Profilkopie laden“ wählen. „Beispielprofil erstellen“
legt vier gebündelte Karten und zwei erfundene Verläufe an und lädt sie. Ein nichtleerer Ordner wird
nicht überschrieben. Ohne `OTAKUSOUL_HOME` ist der vorgeschlagene Ordner ein separater
`ProjectDirs(com, snowwhite, otakusoul-native)`-Datenordner mit Unterordner `preview-profile`;
die EXE funktioniert damit unabhängig vom aktuellen Arbeitsverzeichnis. Ein gesetztes `OTAKUSOUL_HOME`
wird nur als vorgeschlagener Eingabepfad übernommen; ohne `--profile`/Ladeklick kein Import.

Erwartete Kopiestruktur:

```text
<Profilkopie>/
  data/
    characters/     # JSON-Karten und/oder PNG mit chara/ccv3-Textchunk
    otakusoul.db    # optional, abgeschlossene SQLite-Kopie
```

Das aktuelle produktive Profil nicht auswählen. Eine eigene Kopie bei geschlossener Tauri-App
vorbereiten; ein nichtleeres `otakusoul.db-wal` wird abgewiesen. Der Import verwendet SQLite
`mode=ro&immutable=1`, erzeugt keine WAL-/SHM-Dateien und führt keine Migrationen aus. Diese
Unveränderlichkeitsannahme verlangt eine ruhende Kopie, keine parallel geöffnete Tauri-Instanz darauf.
Keine Zugangsdaten oder Einstellungen importieren. Dateiverweise außerhalb der Kopie werden abgewiesen.
Produktive Standardordner werden zusätzlich gegen versehentliche Auswahl geschützt; ein vom Benutzer
selbst als produktiv verwendeter Sonderpfad kann nicht automatisch als solcher erkannt werden.
Demo-Schema bildet nur die gelesenen Chatspalten ab und ist kein Profil für die produktive Tauri-App.

## Etappe 1 – Eigenständige Windows-Vorschau

- [x] Separater Git-Branch und Workspace-Paket; Standardziel bleibt Tauri.
- [x] Dunkles/helles Layout, Navigation und größenveränderliches Fenster (Minimum 850 × 600).
- [x] Charakterauswahl, statische Porträts, Charakterübersicht und Erscheinungsbild-Einstellung.
- [x] Lokale Testnachrichten, Entwürfe pro Figur, Leeren des aktuellen Testchats, Scrollbereich.
- [x] Windows-Build, Clippy und zwei Modelltests erfolgreich; laufendes Fenster teilweise interaktiv geprüft.
- [ ] Gemeinsames Nutzerfeedback zu Layout, Lesbarkeit und Navigation einarbeiten.

Abnahme: EXE startet ohne Tauri/WebView; Auswahl und Eingabe funktionieren; kein Profilzugriff.
Die einfache Textdarstellung ist vorübergehend. Keine KI-Antworten vortäuschen.

Prüfstand 08.11.2026: `cargo fmt --check`, Clippy mit `-D warnings`, zwei Zustandstests und
`cargo build --locked` erfolgreich. Windows-Fenster gestartet; Porträts, Umlaut-Eingabe, Enter zum
Hinzufügen, Wechsel zu Sota (getrennter leerer Verlauf), Einstellungen und Hell-/Dunkelwechsel beobachtet.
UI-Prüfung wurde anschließend per physischer Escape-Taste beendet. Charakterübersicht, Fenstergrößen,
Leeren und längere Verläufe noch nicht interaktiv abgenommen. Der Windows-Accessibility-Baum enthält
bislang nur den Fensterrahmen: Screenreader-Unterstützung ungeklärt, kein Barrierefreiheitsnachweis.
Lockfile-Vergleich: keine zuvor vorhandene Paketversion entfernt; GUI ergänzt zusätzliche Abhängigkeiten.

## Etappe 2 – Daten und Bedienung

- [x] Produktive Pfadauflösung in `crates/otakusoul-paths` extrahiert; Tauri re-exportiert die Funktionen.
- [x] Synthetisches Testprofil erstellen und ausdrücklich gewählte Profilkopie lesen; sichtbare Fehler.
- [x] JSON-/PNG-Karten und Chatlisten lesen; Karten-JSON inklusive unbekannter Felder erhalten.
- [x] Verläufe asynchron laden, Rollen und Reihenfolge erhalten; Archiv schreibgeschützt, separater Testchat.
- [x] Mehrzeilige Eingabe: Enter = neue Zeile, Strg+Enter = hinzufügen; Entwürfe pro Testchat.
- [x] Tab/Shift+Tab für Fokusnavigation, Kopierknöpfe für Nachrichten und vollständiges Karten-JSON.
- [ ] Anhänge, Swipes, Gedanken und Gruppensprecher gezielt darstellen; aktuell nur Rolle und Text.
- [ ] Freie Textauswahl in dargestellten Nachrichten und umfassende Tastatur-/IME-Abnahme.
- [ ] Markdown und lange Chats prüfen; Listenvirtualisierung/Begrenzung anhand Messungen entscheiden.

### Angleichung an Tauri – Stand 08.11.2026

- [x] Kopfzeile (56 px) mit vorhandenem Logo, Brand, Vorschauhinweis und Hell-/Dunkelumschalter.
- [x] Gruppierte Navigation „Spielen / Bibliothek / System“ in gleicher Reihenfolge und mit gleichen
  Lucide-Symbolen; Breiten 240 px bzw. eingeklappt 60 px. Aktiver Bereich violett hervorgehoben.
- [x] Obsidian-nahe Slate-Flächen, violette Akzente, passende Rahmen/Rundungen und Segoe UI unter Windows.
- [x] Chat-Werkzeugleiste (44 px), Charakterzeile, statische Porträtspalte und Nachrichten rechts.
- [x] Porträt ein-/ausblenden, Kompaktansicht, Gesprächsliste als linke Einblendung und Textsuche.
- [x] Nutzerblasen rechts mit Violett-/Indigoverlauf; Antworten links mit Slate-Hintergrund.
- [x] Rollenspiel-Handlungen wie in `RoleplayMessage.tsx` kursiv/violett, Rede warm hervorgehoben;
  Sternchen und Zeilenumbrüche bleiben sichtbar. Kartenvorschau der Begrüßung bleibt auch nach Testnachrichten.
- [x] Native Markdown-Blöcke (z. B. Listen, Überschriften, Code) ohne WebView; keine externen Bilder laden.
- [x] Charakterübersicht, Kartenansicht und Profileinstellungen verwenden dieselben Flächenstile.
- [x] Erste visuelle Abnahme am entsperrten Windows-Desktop bei 1027 × 799, hell/dunkel und mit ein-/ausgeklappter Navigation.
- [ ] Weitere Fenstergrößen einschließlich Minimum 900 × 680 und zusätzliche DPI-/Monitor-Konfigurationen prüfen.
- [ ] Feinschliff nach Vergleich mit laufender Tauri-App: Farben/Abstände, Textumbruch, Fokus und Scrollen.

Referenzen: `src/components/Header.tsx`, `Sidebar.tsx`, `navigation.ts`, `chat/ChatView.tsx`,
`chat/ChatComposer.tsx`, `chat/MessageList.tsx`, `chat/RoleplayMessage.tsx`, `src/App.css`.
Bildvorlage `docs/assets/screenshots/de/chat.png` zeigt Version 0.7.2; aktueller Quellcode hat Vorrang.

Navigationseinträge für noch nicht portierte Bereiche führen zu einem klar bezeichneten Hinweis;
sie sind kein Funktionsnachweis für Stage, Companion, Hub usw. Sprach- und Anhangsknöpfe sind deaktiviert.
Die Chat-Suche filtert nur die geladenen Nachrichten; noch keine globale Suche oder Treffer-Navigation.
Ein Markdown-Link zeigt beim Klick seine Adresse in der Statuszeile; kein automatisches Öffnen im Browser.
OOC-Badges, Vorlesen, Spezialtags, freie Nachrichtentextauswahl und animierte Avatare bleiben offen.

Technische Abnahme dieses Schritts: 21 GUI-Tests, Clippy mit `-D warnings`, Formatprüfung und
Windows-Build bestanden. Nach Entsperren durch den Nutzer wurde die Oberfläche visuell geprüft:
Obsidian/Hell, breite und eingeklappte Navigation, Rollenspieltext, Texteingabe und Strg+Enter mit
einer Markdown-Testnachricht. Die Begrüßung bleibt nach dem Hinzufügen sichtbar und Markdown-Nutzertext
bleibt auch im hellen Design auf der violetten Blase lesbar. Verglichen wurde mit den vorhandenen
Tauri-Quellen und dem Repository-Screenshot, nicht mit einer gleichzeitig laufenden Tauri-Instanz.

Dabei korrigiert: Porträtrahmen umschließt jetzt das unverzerrte Bild ohne interne Leerbalken und mit
runden Ecken; Scrollleisten verwenden schmale, dezente Slate-Schieber statt akzentfarbener Rails.
Der Nutzerblasenverlauf ist wie im Web-Frontend horizontal angelegt. Abschlussbuild mit korrigiertem
Porträtrahmen und Scrollleisten erneut angesehen. Weitere Detailangleichung bleibt möglich;
Pixelgleichheit und vollständige Funktionsgleichheit sind noch nicht nachgewiesen.

Abnahme: kopierte Daten lesbar, Originalprofil unverändert; langer Chat bleibt bedienbar.

Zwischenstand 08.11.2026: Das synthetische Profil liefert 4 Figuren, 2 Verläufe und 3 Nachrichten,
ohne Warnung. Profilimport, geladene Porträts, schreibgeschützter Verlauf, Wechsel in separaten
Testchat, mehrzeilige Umlaut-Eingabe und Strg+Enter im Windows-Fenster beobachtet. Kein persönliches
Profil eingelesen. Karten-Detailansicht vorhanden. Die letzten 200 Nachrichten eines Verlaufs werden
geladen, bei größeren Chats mit sichtbarem Hinweis; noch kein Nachladen älterer Nachrichten.
Read-only-, Reihenfolge-, Format-, Fehler-, Pfad- und veraltete asynchrone Ergebnisfälle sind getestet.
Windows-Symlinktest läuft nur mit vorhandener Berechtigung, sonst wird dieser Teil übersprungen.
Abschlussprüfung: 17 Tests im GUI-Paket und 1 Pfadtest erfolgreich; Clippy mit `-D warnings`,
Formatprüfung und Windows-Build erfolgreich. Das vorhandene Tauri-Backend wurde nach der
Pfadextraktion mit `cargo check -p otakusoul --lib --offline` erfolgreich geprüft. Im Abschlussbuild
auch CLI-Start mit Profilkopie und der Umbruch langer Charakterbeschreibungen visuell geprüft.
Ein zusätzlicher `cargo fmt --all --check` scheitert an bereits vorhandener Formatierung der
Vendorkopien `src-tauri/vendor/pdf-extract` und `src-tauri/vendor/kokoro-en`; diese wurden nicht verändert.
Die Formatabnahme erfolgt gezielt für die App-Pakete und die neue Pfad-Crate.

## Etappe 3 – Ein echter Chat

- [x] Gemeinsamen SSE-/Think-Decoder in `crates/otakusoul-stream` extrahieren und in Tauri wiederverwenden.
- [x] Native Einstellungen: expliziter Verbindungstest mit Endpunkt, optionalem Modell/API-Schlüssel
  und Formatwahl (OpenAI-kompatibel oder Anthropic), Rückmeldung und Abbruch.
- [x] Makros und Prompt-Renderer ohne Tauri herauslösen; beide Oberflächen nutzen dieselben Crates.
- [x] Native Prompt-Vorschau: Persona-Name, eingebaute Vorlage, Autorennotiz, Antwortlänge,
  auswählbarer/kopierbarer System-Prompt und Nachspann.
- [x] Expliziter Modellaufruf im nativen Testchat mit Chatkontext, Abbruch und vollständiger Antwort im RAM.

- [ ] Chat-Vorbereitung und Inferenz aus Tauri lösen; Referenzen:
  `src-tauri/src/commands/chat.rs`, `modules/inference.rs`, `state.rs`,
  `src/store/slices/chatSlice.ts` und `src/store/helpers.ts`.
- [ ] Prompt-/Lore-Aufbereitung, Providerwahl und Kontextberechnung vollständig erfassen. Relevante
  TypeScript-Fachlogik in gemeinsame Rust-Services portieren, statt einen reduzierten zweiten Chat zu bauen.
- [ ] Typisierte Streaming-Ereignisse inkl. Generierungs-ID, Fehlern, Abbruch und Ende definieren.
- [ ] Anbieter/Modell auswählen, vorhandene Secret-Verwaltung nutzen; keine Schlüssel in Logs/Commits.
- [ ] Streaming anzeigen, Abbruch und Teilantworten; konsistente Persistenz im isolierten Profil.
- [ ] Tauri-Adapter auf denselben Service umstellen und betroffene bestehende Szenarien prüfen.

Abnahme: echter Chat, Verlauf nach Neustart, sauberer Abbruch und verständliche Verbindungsfehler.
An diesem Punkt gemeinsam entscheiden, ob die Migration fortgesetzt wird.

### Zwischenstand: gemeinsame Streams und Verbindungsdiagnose

Der Verbindungstest sendet ausschließlich den festen Text `Reply with the word OK.` mit maximal
32 Ausgabetokens. Keine Charakterkarten, Chatverläufe, Einstellungen oder Secrets aus einem Profil
werden geladen/übertragen. Ein eingetragener Schlüssel bleibt nur im Arbeitsspeicher, ist im Eingabefeld
maskiert und in Debug-Darstellung redigiert. Kein automatischer Test beim Start, kein automatisches
Starten/Herunterladen von Modellservern. Der Standardendpunkt ist der bisherige lokale
`http://127.0.0.1:48596/v1/chat/completions`; ein Server muss bereits laufen.

Für Anthropic muss der passende `/v1/messages`-Endpunkt samt Modellnamen manuell eingetragen werden.
Die Formatwahl ändert die Adresse nicht automatisch. Die Diagnose erfasst Textsegmente, keine Tokenzahlen.
Antworten werden nach dem Test angezeigt, noch nicht laufend als Chatnachricht dargestellt.

Technik: HTTP-Verbindungsaufbau maximal 5 s, Anfrage insgesamt maximal 30 s; Watch-Abbruch vor Headern
und beim Warten auf weitere Body-Daten. Die laufende Diagnose sperrt ihre Eingabefelder; alte Ergebnis-IDs
können keinen neueren Test überschreiben. Schließen der App bricht eine laufende Diagnose ab.
Keine Redirects (auch kein Weiterreichen von `x-api-key`), keine rohen Serverfehlertexte mit möglichen
Zugangsdaten. Ohne Abschlussmarker gilt die native Diagnose als unvollständig. Grenzen: maximal 1 MiB
empfangene Daten und 16 KiB sichtbarer Antworttext. Das bestehende Tauri-Fehler-/Request-/Toolverhalten
bleibt im bisherigen Adapter; hier wird nur die gemeinsame Dekodierung benutzt.

Prüfstand 08.11.2026: 29 GUI-Tests, 6 Stream-Core-Tests, 10 bestehende/ergänzte Inferenztests und
5 Providertests erfolgreich (50 gesamt). Clippy für GUI/Core und Backend-Library, Formatprüfung und
Windows-Build erfolgreich. Lokale HTTP-Tests benötigen hier Ausführung außerhalb der Netzwerk-Sandbox,
weil dort Loopback-Verbindungen blockiert sind. Im Windows-Fenster wurde mit `e2e/mock-llm.mjs` eine
erfolgreiche Antwort mit 10 Textsegmenten beobachtet. Der Mock-Server wurde anschließend beendet.
Kein echtes Modell oder Cloud-Anbieter wurde aufgerufen. Kein vollständiger E2E-Lauf.

### Modellantwort im nativen Testchat

„An Modell senden“ überträgt den vorbereiteten Charakter-Prompt und Testverlauf an den Endpunkt unter
Einstellungen. Der Verlauf beginnt mit der gewählten Begrüßung, gefolgt von den bisherigen Nachrichten
und der neuen Eingabe. Lore-Regeln werden mit den letzten fünf Nachrichten einschließlich der neuen
Eingabe und Spannung 0 ausgewertet. Die Auswahl verwendet geladene globale und an die Karte gebundene
Bücher. Strg+Enter und das bisherige Symbol fügen weiterhin lokal eine Testnachricht hinzu.

Der Transport nutzt den gemeinsamen SSE-Decoder. Der native OpenAI-kompatible Request folgt der
LocalLlama-/Custom-Normalisierung aus Tauri und hängt den Nachspann an den letzten User-Turn.
Anthropic erhält die Systemteile gemeinsam und den Verlauf in alternierenden Turns.
Der Prototyp fordert bis zu 1024 Ausgabetokens an und wartet höchstens 120 Sekunden.
Er zeigt die Antwort nach Abschluss und übernimmt dann Eingabe und Antwort gemeinsam. Abbruch, Fehler
und Chatwechsel erhalten den Entwurf. Die Generierungs-ID verwirft verspätete Ergebnisse. Archive
bleiben lesbar, und die App sendet nur aus dem lokalen Testchat.

Der nächste Schritt ist eine laufende Antwortanzeige mit typisierten Delta-Ereignissen. Für die
gemeinsame Vorbereitung sind Kontextbudget und Gedächtnis aus `src/store/helpers.ts` und
`src/store/slices/chatSlice.ts` zu berücksichtigen. Tauri-Adapter und isolierte Persistenz bleiben
eigene Etappenziele. Übersetzungen folgen nach den GUI-Funktionen.

Prüfstand 09.11.2026: 124 native Tests und 27 Tests der Lore-, Prompt- und Stream-Crates. Die
Tests decken beide Request-Formate, den HTTP-Aufruf gegen einen Loopback-Testserver, die Lore-Auswahl
und das Verhalten bei Fehler, Chatwechsel und Abschluss ab.

### Zwischenstand: gemeinsamer Prompt-Renderer und native Vorschau

`crates/otakusoul-macros` enthält die bisherige Makroauflösung (Zeit/Zufall über explizite Testeingaben
prüfbar). `crates/otakusoul-prompt` enthält die Prompt-Datentypen, Vorlagen, Regeln und den Renderer.
Keine GUI-, Datenbank- oder Profilabhängigkeit: Sprache, Makros und Bildverfügbarkeit kommen über
`Services`. Die bisherigen Tauri-Module bleiben typisierte Adapter; IPC-Form und TypeScript-Typen
bleiben erhalten. `npm run types:gen` berücksichtigt jetzt auch die beiden neuen Crates.

Die native Ansicht „Prompt“ ist über die Chat-Kopfleiste erreichbar. Sie verwendet die aktuelle Karte
und die gemeinsamen Vorlagen Rollenspiel/Erzähler/Alltagsgespräch. Deutsch ist bis zur abschließenden
Übersetzung fest eingestellt; die vorhandene Kartenlokalisierung wird im gemeinsamen Kern angewendet.
System-Prompt und Nachspann sind schreibgeschützt, auswählbar und separat kopierbar. Einstellungen
bleiben nur im RAM. Begrüßungsmakros werden pro Testchat und Persona zwischengespeichert, damit Zeit-
und Zufallswerte beim Schreiben oder Chatwechsel nicht ungewollt neu ausgewürfelt werden.

Das gemeinsame **Rendern vorbereiteter Eingaben** ist umgesetzt. Die Lore-Auswahl für die Vorschau
steht im Abschnitt zur gemeinsamen Lorebook-Auswertung. Für echte Chats liegen die Vorbereitung
und die Auswahl von Gedächtnis, Persona-Daten und Verlauf weiterhin in
`src/store/helpers.ts` und `src/store/slices/chatSlice.ts`. Die Vorschau arbeitet lokal im RAM.

Vor der Extraktion wurden zwei deterministische Referenz-Prompts mit dem bisherigen Tauri-Renderer
gesichert (`crates/otakusoul-prompt/tests/fixtures/rich-de.txt`, `rich-en.txt`). Die Backendtests
vergleichen Systemtext und Nachspann bytegenau dagegen. Fixtures nicht zur Anpassung an eine
Regression neu erzeugen; LF ist für sie in `.gitattributes` festgelegt. Weitere Tests decken die
Lokalisierungs-Fallbacks und die asymmetrische Behandlung von Karten-Nachspann/Systemtext ab.

Prüfstand 08.11.2026: 33 GUI-, 6 Makro-, 11 Prompt-Core- und 24 gezielte Backendtests bestanden
(74 einschließlich der Exporttests dieser Pakete); beide Referenz-Prompts stimmen bytegenau überein.
Typgenerierung, TypeScript-Prüfung und drei Command-Abgleichstests erfolgreich. Clippy für GUI,
gemeinsame Crates und Backend-Library, gezielte Formatprüfung und Windows-Build erfolgreich.
Ein unabhängiges Agentenreview fand einen Fallback-Randfall bei ungültigen übersetzten Listen;
er ist korrigiert und durch einen Regressionstest abgesichert. Die Chatansicht des neuen Builds
wurde im Windows-Fenster gesehen. Sichtprüfung/Bedienabnahme der neuen Prompt-Ansicht bleibt offen:
Fensteraktivierung wurde durch parallele Benutzereingaben unterbrochen; keine weitere UI-Steuerung.
Kein vollständiger E2E-Lauf, kein echtes Modell und kein Cloud-Anbieter aufgerufen.

## Spätere Ausbaustufen

### GUI-Zwischenschritt: Charakterbibliothek und Kartenentwurf

- [x] Bibliothekssuche über Name, Beschreibung, Persönlichkeit und Tags mit Trefferzahl/Leerzustand.
- [x] Neu, Bearbeiten, Duplizieren mit eigenständigen IDs/eindeutigen Kopienamen und lokaler Chatzuordnung.
- [x] Karteneditor für Name, Beschreibung, Persönlichkeit, Szenario, Hauptbegrüßung, Beispieldialoge,
  System-Prompt und Nachspann. Mehrzeilige Felder, Übernehmen/Verwerfen, JSON des Entwurfs kopieren.
- [x] Entwurf bleibt bei Navigation erhalten; anderer Editorauftrag setzt ihn fort. Profilwechsel bleibt
  bis Übernehmen/Verwerfen gesperrt. Bei laufendem Profilimport keinen neuen Kartenentwurf beginnen.
- [x] Weitere Metadatenfelder: Titel, Tags (eine Zeile je Tag) und Erstellernotizen.
- [x] Alternative Begrüßungen hinzufügen/bearbeiten/entfernen, JSON-Vorschau des aktuellen Entwurfs.
- [x] Begrüßungsvarianten in leeren lokalen Testchats auswählen; Detailansicht mit weiteren Kartentexten.
- [x] Kartenraster und Tagfilter nach Vorbild des Tauri-Frontends.
- [x] Ausdrucksbilder-Reiter mit 15 Plätzen, Offlinevorschau, Auswahl/Entfernen und Hauptporträtübernahme.
- [x] Lorebook-Bindungen im Charaktereditor und lesender Katalog mit Eintragssuche.
- [x] Lorebook-Basiseditor mit Eintragsverwaltung und atomarem JSON-Export.
- [x] Erweiterte Lorebook-Regelmetadaten mit Eingabevalidierung.
- [x] Gemeinsamer Lorebook-Parser und Regelauswertung in der nativen Prompt-Vorschau.
- [ ] Weitere Editorbereiche: Auflösung fremder relativer Bildverweise; weitere Gesamt-GUI-Bereiche gemäß Folgeetappen.
- [x] Expliziter JSON-/PNG-Dateiimport/-export über native Öffnen-/Speichern-Dialoge.
- [ ] Dauerhafte Integration von Kartenänderungen in ein eigenes isoliertes Schreibprofil.

`src/character_draft.rs` ist reine Kartenlogik ohne GUI/Dateizugriff. Bestehende V2-/flache Form,
unbekannte Metadaten, Lorebook und Bild bleiben erhalten. Nur bearbeitete Textfelder werden ersetzt;
deren vorhandene Kartenübersetzungen werden im Entwurf entfernt, damit alte Übersetzungen Änderungen
nicht in der Prompt-Vorschau verdecken. Die Oberfläche weist darauf hin. Unveränderte Übersetzungen
bleiben erhalten. Die Formulare sind noch keine vollständige Portierung des Tauri-Karteneditors.

Übernehmen aktualisiert nur RAM, Porträtdarstellung und Begrüßungs-/Promptcache; Neustart verliert diese
Änderungen, sofern sie nicht ausdrücklich als Datei exportiert wurden. JSON kopieren bleibt eine
Zwischenablageaktion; „Als JSON/PNG speichern“ exportiert den aktuellen Entwurf auch ohne Übernehmen.
Importierte Archivnachrichten bleiben unverändert. Ein Kartenentwurf hat seinen eigenen Zielindex;
Chatnavigation kann ihn nicht auf einen anderen Charakter umlenken. Bei Duplikaten Quellkarte separat
behalten, um unbekannte Metadaten und Porträt zu übernehmen. Tauri importiert Karten nach Namen,
die native Profilprojektion nach Dateistamm; zusätzliche erfundene Karten-ID-Felder schützen nicht.

Prüfstand: 40 Native-Tests erfolgreich, darunter sieben neue Karten-/Bedienlogiktests für Metadatenerhalt,
Namensvalidierung, Übersetzungsbereinigung, unabhängige Duplikate, Zielbindung, Schutz offener Entwürfe
und Laden eines Archivchats über die Kartenansicht. Letzterer Ladeweg wurde im Agentenreview korrigiert.
Gezieltes Clippy, Formatprüfung und Windows-Build erfolgreich. Neuer Build bis zur Chatansicht gestartet;
Bedienabnahme der Bibliothek/des Editors bleibt offen, da parallele Benutzereingaben die Fenstersteuerung
erneut unterbrochen haben. Keine weiteren Eingaben in den Desktop versucht; keine Profiländerungen.

### GUI-Zwischenschritt: Metadaten und Karten-Dateifluss

`src/card_files.rs` kodiert JSON/PNG außerhalb des UI-Threads; `rfd` 0.18 stellt native asynchrone
Dateidialoge bereit. Laufende Karten-I/O sperrt weitere Dialogaufträge, Profilwechsel und neue
Editoraufträge. Import bei offenem Entwurf verlangt zuerst Übernehmen/Verwerfen. Wiederholter Import
legt stets einen neuen RAM-Charakter mit eigenständiger ID und Testchat an, ersetzt also keine Karte.
Einzeldateien verwenden dieselbe JSON-/PNG-Validierung und Grenzen wie die Profilprojektion;
PNG chara/ccv3 und vollständige unbekannte Kartenfelder bleiben beim Import erhalten.

Export ist eine Momentaufnahme: im Editor der aktuelle Entwurf, auf der Kartenseite die übernommene
Karte. JSON enthält kein Bild, PNG enthält aktuelle Kartenmetadaten und Bildpixel. PNG wird neu kodiert,
alte Metadatenchunks werden nicht mitkopiert. JSON maximal 4 MiB, PNG-Metadaten Base64 maximal 4 MiB,
Bild maximal 4096 × 4096 Pixel/64 MiB Decoderbudget, Ausgabedatei maximal 32 MiB. Dateiendung wird
geprüft. Erst vollständig kodieren, dann temporär im Zielordner schreiben/synchronisieren und atomar
ersetzen; bestehende Exporte dürfen nach Speicherdialogbestätigung ersetzt werden. Produktives Profil
und geladene Profilkopie bleiben geschützte Exportziele, auch über aufgelöste Pfadverweise.

Titel verwendet `extensions.custom_title`, synchronisiert ein vorhandenes `sow_title` und bewahrt
fremde Erweiterungen. Ungültige Erweiterungsobjekte werden bei Titeländerung nicht still ersetzt.
Tags werden als Array gespeichert, Erstellernotizen als `creator_notes`. Unveränderte fehlende Felder
werden nicht unnötig ergänzt. Quellen der Dialog-API: https://docs.rs/rfd/0.18.0/rfd/ .

Prüfstand 08.11.2026: 49 Native-Tests erfolgreich. Neu: Metadaten-/Alias-Erhalt, JSON- und PNG-Roundtrip
(vollständige Kartenfelder und Bildpixel), atomarer Fehlerfall mit unveränderter Zieldatei, geschütztes
Exportziel, Metadatengrenze, konkurrierende GUI-Aufträge und wiederholter Einzelimport ohne Ersetzen.
Clippy mit Warnungen als Fehler, Formatprüfung und Windows-Build erfolgreich. Review korrigierte eine
zu strenge Elternordnerprüfung beim Einzelimport. Eine fehlende Dateiendung wird nicht nachträglich
angehängt, damit genau das im Speicherdialog bestätigte Ziel benutzt wird.

Praktisch unter Windows bei 1027 × 799 Fensterpixeln gesehen: Bibliothek mit Aktionen, Duplizieren
im Editor, sichtbare Übernehmen-/Exportknöpfe und die gemeinsame Prompt-Vorschau. JSON-Speicherdialog
ausgefüllt und Export erfolgreich zurückgemeldet; synthetische Karte unter
`output/native-gui-filecheck-20261108/shiori-copy.json` (gitignored) enthält den Kopienamen.
PNG-Speicherdialog geöffnet; Nutzer hat den PNG-Export anschließend selbst erfolgreich abgeschlossen
und die Datei abgelegt (08.11.2026 bestätigt). Wiederimport per GUI bleibt offen; automatisierte
Roundtrip-Tests decken ihn ab. Testinstanz nach dem Durchlauf beendet. Keine privaten Karten/Chats
benutzt, keine Profiländerung und kein Modellaufruf. Keine vollständige GUI-Abnahme.
Die tatsächlich abgelegte `output/native-gui-filecheck-20261108/charakter.png` wurde zusätzlich
gelesen: 975.053 Bytes, eingebettete vollständige Kartenmetadaten identisch zum JSON-Export.

### GUI-Zwischenschritt: Begrüßungsvarianten und JSON-Ansicht

Editorreiter Kartentexte/Begrüßungen/JSON teilen denselben Entwurf. Im Begrüßungsreiter ist die
Hauptbegrüßung separat wählbar; Alternativen lassen sich hinzufügen, mehrzeilig bearbeiten und entfernen.
Leere Alternativen bleiben im Kartenformat erhalten. Unveränderte fehlende/null/fehlerhafte Listen
bleiben unangetastet; eine explizite Bearbeitung einer fehlerhaften Liste wird abgewiesen. Nur bei
Listenänderung werden alte Übersetzungen von `alternate_greetings` im Entwurf entfernt. JSON ist eine
auswählbare, kopierbare Vorschau des angewendeten Entwurfs und vollständig schreibgeschützt. Leerer
Pflichtname zeigt statt irreführendem JSON eine Fehlermeldung. Kein Roh-JSON-Import über diesen Reiter.

`Conversation.greeting_index` ist ein Originalindex (0 Haupttext, 1..N Alternativen). Alle Varianten
werden gemeinsam über `otakusoul_macros::expand_all` expandiert und pro Persona/Chat im RAM gehalten.
Auswahl verwendet nur nichtleere **expandierte** Texte; auch `{{noop}}` kann daher keine scheinbar
auswählbare leere Begrüßung erzeugen. Wechsel A → B → A würfelt Zufalls-/Zeitmakros nicht neu.
Der Handler erlaubt Auswahl ausschließlich bei leeren lokalen Chats und bewahrt den Composer-Entwurf.
Nach der ersten Nachricht bleibt der aktuelle Begrüßungstext als Snapshot erhalten, auch bei Persona-
oder Kartenänderungen. Kartenänderungen setzen nur leere lokale Begrüßungscaches zurück; Testchat leeren
setzt Auswahl/Cache vollständig zurück. Archive erhalten ausschließlich gespeicherte Nachrichten.

Kartendetails zeigen jetzt zusätzlich Titel, Tags, Persönlichkeit, Szenario, Beispieldialoge,
Prompt/Nachspann, Erstellernotizen und alternative Begrüßungen. Kartenfelder in diesem Bereich sind
bewusst die unveränderten Basistexte einschließlich Makros. Native Begrüßungen lokalisieren noch nicht
die komplette Karte wie Tauri `greetingsFor`; die gemeinsame Promptprojektion enthält diese Felder
nicht. Vollständige Inhaltslokalisierung und native GUI-Übersetzungen bleiben getrennte Folgeaufgaben.

Prüfstand: 57 Native-Tests erfolgreich, einschließlich acht neuer Tests für Listenbearbeitung,
fehlerhafte Karten, mehrzeilige Makros, Editorwechsel/JSON-Schreibschutz, leere Varianten,
Cache-/Snapshot-Verhalten und Archivschutz. Bestehende JSON-/PNG-Roundtrip-Fixtures enthalten jetzt
ebenfalls alternative Begrüßungen. Clippy und gezielte Formatprüfung erfolgreich. Agentenreview
führte zur Filterung expandierter statt roher Texte; kein vollständiger E2E-Lauf oder Modellaufruf.
Windows-Build erfolgreich. Im Windows-Fenster (1027 × 799) Haupt-/Alternativauswahl geöffnet und
„Alternative 1“ gewählt: richtiger expandierter Text im Chat sichtbar. Danach Bibliothek → Bearbeiten,
Reiter Kartentexte/Begrüßungen/JSON durchgeklickt; Hauptbegrüßung und vollständiges JSON mit Alternativen
sichtbar, Export-/Übernehmenknöpfe erreichbar. Kein Speichern und kein produktiver Profilzugriff.
Neue Instanz bleibt auf der JSON-Vorschau einer gebündelten Karte geöffnet. Hinzufügen/Entfernen und
Schreibschutz sind automatisiert geprüft; keine vollständige Tastatur-/DPI-/Screenreaderabnahme.

### GUI-Zwischenschritt: Porträtraster und kombinierte Filter

Die Bibliothek ersetzt die Zeilenliste durch Porträtkarten nach `CharacterLibraryView.tsx`: Bild im
4:5-Ausschnitt, aktive Figur markiert, Name/Titel über dem Bild, Bearbeiten/Duplizieren/PNG-Export,
anklickbares Porträt für Kartendetails, kurze Beschreibung, bis zu drei Tagchips und Chatknopf.
Iced `responsive` (Feature `lazy`) misst die verfügbare Breite; `src/library.rs` bestimmt 1–5 Spalten
an den Tauri-Schwellen 640/768/1024/1280. Originalindizes bleiben beim Filtern erhalten, damit Aktionen
auch nach Suche/Tagwahl die richtige Karte öffnen. Noch keine Virtualisierung großer Bibliotheken.

Textsuche prüft Name, Beschreibung, Persönlichkeit und Tags; der einzelne Tagfilter wird zusätzlich
exakt angewendet. Tags werden zur Darstellung getrimmt, Leerwerte/fehlerhafte Typen ignoriert und
doppelte Werte entfernt, ohne Kartendaten zu verändern. Alle Tags sind über die horizontal scrollbare
Filterleiste erreichbar; Kartenchips wählen denselben Filter. Titel-Fallback: custom_title, sow_title,
erster Tag, „Charakter“. Trefferzahl und Leerzustand mit Zurücksetzen sind vorhanden. Zurücksetzen
behält Chat und Editorentwurf. Nach erfolgreichem Import, Kartenübernahme oder Profilwechsel werden
beide Filter gelöscht, damit neue/geänderte Karten nicht unbemerkt verborgen bleiben.

Prüfstand: 63 Native-Tests erfolgreich; sechs neue Tests für kombinierte Filter, Tagprojektion,
Titel-Fallbacks/fehlerhafte Metadaten, Breakpoints sowie Schutz des Entwurfs beim Zurücksetzen und
Sichtbarkeit nach geänderten Tags. Clippy und Formatprüfung erfolgreich; Agentenreview ohne konkrete
Befunde. Desktop-/Fensterprüfung erst nach ausdrücklicher Freigabe des Nutzers.
Nach ausdrücklicher Freigabe Windows-Build erstellt und praktisch geprüft (1027 × 799): zwei
Spalten mit voller Navigation, drei nach Einklappen; Tag „Buchwurm“ zeigt nur Shiori, „Gamer“ nur
Sota. Porträtklick aus gefiltertem Raster öffnet Sotas Details, Zurücksetzen stellt alle vier Karten
wieder her. Scrollen und Chatknopf öffnen die richtige Figur. Danach Bibliothek offen gelassen und
Desktopkontrolle ausdrücklich zurückgegeben. Keine privaten Daten/Profiländerungen/Modellaufrufe.
Textsuche und Kombination mit Tags sind automatisiert abgedeckt; keine komplette DPI-/Tastaturabnahme.

### GUI-Zwischenschritt: Ausdrucksbilder und Hauptporträt

Der Editor hat einen Reiter „Ausdrucksbilder“ mit denselben 15 Slots wie Tauri: sechs Grundstimmungen,
fünf weitere Ausdrücke und vier Romance-Slots. Slotwahl zeigt Gruppenname, Belegungszahl, Referenzstatus
und Bild. Neutral ohne nichtleeren Verweis zeigt das Hauptporträt. PNG-/WebP-Dateiauswahl bettet das
komprimierte Original als Data-URL ein; Zuordnung entfernen erzeugt bei Bedarf eine leere kanonische
`expressions`-Map, damit Legacy-Bilder nicht wieder erscheinen. Fremde Slots/Metadaten bleiben erhalten.
Präzedenz folgt `getPortraitExpressions`: expressions ?? custom_expressions, dann Objekt-Fallback
sow_expressions. Unveränderte fehlerhafte Erweiterungen bleiben erhalten, Änderungen daran melden Fehler.

`src/expressions.rs` enthält Slotprojektion, Bildprüfung und 44 eingebettete WebP-Dateien für die vier
mitgelieferten Karten (je elf Plätze). Vorschau lädt ausschließlich diese exakten Presetverweise oder
eingebettete PNG-/WebP-Daten, niemals HTTP/Blob/CWD/fremde lokale Dateien. Unaufgelöste Verweise bleiben
Kartendaten; fehlende Herkunft fremder relativer Pfade wird nicht erraten. Nur die explizite Dateiauswahl
liest neue Bilder. Prüfung läuft im Hintergrund: 1 MiB komprimiert, 4096 × 4096 Pixel, 64 MiB Decoderbudget.
Vorschau-IDs und Entwurfs-ID verhindern, dass alte Ergebnisse den gewählten Platz/neuen Entwurf ändern.

Ein verfügbares Bild lässt sich als Hauptporträt in den RAM-Entwurf übernehmen; bei neuen Karten ist
damit PNG-Export möglich. PNG-Export dekodiert nun auch ein WebP-Hauptporträt und bewahrt seine Pixel.
JSON enthält kein separates Hauptporträt. Bilder bleiben bis Übernehmen im Entwurf; Schließen/Neustart
verliert unexportierte Änderungen. Keine automatische Mimik im Chat und keine Avataranimation in dieser Etappe.

Dateiexport wandelt bekannte Presetverweise in allen drei Ausdrucksmaps in portable WebP-Data-URLs um,
bewahrt unbekannte Verweise/Werte und prüft danach die bisherigen Metadatengrenzen. Alle vier gebündelten
Karten passen mit ihren elf Bildern als JSON und PNG hinein. Bildzuweisung prüft das resultierende PNG-
Metadatenbudget vor Übernahme; bei Überschreitung bleibt die alte Zuordnung erhalten. Entfernen bleibt
auch bei zuvor übergroßen Karten möglich. Kleine WebP-Bilder benötigen weniger Platz. JSON-Vorschau und
JSON-Kopieren zeigen die logischen Kartenreferenzen; der Dateiexport bettet die bekannten Assets ein.
Der PNG-Metadatenleser erhält 16 MiB internes Pufferbudget, um mehrfach gehaltene Textchunks zu lesen;
Dateigrenze 32 MiB und Textchunkgrenze 4 MiB bleiben unverändert. Dies ist keine Erweiterung des Kartenformats.

Prüfstand 08.11.2026: 79 Native-Tests erfolgreich. Neu sind Legacy-/Metadatenerhalt, Hauptporträt-Override,
PNG-/WebP-Datenprüfung und Offline-Presetvorschau, Vorschau-/Entwurfsschutz, Kartenbudget, neutraler
Fallback sowie portable JSON-/PNG-Roundtrips aller vier gebündelten Karten und Pixelvergleich beim
WebP-Hauptporträt. Clippy und Formatprüfung erfolgreich. Review korrigierte fehlende Einbettung bekannter
Presetbilder und den leeren Neutral-Verweis; Roundtrip-Test deckte das interne PNG-Lesebudget auf.
Keine echten Modelle oder Netzbilder verwendet; Windows-Build/Sichtprüfung nach Desktopfreigabe.
Desktopfreigabe für diesen Durchlauf angefragt, noch nicht erteilt. Die laufende Vorschau bleibt
unangetastet; die normale Windows-EXE wurde in diesem Schritt noch nicht neu gebaut. Native Test-EXE
und alle Ansichten wurden kompiliert/geprüft. Nach Freigabe: eigene Instanz schließen, Windows-Build,
Editor → Ausdrucksbilder → neutral/fröhlich/fehlenden Slot prüfen; danach Kontrolle explizit zurückgeben.

### GUI-Zwischenschritt: Lorebook-Katalog und Kartenbindungen

Der Lorebooks-Navigationseintrag öffnet jetzt einen lesenden RAM-Katalog statt eines Platzhalters.
JSON-Dateien werden ausdrücklich über einen Öffnendialog gewählt; keine automatische Suche im
produktiven Profil. `src/lore_catalog.rs` ist nur eine Anzeigeprojektion: OtakuSoul-Eintragsarrays
und SillyTavern-Eintragsobjekte, Name/Beschreibung/Text und Aktivierungsanzeige aus der Datei. Keine
Triggernormalisierung, kein Legacyupgrade und keine Kontextevaluation duplizieren. Unbekannte Felder
und das komplette JSON bleiben erhalten und lassen sich kopieren. Gemeinsame Parser-/Evaluations-
Extraktion aus `modules/lorebook.rs` ist die Voraussetzung für echte native Loreaktivierung.

Grenzen: JSON 4 MiB, maximal 10.000 Einträge, bis 200 gefilterte Treffer gleichzeitig dargestellt.
Suche prüft Eintragsnamen und Inhalt; Rohdaten bleiben vollständig. Explizites Dateilesen benutzt die
bestehenden kanonischen Pfad-/Produktivschutzprüfungen. Fehlende Datei-ID fällt wie Tauri auf den
Dateistamm zurück; Laden gleicher Referenz/Quelle ersetzt kein bestehendes RAM-Buch. Der Katalog
bleibt unabhängig vom ausgewählten Charakter/Profil und geht beim Neustart verloren. Keine Datei-
oder Datenbankschreibzugriffe und keine Normalisierung des importierten Originals.

Editorreiter „Lorebooks“: Checkboxen für geladene Bücher, Anzeige/Entfernen bestehender ungelöster
Referenzen und Eingabe einer bekannten ID/eines Namens. Laden/Ansehen bindet nichts automatisch.
Abwählen entfernt alle passenden ID-/Namens-/Pfadaliase (trim/casefold wie `lorebookUsage.ts`), bewahrt
fremde Referenzen. Entwurf bleibt beim Wechsel zum Katalog/Chat erhalten. Übernehmen schreibt
`extensions.bound_lorebooks` und `selected_lorebook` konsistent; leere Bindungen entfernen den Legacy-
Schlüssel. Keine DB-Bindungen erfinden. Unveränderte fehlerhafte Metadaten bleiben erhalten;
Änderungen an fehlerhaften Erweiterungsobjekten werden abgewiesen.

Eingebettetes `character_book` / `extensions.character_book` / `embedded_lorebook` wird separat als
vorhanden angezeigt und kann als unverändertes JSON kopiert werden. Kein automatisches Herausschreiben,
Importieren oder Binden eingebetteter Bücher. Externe Bindungen betten die Lorebooks nicht in die
Charakterkarte ein. Die Oberfläche kennzeichnet, dass die native Promptvorschau sie noch nicht nutzt.

Prüfstand: 89 Native-Tests erfolgreich, darunter zehn neue Tests zu Array-/Objektprojektion,
Dateistamm-Fallback, unverändertem Dateilesen, Grenzen, Aliasentfernung, Entwurfsziel und Legacy-
Synchronisierung; bestehende JSON-/PNG-Karten-Roundtrip-Fixtures enthalten nun Lorebook-Bindungen
und ein eingebettetes Buch. Clippy und gezielte Formatprüfung bestanden. Agentenreview korrigierte
die fehlende Datei-ID. Keine Desktopsteuerung und kein Stoppen/Neustarten der laufenden Vorschau;
neue normale Windows-EXE und Sichtabnahme bleiben wie gewünscht für später offen.

### GUI-Zwischenschritt: Lorebook-Editor und gemeinsamer atomarer Export

Katalog/Detailansicht bieten Neu/Bearbeiten/JSON speichern. `src/lore_draft.rs` verwaltet einen eigenen
RAM-Entwurf unabhängig vom Charakterentwurf: Name/Beschreibung, Einträge hinzufügen/entfernen,
Eintragsname, Inhalt, Schlüsselwörter, zusätzliche Schlüssel, Ausschlusswörter, RegEx-Zeilen sowie
ein-/ausgeschaltet und „Immer aufnehmen“. Erweiterte Prioritäts-/Zustands-/Kettenregeln sind noch
nicht als Formulare portiert; vorhandene Werte bleiben erhalten. Keine Triggerauswertung im Editor.

OtakuSoul-Arrays und SillyTavern-Objekte behalten ihre Form, vorhandene Objektkeys, UIDs und unbekannte
Felder. Neue Einträge bekommen kollisionsfreie UIDs/Objektkeys. Bearbeitete Aliasfelder werden konsistent
gesetzt; bloße Cursor-/Auswahlaktionen dürfen nichts normalisieren. Schlüssel sind zeilenweise Strings,
Regex-Zeilen behalten relevante Leerzeichen. Der Auswahlaufbau für Objekteinträge läuft linear.
Dateistamm-Fallback-ID und projizierter Name werden im Export festgeschrieben; anderes Ziel/Dateiname
ändert damit die Buchidentität nicht. Reine Namens-/Pfadbindungen nach Umbenennen bleiben vom Nutzer
zu prüfen; es gibt keine automatische Massenänderung bereits gespeicherter Charakterkarten.

Navigation zu anderen Ansichten oder ein weiterer Editorauftrag bewahrt den offenen Lorebookentwurf.
Übernehmen ändert nur den Katalog im RAM, Verwerfen lässt ihn unverändert. Doppelte IDs werden beim
Übernehmen abgefangen, auch wenn inzwischen ein gleichnamiger Import hinzukam. Charakterbindungen
bleiben unabhängig. Export ist eine Momentaufnahme des aktuellen Entwurfs oder Katalogbuchs und kann
auch vor Übernehmen erfolgen. Name ist Pflicht; Quelldateien werden nicht automatisch überschrieben.

`src/file_export.rs` enthält jetzt den gemeinsamen atomaren Schreibweg für Karten- und Lorebookexport:
Zielschutz, temporäre Datei im Zielordner, vollständiges Schreiben/sync_all, danach persist. JSON maximal
4 MiB. Karten behalten vorherige Bildtransformationen und Zielvalidierung. Speicherdialogziele werden
unverändert verwendet, Endung .json erforderlich; produktives und geladenes Profil bleiben geschützt.
Exportmeldungen sind auch in Lorebookdetails sichtbar. Kein automatischer Profil-/Dateischreibzugriff.

Prüfstand: 103 Native-Tests erfolgreich; 14 zusätzliche Tests für Array-/Objekt-/UID-/Aliaserhalt,
Pflichtfelder, Entwurfsschutz/ID-Kollision, Auswählen ohne Normalisierung, atomaren Export sowie
Roundtrip unter anderem Dateinamen mit unveränderter Quelle. Clippy/Formatprüfung erfolgreich.
Review korrigierte fehlende Exportmeldungen und den projizierten Namen ohne Rohfeld. Kein Desktopzugriff,
kein Schließen/Starten der Vorschau. Normale Windows-EXE und gesammelte Sichtabnahme weiter offen.

### GUI-Zwischenschritt: erweiterte Lorebook-Regeln

Im Lorebookeditor zwischen „Eintragstext“ und „Regeln“ wechseln. Regeln zeigen die Aktivierung
(Schlüsselwort/Regex/immer/Spannung), Einfügeart (Hintergrundwissen/Anweisung), Priorität (i32), optionale
Wahrscheinlichkeit/Spannung (0–100), Groß-/Kleinschreibung und ganze Wörter. Vorhandene unbekannte
Trigger-/Einfügewerte erscheinen separat und werden nicht beim Anzeigen ersetzt. Verkettungen
`chain_requires`/`chain_activates` lassen sich über die Feldliste zeilenweise bearbeiten; Schnellknöpfe
öffnen diese Felder. Buchweit sind `scan_depth` (u32 einschließlich 0) und `is_global` editierbar.
Der Editor verwaltet die Werte als Dateimetadaten. Die Vorschau wertet die übernommenen Werte aus.

Zahleneingaben haben eigene Puffer/Fehlerzustände. Ungültige Werte verändern den Entwurf nicht,
bleiben aber sichtbar und sperren Übernehmen, Entwurfsexport sowie Eintragswechsel/Anlegen/Entfernen.
„Ungültige Eingabe verwerfen“ setzt Puffer auf die letzten gültigen Entwurfswerte, nicht auf die
ursprüngliche Datei zurück. Andere gültige Regeländerungen gehen dabei nicht verloren. Regelansicht
wechseln/Navigation verwirft keine ungültigen Puffer. Katalogexport eines bereits übernommenen Buchs
bleibt unabhängig vom offenen Entwurf. Leere optionale Prozentwerte entfernen die eigene Vorgabe.

Legacy-Metadaten: `n_depth` beim Suchbereich lesen und beim Ändern synchronisieren; `order` bei
Prioritätsänderung erhalten/synchronisieren; String-`position` bei Einfügeart mitlesen und beim Ändern
abgleichen. Leere Voraussetzungen berücksichtigen ein nichtnegatives `depends_on`; ausdrückliches
Bearbeiten der Voraussetzungsliste entfernt diesen Legacywert, damit er später nicht wieder greift.
Das sind Editorprojektionen und Aliasbereinigung. Bestehende unbearbeitete Rohwerte bleiben erhalten.
Der gemeinsame Parser übernimmt die Importnormalisierung beim Auswerten.

Prüfstand: 111 Native-Tests erfolgreich (acht neue Regel-/Eingabeschutztests gegenüber dem Basiseditor).
Der Dateiroundtrip prüft nun ebenfalls Suchbereich, Globalmarkierung, Priorität, Wahrscheinlichkeit,
Spannung und Aktivierung. Clippy und Formatprüfung bestanden. Review führte zu drei Legacy-Alias-
Korrekturen. Keine Desktopsteuerung/kein Neustart; Windows-Build und Sichtprüfungen bleiben gesammelt offen.

### GUI-Zwischenschritt: Chatsuche und aktueller Windows-Build

Vor dem ausdrücklich gewünschten neuen EXE-Build wurde die vorhandene Chatsuche ausgebaut:
Strg+F öffnet/fokussiert das Suchfeld ausschließlich im Chat, Trefferzahl zählt Nachrichten und den
sichtbaren lokalen Begrüßungssnapshot. Archive bekommen keine Kartenbegrüßung als Suchtreffer.
Suchtext wird getrimmt, Groß-/Kleinschreibung ignoriert. Keine Treffer zeigt einen klaren Leerzustand
mit Zurücksetzen. Schließen/Zurücksetzen löscht nur den Filter, keine Nachrichten oder Eingabeentwürfe.
Wechsel zu einem anderen Gespräch setzt den Begriff zurück; erneute Auswahl/das Nachladen desselben
Chats bewahrt ihn. Ein neuer Profilimport entfernt die vorherige Suche. Maximal geladene 200 Archiv-
Nachrichten bleiben die Grenze; keine Behauptung einer vollständigen Archivsuche und kein Nachladen.

`src/chat_search.rs` liefert Originalindizes, damit Nachrichtencaches/Kopieraktionen nach Filtern
korrekt zugeordnet bleiben. 115 Native-Tests erfolgreich (vier neue Such-/Bedienlogiktests),
Clippy und Formatprüfung bestanden. Keine Desktopsteuerung; Sichtprüfung weiterhin gesammelt offen.
Windows-Testbuild am 08.11.2026 erfolgreich: `cargo build -p otakusoul-native --offline` erzeugte
`target/debug/otakusoul-native.exe` mit sämtlichen bisherigen Änderungen (einschließlich Ausdrucksbildern,
Lorebook-Editor/-Regeln und Chatsuche). Die alte Vorschau lief nicht mehr; kein Schließen erforderlich.
Die neue EXE wurde nicht automatisch gestartet. Dieser neue Build ersetzt die zuvor offenen EXE-Builds;
deren Sicht-/Bedienprüfungen bleiben weiter gesammelt für einen ausdrücklich freigegebenen Durchlauf.

### Gemeinsame Lorebook-Auswertung in der Prompt-Vorschau

`crates/otakusoul-lore` enthält Parser, Lokalisierung und Regelauswertung. Tauri verwaltet weiterhin
seine eigenen Datei- und Profilzugriffe. Der Editor bewahrt das Roh-JSON für den Export.
`npm run types:gen` berücksichtigt die neue Crate.

„Lore prüfen“ wertet ausdrücklich geladene globale Bücher und geladene Bücher mit passender
Kartenbindung aus. Die Vorschau verwendet Deutsch, Spannung 0 und die letzten fünf angezeigten
Nachrichten einschließlich der lokalen Begrüßung, sofern sie noch in diesem Ausschnitt liegt.
Hintergrund und Anweisungen werden in die gemeinsame Prompt-Struktur übernommen. Die Vorschau
zeigt die Zahl der Bücher und Treffer. Ein Wechsel des Chatkontexts verwirft das Ergebnis.
Eine erneute Prüfung würfelt Wahrscheinlichkeitsregeln neu. Die Vorschau arbeitet lokal im RAM.
Der Abschnitt „Modellantwort im nativen Testchat“ beschreibt die anschließende Verwendung beim Senden.

Prüfstand am 09.11.2026: 117 Native-, 10 Lore- und 11 Prompt-Tests bestanden. In Tauri bestanden
zwei Lorebook-Tests und der Referenztest für System-Prompt und Nachspann. Clippy, die gezielte
Rust-Formatprüfung und der TypeScript-Check bestanden. Windows-Debugbuild unter
`target/debug/otakusoul-native.exe`.

Windows-Bedienprobe am 09.11.2026 mit synthetischem Test-Lorebook und der integrierten Shiori-Karte:

- Chatsuche über Strg+F öffnet und fokussiert das Suchfeld. Geprüft wurden ein Treffer in der
  Begrüßung, der Leerzustand bei null Treffern und das Zurücksetzen des Filters.
- Ausdrucksbilder „Neutral“ und „Fröhlich“ laden lokal. Ein WebP ließ sich über den Dateidialog
  einbetten, als Hauptporträt übernehmen und anschließend im Chat anzeigen.
- Lorebook per Dateidialog geladen. Der Regelreiter sperrte Übernehmen und Entwurfsexport bei
  101 Prozent. Nach Zurücksetzen war der Entwurf wieder gültig. Die deaktivierte Globalmarkierung
  wurde im exportierten JSON bestätigt. Die Prüfsumme der Quelldatei blieb gleich.
- Das nichtglobale Buch wurde an Shiori gebunden. Die Prompt-Vorschau zeigte ein geprüftes Buch,
  einen Hintergrundtext und eine Regieanweisung. Beide Texte waren im Systemteil sichtbar.

Der Test lief im Standardfenster mit dem lokalen Testchat. Die eigens gestartete Instanz wurde
anschließend geschlossen. Ein veralteter Hinweis im Regel-Editor und die Anzeige der Trefferzahl
wurden nach dem Durchlauf textlich korrigiert.

### Öffentlicher Hub im nativen Fenster

- [x] Hub-Seite mit Kartenraster, Suchfeld und Reitern für Welten, Charaktere, Szenarien und Lorebooks.
- [x] Charakterkarten mit Porträt und Lorebooks über die vorhandenen Bibliotheken übernehmen,
  bearbeiten und explizit exportieren.
- [x] Welt-Detailansicht mit Titelbild und Mitgliedern als verknüpfte Katalogeinträge.
- [x] Titelbilder im Weltenraster und Wiederverwendung in der Detailansicht.
- [ ] Vorschaubilder für Figuren über ein separates kleines Katalog-Asset. Die Registry enthält
  derzeit nur Links zur vollständigen Charakterkarte.
- [x] Dauerhafte Installation von Figuren und Lorebooks in einer eigenen nativen Hub-Bibliothek.
- [x] Versionsabgleich und ausdrücklich angeforderte Updates für importierte Originale.
- [ ] Konfliktbehandlung für dauerhaft gespeicherte Bearbeitungen und Aktivierung während der Sitzung.
- [ ] Registry und Downloads für Updates an denselben Repository-Stand binden.
- [x] Öffentliche Hub-Szenarien direkt in der nativen Stage-Vorschau öffnen.
- [ ] Szenario-Installation und Spielfortschritt an die Stage-Laufzeit anbinden. Avatare und Chub AI
  separat integrieren.

`src/hub_catalog.rs` lädt die Listen im Hintergrund von der festen öffentlichen OtakuSoul-Quelle.
„Neu laden“ fragt alle vier Listen für die Filterzähler ab. Ein Fehler beim Aktualisieren erhält den
bisher geladenen Katalog. „Details ansehen“ öffnet eine Welt mit Titelbild und drei Abschnitten.
Figuren und Lorebooks lassen sich direkt aus der Welt importieren. Szenarien zeigen Titel und
Beschreibung. Im Raster lösen Iced-Sensoren einen Bildabruf aus, wenn eine Karte sichtbar ist
oder sich dem sichtbaren Bereich nähert. Scrollen aus dem Bereich entfernt noch wartende Abrufe.
Filter- und Ansichtswechsel räumen die Warteschlange auf. Die Detailansicht priorisiert ihr Bild.
Raster und Details teilen einen Sitzungscache mit 32 Einträgen und bis zu drei gleichzeitigen
Abrufen. Bilder werden auf maximal 800 × 480 Pixel vorbereitet. Bei fehlendem oder unlesbarem Bild
bleibt der Platzhalter in gleicher Größe. „Neu laden“ erlaubt einen neuen Versuch fehlgeschlagener
Bildabrufe. Der Bildabruf verwendet dieselbe öffentliche Quelle und feste Größenlimits.

Katalogtexte behalten alle vorhandenen Übersetzungen. Die Projektion verwendet die Inhaltssprache,
bei fehlender nichtdeutscher Fassung Englisch und dann den Originaltext. Stabile Welt- und
Szenario-IDs sowie unveränderte Figuren- und Lorebook-Namen bleiben Import- und Referenzschlüssel.
Die Hub-Oberfläche liest gemeinsame Schlüssel aus `presets/locales/ui/`. Spezifische
Prototyp-Texte liegen in `native-ui/assets/locales/de.json`. Die Vorschau verwendet Deutsch für
Oberfläche und Inhalte. App-weite Sprachauswahl und die restlichen Ansichten folgen später.

Karten- und Lorebook-Downloads sind auf die jeweiligen Gateway-Ordner und Dateitypen begrenzt.
Markierte 18+-Einträge und markierte Downloads bleiben ausgefiltert. Ein gleich referenziertes
Lorebook bleibt beim Import erhalten. Die importierten Inhalte nutzen die bestehenden Editoren und
die explizite Exportfunktion. „Ansehen“ lädt öffentliche Hub-Szenarien in die lesende Stage-Vorschau.

Prüfstand 09.11.2026: Der Nutzer hat Charakter- und Lorebook-Import im Hub-Fenster bestätigt.
Für die neue Weltansicht bestanden 131 native Tests und der separate Live-Test mit allen vier
öffentlichen Registries, je einem Charakterkarten- und Lorebook-Download und einem Titelbild.
Der Test prüft Weltmitglieder und die Übernahme aus der Weltansicht auf Ereignisebene. Die
Windows-EXE wurde neu gebaut. Die Sichtprüfung der neuen Weltansicht steht aus.

Prüfstand für das Weltenraster: 134 native Tests bestanden, darunter Cache-Tests für Parallelität,
Priorisierung, erneuten Abruf und Verdrängung. Der separate Live-Test lädt ein öffentliches
Titelbild und prüft, dass Raster und Detailansicht dasselbe Ergebnis verwenden. Die Sichtprüfung
des Scrollverhaltens steht aus.

#### Separate native Hub-Bibliothek

Der Pfad kommt aus `otakusoul_paths::native_data_dir()` unter der App-Kennung
`otakusoul-native-preview`. Einstellungen zeigen den Pfad an. Die App liest
`hub/native-hub.sqlite3` beim Start im Hintergrund. Der erste ausdrücklich gewählte Hub-Import
legt die Datenbank an. Originaldownload, Registry-ID, Art und Revision werden gemeinsam gespeichert.
Die Datenbank verhindert doppeltes Anlegen und hält bei gleichzeitigem Import die bereits
gespeicherte Fassung. Tauri-Produktionspfade, `OTAKUSOUL_HOME` und geladene Profilkopien sind
als Hub-Speicher ausgeschlossen. Nach dem Laden einer Profilkopie bleiben Hub-Importe verfügbar.
Die Native-App lädt beim Neustart die gespeicherten Originale. Änderungen im Editor werden wie
bisher explizit exportiert. Lokale Testchats bleiben flüchtig.
Die Bibliothek begrenzt sich im Prototyp auf 1.024 Einträge und 256 MiB Originaldaten.

Prüfstand 09.11.2026: 139 Native- und ein Pfadtest bestanden. Der Hub-Live-Test installierte
eine öffentliche Charakterkarte und ein Lorebook in einer temporären SQLite-Bibliothek und
stellte beide beim erneuten Laden in einer frischen App-Instanz wieder her. Clippy und der
Windows-Build bestanden. Der Neustart im Windows-Fenster ist noch offen.

#### Hub-Revisionsabgleich

Die gespeicherte Revision eines Eintrags bestimmt den Status im Katalog und in den Weltdetails.
„Aktualisieren“ lädt eine neuere Fassung, validiert dieselben Karten- und Lorebook-Formate wie beim
Erstimport und schreibt Nutzdaten und Metadaten gemeinsam in die vorhandene SQLite-Zeile.
Der Revisionsvergleich erfolgt innerhalb der Schreibtransaktion. Bei gleichzeitigen Aktualisierungen
gilt die höchste erfolgreich gespeicherte Revision. Die vorhandene Datenbankversion bleibt kompatibel.

Die aktualisierte Fassung wird beim nächsten Start geladen. Bis dahin arbeiten Editor und Chat mit
der geöffneten Fassung. Eigene Bearbeitungen lassen sich wie bisher separat exportieren.

Prüfstand 09.11.2026: 142 native Tests und der öffentliche Hub-Live-Test bestanden. Der
Live-Test aktualisierte eine temporäre Bibliothek von Testrevision 3 auf Katalogrevision 4.
Der lokale Test mit unterschiedlichen Lorebook-Fassungen prüft, dass ein offener Entwurf
erhalten bleibt und erst eine frische App-Instanz die neue Fassung liest.

#### Hub-Oberfläche nach Tauri v0.7.5

Der Hub-Vergleich verwendet die Tauri-App im E2E-Harness mit Theme `midnight`. Relevante Abläufe
stehen in `e2e/hub-collections.mjs` und `e2e/hub-scroll.mjs`. Die native Ansicht hat eine eigene
Hub-Kopfzeile mit Suche, Kennzeichnung und Aktualisieren-Symbol. Darunter stehen
Welten-Reiter und Inhaltsfilter mit aktuellen Zählern. Cyan-Akzente, dunkler Katalogbereich und
Sammlungskarten mit 16:9-Cover, Titel im Bild und farbigen Zählern folgen der Vorlage.
Das Raster passt sich der Breite an. Ein Klick auf die Karte öffnet die Sammlung. Die Suche
findet auch Sammlungen, deren Figuren, Szenarien oder Lorebooks zur Suchanfrage passen.

Windows-Bedienprobe am 09.11.2026: Filterwechsel, Raster mit zwei und drei Spalten, Suche nach
„Zwei Stunden bis zum Andruck“ über das zugehörige Szenario und Öffnen der Sammlung über ihr
Titelbild. Danach wurden Kontrast des Aktualisieren-Symbols und Breite der Sammlungsvorschau
angepasst. Chub AI, Avatare und URL-Import werden mit den jeweiligen Funktionen ergänzt.
148 native Tests, der Hub-Live-Test, Clippy und der Windows-Build bestanden.

Tauri-Referenz am 09.11.2026 über den vorhandenen E2E-Build aufgenommen. Der Sammlungstest
bestand im isolierten Wegwerfprofil. Die Referenz verwendet die lokalen öffentlichen
Katalogdaten und Titelbilder. WebDriver bestätigte Theme, alle vier Filter und die drei
geladenen Titelbilder der ersten Reihe. Die Aufnahme liegt lokal in
`e2e/screenshots/native-reference-tauri-hub-midnight.png`.

### Startseite und Stage-Galerie

- [x] Startseite nach `HomeView.tsx` mit responsiven Einstiegskarten für Chat, Stage und Hub,
  aktivem Charakterporträt sowie Zugriff auf Einstellungen, Charaktere und Lorebooks.
- [x] Stage-Galerie nach `StoryGallery.tsx` mit den zwei mitgelieferten Titelbildern, Starter-
  Geschichten, den drei Gruft-Akten und Filtern für Genre und Einsteiger.
- [x] Szenariovorschau mit Schauplatz, Tageszeit, Gruppe, Inhaltsangaben, Einstiegsideen und
  lesbarem Auftakt. Öffentliche Hub-Szenarien werden beim Ansehen für die Sitzung geladen.
- [x] Szenen-Lobby mit Suche und Herkunftsfiltern, Vorschau, Basis-Editor und JSON-Import
  und -Export. Eigene Szenen und Entwürfe liegen für die Dauer der Sitzung im Speicher.
- [ ] Dauerhafter Szenenspeicher, Ordnerverwaltung, erweiterte Szenenfelder und Story-Wizard.
- [ ] Spielansicht mit echten Stage-Runden und Spielständen.
- [ ] 5e-Spielbrett, Kampf und Erkundung über die vorhandene Stage-/Regel-Engine.

Gemeinsame UI-Schlüssel kommen aus den mitgelieferten Tauri-Sprachpaketen. `stage_preview.rs`
verwendet dieselben Szenendateien und die vorhandene Inhaltslokalisierung. Szenario-IDs sind von
lokalisierten Titeln getrennt. Hub-Downloads werden auf öffentliche Gateway-JSONs begrenzt.
Die Vorschau lädt keine referenzierten Figuren, Lorebooks oder Medien zusätzlich.
`stage_lobby.rs` verbindet Lobby und Editor mit den nativen Dateidialogen. `stage_draft.rs`
ändert nur bearbeitete Definitionsfelder. Der JSON-Import akzeptiert eine Definition oder
einen Spielstand mit `definition`. Der Export speichert die Definition einschließlich
unveränderter Regel- und Erweiterungsfelder. Spielverlauf und Medien sind separate Etappen.
Tauris Lobby und die gemeinsamen Editorfelder wurden per WebDriver im isolierten E2E-Profil
geprüft. Für die native Variante bestanden 152 Tests einschließlich JSON-Rundlauf und der
Windows-Build. Der Live-Hub-Test war bei diesem Lauf ausgenommen.

Windows-Bedienprobe am 09.11.2026 im Standardfenster und maximiert. Geprüft wurden Startkarten
mit Charakterporträt, beide Sammlungscover, die drei Gruft-Akte, der Science-Fiction-Filter, der
Auftakt von Kepler-9 und der Einstieg aus dem Hub in „Redaktionsschluss“. Der Vergleich orientierte
sich an den React-Quellen. Der vollständige Funktionsvergleich folgt mit den weiteren Stage-Teilen.

- [ ] Einstellungen/Onboarding, weitere Charakter-/Lorebook-Editoren, Gedächtnis und Im-/Export.
- [ ] Native Audioausgabe/-aufnahme separat planen, danach Avatarintegration separat bewerten.
- [ ] Windows: DPI (100/150/200 %), mehrere Monitore, Tastatur, Screenreader, Zwischenablage, Dateidialoge.
- [ ] Linux: reale X11-/Wayland-Tests, GNOME/KDE, Portale und Grafiktreiber.
- [ ] macOS: echter Mac, Apple Silicon, Berechtigungen, Retina und Menüintegration; Intel separat entscheiden.
- [ ] Installer, Updatepfad, Signierung/Notarisierung und Datenkompatibilität vor einer Veröffentlichung.
- [ ] Tauri erst nach Funktionsvergleich und Abnahme ablösen.

## Abschluss – Übersetzungen (ausdrücklich zuletzt)

- [ ] Nach Abschluss der Oberfläche die Anbindung an `presets/locales/ui/` vom Hub auf die
  übrigen Ansichten erweitern und die Sprachwahl im Profil integrieren.
- [ ] Mehrstufige Sprachauflösung/Fallbacks übernehmen; Layout mit längeren Texten und japanischer Eingabe prüfen.
- [ ] Übersetzungsprüfung und abschließende Plattform-/Bedienabnahme durchführen.

## Risiken und offene Entscheidungen

- Iced ist kein automatischer Ersatz für native Betriebssystem-Widgets. Textbearbeitung, IME und
  Barrierefreiheit früh praktisch prüfen. Unterstützte Plattform bedeutet nicht bereits geprüfte App.
- Aktuell keine Garantie für RAM-, Startzeit- oder Leistungsvorteile. Mit vergleichbaren Daten messen.
- Vorschau rendert alle lokalen Testnachrichten bzw. maximal 200 geladene Archivnachrichten;
  noch keine Virtualisierung, kein Nachladen älterer Nachrichten und kein Langchat-Leistungsnachweis.
- Importgrenzen: 32 MiB je Kartendatei, 4 MiB JSON-/PNG-Kartenmetadaten, 10.000 Chatlisten-Einträge.
  Kartenordner wird nicht rekursiv durchsucht; gleichnamige JSON-/PNG-Karten werden zusammengefasst.
- Three.js/VRM/MMD, WebAudio, Live2D und Inochi2D nicht als automatisch portierbar betrachten.
- Screenshots/Prüfergebnisse und bekannte Einschränkungen nach jeder Etappe hier konkret ergänzen.
- Diese Roadmap bleibt als branchspezifischer Arbeitskontext versioniert; erledigte Meilensteine dürfen
  hier sichtbar bleiben. Die allgemeine Produkt-Roadmap wird dadurch nicht als erledigt markiert.

## Quellen zur gewählten API

- https://docs.rs/iced/0.14.0/iced/
- https://github.com/iced-rs/iced/tree/0.14/examples
