---
paths:
  - "src-tauri/src/modules/inference.rs"
  - "src-tauri/src/modules/providers.rs"
  - "src-tauri/src/modules/prompt_builder.rs"
  - "src-tauri/src/modules/context_window.rs"
  - "src-tauri/src/modules/chat_summary.rs"
  - "src-tauri/src/modules/attachments.rs"
  - "src/store/slices/chat/**"
  - "src/components/chat/**"
  - "src/services/api/chat.ts"
---
# Chat-Pipeline & Streaming
Lies bei Aufgaben in diesem Bereich [`docs/ai/chat-pipeline.md`](../../docs/ai/chat-pipeline.md).
- Neue Tauri-Commands in `generate_handler!` registrieren und im Frontend via `services/api/chat.ts` wrappen (`src/test/commandCheck.test.ts` prüft Namen und Pflichtargumente).
- Streaming-Abbrüche und Kontext-Neuberechnungen dürfen keine veralteten Zwischenstände zurückschreiben.
