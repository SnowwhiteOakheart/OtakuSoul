# Windows-Nachprüfung der Abhängigkeiten – 07.11.2026

**Späterer Stand:** [Ersetzung nicht mehr gepflegter Pakete und verbleibende Linux-Eltern](ungepflegte-abhaengigkeiten-2026-11-07.md).

Dieser Nachtrag aktualisiert die verbliebenen Windows-Punkte aus der [Major-Übersicht](abhaengigkeiten-major-2026-11-07.md).

## ONNX und Kokoro umgesetzt

| Bestandteil | Vorher | Jetzt |
|---|---|---|
| `ort`, `ort-sys` | 2.0.0-rc.13 | exakt 2.0.0-rc.15 |
| Tatsächlich geladene ONNX Runtime | bisherige Runtime-Linie | 1.31.0, durch `ort::info()` im echten Inferenztest nachgewiesen |
| `kokoro-en` | Registry 0.1.5 blockiert neue Session-API | lokale Kompatibilitätsportierung von 0.1.5 |
| Session-Verwaltung | implizite globale Umgebung | explizite gemeinsame Umgebung, verzögert initialisiert und von `AppState.onnx_runtime` gehalten |

rc.15 behebt laut [offiziellen Release-Hinweisen](https://github.com/pykeio/ort/releases/tag/v2.0.0-rc.15) zahlreiche Probleme der Speichersicherheit. Seit rc.14 ist eine explizite `Environment` erforderlich; rc.15 verlangt für `run_async` besitzende Eingabetensoren. Kokoro wurde an beide Änderungen angepasst, einschließlich des v1.1-Synthesepfads auf Typebene. Die App verwendet den neuen `new_with_environment`-Konstruktor.

Der erste reale VAD-Test deckte eine zusätzliche Laufzeitbedingung auf: rc.15 lässt nur eine Umgebung pro Prozess zu, auch bei nacheinander geöffneten Sessions. Deshalb wird nicht pro Modell eine neue Umgebung angelegt. `modules/onnx_runtime.rs` synchronisiert die einmalige Initialisierung und reicht geklonte Handles an Kokoro, Silero und Porträts weiter. Die globale Registry hält nur eine schwache Referenz auf den App-eigenen Verwalter. Provider werden weiterhin pro Session gewählt; der Kokoro-CPU-Fallback baut ebenfalls auf derselben Umgebung auf.

Die lokale Bibliothek enthält Quellcode, Wörterbücher und Lizenzen, keine Modellgewichte. Originalversion, Upstream-Commit, SHA-256 des Crate-Archivs und die gezielten Änderungen stehen in [OTAKUSOUL-PATCH.md](../src-tauri/vendor/kokoro-en/OTAKUSOUL-PATCH.md). Apache- und CMU-Lizenz werden auch als App-Ressourcen ausgeliefert. Upstream-Stillints sind ausschließlich in diesem Fremdmodul erlaubt; die App bleibt mit `-D warnings` geprüft. Bei einem kompatiblen Upstream-Release soll die lokale Kopie wieder entfallen.

Der von Upstream genannte `copy-dylibs`-Blocker für Rust 1.100 wird damit adressiert. **Rust 1.100 wurde hier nicht installiert oder getestet**; geprüft wurde weiterhin Rust 1.99.1. Eine Behauptung vollständiger 1.100-Kompatibilität wäre daher verfrüht.

## Kontrastbefund behoben

Die Sammlungskarten verwendeten für die Abdunklung die umkehrbare Theme-Farbe `slate-950`. Im hellen Modus wurde daraus eine helle Fläche, während der Titel weiß blieb und der Badge dunkle Akzentfarbe erhielt. Über dem Cover liegen jetzt ausdrücklich schwarze Abdunklungen und weiße Beschriftungen. Der Titel besitzt eine eigene halbtransparente dunkle Fläche; dadurch bleibt er auch über sehr hellen oder noch nicht geladenen Bildern lesbar. Der hoverabhängige Wechsel zu dunkler Akzentfarbe entfällt.

Die Kontrastmessung wird dafür nicht abgeschwächt und bekommt keine Ausnahme für Covertexte.

## WebdriverIO: weiterhin Upstream-Blocker

Erneut geprüfte Registry-Stände: WebdriverIO **10.2.0**, Archiver **8.0.0**, readdir-glob **3.0.0**. Letzteres verlangt weiterhin `minimatch ^10.2.2`; installiert ist dort 10.2.6. Der [Sicherheitsfix](https://github.com/advisories/GHSA-g3hv-75wg-m249) beginnt bei 11.0.1. Die 11er-Linie ersetzt die interne Glob-Implementierung grundlegend, wie die [Upstream-Dokumentation](https://github.com/isaacs/minimatch#readme) erläutert.

Einige erfolgreiche Archivtests allein wären kein Beleg für die vollständige Kompatibilität mit der vom Elternpaket nicht freigegebenen Hauptversion. Deshalb weiterhin kein globaler oder erzwungener Hauptversions-Override und kein Rückschritt auf WebdriverIO 9. Der aktuelle Auditstand bleibt **vier moderate Entwicklungsbefunde, keine hohen oder kritischen Befunde**. `npm audit --omit=dev` meldet **null Befunde**. Die vier Meldungen gehören zu derselben weitergereichten Abhängigkeitskette, nicht zu vier unabhängigen App-Lücken.

## Prüfung auf Windows

- `npm run check:web`: **805 Tests / 152 Dateien**, Oxlint und TypeScript erfolgreich.
- `npm run check:rust`: Formatierung, Clippy mit `-D warnings`, **852 Tests erfolgreich**, 13 modell-/GPU-abhängige Bibliothekstests regulär ignoriert.
- Vier gezielte Modelltests separat aktiviert und erfolgreich: Kokoro, Silero, Porträts und modulübergreifende ONNX-Nutzung.
- Kokoro auf CPU: `af_heart` normal und langsamer, `am_michael` schneller; gültiges Mono-WAV mit 24 kHz, plausible Dauer und messbares Audiosignal. Unbekannte Stimme wird weiterhin zurückgewiesen. Die Tests verwenden vorhandene Gewichte ohne deren Änderung.
- Silero: echte gebündelte Sprachaufnahme erkannt, Rauschen und Tippimpulse abgelehnt; wiederholtes Öffnen von Detektoren funktioniert. Das kleine Testmodell wurde von der gepinnten Originalquelle geladen und per SHA-256 geprüft.
- Porträts: vorhandene ISNet-/THA3-Modelle im isolierten Testprofil; echte Segmentierung und Mund-/Blinkbilder erzeugt, unterschiedliche Ausgaben geprüft und visuell angesehen. Kein Zugriff auf den vorhandenen Porträtcache des Benutzerprofils.
- Gemeinsamer Prozess: Kokoro-Synthese, zwei VAD-Detektoren, echte Porträt-Segmentierung und erneutes Öffnen eines Detektors erfolgreich.
- Produktionsbundle und Windows-Desktop-Binary mit den neuen Bibliotheken erfolgreich gebaut; mitgelieferte Lizenzdateien im Build vorhanden.
- Acht gezielte Desktop-Szenarien nach gegebenenfalls erforderlicher Wiederholung erfolgreich: `onnx-local`, `contrast`, `hub-collections`, `stage-gallery`, `voice-mic-check`, `voice-barge-in`, `chat-narrator-voice`, `smoke`.
- `onnx-local` startet echte Kokoro-Synthese und VAD gleichzeitig in der gebauten App, dekodiert das WAV im Webview und prüft Dauer, Kanalzahl und Signal. Danach werden VAD-Detektoren wiederholt geöffnet/geschlossen und eine zweite Stimme synthetisiert. Keine Wiedergabe erforderlich.
- `contrast`: alle fünf Themes jeweils hell und dunkel ohne Befund; Galerie-Screenshots visuell kontrolliert. Die vorherigen zehn Stilbefunde sind behoben. Im Mikrofontest wird jetzt auf die tatsächlich geladene gespeicherte STT-Konfiguration gewartet: Die sichtbare Startschaltfläche allein bedeutete noch keine geladene Stimmenkonfiguration. Ohne diese Wartebedingung wurde der positive Test mit einer veralteten Konfiguration gestartet.
- Die gesamte 100-Szenarien-Suite wurde in diesem Nachtrag nicht erneut ausgeführt; die oben genannten acht Tests decken die betroffenen Abläufe gezielt ab. Für die vorherigen breiten Prüfungen gilt die Major-Übersicht.

Protokolle und erzeugte WAV-/Porträtdateien liegen lokal unter `target/windows-onnx-*` und werden nicht eingecheckt. Die optionalen Modelltests benötigen explizite Pfade; `e2e/onnx-local.mjs` dokumentiert und prüft dies vor dem Start.

## Verbleibende Grenzen

Keine Laufzeitprüfung von CUDA, DirectML, CoreML oder Kokoro v1.1; die bestätigte Inferenz läuft auf CPU mit dem von der App installierten v1.0-Modell. Kein vollständiger Linux-/macOS-Build. zbus 6 und Linux-/KWin-Tests bleiben zurückgestellt; MMD bleibt auf der stabilen 0.1.2-Linie.
