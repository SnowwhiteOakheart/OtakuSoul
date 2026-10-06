# 🗺️ OtakuSoul – Roadmap (offen)

> Stand: 05.10.2026. Diese Datei sammelt alle **offenen** Punkte, `roadmap_abgeschlossen.md` alles Erledigte
> (Portierung Phasen 1–18, Verbesserungen, Sprachausgabe, Neutralisierung, optionale Inhalte, Qualität & Bedienung).
> Sie ersetzt `ROADMAP.md`, `ROADMAP_ABGESCHLOSSEN.md`, `Roadmap_abgeschlossen.md`, `Roadmap_TTS.md`,
> `Roadmap_rename.md`, `roadmap_chatgpt.md` und `roadmap_optional_content.md`.
>
> Offene Punkte sind Vorschläge, keine zugesagten Features. Erledigtes wird hier abgehakt und beim nächsten
> Aufräumen nach `roadmap_abgeschlossen.md` verschoben.

## 1. Lokale Modelle, Hardware & Laufzeiten

- [ ] **Apple Metal:** `recommendedMaxWorkingSetSize` statt des gesamten Arbeitsspeichers als GPU-Speicher.
- [ ] **Vision lokal auf echter Hardware testen** (Gemma/Qwen-VL mit passender `mmproj`, z. B. aus dem Modell-Hub).
- [ ] **Bildgenerierung parallel zum Chat auf 24 GB** testen (keine passende Karte vorhanden).
- [ ] **Weitere Laufzeit-Backends** (HIP/ROCm, SYCL) neben CUDA, Vulkan, Metal und CPU – nur bei Bedarf.

## 2. Sprachausgabe (TTS)

- [ ] Chatterbox-Stimmklonen ohne Python (sobald CrispASR ein C++-Baking anbietet).
- [ ] Streaming-Ausgabe (`stream: true`) für kürzere Latenz.
- [ ] Whisper-Spracherkennung ebenfalls über CrispASR (eine Laufzeit für STT und TTS).

## 3. Technik & Tests

- [ ] Command-Wrapper in `api.ts` typsicher erzeugen, sobald `tauri-specta` eine stabile 2.0 hat.
- [ ] Wackeligen E2E-Test beobachten: `chat-sidebar-errors` scheiterte einmal an einem Entwurfsvergleich und bestand
  danach wiederholt.
