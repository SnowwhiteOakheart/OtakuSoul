---
paths:
  - "src-tauri/src/modules/voice/**"
  - "src-tauri/src/modules/tts_local/**"
  - "src-tauri/src/modules/runtimes.rs"
  - "src-tauri/src/modules/llama_manager.rs"
  - "src-tauri/src/modules/local_image.rs"
  - "src-tauri/src/modules/hardware.rs"
  - "src/services/api/voice.ts"
---
# Hardware, lokale Server & Audio/TTS
Lies bei Aufgaben in diesem Bereich [`docs/ai/hardware-models-audio.md`](../../docs/ai/hardware-models-audio.md).
- Pfade ausschließlich über `paths::base_dirs()` auflösen (`$OTAKUSOUL_HOME`); Kindprozesse mit `kill_on_drop(true)` (und Linux `PR_SET_PDEATHSIG`) absichern.
- Modell-/Runtime-Downloads über Quelle + SHA-256 prüfen; Lizenzkennzeichnung (`license_kind`) und TTS-Freischaltregeln wahren.
