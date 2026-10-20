# 🗺️ OtakuSoul – Roadmap (offen)

> Stand: 19.10.2026. Diese Datei ist die **einzige** Liste offener Punkte; `roadmap_abgeschlossen.md` (nur lokal, nicht im
> Repository) enthält alles Erledigte (Portierung Phasen 1–18, Verbesserungen, Sprachausgabe, Neutralisierung, optionale Inhalte, Qualität &
> Bedienung, 5e-Regeln, 3D-Figuren aus Spielen, Bedienbarkeit & Story-Einstieg, Avatar-Manager, Oberflächensprachen, Chat-Erweiterungen,
> Kognitives Gedächtnis 2.0 sowie FSK18/NSFW-Grundintegration). Sie ersetzt alle früheren separaten Roadmap-Dateien.
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
5. **Eine Sprache.** Oberfläche, mitgelieferte Inhalte und Antworten folgen der gewählten App-Sprache (de/en/ru mitgeliefert, weitere als JSON-Datei in `<Daten>/locales/ui/` ohne neuen Build).
6. **Prüfbar.** Jeder Schritt endet mit einem E2E-Durchlauf aus Einsteigersicht und Screenshots in
   `e2e/screenshots/`, die vor dem Abhaken angesehen werden.

## 0. Bedienbarkeit & Nutzertests

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

## 3. 3D Desktop Pet (Mascot Companion)

> **Fokus:** Windows & macOS (Linux/Wayland ausgeklammert aufgrund von Compositor-Restriktionen bei freier Fensterplatzierung und Cross-App-Window-Sniffing).
> Ziel: Aktiven 3D-Avatar (VRM / glTF / MMD) aus OtakuSoul als transparenten, frei schwebenden Begleiter auf den Desktop bringen.

### Phase 1: Transparentes Companion-Fenster & Klick-Verhalten
- [ ] **Multi-Window-Setup in Tauri 2:**
  - Separater Window-Builder (`desktop_pet_window`) in Rust: `transparent: true`, `decorations: false`, `always_on_top: true`, `skip_taskbar: true`, `shadow: false`.
  - Dedizierte schlanke Route im Frontend (`/desktop-pet` oder eigener HTML-Einstiegspunkt), die nur den Viewer lädt.
- [ ] **Rendering & Transparenz:**
  - Three.js WebGLRenderer mit `alpha: true` und Hintergrund `setClearColor(0x000000, 0)`.
  - Wiederverwendung von `VrmViewer` / `AvatarCanvas` ohne Hintergrund-Mesh, Vignette oder Standard-Bühne.
- [ ] **Intelligentes Click-Through (Maus-Durchlässigkeit):**
  - Raycaster im Webview prüft kontinuierlich oder per `mousemove`, ob der Zeiger über einem Mesh/Knochen des Avatars liegt.
  - Wenn Cursor über dem Avatar: `window.set_ignore_cursor_events(false)` (Avatar ist greifbar & anklickbar).
  - Wenn Cursor über transparentem Leerraum: `window.set_ignore_cursor_events(true)` (Klicks gehen transparent an darunterliegende Desktop-Fenster durch).
- [ ] **Manuelles Drag & Drop:**
  - Greifen mit linker Maustaste bewegt das Fenster (`start_dragging()`).
  - Kontextmenü mit Rechtsklick (z. B. „Zurück zur Haupt-App“, „Ausblenden“, „Stimmung wählen“).

### Phase 2: Anbindung an OtakuSoul (Zustände, Gesten & Sprache)
- [ ] **Synchronisation über Tauri-Events:**
  - Übertragen des aktuellen Charakters & Modells an das Pet-Fenster (`pet:set-model`).
  - Übertragen von Stimmungen und Gesten aus Chat-Antworten (`pet:play-gesture`, `pet:set-mood`).
  - TTS & Lip-Sync Event-Bridge: Mundbewegungen synchron zum aktuellen Audio.
- [ ] **Idle- & Verhaltens-Logik (State Machine):**
  - Zustände: `IDLE_STAND`, `IDLE_SIT`, `WALKING`, `FALLING`, `REACTING`, `DRAGGED`.
  - Zufällige Aktionen bei Inaktivität (umschauen, gähnen, hinsetzen, winken).
  - Sprechblasen-Overlay über dem Kopf bei eingehenden Chat-Nachrichten.

### Phase 3: Desktop-Physik & Bildschirmkanten
- [ ] **Bildschirm-Grenzen erfassen:**
  - Abfrage der Monitore via Tauri: `window.available_monitors()`.
  - Erkennung der Taskleiste / des Docks (Work-Area vs. Gesamtauflösung).
- [ ] **Gravitation & Kanten-Kollision:**
  - Avatar hat Schwerkraft: Beim Loslassen in der Luft fällt das Modell nach unten.
  - Landung auf der unteren Bildschirmkante (bzw. oberhalb der Windows-Taskleiste / macOS-Menüleiste).
  - Wand-Kollision links/rechts: Umdrehen beim Erreichen des Bildschirmrands.

### Phase 4: Interaktion mit fremden Fenstern (Windows & macOS)
- [ ] **Windows-Integration (Win32 API über `windows-rs`):**
  - Window Scanner (Hintergrund-Thread in Rust): Periodisches Abfragen offener Fenster via `EnumWindows()`.
  - Filtern ungültiger Fenster (nur sichtbare, keine minimierten, keine Overlays oder das Pet selbst).
  - Bestimmung der oberen Kante (Titelleiste) via `DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS)` bzw. `GetWindowRect()`.
  - Kollisions-Plattformen: Sitzen & Laufen auf der Titelleiste des fokussierten Fensters. Avatar fällt herunter bei Fensterbewegung.
- [ ] **macOS-Integration (CoreGraphics / Quartz Window Services):**
  - Window Scanner via `CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID)`.
  - Auslesen der `kCGWindowBounds`-Rechtecke.
  - Berechtigungsprüfung („Bedienungshilfen“ / „Screen Recording“).
- [ ] **Mini-Interaktionen & Feinschliff:**
  - Quick-Chat / Mini-Input bei Klick oder Tastenkürzel.
  - Adaptive Framerate zur GPU-Schonung (15–30 FPS im Leerlauf, Pause bei Bildschirmsperre/Vollbild).
  - Multi-Monitor-Übergang beim Laufen oder Ziehen.

## 4. Kognitives Gedächtnis (Memory 2.0 – Ausblick & Folgepunkte)

- [ ] **Lokale Embeddings (nur falls FTS5 nicht reicht):**
  - Kleines GGUF-Embedding-Modell über den vorhandenen llama-server (`--embedding`).
  - Vektoren als BLOB in SQLite, Kosinus-Ähnlichkeit in Rust (bei < 10.000 Erinnerungen pro Figur reicht Brute Force).
  - Fusion mit BM25 per Reciprocal Rank Fusion (RRF). Erst messen, dann bauen.

