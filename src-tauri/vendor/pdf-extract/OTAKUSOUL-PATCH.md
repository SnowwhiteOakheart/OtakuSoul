# PDF-Extraktion mit gepflegtem Parser

Grundlage ist das veröffentlichte MIT-Crate `pdf-extract` **0.12.1**, Upstream https://github.com/jrmuizel/pdf-extract.
Commit laut `.cargo_vcs_info.json`: `47b792ba04c5f3b6e478072b2efb8e1a2a06ec7e`.
SHA-256 des originalen crates.io-Archivs: `e5c4820f5811e424ce037d08493ac87752ecc54339e0f1e40c3d17da93278861`.

Die veröffentlichte Version verlangt lopdf 0.42, das `ttf-parser` zwingend einbindet. Diese Kompatibilitätskopie verwendet **lopdf 0.47 ohne optionale Font-Einbettung**. Damit entfällt `ttf-parser`; der bestehende PDF-Extraktionsalgorithmus einschließlich Schrift-/CMap-Decodierung bleibt erhalten. Ein Wechsel auf eine einfachere Text-Extraktion findet nicht statt.

Gezielte Änderungen:

- `Cargo.toml`: lopdf auf 0.47 angehoben, ungenutzte Upstream-Entwicklungsabhängigkeiten entfernt.
- `src/lib.rs`: Seiteninhalt über `get_page_content_with_limit` mit dem aktuellen lopdf-Standardlimit lesen und Fehler weiterreichen. Die alte API liefert ab 0.44 keinen `Result` mehr; ein bloßes Entfernen von `unwrap()` würde Fehler bei der Dekomprimierung verschlucken.
- Veraltetes `std::f64::NAN` durch `f64::NAN` ersetzt. Bekannte Upstream-Stillints sind ausschließlich in dieser Fremdkopie erlaubt; die App wird unverändert mit `-D warnings` geprüft.
- Quellcode und README aus dem Crate übernommen; der nicht für die App benötigte Python-Generator ist nicht enthalten. Herkunfts-/Lizenzinformationen sind beigefügt, die MIT-Lizenz wird mit der App ausgeliefert.
- Einzelne nachgestellte Leerzeichen und eine überzählige Leerzeile am Manifestende entfernt (`git diff --check`); keine semantische Änderung.

Bei einer veröffentlichten Upstream-Version mit aktuellem lopdf wieder auf die Registry wechseln und diese Kopie entfernen. Regressionstests in `modules/attachments.rs` prüfen komprimierte mehrseitige PDFs, WinAnsi-Sonderzeichen, Unicode-CMaps, beschädigte Eingaben und Dokumente ohne extrahierbaren Text. Die PDF-Fixtures werden synthetisch erzeugt und enthalten keine fremden Dokumente.
