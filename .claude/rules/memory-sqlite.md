---
paths:
  - "src-tauri/src/modules/memory/**"
  - "src-tauri/src/modules/memory_pipeline/**"
  - "src-tauri/src/modules/device_sync.rs"
  - "src/components/memory/**"
  - "src/store/slices/memorySlice.ts"
  - "src/services/api/memory.ts"
---
# Kognitives Gedächtnis, SQLite & Sync
Lies bei Aufgaben in diesem Bereich [`docs/ai/memory-sqlite.md`](../../docs/ai/memory-sqlite.md).
- Reflexions-Ergebnisse zuerst komplett einholen und anschließend atomar in einer SQLite-Transaktion (`apply_reflection`) schreiben.
- FTS5 nutzt External Content (`soul_episodic_memory_fts`): nur `'delete'`-Kommandos verwenden und Schemaänderungen sauber über Migrationen führen.
