# 🗺️ OtakuSoul – Roadmap (offen)

> Stand: 17.10.2026. Diese Datei ist die **einzige** Liste offener Punkte; `roadmap_abgeschlossen.md` (nur lokal, nicht im
> Repository) enthält alles Erledigte (Portierung Phasen 1–18, Verbesserungen, Sprachausgabe, Neutralisierung, optionale Inhalte, Qualität &
> Bedienung, 5e-Regeln, 3D-Figuren aus Spielen, Bedienbarkeit & Story-Einstieg). Sie ersetzt `ROADMAP.md`,
> `ROADMAP_ABGESCHLOSSEN.md`, `Roadmap_abgeschlossen.md`, `Roadmap_TTS.md`, `Roadmap_rename.md`, `roadmap_chatgpt.md`,
> `roadmap_optional_content.md` und seit 17.10.2026 auch `Roadmap_DND.md`, `roadmap_ue5.md`, `Roadmap_GUI.md` und
> `todo_assets.md` (Grafik-Vorgaben jetzt in `docs/stage_assets.md`).
>
> Offene Punkte sind Vorschläge, keine zugesagten Features. Erledigtes wird hier abgehakt und beim nächsten
> Aufräumen nach `roadmap_abgeschlossen.md` verschoben.

## Leitlinien für neue Oberflächen

1. **Klartext vor Fachbegriff.** Die Oberfläche sagt, *was* etwas bewirkt („Wie kreativ antwortet die Figur?“), der
   Fachbegriff steht höchstens klein daneben („Temperatur“). Ein Glossar erklärt den Rest.
2. **Einfach zuerst, Experte auf Wunsch.** Jede Seite zeigt zuerst das, was die meisten brauchen; technische Optionen
   liegen hinter „Erweitert“ bzw. im Expertenmodus – nichts geht verloren.
3. **Immer ein nächster Schritt.** Kein leerer Bildschirm ohne Handlungsangebot; jede Fehlermeldung nennt eine Lösung
   (mit Knopf, wenn möglich).
4. **Sinnvolle Vorgaben.** Was der Nutzer nicht einstellt, funktioniert trotzdem gut (Hardware-Erkennung, empfohlene
   Modelle, Vorlagen).
5. **Eine Sprache.** Oberfläche, mitgelieferte Inhalte und Antworten folgen der gewählten App-Sprache (de/en/ru).
6. **Prüfbar.** Jeder Schritt endet mit einem E2E-Durchlauf aus Einsteigersicht und Screenshots in
   `e2e/screenshots/`, die vor dem Abhaken angesehen werden.

## 0. Bedienbarkeit

- [ ] Kurze Nutzertests mit 2–3 Einsteigern anhand einer Aufgabenliste; Befunde hier als neue Punkte eintragen
  (alles Übrige aus dem Bedienbarkeitsplan ist erledigt, siehe `roadmap_abgeschlossen.md`, Abschnitt 10).
  Aufgabenliste (ohne Hilfe vorlesen, beobachten, wo gezögert wird; Zeit pro Aufgabe notieren):
  1. „Richte die App so ein, dass eine Figur dir antworten kann.“
  2. „Unterhalte dich mit einer Figur, die dir gefällt, und lass eine Antwort neu schreiben.“
  3. „Starte eine kurze Geschichte und spiele drei Züge – einmal mit einem Vorschlag.“
  4. „Erstelle eine eigene Geschichte mit einem Gefährten deiner Wahl.“
  5. „Lass die Figur ihre Antworten vorlesen.“
  6. „Finde heraus, was ‚Kontext‘ bedeutet.“
  7. „Hol dir eine neue Figur aus dem Hub.“

## 1. Lokale Modelle, Hardware & Laufzeiten

- [ ] **Apple Metal:** `recommendedMaxWorkingSetSize` statt des gesamten Arbeitsspeichers als GPU-Speicher.
- [ ] **TADA 3B Deutsch (GPU-Test 17.10.2026):** Vorgabestimme in CrispASR v0.8.43 nur noch 8 % verständlich (v0.8.41: 92 %);
  der deutsche Klon spricht mit vorgesprochenem KI-Hinweis nur den Hinweis (0 %), ohne Hinweis 75 %. Vorschlag: Fehler liegt bei
  CrispASR (neuere Version abwarten); Hinweis bei TADA als eigenen Clip vorweg erzeugen statt im selben Durchlauf (Entscheidung des Nutzers). Englisch ist unbetroffen.
- [ ] **Vision lokal auf echter Hardware testen** (Gemma/Qwen-VL mit passender `mmproj`, z. B. aus dem Modell-Hub).
- [ ] **Bildgenerierung parallel zum Chat auf 24 GB** testen (keine passende Karte vorhanden).
- [ ] **Weitere Laufzeit-Backends** (HIP/ROCm, SYCL) neben CUDA, Vulkan, Metal und CPU – nur bei Bedarf.

## 2. Technik & Tests

- [ ] Umstieg auf erzeugte Command-Wrapper (`tauri-specta`), falls es eine stabile 2.0 gibt (bis dahin prüft
  `src/test/commandCheck.test.ts` die Aufrufe; Stand 16.10.2026: weiterhin 2.0.0-rc.25 vom 08.05.2026,
  verlangt exakte specta-Pins; Umstieg betrifft 257 Befehle und 232 Typen → abwarten).
- [ ] Wackeligen E2E-Test beobachten: `chat-sidebar-errors` scheiterte einmal an einem Entwurfsvergleich und bestand
  danach wiederholt.
- [ ] Wackeligen E2E-Test beobachten: `stage-5e` scheiterte einmal an einem veralteten Element (`button[aria-label*="gegen"]`
  im Kampfpanel, 16.10.2026) und bestand danach.
  17.10.2026: zweite Ursache behoben – der Test übersah Heilung durch „Zweiter Atem“ (zählt jetzt Heal-Ereignisse).

## 3. Chat & Rollenspiel (Vorschläge vom 18.10.2026)

- [x] **Alternative Begrüßungen** einer Karte als Swipes der ersten Nachricht eines neuen Chats (übersetzt, Makros gefüllt).
- [x] **Antwortvorschläge im Chat:** Knopf „Was könnte ich sagen?“ mit 2–3 kurzen Ideen im Stil der Persona (wie `pending_choices` in Stage).
- [x] **„Schreib für mich“ (Impersonate):** KI entwirft die nächste Nutzernachricht in den Composer, Nutzer bearbeitet vor dem Senden.
- [ ] **Gruppen-Chats** mit mehreren Charakteren; Sprecherwahl/Ansprache-Erkennung aus `stage/director.rs` wiederverwenden, ohne Spielmechanik.
- [x] **OOC-/Regie-Nachrichten:** `(( … ))` oder Umschalter „Regieanweisung“ geht als Hinweis ans Modell statt in die Erzählung.
- [x] **Weitere Kartenmakros:** `{{random:a,b}}`, `{{roll:1d20}}`, `{{time}}`/`{{date}}`, `{{idle_duration}}` (Community-Karten zeigen sie sonst roh).
- [x] **Wiederholungen eindämmen in Klartext:** Schalter „Abwechslungsreicher schreiben“ (DRY/XTC mit guten Werten), optional automatisches
  Neu-Würfeln bei fast gleicher Antwort.
- [x] **Ausgabe-Filter:** einfache Liste „Diese Wörter/Muster vermeiden“, Ersetzungsregeln für Antworten (Expertenmodus: RegEx).
  Logit-Bias bewusst nicht: llama.cpp sperrt nur Einzeltokens, mehrteilige Wendungen träfen häufige Wortteile.
- [x] **Antwortlänge pro Chat:** kurz/mittel/ausführlich, passt Prompt und `max_tokens` gemeinsam an.
- [x] **Sichtbare Lorebook-/Gedächtnis-Treffer** je Antwort (welche Einträge einbezogen wurden).
- [x] **„Diese Nachricht merken“** im Nachrichtenmenü (`add_episodic_memory_from`).
- [x] **Szenenbild per Knopf** aus dem aktuellen Chat-Kontext (gab es als HUD-„Foto“ schon als Porträt; ergänzt: Bildart
  „Moment“ je Antwort im Nachrichtenmenü, Bild als Chat-Hintergrund übernehmen).
- [ ] **Chat-Export/-Import im SillyTavern-Format (JSONL)** für Umsteiger.
