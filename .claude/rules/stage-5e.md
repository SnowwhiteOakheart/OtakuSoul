---
paths:
  - "src-tauri/src/modules/stage/**"
  - "crates/otakusoul-rules5e/**"
  - "src/components/stage/**"
  - "src/store/slices/stageSlice.ts"
  - "src/services/api/stage.ts"
---
# Stage & D&D 5e-Regeln
Lies bei Aufgaben in diesem Bereich [`docs/ai/stage-and-5e.md`](../../docs/ai/stage-and-5e.md).
- `crates/otakusoul-rules5e` wird von OtakuSoul-Android per UniFFI eingebunden: Feldnamen und JSON-Formen nicht ohne Rücksprache brechen (`npm run types:check` / `cargo test -p otakusoul-rules5e`).
- `golden5e_snapshot.json` wird byte-identisch verglichen – nur bei gewollter Verhaltensänderung mit `OTAKUSOUL_BLESS_GOLDEN=1` aktualisieren.
