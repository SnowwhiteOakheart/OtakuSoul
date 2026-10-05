# 🗺️ OtakuSoul – Roadmap (offen)

> Stand: 05.10.2026. Diese Datei sammelt alle **offenen** Punkte, `roadmap_abgeschlossen.md` alles Erledigte
> (Portierung Phasen 1–18, Verbesserungen, Sprachausgabe, Neutralisierung, optionale Inhalte, Qualität & Bedienung).
> Sie ersetzt `ROADMAP.md`, `ROADMAP_ABGESCHLOSSEN.md`, `Roadmap_abgeschlossen.md`, `Roadmap_TTS.md`,
> `Roadmap_rename.md`, `roadmap_chatgpt.md` und `roadmap_optional_content.md`.
>
> Offene Punkte sind Vorschläge, keine zugesagten Features. Erledigtes wird hier abgehakt und beim nächsten
> Aufräumen nach `roadmap_abgeschlossen.md` verschoben.

## 1. Verlässlichkeit von Chat und Daten

Aus den Arbeitsprotokollen der Qualitäts-Roadmap; größere Pakete, jeweils mit eigenen Tests.

- [ ] **Abgebrochene Antworten fortsetzen:** Eine per Stopp beendete Antwort gezielt an der Abbruchstelle weiterführen.
- [ ] **Dauerhafte Entwurfssicherung:** Entwürfe in Composer, Chat-Seitenleiste und Memory-Drawer überleben bisher
  Reiterwechsel, aber keinen Neustart der App.
- [ ] **Atomare Reflexion:** Die mehrstufige Memory-Reflexion speichert frühe Änderungen auch, wenn ein späterer Schritt
  scheitert (Hinweis auf den Snapshot ist vorhanden).
- [ ] **„Rückgängig“-Toast** bei destruktiven Aktionen statt nur Bestätigungsdialog.

## 2. Chat-Funktionen (aus der Portierung, noch nicht umgesetzt)

- [ ] **Chat-Erscheinungsbild** – Hintergrund pro Chat, Schrift, Blasenfarben.
- [ ] **Ambient-Sound pro Chat** mit Lautstärke (in der Stage bereits vorhanden: `useStageAmbient`).
- [ ] **Tool Calling im normalen Chat** – Websuche, Datum/Zeit, Rechner (der Companion kann es bereits).
- [ ] **Prompt-Log / Debug-Dump** des zuletzt gesendeten Prompts.
- [ ] **Sammel-Import** von Charakteren samt Live2D, Personas, Lorebooks, Szenen und Hintergründen aus einem Ordner
  (Port von SoWs `tools/import_character_cards.py`).

## 3. Lokale Modelle, Hardware & Laufzeiten

- [ ] **Apple Metal:** `recommendedMaxWorkingSetSize` statt des gesamten Arbeitsspeichers als GPU-Speicher.
- [ ] **Vision lokal auf echter Hardware testen** (Gemma/Qwen-VL mit passender `mmproj`, z. B. aus dem Modell-Hub).
- [ ] **Bildgenerierung parallel zum Chat auf 24 GB** testen (keine passende Karte vorhanden).
- [ ] **Laufzeit-Rollback:** llama.cpp/sd.cpp/CrispASR lassen sich aktualisieren, aber nicht auf den vorigen Build zurücksetzen.
- [ ] **Weitere Laufzeit-Backends** (HIP/ROCm, SYCL) neben CUDA, Vulkan, Metal und CPU – nur bei Bedarf.

## 4. Sprachausgabe (TTS)

- [ ] Chatterbox-Stimmklonen ohne Python (sobald CrispASR ein C++-Baking anbietet).
- [ ] Qwen3-TTS VoiceDesign (Stimme per Beschreibung, 1.7B-Modell).
- [ ] Streaming-Ausgabe (`stream: true`) für kürzere Latenz.
- [ ] Whisper-Spracherkennung ebenfalls über CrispASR (eine Laufzeit für STT und TTS).
- [ ] Fehlerberichte an CrispASR: F5-TTS extrem langsam (~13 s pro Diffusionsschritt, im Katalog „experimentell“),
  0.6B-Base-GGUF ohne Sprachtabelle, Standard-Stimmpaket passt nicht zu 1.7B.

## 5. Technik & Tests

- [ ] Command-Wrapper in `api.ts` typsicher erzeugen, sobald `tauri-specta` eine stabile 2.0 hat.
- [ ] Wackelige E2E-Tests beobachten: `chat-sidebar-errors` scheiterte einmal an einem Entwurfsvergleich,
  `character-import` einmal beim Aufräumen des Testordners (`ENOTEMPTY`); beide bestanden danach wiederholt.
- [ ] Xvfb für E2E auf diesem Rechner nicht installiert (`xvfb-run` fehlt); bei gesperrtem Desktop nötig (siehe AI.md).
