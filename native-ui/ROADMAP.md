# Native Rust-Oberfläche – Arbeitsplan

Stand: 08.11.2026. Experiment auf `codex/native-rust-gui`, ausdrücklich vom Nutzer beauftragt.
Dieses Dokument ist der Einstieg für spätere Arbeit am Prototyp. Allgemeine Regeln: `../AI.md`.

## Ziel und Zusammenarbeit

Wir entwickeln gemeinsam eine separat startbare native GUI ohne WebView. Zunächst zählt ausschließlich
Windows auf dem vorhandenen Rechner. Der Assistent implementiert und prüft; der Nutzer beurteilt die
laufende Oberfläche. Fortschritt wird an nutzbaren Etappen gemessen, nicht an Personentagen.
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
- Aktuelle Vorschau ist ausdrücklich ohne KI und speichert ausschließlich im Arbeitsspeicher.
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
- [ ] Weitere Editorbereiche: Titel, Tags/Erstellernotizen, alternative Begrüßungen, Ausdrucksbilder,
  Lorebook-Bindungen und vollständige JSON-Ansicht; Kartenraster/Tagfilter wie im Tauri-Frontend.
- [ ] Expliziter Dateiimport/-export und dauerhafte Speicherung ausschließlich im isolierten Profil.

`src/character_draft.rs` ist reine Kartenlogik ohne GUI/Dateizugriff. Bestehende V2-/flache Form,
unbekannte Metadaten, Lorebook und Bild bleiben erhalten. Nur bearbeitete Textfelder werden ersetzt;
deren vorhandene Kartenübersetzungen werden im Entwurf entfernt, damit alte Übersetzungen Änderungen
nicht in der Prompt-Vorschau verdecken. Die Oberfläche weist darauf hin. Unveränderte Übersetzungen
bleiben erhalten. Die Formulare sind noch keine vollständige Portierung des Tauri-Karteneditors.

Übernehmen aktualisiert nur RAM, Porträtdarstellung und Begrüßungs-/Promptcache; Neustart verliert diese
Änderungen. JSON kopieren ist eine bewusst ausgelöste Zwischenablageaktion, noch kein Dateiexport.
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
