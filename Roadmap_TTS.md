# OtakuSoul – Roadmap Sprachausgabe (TTS)

Ziel: Lokale, mehrsprachige Sprachausgabe (Deutsch, Englisch, Russisch …) ohne Python, mit optionalem Stimmklonen
aus einer eigenen Aufnahme. Grundlage ist die Recherche vom 30.09.2026.

**Veröffentlichung:** Das Repository wird öffentlich. Deshalb gilt:

- Standardmodelle haben freie Lizenzen (Apache-2.0/MIT) und dürfen auch kommerziell genutzt werden.
- Modelle mit Einschränkungen (z. B. F5-TTS, CC-BY-NC-4.0) sind **aus**, bis man sie in den Einstellungen ausdrücklich
  freischaltet, und tragen überall einen Hinweis „nur nicht-kommerziell“.
- Die App liefert keine Modelle mit, sondern lädt sie von den Originalquellen; die Lizenz steht in der Oberfläche.
- Stimmklonen nur mit Einwilligungsbestätigung; erzeugtes Audio wird gekennzeichnet (EU AI Act, Art. 50).

## Ist-Zustand

- Edge-TTS (online), Kokoro (lokal, ONNX in Rust, nur Englisch), ElevenLabs, OpenAI, RVC-Anschluss.
- Spracherkennung lokal mit Whisper (`whisper-rs`).
- Stimmklonen nur über ElevenLabs bzw. RVC.

## Reihenfolge

1. [x] **Laufzeit CrispASR** (MIT, C++/ggml, keine Python-Abhängigkeit) als vierte Laufzeitart in `modules/runtimes.rs`:
   Download des passenden Builds (Linux CUDA/Vulkan/HIP/CPU, Windows CUDA/Vulkan/CPU, macOS), SHA-256-Prüfung,
   Karte in den Spracheinstellungen. *(Download und Start aller vier CPU-Builds im Netzwerktest geprüft; die
   Download-Logik für Modelle ist jetzt gemeinsam in `modules/model_files.rs`, mit Test für Fortsetzen/Prüfsumme/Abbruch.)*
2. [x] **TTS-Modellkatalog** mit fortsetzbarem, geprüftem Download (gemeinsame Download-Logik mit den Bildmodellen):
   - Qwen3-TTS 0.6B Base (Apache-2.0, ~1 GB + Codec): Standard, 10 Sprachen, Stimmklonen aus WAV + Transkript.
   - Chatterbox Multilingual (MIT, ~0,9 GB): 23 Sprachen, eingebaute Stimme (Klonen braucht bisher ein Python-Skript).
   - Kokoro mit deutschem Modell (Apache-2.0): klein und schnell, feste Stimmen.
   - F5-TTS v1 (Gewichte CC-BY-NC-4.0): nur nach Freischaltung, mit Hinweis.
3. [x] **Lokaler TTS-Server:** `crispasr --server` wird von der App gestartet/gestoppt (wie `sd-server`),
   neue Engine „Lokal (CrispASR)“ in der Sprachausgabe über `POST /v1/audio/speech` (Sprache aus der Antwortsprache).
4. [x] **Stimmklonen pro Charakter:** Aufnahme hochladen oder aufnehmen (5–15 s), Transkript automatisch per Whisper,
   Pflicht-Häkchen „Ich habe die Rechte/Einwilligung“, Speicherung unter `voices/` im Datenordner, Auswahl im
   Stimmen-Dialog des Charakters. Die Einwilligung wird als `consent_attestation` mitgeschickt.
5. [x] **Kennzeichnung:** CrispASR setzt Wasserzeichen/C2PA; im UI ein Hinweis, dass Audio KI-generiert ist.
6. [x] **Freischaltung eingeschränkter Modelle:** Schalter „Nicht-kommerzielle Modelle erlauben“ (Standard: aus),
   Lizenzhinweis im Katalog, README-Abschnitt zu Modell-Lizenzen.
   *Umsetzung:* `modules/tts_local.rs` (Katalog, `crispasr --server` auf Port 48598, Synthese, geklonte Stimmen unter
   `voices/<id>.wav|.txt|.json`), Oberfläche `components/voice/LocalTtsSettings.tsx` im Stimmen-Dialog. Chatterbox
   läuft vorerst nur mit eingebauter Stimme; Kokoro-DE bringt vier deutsche Stimmen mit. Aufnahmen werden mit 16 kHz
   gespeichert (so liefert die vorhandene Aufnahmefunktion).
5a. [x] Gesprochener KI-Hinweis vor geklonten Stimmen ist einstellbar (Standard an); das Wasserzeichen bleibt immer an.
7. [ ] **VRAM:** TTS-Modelle im VRAM-Planer berücksichtigen (klein, meist parallel zum Chat-Modell).
   *Teilweise:* Beim Tausch für ein Bild wird auch `crispasr` gestoppt und startet beim nächsten Satz neu; gemessener
   freier VRAM (nvidia-smi) enthält ein geladenes Sprachmodell bereits. Offen: Schätzwert ohne Messung.
8. [ ] **Tests nachholen** (aufgeschoben, solange keine Modelle laufen sollen): Qwen3-TTS mit deutscher/russischer
   Ausgabe, Klon aus eigener Aufnahme, Chatterbox, Kokoro-DE, F5-TTS; Latenz und VRAM messen.

## Später / offen

- Chatterbox-Stimmklonen ohne Python (sobald CrispASR ein C++-Baking anbietet).
- Qwen3-TTS VoiceDesign (Stimme per Beschreibung, 1.7B-Modell).
- Streaming-Ausgabe (`stream: true`) für kürzere Latenz.
- Whisper-Spracherkennung ebenfalls über CrispASR (eine Laufzeit für STT und TTS).

## Quellen

- F5-TTS: https://github.com/SWivid/F5-TTS (Code MIT, Gewichte CC-BY-NC-4.0)
- CrispASR: https://github.com/CrispStrobe/CrispASR (MIT; TTS-Doku `docs/tts.md`, Server `docs/server.md`)
- Qwen3-TTS GGUF: https://huggingface.co/cstr/qwen3-tts-0.6b-base-GGUF (Apache-2.0)
- Chatterbox GGUF: https://huggingface.co/cstr/chatterbox-GGUF (MIT)
- EU AI Act, Kennzeichnung: CrispASR `docs/eu-ai-act.md`
