# Lokale Kokoro-Portierung

Grundlage: unverändertes veröffentlichtes Crate `kokoro-en` **0.1.5**, Apache-2.0.
Upstream: https://github.com/pguso/kokoro, Commit `b42bd5cf915163607cb51984cabf273dcf09755e` laut `.cargo_vcs_info.json`.
SHA-256 des originalen crates.io-Archivs: `1445ee0320264221395986e9d5c797883663d13329b6f48053bc21588e3651d1`.

Enthalten sind die tatsächlich eingebundenen Quellen unter `src/`, das benötigte CMU-Wörterbuch, `build.rs`, README und Lizenz. Nicht eingebundene Upstream-Dateien `src/g2p/v10.rs`, `src/g2p/v11.rs`, `src/transcription/zh.rs` sowie die ungenutzten Wörterbücher `dict/pinyin.dict` und `dict/espeak.dict` sind ausgelassen (zusammen etwa 9 MB). Die Moduldeklarationen und der Build verwenden diese Dateien nicht. Der tatsächlich kompilierte v1.1-Synthesepfad in `src/synthesizer.rs` bleibt enthalten. Modell- und Stimmgewichte sind nicht enthalten. Die CMU-Lizenz des Aussprachewörterbuchs ist zusätzlich in `dict/CMUDICT-LICENSE` beigefügt und wird mit der App ausgeliefert.

Änderungen gegenüber dem Crate:

- `Cargo.toml`: `ort` exakt auf `2.0.0-rc.15` angehoben; nicht mitkopierte Beispiele und deren ungenutzte `voxudio`-Entwicklungsabhängigkeit entfernt.
- `src/lib.rs`: neue Konstruktoren `new_with_environment` und `new_from_bytes_with_environment` nehmen die von der App verwaltete Umgebung entgegen. Auch der CPU-Fallback verwendet dieselbe Umgebung. Die bisherigen Konstruktoren erzeugen eine eigene Umgebung und sind nur für die alleinige Verwendung von Kokoro geeignet; die App nutzt ausschließlich den neuen Konstruktor, da rc.15 nur eine Umgebung pro Prozess zulässt. Upstream-Stillints von Clippy sind für dieses Fremdmodul erlaubt, damit die App weiterhin mit `-D warnings` geprüft wird, ohne unabhängige Upstream-Stiländerungen einzumischen.
- `src/synthesizer.rs`: besitzende `Tensor::from_array` statt geliehener `TensorRef` in beiden asynchronen Synthesepfaden. Das ist seit rc.15 vorgeschrieben und verhindert ungültige Eingabe-Lebenszeiten.

Providerwahl, CPU-Fallback, G2P, Wörterbücher und Stimmenformate bleiben erhalten. Die Windows-Prüfung deckt das tatsächlich eingesetzte v1.0-Modell mit mehreren Stimmen/Geschwindigkeiten ab; ein v1.1-Modell und macOS/Linux-Provider wurden nicht zur Laufzeit geprüft.

Wartung: Sobald Upstream eine kompatible Version veröffentlicht, gegen diese Änderungen vergleichen und auf die Registry-Abhängigkeit zurückwechseln. Dieses Verzeichnis ist eine gezielte Übergangslösung, kein unabhängig weiterentwickelter TTS-Fork. `README.md` beschreibt den ursprünglichen Upstream-Stand; diese Datei beschreibt die Abweichungen.
