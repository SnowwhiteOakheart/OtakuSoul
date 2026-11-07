# Synthetische PDF-Fixtures

Eigene Testdaten, erzeugt durch `pdf_fixture` in `src-tauri/src/modules/attachments.rs`, keine fremden Dokumente oder Schriftdateien.

- `mehrseitig.pdf`: zwei komprimierte Seiten, WinAnsi-Sonderzeichen und vererbte Schrift-/Seiteneigenschaften.
- `unicode.pdf`: komprimierter Text und ToUnicode-CMap (`ABC` wird als `日本語` extrahiert).
- `ohne-text.pdf`: gültiges PDF ohne extrahierbaren Text; muss als leer zurückgewiesen werden.

Regenerieren: `OTAKUSOUL_PDF_TEST_OUTPUT` auf dieses Verzeichnis setzen und `cargo test --manifest-path src-tauri/Cargo.toml --lib modules::attachments::tests::pdf_` ausführen.
