# Native Rust-Oberfläche – Arbeitsplan

Stand: 08.11.2026. Experiment auf `codex/native-rust-gui`, ausdrücklich vom Nutzer beauftragt.
Dieses Dokument ist der Einstieg für spätere Arbeit am Prototyp. Allgemeine Regeln: `../AI.md`.

## Ziel und Zusammenarbeit

Wir entwickeln gemeinsam eine separat startbare native GUI ohne WebView. Zunächst zählt ausschließlich
Windows auf dem vorhandenen Rechner. Der Assistent implementiert und prüft; der Nutzer beurteilt die
laufende Oberfläche. Fortschritt wird an nutzbaren Etappen gemessen, nicht an Personentagen.
Vor jeder Desktopübernahme ausdrücklich fragen und Zustimmung abwarten (Nutzerwunsch 08.11.2026).
Das umfasst die Vorbereitung mit Schließen/Neustarten der GUI-Testinstanz. Keine parallelen Eingaben;
Codearbeit und Prüfungen ohne Desktopsteuerung können währenddessen weiterlaufen.
Linux und macOS bleiben Architekturziele, sind bis zu tatsächlichen Tests aber nicht als unterstützt bestätigt.
WSL kann später Linux-Builds/erste WSLg-Tests ermöglichen; es ersetzt weder Linux-Desktopabnahme noch einen Mac.

Aktuelle Nutzerentscheidung (08.11.2026): **Vollständige, funktionierende GUI vor Übersetzungen**.
Übersetzungen integrieren, sobald die wesentlichen Oberflächen und Abläufe stehen; bis dahin Deutsch.
Die native Oberfläche soll der bestehenden Tauri-Oberfläche möglichst nahekommen, kein neues visuelles
Konzept. Vergleichsquelle ist der aktuelle React-/CSS-Code; vorhandene Screenshots dienen als Ergänzung.

## Verbindlicher Umfang

- Zunächst Navigation, Charakterauswahl, Chatverlauf, Eingabe, grundlegende Einstellungen und echte Chat-Anbindung.
- Kein Desktop-Pet. Animierte Avatare, Audio, Hub, Stage und komplexe Editoren sind spätere Ausbaustufen.
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
- `src/connection.rs`: ausdrücklich gestartete feste Testanfrage, keine zweite Charakter-Chat-Pipeline.
  Eigener Tokio-Hintergrunddienst mit Abbruch, begrenzter Antwort und klaren Verbindungsfehlern.
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
  auswählbarer/kopierbarer System-Prompt und Nachspann. Noch kein Versand von Charakterdaten.

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

Nächster enger Arbeitsschritt für **echte Charakterchats**:

1. Auf den gemeinsamen Prompt-Eingaben aufbauen; Request-/Event-Typen ohne Tauri herauslösen und
   die noch fehlenden Rust-/TypeScript-Verantwortlichkeiten abbilden. Der Renderer nimmt bereits
   Projektionen von Karte, Lore, Gedächtnis und Zustandswerten entgegen; deren Auswahl fehlt nativ.
2. Insbesondere `src/store/helpers.ts` und `src/store/slices/chatSlice.ts` prüfen: Auswahl von Lore,
   Persona, Vorlage und Verlauf nicht durch eine kurze zweite System-Prompt-Funktion ersetzen.
3. Gemeinsamen Prompt-/Inferenz-Service mit typisierten Ereignissen herstellen; Tauri bleibt Adapter.
   Abbruch und Generierungs-ID müssen Vorbereitung, Streaming und Abschluss gemeinsam absichern.
4. Erst dann „Hinzufügen“ im lokalen Testchat um einen ausdrücklichen echten Sendemodus erweitern;
   importierte Archivchats weiterhin schreibgeschützt. Persistenz nur im eigenen isolierten Profil.

Die Charakter-Chat-Anbindung ist durch die Diagnose **noch nicht erledigt**. Übersetzungen weiterhin zuletzt.

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

Wichtig für die nächste Arbeit: gemeinsames **Rendern vorbereiteter Eingaben** ist umgesetzt; die
Auswahl von Lore, Gedächtnis, Persona-Daten und Verlauf in `src/store/helpers.ts`/`chatSlice.ts` noch
nicht. Die Vorschau behauptet keine vollständige Übereinstimmung mit einem echten Tauri-Chatkontext.
Keine Profiländerung, kein Modellaufruf und keine Netzwerkübertragung durch diese Ansicht.

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
- [ ] Weitere Editorbereiche: Lorebook-Bindungen und vollständige Auflösung fremder relativer Bildverweise.
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

- [ ] Einstellungen/Onboarding, Charakter-/Lorebook-Editoren, Gedächtnis, Hub und Im-/Export.
- [ ] Stage und 5e einschließlich Battlemap; Fachlogik wiederverwenden.
- [ ] Native Audioausgabe/-aufnahme separat planen, danach Avatarintegration separat bewerten.
- [ ] Windows: DPI (100/150/200 %), mehrere Monitore, Tastatur, Screenreader, Zwischenablage, Dateidialoge.
- [ ] Linux: reale X11-/Wayland-Tests, GNOME/KDE, Portale und Grafiktreiber.
- [ ] macOS: echter Mac, Apple Silicon, Berechtigungen, Retina und Menüintegration; Intel separat entscheiden.
- [ ] Installer, Updatepfad, Signierung/Notarisierung und Datenkompatibilität vor einer Veröffentlichung.
- [ ] Tauri erst nach Funktionsvergleich und Abnahme ablösen.

## Abschluss – Übersetzungen (ausdrücklich zuletzt)

- [ ] Nach Abschluss der Oberfläche vorhandene `presets/locales/ui/` anbinden und deutsche Literaltexte ablösen.
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
