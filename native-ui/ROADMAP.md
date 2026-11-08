# Native Rust-Oberfläche – Arbeitsplan

Stand: 08.11.2026. Experiment auf `codex/native-rust-gui`, ausdrücklich vom Nutzer beauftragt.
Dieses Dokument ist der Einstieg für spätere Arbeit am Prototyp. Allgemeine Regeln: `../AI.md`.

## Ziel und Zusammenarbeit

Wir entwickeln gemeinsam eine separat startbare native GUI ohne WebView. Zunächst zählt ausschließlich
Windows auf dem vorhandenen Rechner. Der Assistent implementiert und prüft; der Nutzer beurteilt die
laufende Oberfläche. Fortschritt wird an nutzbaren Etappen gemessen, nicht an Personentagen.
Linux und macOS bleiben Architekturziele, sind bis zu tatsächlichen Tests aber nicht als unterstützt bestätigt.
WSL kann später Linux-Builds/erste WSLg-Tests ermöglichen; es ersetzt weder Linux-Desktopabnahme noch einen Mac.

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
- Ressourcen über `include_bytes!`, keine absoluten Rechnerpfade. Keine derzeitige Verbindung zum Tauri-Crate.
- Vier gebündelte Charakterporträts; Beschreibungen sind Vorschautexte, kein vollständiger Kartenimport.
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

## Etappe 1 – Eigenständige Windows-Vorschau

- [x] Separater Git-Branch und Workspace-Paket; Standardziel bleibt Tauri.
- [x] Dunkles/helles Layout, Navigation und größenveränderliches Fenster (Minimum 850 × 600).
- [x] Charakterauswahl, statische Porträts, Charakterübersicht und Erscheinungsbild-Einstellung.
- [x] Lokale Testnachrichten, Entwürfe pro Figur, Leeren des aktuellen Testchats, Scrollbereich.
- [x] Windows-Build, Clippy und zwei Modelltests erfolgreich; laufendes Fenster teilweise interaktiv geprüft.
- [ ] Gemeinsames Nutzerfeedback zu Layout, Lesbarkeit und Navigation einarbeiten.

Abnahme: EXE startet ohne Tauri/WebView; Auswahl und Eingabe funktionieren; kein Profilzugriff.
Die Einzeileneingabe und einfache Textdarstellung sind vorübergehend. Keine KI-Antworten vortäuschen.

Prüfstand 08.11.2026: `cargo fmt --check`, Clippy mit `-D warnings`, zwei Zustandstests und
`cargo build --locked` erfolgreich. Windows-Fenster gestartet; Porträts, Umlaut-Eingabe, Enter zum
Hinzufügen, Wechsel zu Sota (getrennter leerer Verlauf), Einstellungen und Hell-/Dunkelwechsel beobachtet.
UI-Prüfung wurde anschließend per physischer Escape-Taste beendet. Charakterübersicht, Fenstergrößen,
Leeren und längere Verläufe noch nicht interaktiv abgenommen. Der Windows-Accessibility-Baum enthält
bislang nur den Fensterrahmen: Screenreader-Unterstützung ungeklärt, kein Barrierefreiheitsnachweis.
Lockfile-Vergleich: keine zuvor vorhandene Paketversion entfernt; GUI ergänzt zusätzliche Abhängigkeiten.

## Etappe 2 – Daten und Bedienung

- [ ] Produktive Pfadauflösung gezielt extrahieren: aktuell `src-tauri/src/modules/paths.rs::base_dirs`.
  Dieses Modul hängt selbst an Kartentypen; nicht als Ganzes in den Prototyp hineinziehen.
- [ ] Isoliertes Testprofil anlegen/importieren, Fehler sichtbar machen; keine automatische Nutzung echter Daten.
- [ ] Vollständige Charakterkarten und vorhandene Chats lesen; Formatkompatibilität erhalten.
- [ ] UI-Lokalisierung aus vorhandenen `presets/locales/ui/` übernehmen; deutsche Vorschautexte ablösen.
- [ ] Mehrzeilige Eingabe, Textauswahl/Kopieren, Tastaturfokus, Entwürfe und Nachrichtendarstellung.
- [ ] Markdown und lange Chats prüfen; Listenvirtualisierung/Begrenzung anhand Messungen entscheiden.

Abnahme: kopierte Daten lesbar, Originalprofil unverändert; langer Chat bleibt bedienbar.

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

## Risiken und offene Entscheidungen

- Iced ist kein automatischer Ersatz für native Betriebssystem-Widgets. Textbearbeitung, IME und
  Barrierefreiheit früh praktisch prüfen. Unterstützte Plattform bedeutet nicht bereits geprüfte App.
- Aktuell keine Garantie für RAM-, Startzeit- oder Leistungsvorteile. Mit vergleichbaren Daten messen.
- Vorschau rendert alle Testnachrichten; noch keine Virtualisierung und kein Langchat-Leistungsnachweis.
- Three.js/VRM/MMD, WebAudio, Live2D und Inochi2D nicht als automatisch portierbar betrachten.
- Screenshots/Prüfergebnisse und bekannte Einschränkungen nach jeder Etappe hier konkret ergänzen.
- Diese Roadmap bleibt als branchspezifischer Arbeitskontext versioniert; erledigte Meilensteine dürfen
  hier sichtbar bleiben. Die allgemeine Produkt-Roadmap wird dadurch nicht als erledigt markiert.

## Quellen zur gewählten API

- https://docs.rs/iced/0.14.0/iced/
- https://github.com/iced-rs/iced/tree/0.14/examples
