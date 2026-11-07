# Abhängigkeiten: Update und verbleibende Migrationen

Stand: 07.11.2026. Geprüft wurden alle **37 direkten npm- und 54 direkten Rust-Abhängigkeiten**, einschließlich Entwicklungs-, Build- und plattformspezifischer Pakete. Grundlage sind die offiziellen npm-/crates.io-Metadaten, die tatsächlichen Lockfiles und die unten verlinkten Release- bzw. Migrationshinweise. Zusätzlich wurden kompatible indirekte Abhängigkeiten aktualisiert und verbliebene Resolver-Sperren untersucht.

**Eingespielt: 12 direkte npm-Updates und 22 Rust-Paketupdates**, dazu die dadurch aufgelösten indirekten npm-Änderungen. Bei Rust ist `flate2` direkt; die übrigen 21 Updates betreffen indirekte Pakete. Es wurden keine Vorschauversionen neu eingeführt und keine Resolver-Sperren mit Overrides umgangen. Bereits vorhandene Release Candidates von `ort` bleiben unverändert.

`jsdom` wurde von 30.1.3 auf 31.0.0 angehoben: Der dokumentierte Wechsel des optionalen Canvas-Backends betrifft dieses Projekt nicht. Ein bestehender Porträt-Test musste die CSSOM-Normalisierung von `0.000%` zu `0%` akzeptieren; die Assertion prüft weiterhin die unveränderte Ruheposition einschließlich Skalierung. [jsdom-Releasehinweise](https://github.com/jsdom/jsdom/releases).

## Was noch zurückgestellt ist und warum

„Neueste Version nicht eingesetzt“ bedeutet nicht automatisch „Upstream verhindert das Update“. Die folgenden Einträge unterscheiden konkrete Inkompatibilitäten von bewusst zurückgestellten Migrationen. Die Einschätzungen gelten für die nächsten **drei Monate bis Anfang Februar 2027**. Sie sind technische Einschätzungen anhand der veröffentlichten Änderungen, keine statistisch berechneten Wahrscheinlichkeiten oder zugesagten Veröffentlichungstermine. „Mit Migration hoch“ setzt voraus, dass wir die Arbeit einplanen und die genannten Tests durchführen.

| Paket | Aktuell → neueste | Konkrete Hürde / Entscheidung | Aussicht und nächster Schritt |
|---|---|---|---|
| `three` + `@types/three` | 0.186.1 / 0.186.0 → 0.187.0 | r187 ändert PMREM, Materialdarstellung und Viewport-/Scissor-Verhalten bei Renderzielen. Die App nutzt `PMREMGenerator` in `avatarStage.ts`; reine Typchecks sichern das Bild nicht ab. Keine nachgewiesene Peer-Sperre durch VRM/MMD. | **Hoch mit gezielter Renderprüfung**, kein Warten auf einen neuen Upstream-Release nötig. Gemeinsam anheben und VRM, GLB, MMD, Outlines und Pet auf Windows/Linux vergleichen. Kein sinnvoller Bibliothekswechsel. [Migration](https://github.com/mrdoob/three.js/wiki/Migration-Guide). |
| `@moeru/three-mmd` + Springbone | 0.1.2 → 0.2.0-beta.2 | npm `latest` zeigt auf eine Beta vom 05.09.2026. Die neue Linie ändert unter anderem IK-/Physik-Reihenfolge; die App hat hierfür eine eigene Integrationsreihenfolge. | **Mittel** für eine stabile, ohne größere Änderungen nutzbare Folgelinie; kein stabiler Termin belegt. Gemeinsam migrieren und VMD, Morphs, IK sowie Physik prüfen. Bis dahin bleibt die neueste stabile 0.1.2 sinnvoll. [Releases](https://github.com/moeru-ai/three-mmd/releases). |
| `webdriverio` | 9.33.1 → 10.2.0 | v10 entfernt `executeAsync`; vier Aufrufstellen in unseren E2E-Skripten verwenden es. Zusätzlich gelten strengere Einzelselektoren und höhere Node-Mindestversionen. Das lokale Node 26.13.0 erfüllt die neue Vorgabe. | **Hoch mit Migration**, **niedrig durch bloßes Abwarten**: entfernte APIs kommen voraussichtlich nicht zurück. Die vier Aufrufe auf asynchrones `execute` umstellen, Selektoren prüfen und E2E-Suite ausführen. Wegen der Audit-Befunde zuerst angehen. [Migrationsanleitung](https://webdriver.io/docs/v10-migration). |
| `sysinfo` | 0.39.6 → 0.40.1 | 0.40 entfernt `Disks::list`; `hardware.rs` ruft es noch auf. Weitere API-Änderungen betreffen Betriebssystemdaten. | **Hoch mit kleiner Migration** auf Iteration über `Disks`, anschließend Laufwerks-/Hardwareprüfung auf den Zielsystemen. Kein Bibliothekswechsel erforderlich. [Changelog](https://github.com/GuillaumeGomez/sysinfo/blob/main/CHANGELOG.md). |
| `parking_lot` | 0.12.5 → 0.13.0 | Rust mindestens 1.95; neue `lock_api`-Typen und geänderte Fairness-/Rekursionsregeln. Lokales Rust 1.99.1 reicht, aber der Projektvertrag nennt noch 1.88. Daher kein unkritisches Update allein aufgrund eines erfolgreichen lokalen Builds. | **Niedrig ohne bewusste Anpassung**, **hoch nach Toolchain-/Synchronisationsprüfung**. Empfehlung: Mindestversionen bereinigen, dann migrieren; ein Fork ist unnötig. [Changelog](https://github.com/Amanieu/parking_lot/blob/master/CHANGELOG.md). |
| `rusqlite` | 0.40.2 → 0.41.1 | Neue inkompatible Linie mit geändertem Spalten-Metadaten-API, PRAGMA-Prüfung und gebündeltem SQLite 3.54.0. Die Registry nennt Rust 1.89. Ein konkreter Compilerfehler der App wurde nicht behauptet oder durch einen Testupgrade nachgewiesen; zurückgestellt wegen des zentralen Datenbank-/Backup-Pfads. | **Hoch mit gezielter Validierung**: temporäre Datenbank, Migrationen, FTS, Snapshots, Profil-Backup und Rückkehr zur alten App-Version prüfen. Kein Upstream-Blocker und kein Anlass, den Datenbank-Stack zu ersetzen. [Releases](https://github.com/rusqlite/rusqlite/releases). |
| direkte `zip`-Abhängigkeit | 8.6.0 → 9.4.1 | Neue Hauptversion mit Umbauten am Archiv-/Extraktionsverhalten. Die App verwendet ZIP für Profil-Backups, Avatar-/Live2D-Import und Exporte; deshalb nicht ohne entsprechende Archiv- und Wiederherstellungstests angehoben. Die separate indirekte 9er-Kopie wurde bereits auf 9.4.1 aktualisiert. | **Hoch mit Archivtests**, kein Warten auf Upstream nötig. Beschädigte Archive, Pfadtraversal, Symlinks und Backup-Roundtrip prüfen. [Changelog](https://github.com/zip-rs/zip2/blob/master/CHANGELOG.md). |
| `ort` / `ort-sys` | rc.13 → rc.15 | Projekt pinnt `ort` exakt auf rc.13. Ab rc.14 verlangt `Session::builder` eine explizite `Environment`; der veröffentlichte Kokoro-Code verwendet noch die frühere API. Einfach den Pin zu entfernen würde auch Kokoro auf die inkompatible API auflösen. Neue Runtime-Binaries und Rust mindestens 1.92 kommen hinzu. | **Niedrig bis mittel für ein fertiges kompatibles Kokoro-Release in drei Monaten**: letztes Crate-Release 0.1.5 vom 04.08., der aktuell eingesehene Upstream-Manifeststand verwendet weiterhin die ältere API-Linie; kein verbindlicher Migrationstermin gefunden. Mit eigener kleiner Kokoro-Portierung technisch deutlich besser planbar, anschließend echte TTS-/Porträt-Inferenz und Provider prüfen. [ort-Releases](https://github.com/pykeio/ort/releases), [Kokoro-Manifest](https://github.com/pguso/kokoro/blob/main/Cargo.toml). |
| `x11rb` (Linux) | 0.13.2 → 0.14.0 | Inkompatible Versionslinie. Linux-spezifische Desktop-Fenster-/Mausintegration lässt sich auf diesem Windows-System nicht validieren; kein konkreter API-Fehler nachgewiesen. | **Hoch mit Linux-Prüfplatz**, derzeit bewusst zurückgestellt. X11 und XWayland einschließlich Pet-Auflageflächen testen. Die 0.13er-Kopien anderer Bibliotheken sind davon unabhängig. [Upstream](https://github.com/psychon/x11rb), [Registry](https://crates.io/crates/x11rb). |
| `zbus` (Linux) | 5.19.0 → 6.2.1 | v6 entfernt die gesamte `blocking`-API. `desktop_windows.rs` und `kwin_bridge.rs` verwenden `zbus::blocking::Connection` und blockierende Proxys; ein Versionswechsel allein ist inkompatibel. | **Niedrig ohne Umbau**, **mittel bis hoch mit geplanter Async-Migration und KDE-Test**. Warten auf einen Patch löst die bewusst entfernte API voraussichtlich nicht. Beste Route ist v6 mit dem bereits vorhandenen Tokio. [Changelog](https://github.com/z-galaxy/zbus/blob/main/zbus/CHANGELOG.md). |

## Alternativen bei geringer Aussicht auf ein einfaches Update

| Bereich | Realistische Alternative | Nutzen und Kosten | Empfehlung |
|---|---|---|---|
| Kokoro / ONNX | Kleiner gepflegter Kokoro-Fork bzw. Upstream-Beitrag mit expliziter `Environment` | Erhält Modelle, Stimmen und bisherige Integration; wir übernehmen bis zur Upstream-Übernahme Wartung und müssen reale Inferenz testen. | **Erste Wahl**, falls zeitnah Rust 1.100 oder neue Runtime-Provider gebraucht werden. `ort` warnt ausdrücklich vor `copy-dylibs` alter Versionen unter Rust 1.100. |
| Kokoro / ONNX | Bereits vorhandene lokale TTS über den externen Server; für ONNX-Porträts separat `tract` prüfen | Externe TTS entkoppelt die App von Kokoros Rust-API, ersetzt aber nicht die ONNX-Porträt-Inferenz. `tract` bietet ONNX-Inferenz in Rust; Modelloperatoren, Laufzeit und Beschleunigung sind vor einem Wechsel zu messen. Kein geprüfter direkter Ersatz. | Bestehende TTS als Ausweichweg nutzen; **keinen vorschnellen Komplettwechsel** der Inferenz. [tract](https://github.com/sonos/tract). |
| D-Bus / zbus | `dbus` mit blockierender API | Unterstützt synchrone Aufrufe, führt aber `libdbus`-FFI und neue Integrations-/Paketierungsarbeit ein; KWin-Schnittstelle muss dennoch portiert werden. | **Tokio-Migration von zbus bevorzugen**. `dbus` nur wählen, wenn synchrone Aufrufe ein festes Architekturziel sind. [API](https://docs.rs/dbus/latest/dbus/). |
| Synchronisation | `std::sync::{Mutex, RwLock}` | Keine zusätzliche direkte Bibliothek; Poisoning und Fehlerbehandlung unterscheiden sich, Performance muss am Nutzungspfad geprüft werden. Entfernt ältere indirekte `parking_lot`-Kopien nicht automatisch. | Nur bei bewusstem Abbau von Abhängigkeiten; **Toolchain bereinigen und parking_lot migrieren ist kleiner**. [Standardbibliothek](https://doc.rust-lang.org/std/sync/index.html). |
| MMD, falls die Beta-Linie länger ohne stabile Freigabe bleibt | `babylon-mmd` auf Babylon.js | Dedizierter MMD-Loader und Runtime; braucht einen anderen Renderer und neue Anbindung für Gesten, Outlines, Kamera und Pet. Kein austauschbares Three.js-Paket. | **Reserveoption mit hohem Aufwand**, momentan 0.1.2 beibehalten. [Projekt](https://github.com/noname0310/babylon-mmd). |

## Indirekte Versionssperren

Diese Unterschiede lassen sich nicht durch ein reguläres `cargo update` aufheben:

- **`matchit` 0.8.4 statt 0.8.6:** `axum` 0.8.9 verlangt exakt `=0.8.4`. Aktualisierung des Elternpakets abwarten bzw. separat dessen Kompatibilität prüfen. Aussicht auf kurzfristige Freigabe **unbekannt**; kein belastbarer Termin. Ein Ersatz des Webservers wäre unverhältnismäßig.
- **`generic-array` 0.14.7 statt 0.14.9:** `crypto-common` 0.1.7 verlangt exakt `=0.14.7`. Ein gezielter Dry-run auf 0.14.9 scheitert am Resolver. Alte Crypto-Linien stammen unter anderem aus SHA-1/PDF-/Tauri-Abhängigkeiten. Aussicht auf bloßes automatisches Nachziehen **eher gering**; über Elternpakete migrieren, kein eigener Crypto-Fork.
- **`toml` 0.8.2 / `toml_datetime` 0.6.3 / `toml_edit` 0.20.2:** Linux-GTK/GLib-Buildkette; `proc-macro-crate` 2.0.2 pinnt die alten TOML-Komponenten. Ein gezielter Dry-run auf `toml` 0.8.23 scheitert am exakten `toml_datetime =0.6.3`. Größere aktuelle TOML-Linien existieren gleichzeitig und wurden regulär aktualisiert. Aussicht auf Auflösung ohne Aktualisierung der GTK/GLib-Eltern **gering**. Tauri-/GTK-Kette verfolgen, keine globalen Overrides.

Die konkreten Pins wurden in den heruntergeladenen offiziellen Crate-Manifesten und mit `cargo tree --target all` geprüft. Alte Hauptversionen im Baum sind nicht generell Fehler: mehrere Eltern können legitimerweise unterschiedliche API-Linien benötigen.

## Sicherheit und Priorität

Nach den Updates meldet `npm audit` **14 betroffene Pakete: 10 hoch, 4 moderat**, alle im Entwicklungszweig um WebdriverIO 9. Das sind inklusive weitergereichter Befunde gezählte Pakete, nicht 14 unabhängige Sicherheitslücken. Betroffen sind unter anderem Archivextraktion, Proxy-/FTP-Hilfen und Glob-Verarbeitung. Der von npm angebotene vollständige Fix erfordert WebdriverIO 10.2.0. Die Befunde wurden nicht mit einem Major-Override versteckt. Beispiele: [extract-zip](https://github.com/advisories/GHSA-jmr9-qjv8-65gv), [basic-ftp](https://github.com/advisories/GHSA-c475-qrg2-pj4r).

`npm audit --omit=dev` meldet **0 bekannte Befunde**. Das ist eine Aussage über die npm-Audit-Datenbank und kein Nachweis vollständiger Sicherheit. Ein RustSec-Audit wurde nicht ausgeführt, da `cargo-audit` nicht installiert ist.

Empfohlene Reihenfolge: **WebdriverIO 10 → ONNX/Kokoro vor Rust 1.100 → sysinfo/Toolchain-Vertrag → ZIP/SQLite mit Daten-Roundtrips → Three.js/MMD mit Rendervergleich → zbus/x11rb auf Linux.**

Zusätzlicher bestehender Befund: `src-tauri/Cargo.toml` nennt Rust 1.88, während schon der bisherige `sysinfo`-Stand 1.95 und `tauri-build` 2.7.4 laut Registry 1.90 voraussetzen. Dieses Update erhöht die deklarierte Mindestversion nicht stillschweigend. Der Toolchain-Vertrag sollte separat auf einen tatsächlich testbaren Stand gebracht werden.

Die von der App nachgeladenen Modellserver sind separat zu betrachten: `runtimes.rs` löst llama.cpp über den aktuellen stabilen Release und dessen Build-Tag auf; weitere Server haben eigene Release-/Prüfsummenlogik. Persönlich installierte Runtimes und Modellgewichte wurden nicht ersetzt. Tauri-3-Alphas sind ebenfalls kein Ziel dieses konservativen Updates; die vorhandene Tauri-2-Linie ist aktuell.

## Validierung

- `npm run check:web`: Oxlint, TypeScript und **805 Tests in 152 Dateien erfolgreich**, einschließlich jsdom 31 und der angepassten CSSOM-Assertion.
- `npm run build`: erfolgreich. Vite meldet bestehende gemischte statische/dynamische Imports und Plugin-Timing-Hinweise.
- `npm run check:rust`: Formatierung und Clippy mit `-D warnings` erfolgreich; **852 Rust-Tests erfolgreich**. Die bereits als ignoriert markierten GPU-/Modelltests wurden nicht aktiviert.
- `npm run e2e:build`: Desktop-App erfolgreich gebaut. Rauchtest vollständig bestanden, sowohl mit ergänzter Browserdiagnose als auch anschließend mit dem unveränderten `e2e/smoke.mjs` (je 10 Chat-Anfragen und 2 Zusammenfassungen); Screenshots von Zusammenfassungs-Editor und Stage angesehen. Der erste Lauf scheiterte an einem 20-Sekunden-Timeout des Zusammenfassungs-Editors. Die Ursache ist nicht abschließend geklärt; in beiden Wiederholungen trat er nicht auf. Daher kein behaupteter Nachweis, dass dieser Fehler schon vor den Updates bestand. Die vollständige E2E-Suite wurde nicht ausgeführt.
- Plattform: Windows x86_64, Node 26.13.0, npm 12.2.1, Rust/Cargo 1.99.1. Linux/macOS und echte GPU-Inferenz wurden nicht getestet.

## Eingespielte npm-Updates

Die Versionsgrenzen im Manifest wurden auf den geprüften Stand angehoben. Bereits aktuelle Pakete mit älterer Mindestgrenze wurden ebenfalls abgeglichen.

| Paket | Lockfile vorher | Lockfile jetzt |
|---|---|---|
| @tailwindcss/vite | 4.3.3 | 4.3.5 |
| @tanstack/react-virtual | 3.14.25 | 3.14.26 |
| lucide-react | 1.66.0 | 1.70.0 |
| tailwindcss | 4.3.3 | 4.3.5 |
| zustand | 5.0.16 | 5.1.0 |
| @vitejs/plugin-react | 6.1.2 | 6.2.1 |
| jsdom | 30.1.3 | 31.0.0 |
| oxlint | 1.90.0 | 1.92.0 |
| rollup-plugin-visualizer | 7.1.1 | 7.1.2 |
| vite | 8.3.5 | 8.3.6 |
| vitest | 5.0.5 | 5.1.0 |
| webdriverio | 9.32.0 | 9.33.1 |

## Eingespielte Rust-Updates

Kompatible Auflösung innerhalb der bestehenden Cargo-Vorgaben; Manifest unverändert.

| Crate | Vorher | Jetzt |
|---|---|---|
| aes | 0.9.3 | 0.9.4 |
| async-executor | 1.14.0 | 1.14.1 |
| async-lock | 3.4.2 | 3.5.0 |
| brotli-decompressor | 6.2.0 | 6.3.0 |
| cc | 1.10.0 | 1.11.1 |
| ctutils | 0.4.7 | 0.4.8 |
| flate2 | 1.1.10 | 1.1.11 |
| jiff | 0.2.38 | 0.2.39 |
| jiff-core | 0.1.1 | 0.1.2 |
| jiff-static | 0.2.38 | 0.2.39 |
| mime | 0.3.17 | 0.3.18 |
| serde_spanned | 1.1.2 | 1.1.3 |
| smallvec | 1.16.4 | 1.16.5 |
| toml | 1.1.8+spec-1.1.0 | 1.2.1+spec-1.1.0 |
| toml_datetime | 1.1.2+spec-1.1.0 | 1.1.3+spec-1.1.0 |
| toml_edit | 0.25.17+spec-1.1.0 | 0.25.19+spec-1.1.0 |
| toml_writer | 1.1.3+spec-1.1.0 | 1.2.0+spec-1.1.0 |
| ureq | 3.5.0 | 3.5.1 |
| ureq-proto | 0.6.5 | 0.7.1 |
| uuid | 1.29.0 | 1.29.1 |
| winnow | 1.0.4 | 1.0.5 |
| zip | 9.2.1 | 9.4.1 |

## Vollständiger Stand der direkten npm-Abhängigkeiten

Registry-Abfrage am 07.11.2026; „neueste“ bezeichnet den npm-Tag `latest`, der bei MMD eine Beta enthält. Quellen: offizielle [npm-Registry](https://registry.npmjs.org/), je Paket über dessen Metadaten abrufbar.

| Paket | Installiert | Neueste |
|---|---|---|
| @moeru/three-mmd | 0.1.2 | 0.2.0-beta.2 |
| @moeru/three-mmd-physics-springbone | 0.1.2 | 0.2.0-beta.2 |
| @pixi/sound | 6.0.2 | 6.0.2 |
| @pixiv/three-vrm | 3.5.5 | 3.5.5 |
| @pixiv/three-vrm-animation | 3.5.5 | 3.5.5 |
| @tailwindcss/vite | 4.3.5 | 4.3.5 |
| @tanstack/react-virtual | 3.14.26 | 3.14.26 |
| @tauri-apps/api | 2.12.4 | 2.12.4 |
| @tauri-apps/plugin-dialog | 2.8.4 | 2.8.4 |
| @tauri-apps/plugin-notification | 2.8.0 | 2.8.0 |
| @tauri-apps/plugin-opener | 2.7.2 | 2.7.2 |
| @tauri-apps/plugin-process | 2.4.0 | 2.4.0 |
| @tauri-apps/plugin-updater | 2.14.1 | 2.14.1 |
| lucide-react | 1.70.0 | 1.70.0 |
| pixi.js | 8.22.0 | 8.22.0 |
| react | 19.3.1 | 19.3.1 |
| react-dom | 19.3.1 | 19.3.1 |
| tailwindcss | 4.3.5 | 4.3.5 |
| three | 0.186.1 | 0.187.0 |
| untitled-pixi-live2d-engine | 1.4.0 | 1.4.0 |
| zustand | 5.1.0 | 5.1.0 |
| @tauri-apps/cli | 2.12.4 | 2.12.4 |
| @testing-library/dom | 10.4.2 | 10.4.2 |
| @testing-library/jest-dom | 7.0.1 | 7.0.1 |
| @testing-library/react | 16.3.3 | 16.3.3 |
| @testing-library/user-event | 14.6.8 | 14.6.8 |
| @types/react | 19.3.0 | 19.3.0 |
| @types/react-dom | 19.3.0 | 19.3.0 |
| @types/three | 0.186.0 | 0.187.0 |
| @vitejs/plugin-react | 6.2.1 | 6.2.1 |
| jsdom | 31.0.0 | 31.0.0 |
| oxlint | 1.92.0 | 1.92.0 |
| rollup-plugin-visualizer | 7.1.2 | 7.1.2 |
| typescript | 7.0.2 | 7.0.2 |
| vite | 8.3.6 | 8.3.6 |
| vitest | 5.1.0 | 5.1.0 |
| webdriverio | 9.33.1 | 10.2.0 |

## Vollständiger Stand der direkten Rust-Abhängigkeiten

Einschließlich Build- und plattformspezifischer Abhängigkeiten. Version aus der Cargo-Auflösung, nicht bloß aus der Mindestvorgabe. Quelle: [crates.io-API](https://crates.io/data-access), `/api/v1/crates/<name>`. Bei `ort` ist auch die neueste verfügbare Version ein Release Candidate.

| Crate | Aufgelöst | Neueste stabile / verfügbare Version |
|---|---|---|
| tauri-build | 2.7.4 | 2.7.4 |
| flate2 | 1.1.11 | 1.1.11 |
| tar | 0.4.46 | 0.4.46 |
| ts-rs | 12.0.1 | 12.0.1 |
| parking_lot | 0.12.5 | 0.13.0 |
| tauri | 2.12.5 | 2.12.5 |
| tauri-plugin-opener | 2.7.2 | 2.7.2 |
| tauri-plugin-process | 2.4.0 | 2.4.0 |
| tauri-plugin-dialog | 2.8.4 | 2.8.4 |
| crc32fast | 1.5.4 | 1.5.4 |
| serde | 1.0.229 | 1.0.229 |
| serde_json | 1.0.154 | 1.0.154 |
| tokio | 1.54.1 | 1.54.1 |
| reqwest | 0.13.5 | 0.13.5 |
| futures-util | 0.3.34 | 0.3.34 |
| sysinfo | 0.39.6 | 0.40.1 |
| directories | 6.0.0 | 6.0.0 |
| rusqlite | 0.40.2 | 0.41.1 |
| tracing | 0.1.44 | 0.1.44 |
| tracing-subscriber | 0.3.23 | 0.3.23 |
| rand | 0.10.3 | 0.10.3 |
| base64 | 0.23.1 | 0.23.1 |
| png | 0.18.1 | 0.18.1 |
| urlencoding | 2.1.3 | 2.1.3 |
| regex | 1.13.1 | 1.13.1 |
| chrono | 0.4.45 | 0.4.45 |
| sha2 | 0.11.1 | 0.11.1 |
| ring | 0.17.14 | 0.17.14 |
| tokio-tungstenite | 0.30.0 | 0.30.0 |
| hound | 3.5.1 | 3.5.1 |
| kokoro-en | 0.1.5 | 0.1.5 |
| encoding_rs | 0.8.44 | 0.8.44 |
| zip | 8.6.0 | 9.4.1 |
| image | 0.25.10 | 0.25.10 |
| ort | 2.0.0-rc.13 | 2.0.0-rc.15 |
| ndarray | 0.17.2 | 0.17.2 |
| arboard | 3.7.0 | 3.7.0 |
| xcap | 0.9.8 | 0.9.8 |
| axum | 0.8.9 | 0.8.9 |
| qrcode | 0.14.1 | 0.14.1 |
| keyring | 4.2.0 | 4.2.0 |
| ash | 0.38.0+1.3.281 | 0.38.0+1.3.281 |
| pdf-extract | 0.12.1 | 0.12.1 |
| tauri-plugin-notification | 2.8.0 | 2.8.0 |
| tauri-plugin-single-instance | 2.5.5 | 2.5.5 |
| tauri-plugin-window-state | 2.5.0 | 2.5.0 |
| tauri-plugin-updater | 2.14.1 | 2.14.1 |
| tauri-plugin-global-shortcut | 2.4.1 | 2.4.1 |
| whisper-rs | 0.16.0 | 0.16.0 |
| libc | 0.2.191 | 0.2.191 |
| x11rb | 0.13.2 | 0.14.0 |
| zbus | 5.19.0 | 6.2.1 |
| tauri-winrt-notification | 0.8.1 | 0.8.1 |
| windows | 0.62.2 | 0.62.2 |
