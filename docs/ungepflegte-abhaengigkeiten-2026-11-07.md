# Nicht mehr gepflegte Rust-Pakete – 07.11.2026

Ausgangspunkt: `cargo-audit 0.22.2` meldete sechs nicht mehr gepflegte Pakete und zusätzlich einen `unsound`-Hinweis für glib. Die [vorherige Windows-Übersicht](abhaengigkeiten-windows-2026-11-07.md) dokumentiert den Stand vor dieser Ersetzung.

## Unter Windows ersetzt

| Altes Paket | Einbindung | Umsetzung |
|---|---|---|
| `bincode 2.0.1` | ausschließlich unsere Kokoro-Kompatibilitätskopie | Ersetzt durch **cu-bincode 2.2.0**, einen gepflegten Fork der 2.x-Linie. Der Importalias bleibt `bincode`, tatsächlich enthält die App-Abhängigkeitsauflösung das alte Paket nicht mehr. Nur `std` ist aktiv, ungenutzte Derive-Makros entfallen. Das bisherige Format und das 16-MiB-Decodelimit bleiben erhalten. |
| `ttf-parser 0.25.1` | pdf-extract 0.12.1 → lopdf 0.42.0 | pdf-extract mit **lopdf 0.47.0** verbunden. Die neue Linie ersetzt die alte TTF-Bibliothek durch eine optionale Font-Einbettung; diese für die App ungenutzte Funktion ist ausgeschaltet. Damit entfällt ttf-parser vollständig. Der vorhandene PDF-Extraktionsalgorithmus einschließlich Font-/CMap-Decodierung bleibt erhalten. |

Quellen: [cu-bincode](https://crates.io/crates/cu-bincode), [Copper-Projekt](https://github.com/copper-project/cu-bincode), [lopdf-Änderungen](https://github.com/J-F-Liu/lopdf/blob/main/CHANGELOG.md), [lopdf 0.47](https://github.com/J-F-Liu/lopdf/releases/tag/v0.47.0). Die jüngeren lopdf-Versionen begrenzen außerdem die Dekomprimierung und beheben Fehler bei ungewöhnlichen PDFs.

pdf-extract selbst ist weiterhin gepflegt, bindet aber auch im geprüften Upstream-Manifest noch lopdf 0.42 ein. Deshalb liegt eine kleine dokumentierte Kompatibilitätskopie unter `src-tauri/vendor/pdf-extract`: Manifest angepasst, Seiteninhalt mit der neuen begrenzten API gelesen, Fehler weitergereicht. Ein bloßes Entfernen des früheren `unwrap()` würde Dekomprimierungsfehler verschlucken. Herkunft, Crate-Prüfsumme und Lizenz stehen in `OTAKUSOUL-PATCH.md`. Bei passendem Upstream-Release soll die lokale Kopie wieder entfallen. Die Lizenz wird mit der App ausgeliefert.

## Vier Warnungen bleiben im Linux-Zweig offen

| Paket | Warum kein isolierter Austausch in der App? | Erforderlicher Ersatzweg |
|---|---|---|
| `proc-macro-error 1.0.4` | Kommt über `glib-macros 0.18.5` und `gtk3-macros 0.18.2` aus den GTK-Bindings von Tauri/Wry, Tray und Menü. Unsere App verwendet die Makrobibliothek nicht direkt. | GTK-/Tauri-Eltern gemeinsam auf eine gepflegte Makro-Abhängigkeit portieren; GTK-/WebKit-Integration auf Linux testen. Ein App-Eintrag für einen Nachfolger ersetzt die Abhängigkeit der Eltern nicht. |
| `zbus_names 4.3.5` | Wird von zbus 5 selbst und dessen Makros benötigt. | In zbus 6 in das Modul `names` integriert. Alle entsprechenden Eltern müssen die 6er-Linie verwenden. |
| `zvariant 5.15.1` | Bestandteil der zbus-5-Kette. | In zbus 6 in `wire` integriert; nicht allein über eine Versionszahl austauschbar. |
| `zvariant_derive 5.15.1` | Gehört zur gleichen Typ-/Makro-Kette. | Neue zbus-Makros mit den passenden Eltern gemeinsam einsetzen. |

Die zbus-5-Eltern umfassen neben unserer direkten Linux-Abhängigkeit auch **notify-rust, xcap, secret-service/keyring** und mehrere **Tauri-Plugins**. Ein Wechsel allein unserer direkten Abhängigkeit würde die alten Pakete daher weiterhin im Baum lassen. Die geprüften stabilen Eltern verwenden noch diese Linie: notify-rust 4.18.2, xcap 0.9.8 und keyring 4.2.0 sind die aktuellen Registry-Stände. Als neuere Linien wurden unter anderem secret-service 6.0.0-rc.1 und Tauri-Plugins 3.0.0-alpha.3 angeboten; daraus wird kein ungeprüfter Framework-/Linux-Umbau abgeleitet. Ein teilweiser oder erzwungener Wechsel wurde nicht vorgenommen.

Alle vier Pakete wurden einzeln mit `cargo tree --locked --target x86_64-pc-windows-msvc -i <paket>` geprüft: **keines ist im Windows-Abhängigkeitsbaum enthalten**. Die entsprechenden Linux-Bäume zeigen die oben genannten Eltern. Es wurden weder Audit-Ausnahmen eingetragen noch Funktionen wie Benachrichtigungen, Schlüsselbund oder Screenshots entfernt, um Warnungen zu verstecken. Die notwendige Linux-Migration ist als **D6** in der Roadmap vermerkt; ein Linux-Prüfplatz fehlt hier weiterhin.

Die drei D-Bus-Warnungen betreffen in zbus zusammengeführte Einzelpakete; sie bedeuten nicht, dass D-Bus-Unterstützung insgesamt aufgegeben wurde. Primärquellen: [proc-macro-error](https://rustsec.org/advisories/RUSTSEC-2024-0370.html), [zbus_names](https://rustsec.org/advisories/RUSTSEC-2026-0371.html), [zvariant](https://rustsec.org/advisories/RUSTSEC-2026-0370.html), [zvariant_derive](https://rustsec.org/advisories/RUSTSEC-2026-0372.html).

## Sicherheitsstand und Grenzen

- `cargo audit`: **0 reguläre Schwachstellen**, **4 Wartungswarnungen** statt zuvor 6. Keine Ausnahmen oder Ignorierregeln.
- Der letzte Online-Lauf lieferte die RustSec-Befunde, meldete anschließend aber einen Timeout der separaten Registry-Prüfung auf zurückgezogene Crates. Der abschließende maschinenlesbare RustSec-Lauf verwendet deshalb die gerade aktualisierte Datenbank mit `--no-fetch --no-yanked`. Es werden keine Sicherheitsadvisories ausgeblendet; der Rückzugsstatus der Registry ist damit in diesem Abschlusslauf nicht erneut bestätigt.
- Der zusätzliche Hinweis **RUSTSEC-2024-0429 für glib 0.18.5** bleibt offen. Er betrifft einen Speicherfehler in einem Iterator des Linux-/GTK-Zweigs und gehört in dieselbe abgestimmte Plattformmigration. Er ist keine bloße Wartungswarnung. glib ist im geprüften Windows-Baum nicht enthalten. [RustSec](https://rustsec.org/advisories/RUSTSEC-2024-0429.html).
- Die npm-Abhängigkeiten wurden in diesem Schritt nicht geändert; für die vier moderaten Entwicklungsbefunde der WebdriverIO-Kette gilt weiterhin die vorherige Übersicht.

## Prüfungen

- Drei Codec-Golden-Tests erfolgreich: Original-bincode-2-Einzelstimme, Sammelstimmen-Datei, abgeschnittene/übermäßige Längen. Golden-Bytes wurden mit dem originalen bincode 2.0.1 außerhalb des App-Abhängigkeitsbaums erzeugt. Die alte Bibliothek ist keine Testabhängigkeit der App.
- Drei PDF-Regressionstests erfolgreich: komprimierte Seiten mit WinAnsi-Sonderzeichen und richtiger Reihenfolge, Unicode-CMap sowie beschädigte/inhaltlich leere Dokumente. Fixtures sind eigene kleine synthetische PDFs; keine fremden Schriftdateien oder Dokumente.
- `npm run check:rust`: Formatierung, Clippy mit `-D warnings` und **855 Rust-Tests erfolgreich**, 13 modell-/GPU-abhängige Bibliothekstests regulär ignoriert.
- Echte Kokoro-Synthese separat aktiviert: Rohstimmen mit mehreren Stimmen/Geschwindigkeiten sowie eine durch das ursprüngliche bincode 2.0.1 gepackte Sammelstimme erfolgreich. Die alten Modell-/Stimmdateien wurden nur gelesen; der gepackte Test liegt lokal unter `target/` und wird nicht ausgeliefert.
- `npm run e2e:build`: TypeScript, Produktionsbundle und Windows-App erfolgreich gebaut; neue PDF-Lizenzdatei im Build vorhanden.
- Desktop-Regressionen: `pdf-attachments`, `onnx-local` und `smoke` erfolgreich. Echte PDF-Anhänge über IPC importiert, gespeicherten Unicode-/Mehrseitentext und Fehlercodes geprüft. Die App synthetisiert auch mit der alten Sammelstimme; gleichzeitige ONNX-Initialisierung, Audio-Dekodierung und wiederholte VAD-Sessions bestehen weiterhin.
- Oxlint, Syntaxprüfung und Parität der beiden E2E-Skripte geprüft. Der neue PDF-Test ist Bestandteil der regulären Suite (**101 Szenarien**). Die vollständige Desktop-Suite und die unveränderten React-Unit-Tests wurden in diesem Backend-Schritt nicht erneut ausgeführt.

Lokale Protokolle liegen unter `target/unmaintained-*`. Quellcode und Golden-Tests der Kokoro-Portierung sowie Herkunft der synthetischen PDF-Fixtures sind im Repository dokumentiert.
