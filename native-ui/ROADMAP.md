# Native Rust-Oberfläche – Arbeitsplan

Stand: 08.11.2026. Experiment auf `codex/native-rust-gui`, ausdrücklich vom Nutzer beauftragt.
Dieses Dokument ist der Einstieg für spätere Arbeit am Prototyp. Allgemeine Regeln: `../AI.md`.

## Ziel und Zusammenarbeit

Wir entwickeln gemeinsam eine separat startbare native GUI ohne WebView. Zunächst zählt ausschließlich
Windows auf dem vorhandenen Rechner. Der Assistent implementiert und prüft; der Nutzer beurteilt die
laufende Oberfläche. Fortschritt wird an nutzbaren Etappen gemessen, nicht an Personentagen.
Linux und macOS bleiben Architekturziele, sind bis zu tatsächlichen Tests aber nicht als unterstützt bestätigt.
WSL kann später Linux-Builds/erste WSLg-Tests ermöglichen; es ersetzt weder Linux-Desktopabnahme noch einen Mac.

Aktuelle Nutzerentscheidung (08.11.2026): **Übersetzungen erst ganz zum Schluss**. Bis dahin Deutsch.
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

## Spätere Ausbaustufen

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
