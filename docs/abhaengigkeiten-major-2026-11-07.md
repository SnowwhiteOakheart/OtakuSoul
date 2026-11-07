# Größere Abhängigkeitsupdates vom 07.11.2026

Dieser Nachtrag ersetzt den zurückgestellten Status der unten genannten Pakete im [ersten Prüfbericht](abhaengigkeiten-2026-11-07.md).

## Rust und Entwicklungsumgebung

`rustup update stable` wurde ausgeführt. Die installierte Toolchain **Rust 1.99.1** ist bereits die aktuelle stabile Version; es gab keinen neueren Compiler zu installieren. Veraltet war die Projektangabe `rust-version = "1.88"`. Sie ist jetzt auf **1.99** angehoben und entspricht damit der geprüften Compiler-Linie. Die README-Dateien nennen denselben Stand.

Die Node-Anforderung ist in `package.json` und den READMEs festgehalten: **22.23.4+ innerhalb 22.x, 24.22.1+ innerhalb 24.x oder mindestens 26.12.1**. Das vorhandene Node 26.13.0 erfüllt sie. Die bestehenden Release-Jobs mit Node 22 beziehen weiterhin eine unterstützte aktuelle Version dieser Linie.

## Eingespielte Updates und Anpassungen

| Paket | Vorher | Jetzt | Anpassung |
|---|---|---|---|
| `three` | 0.186.1 | 0.187.0 | Zusammen mit den Typen angehoben; kein inkompatibler Aufruf im App-Renderer gefunden. Avatar-/Toon-Darstellung wird per E2E geprüft. |
| `@types/three` | 0.186.0 | 0.187.0 | Passend zur Three.js-Laufzeit; TypeScript-Prüfung erfolgreich. |
| `webdriverio` | 9.33.1 | 10.2.0 | Vier `executeAsync`-Aufrufe auf Promise-basiertes `execute` umgestellt. IPC-Erfolge und -Fehler bleiben bei den bisherigen Rückgabeformaten; der Lorebook-Test reicht Fehler jetzt direkt durch. Strenge Selektoren bleiben eingeschaltet. |
| `sysinfo` | 0.39.6 | 0.40.1 | Neue fehlerbehaftete System-/Laufwerksabfragen behandelt, direkte Laufwerksiteration statt `Disks::list`; Hostname-Fallback für Gerätesync erhalten. Companion-Werkzeuge reichen Initialisierungsfehler weiter, Hintergrund-Hardwareabfragen protokollieren sie und behalten den bestehenden Zahlen-/Fallback-Vertrag. |
| `parking_lot` | 0.12.5 | 0.13.0 | Direkte Abhängigkeit auf neue Linie angehoben. Die App nutzt reguläre Mutex-/RwLock-Zugriffe, keine entfernten rekursiven oder Raw-Lock-APIs. Indirekte 0.12er-Kopien anderer Bibliotheken bleiben unabhängig bestehen. |
| `rusqlite` | 0.40.2 | 0.41.1 | Gebündelte SQLite-Bibliothek aktualisiert. Keine Änderung am Anwendungsschema; vorhandene Datenbank-, FTS-, Snapshot- und Profil-Backup-Tests decken die Integration ab. |
| direkte `zip`-Abhängigkeit | 8.6.0 | 9.4.1 | Mit der bereits vorhandenen 9er-Linie vereinheitlicht. Fehler beim Lesen von Archivnamen werden im VRoid-Import zurückgegeben; EPUB-Test an fehlerbehaftete `name()`-API angepasst. |
| `x11rb` (Linux) | 0.13.2 | 0.14.0 | Verwendete X11-Aufrufe aus dem echten Linux-Modul separat gegen 0.14 kompiliert; keine API-Anpassung nötig. Windows-Build allein validiert dieses Linux-Modul nicht. |

Offizielle Änderungsgrundlagen: [Three.js-Migration](https://github.com/mrdoob/three.js/wiki/Migration-Guide), [WebdriverIO 10](https://webdriver.io/docs/v10-migration), [sysinfo](https://github.com/GuillaumeGomez/sysinfo/blob/main/CHANGELOG.md), [parking_lot](https://github.com/Amanieu/parking_lot/blob/master/CHANGELOG.md), [rusqlite](https://github.com/rusqlite/rusqlite/releases), [ZIP](https://github.com/zip-rs/zip2/blob/master/CHANGELOG.md), [x11rb](https://crates.io/crates/x11rb).

Bei der Sichtprüfung fiel zusätzlich ein bestehender Cache-Fehler des VRM-Viewers auf: Auf dem synchronen Cache-Pfad wurde der Ladevorgang gestartet, bevor die Variablen für Modellhöhe, Hüftposition und Beinlängen initialisiert waren. Er startet jetzt nach deren Initialisierung. Der Gestentest prüft zusätzlich die Abwesenheit einer VRM-Ladefehlermeldung; zuvor konnten seine Gesten-Assertions trotz sichtbarer Fehlermeldung bestehen.

Der strengere Inochi2D-Test deckte außerdem kollidierende React-Schlüssel bei benachbarten Puppen-/Pet-/VRoid-Einstellungen auf. Wiederholte Charakterzuweisungen konnten dadurch zusätzliche Kopien der Puppen-Einstellungen anlegen. Die Schlüssel haben jetzt unterschiedliche Präfixe; der Test verlangt nach dem Zuweisen und Entfernen genau einen Puppen-Einstellungsbereich.

Die E2E-Anpassungen behalten WebdriverIO 10s strenge Selektoren bei. Mehrdeutige Bedienelemente werden über ihren Dialog-/Sidebar-/Faktenbereich angesprochen; bei einer ausdrücklich gewünschten ersten Charakterkarte wird die Trefferliste verwendet. Alte Fehler-Toasts werden vor dem nächsten Fehlerversuch geschlossen, damit dessen Assertion eine neue Meldung prüft. Neuladen erfolgt über den WebDriver-Befehl `refresh`, statt ein Neuladen per JavaScript zu starten und möglicherweise noch das alte Dokument zu bedienen. Der Avatar-Manager-Test berücksichtigt außerdem die inzwischen vorhandene dritte Modellart Inochi2D.

`e2e:run` führt jetzt dieselben **100 Szenarien** wie `e2e` aus und lässt lediglich den Build weg. Zuvor fehlten dort sechs inzwischen ergänzte Tests. Der Linux-/X11-Schließtest meldet außerhalb von Linux ausdrücklich eine Überspringung. Ein Test der Fehlerfreigabe von Chat-Anfragen verwendet jetzt eine kontrollierte HTTP-503-Antwort statt eines vermeintlich sofort fehlschlagenden TCP-Ports; dadurch bleibt seine Vier-Sekunden-Prüfung unabhängig von Windows-Verbindungswiederholungen.

## Sicherheitsstand

Nach WebdriverIO 10.2.0 verbleiben laut npm **vier moderate betroffene Entwicklungspakete und keine hohen Befunde**. Es handelt sich um `webdriverio → archiver → readdir-glob → minimatch`; npm zählt auch weitergereichte Befunde an den Eltern. Der zugrunde liegende Hinweis betrifft [minimatch-DoS durch Glob-Verstärkung](https://github.com/advisories/GHSA-g3hv-75wg-m249).

`npm audit --omit=dev` meldet **keine Schwachstellen** in den Produktionsabhängigkeiten.

Der Audit-Resolver schlägt inzwischen einen Rücksprung auf WebdriverIO 9.31.9 vor. Dieser wurde nicht übernommen: Er würde die gewünschte Migration rückgängig machen. Ebenso wurde keine inkompatible minimatch-Hauptversion über einen globalen Override erzwungen. Die verbleibende Archivierungs-Abhängigkeit muss über einen kompatiblen Upstream-Fix bereinigt werden. Der erste Bericht hatte WebdriverIO 10 als vollständigen angebotenen Fix bezeichnet; die tatsächlich geprüfte Installation zeigt diese verbleibende Einschränkung.

## Bewusst verbleibende Grenzen

- **MMD 0.2:** weiterhin Beta; bisherige stabile Pakete 0.1.2 bleiben bestehen.
- **ONNX/Kokoro:** weiterhin `ort` rc.13. Eine Portierung oder ein Fork von Kokoro ist eine eigene Migration; ein neues Rust-Mindestniveau macht die inkompatible Session-API nicht kompatibel. Vor einem späteren Wechsel auf Rust 1.100 ist die bekannte `copy-dylibs`-Änderung von `ort` erneut zu prüfen.
- **zbus 6:** entfernt die verwendete blockierende API. Die größere Linux-/KWin-Migration ist nicht Teil der hier ausgewählten Updates mit hoher unmittelbarer Umsetzbarkeit.
- **Linux/macOS:** kein vollständiger Build oder Desktop-Test auf diesen Plattformen. WSL ist auf diesem Rechner nicht installiert. Der separate x11rb-Kompilierungstest prüft nur die konkret verwendete API, keine X11-/XWayland-Verbindung oder Pet-Interaktion.
- Exakt gepinnte indirekte Pakete wie `matchit`, `generic-array` und die alte GTK/GLib-TOML-Kette bleiben unter Kontrolle ihrer Elternbibliotheken; keine Overrides.

Die verbleibenden Update-Aussichten und Alternativen aus dem ersten Bericht gelten weiterhin für die nächsten drei Monate: **MMD mittel** für eine stabile Folgelinie; vorerst 0.1.2 behalten, Babylon-MMD wäre ein großer Rendererwechsel. **Kokoro niedrig bis mittel** für eine fertige kompatible Upstream-Version; eine kleine eigene Portierung mit echter Inferenzprüfung ist besser planbar, der vorhandene externe TTS-Server bleibt ein Ausweichweg. **zbus niedrig durch Abwarten, mittel bis hoch mit eigener Async-Migration** und KDE-Test; Tokio ist bereits vorhanden und gegenüber einem Wechsel auf libdbus vorzuziehen. Das sind qualitative technische Einschätzungen, keine statistischen Wahrscheinlichkeiten oder Release-Zusagen. Details und Primärquellen stehen im ersten Bericht.

## Prüfergebnisse

- `rustup update stable`: erfolgreich, Rust 1.99.1 bereits aktuell.
- `npm run check:web`: Oxlint, TypeScript und **805 Tests in 152 Dateien erfolgreich**.
- Separate Kompilierung der tatsächlich verwendeten X11-Aufrufe gegen x11rb 0.14.0: erfolgreich.
- `npm run check:rust`: Formatierung, Clippy mit `-D warnings` und **852 Rust-Tests erfolgreich**. Dazu gehören echte temporäre Datenbanken, FTS, Snapshots, Profil-Backup-Roundtrip sowie Ordner-/WebDAV-Sync. Bereits ignorierte GPU-/Modelltests blieben deaktiviert.
- `npm run e2e:build`: TypeScript, Produktionsbundle und Desktop-Binary erfolgreich gebaut.
- Desktop-E2E: Alle **100 Szenarien** ausgeführt, Fehler gezielt nach Anpassung wiederholt. Abschließender Stand über diese Läufe: **98 erfolgreich, 1 ausdrücklich übersprungen, 1 mit Befund**. Der übersprungene Schließtest benötigt Linux/X11. Der offene Kontrasttest meldet zehn Kombinationen aus Theme und Textstil bei Sammlungskarten in den fünf hellen Themes (Titel und „Sammlung“-Badge). Die Messung berücksichtigt darüberliegende Bild-/Gradientenflächen nicht vollständig; Badge-Farben und tatsächlicher Bildkontrast müssen separat geprüft werden. Der Befund wurde als A6 in die Roadmap aufgenommen. Es wird daher kein vollständig grüner E2E-Lauf behauptet.
- VRM-Gesten, MMD, glTF/Toon, Avatar-Manager und Inochi2D einschließlich Charakterzuweisung, Puppen-Einstellungen und Pet erfolgreich geprüft; relevante Screenshots visuell kontrolliert. Nach dem React-Schlüsselfix Web-Prüfung, Desktop-Build und die drei betroffenen Avatar-/Pet-Szenarien erneut erfolgreich.
- Zusätzliche IPC-Prüfung auf Windows: CPU-Kerne, RAM, freie Laufwerke, Prozessanzahl und Uptime liefern plausible positive Werte über die aktualisierte sysinfo-Integration.
- Lokale Prüfprotokolle: `target/major-web-check-final.log`, `target/major-rust-check.log`, `target/major-e2e-build-last.log`, `target/major-e2e-summary.json` und zugehörige Einzelprotokolle in `target/major-e2e-*`. Diese erzeugten Dateien werden nicht eingecheckt.
