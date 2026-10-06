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

## 3. Technik & Tests

- [ ] Umstieg auf erzeugte Command-Wrapper (`tauri-specta`), falls es eine stabile 2.0 gibt (bis dahin prüft
  `src/test/commandCheck.test.ts` die Aufrufe; Stand 06.10.2026: 2.0.0-rc.25).
- [ ] Wackeligen E2E-Test beobachten: `chat-sidebar-errors` scheiterte einmal an einem Entwurfsvergleich und bestand
  danach wiederholt.
