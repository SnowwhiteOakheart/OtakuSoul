# 🗺️ OtakuSoul – Roadmap (offen)

> Stand: 21.10.2026. Diese Datei ist die **einzige** Liste offener Punkte; `roadmap_abgeschlossen.md` (nur lokal, nicht im
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
- [ ] **Weitere Laufzeit-Backends** (HIP/ROCm, SYCL) neben CUDA, Vulkan, Metal und CPU – nur bei Bedarf.

## 2. Technik & Tests

- [ ] Umstieg auf erzeugte Command-Wrapper (`tauri-specta`), falls es eine stabile 2.0 gibt (bis dahin prüft
  `src/test/commandCheck.test.ts` die Aufrufe; Stand 20.10.2026: weiterhin 2.0.0-rc.25 vom 08.05.2026,
  verlangt exakte specta-Pins; Umstieg betrifft 257 Befehle und 232 Typen → abwarten).
- [ ] Wackeligen E2E-Test beobachten: `chat-sidebar-errors` scheiterte einmal an einem Entwurfsvergleich und bestand
  danach wiederholt.
- [ ] Wackeligen E2E-Test beobachten: `stage-5e` scheiterte einmal an einem veralteten Element (`button[aria-label*="gegen"]`
  im Kampfpanel, 16.10.2026) und bestand danach.
  17.10.2026: zweite Ursache behoben – der Test übersah Heilung durch „Zweiter Atem“ (zählt jetzt Heal-Ereignisse).

## 3. 3D Desktop Pet (Mascot Companion)

> Ziel: Die aktive Figur (VRM / glTF / MMD) lebt als transparenter Begleiter auf dem Desktop.
> **Stand 26.10.2026 (Windows):** eigenes Pet-Fenster mit Click-Through, Ziehen, Werfen, Kontextmenü und Status-Panel;
> Figur, Stimmung, Gesten, Lippensync und Chat-Antworten (satzweise zur Stimme) aus dem Hauptfenster; Schnell-Chat;
> Leerlauf-Verhalten (umschauen, gähnen, hüpfen, dösen, gehen, sitzen mit Animation), Streicheln nach Körperzone;
> Schwerkraft, Bildschirmkanten, mehrere Monitore, Stehen/Laufen/Mitfahren auf Titelleisten anderer Fenster;
> Pause bei Vollbild und Sperre; Tray-Eintrag, Tastenkürzel Strg+Alt+Umschalt+P, Wiederkehr beim Start.
> Details und Stolperfallen: `roadmap_abgeschlossen.md` (Abschnitt 3) und `AI.md` (Abschnitt 10).

### Plattformen
- [ ] **macOS-Integration:** Fenster-Scanner über `CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly |
  kCGWindowListExcludeDesktopElements)` (`kCGWindowBounds`, Ebene 0, eigene PID ausnehmen), Berechtigung „Bildschirm-
  aufnahme“ für Fenstertitel prüfen und erklären; Maustastenstatus (`NSEvent.pressedMouseButtons`) für sofortiges
  Drag-Ende und Werfen; Vollbild/Sperre (`CGSessionCopyCurrentDictionary`). Braucht einen Mac zum Bauen und Testen.
- [ ] **Linux (X11, nach Möglichkeit):** Transparenz und Click-Through hängen vom Fenstermanager ab; unter X11 Fenster
  über `_NET_CLIENT_LIST_STACKING` lesen, unter Wayland bewusst nur Boden und Ränder.

### Bedienung & Einstellungen
- [ ] **Pet-Einstellungen im Desktop-Pet-Tab:** Alle Menü-Schalter (Bewegungen, Sprechblasen, Schwerkraft, Mitfahren,
  Vollbild) auch dort, plus Vorschau – das Rechtsklick-Menü bleibt die schnelle Variante.
- [ ] **Tastenkürzel frei belegen:** Strg+Alt+Umschalt+P ist fest; Aufnahme eines eigenen Kürzels im Tab, Hinweis bei
  Belegung durch ein anderes Programm (bisher nur Log-Warnung).
- [ ] **Größe stufenlos:** Strg+Mausrad über der Figur statt nur Klein/Mittel/Groß; Größe pro Modell merken.
- [ ] **Ausschnitt pro Modell:** Modelle mit ungewöhnlichen Proportionen (Chibi, sehr große Haare, MMD mit Zubehör)
  geraten mit dem festen Ganzkörper-Ausschnitt zu klein oder abgeschnitten; Feinjustierung im Avatar-Manager.
- [ ] **„Komm her“:** Menüpunkt und Doppelklick aufs Tray-Symbol, damit die Figur zum Mauszeiger läuft (oder hinspringt,
  wenn Schwerkraft aus ist).

### Verhalten & Persönlichkeit
- [ ] **Kopfzone aus dem Modell:** Kopf-Knochen auf den Bildschirm projizieren statt fester 34 % der Fensterhöhe – stimmt
  dann auch bei Drehung, Sitzen und Chibi-Proportionen; zusätzlich Hände (Hand halten / abklatschen).
- [ ] **Hormone und Tageszeit steuern das Verhalten:** Erschöpfung → öfter gähnen und dösen, Dopamin → mehr hüpfen und
  laufen, Cortisol → unruhiges Umschauen; nachts schläft die Figur früher ein und wird leiser.
- [ ] **Springen und Klettern:** Von Titelleiste zu nahe gelegener Titelleiste springen bzw. auf ein Fenster klettern,
  statt nur dort zu landen, wo man sie absetzt.
- [ ] **Reaktion auf den Desktop:** auf Fensterwechsel, Musik-Wiedergabe (Kopfnicken im Takt) oder lange Untätigkeit
  reagieren – nur aus lokalen Signalen, ohne Bildschirminhalt zu lesen.
- [ ] **Proaktive Nachrichten über das Pet:** Schreibt die Figur von sich aus (auch für andere Chats), meldet sie sich
  per Sprechblase und kurzer Geste statt nur per Benachrichtigung; Klick öffnet den Chat.
- [ ] **Mehrere Pets:** Bei Gruppenchats auf Wunsch mehrere Figuren gleichzeitig, die sich gegenseitig anschauen und
  nacheinander sprechen (eigene Fenster, gemeinsame Physik).

### Darstellung
- [ ] **Live2D- und Porträt-Pet:** Für Nutzer ohne 3D-Modell das Live2D-Modell bzw. das atmende Porträt als Pet (Inochi2D läuft seit 27.10.2026)
  (Treffertest und Zonen über `hitTest` bzw. Bildmaske).
- [ ] **Weicher Schatten unter den Füßen** auf Boden und Titelleisten, damit die Figur „steht“ statt schwebt.
- [ ] **Sprechblase mit Zeiger zum Kopf**, automatisch links/rechts, wenn die Figur am Bildschirmrand steht, und
  Scrollen für lange Sätze.

### Leistung & Qualität
- [ ] **E2E-Test fürs Pet-Fenster:** tauri-driver mit zweitem Fenster (Öffnen, Zustand vom Hauptfenster, Ausblenden,
  Wiederkehr beim Start); Physik und Verhalten sind bereits per Vitest abgedeckt.
- [ ] **Sparmodus im Akkubetrieb:** Leerlauf mit 10–15 FPS und ohne zufällige Aktionen, wenn das Gerät auf Akku läuft.
- [ ] **Speicher des Pet-Webviews messen** (zweiter WebView2-Prozess, Modell doppelt geladen) und ggf. Modelldaten aus
  dem Hauptfenster übergeben statt erneut zu lesen.

## 3a. Inochi2D-Puppen – Folgepunkte

> Grundintegration, Animationen, Mundformen, Einstellungen je Puppe, Desktop-Pet und Hub-Registry fertig (26./27.10.2026,
> Details in `roadmap_abgeschlossen.md` Abschnitt 26 und `AI.md` Abschnitt 6).

- [ ] **Fehlende Inochi2D-Funktionen:** Emission/Bump-Licht, BC7-Texturen, `translate_children` und verschachtelte
  Mesh-Gruppen – erst mit einem Modell, das sie nutzt (Aka, Midori und Nagatoro brauchen sie nicht).

## 4. Kognitives Gedächtnis (Memory 2.0 – Ausblick & Folgepunkte)

- [ ] **Lokale Embeddings (nur falls FTS5 nicht reicht):**
  - Kleines GGUF-Embedding-Modell über den vorhandenen llama-server (`--embedding`).
  - Vektoren als BLOB in SQLite, Kosinus-Ähnlichkeit in Rust (bei < 10.000 Erinnerungen pro Figur reicht Brute Force).
  - Fusion mit BM25 per Reciprocal Rank Fusion (RRF). Erst messen, dann bauen.


## 5. Wettbewerbsfähigkeit (Vorschläge vom 20.10.2026)

> Abgleich mit Character.AI, Kindroid, Nomi, Replika, SillyTavern und Backyard AI. Beim Funktionsumfang liegt OtakuSoul vorn;
> die Lücken liegen bei Zugang, Vertrauen, proaktiver Bindung und Mobilität. Reihenfolge = vorgeschlagene Priorität.

### Zugang & Vertrauen
- [ ] **Signierte Installer:** Windows-Code-Signierung (gegen SmartScreen-Warnung) und macOS-Notarisierung (statt
  Rechtsklick → Öffnen bzw. `xattr`) im Release-Workflow. Kosten: Zertifikat bzw. Apple Developer Account (~99 $/Jahr) –
  Entscheidung des Nutzers.

### Die Figur meldet sich von selbst
- [ ] **Klick auf die Benachrichtigung öffnet den Chat:** Desktop-Benachrichtigungen von `tauri-plugin-notification` bieten
  keine Klick-Aktion; bis dahin zeigt die App außerhalb des Chats einen Toast mit „Zum Chat“.

### Mobil
- [ ] **Zugriff von unterwegs:** Web-Client außerhalb des WLANs über eine verschlüsselte Relay-Verbindung ohne Portfreigabe,
  mit Push-Benachrichtigungen. Danach prüfen: eigene Handy-App über Tauri 2 (Android/iOS) mit Cloud-KI oder dem PC als Server.

### Für erfahrene Nutzer
- [ ] **Skript-Hook für eigenen Code:** Regex-Skripte und Quick-Replies gibt es seit 20.10.2026; offen ist nur ein Hook, der
  eigenen Code (z. B. JavaScript) auf Ein-/Ausgabe anwendet. Nur in einer echten Sandbox ohne Netz und ohne Zugriff auf die
  App (z. B. QuickJS als WebAssembly im Worker), weil importierte Skripte fremder Herkunft sein können.

### Gemeinschaft
- [ ] **Eigene Figuren und Geschichten aus der App teilen:** Einreichen in den Hub (z. B. als Pull Request an `otakusoul-data`
  oder über ein Formular), mit Prüfung vor der Aufnahme.
- [ ] **Sync bzw. Backup zwischen Geräten** über Ordner-Sync oder WebDAV, ohne eigenen Server.

> Alleinstellungsmerkmal: Das Desktop-Pet (Abschnitt 3) zusammen mit Gedächtnis und proaktiven Nachrichten –
> „Deine Figur lebt auf deinem PC.“

## 6. Weitere Alleinstellungsmerkmale (Immersion, Storytelling & Alltag)

### 🕸️ Interaktiver „Seelen- & Beziehungs-Atlas“ (Visual Memory Graph)
- [ ] **Visuelle Sternenkarte der Erinnerungen:** Interaktive 2D/3D-Knotenansicht (Force-Graph) für das SQLite-Gedächtnis (`psyche`, `relationship`, `episodes`, `diary`, `plans`), in der leuchtende Verbindungen zeigen, welche Erlebnisse welche Überzeugungen geformt haben.
- [ ] **Zeitreise-Checkpoints (Parallelwelt-Zeitlinien):** Klick auf einen historischen Knoten in der Beziehungs-Chronik startet von diesem Gedächtnis-Snapshot + Chat-Zeitpunkt aus einen neuen Branch („Was wäre, wenn ich mich damals anders entschieden hätte?“) mit eigenem Gedächtnisstand.

### 🎬 Visual-Novel-, Light-Novel- & Hörbuch-Export („Verewige deine Geschichte“)
- [ ] **Illustrierter Buch- & Webtoon-Export:** Verwandelt einen gespielten Story-Akt aus der Stage oder einen Chat-Verlauf auf Knopfdruck in ein flüssig geschriebenes Light-Novel-Kapitel (PDF/EPUB/HTML-Replay) oder einen Webtoon-Strip – inklusive eingebetteter Szenenbilder und passender Emotionsporträts.
- [ ] **Hörbuch-Kapitel-Export:** Fügt die generierten Sprachdateien (Erzählerstimme + Charakterstimmen) eines Kapitels automatisch zu einer durchgängigen Audiodatei zusammen.

### 🎭 „Puppenspieler & Regisseur“: Dynamische Musik-Dramaturgie & Kartenbau für die Stage
- [ ] **Stimmungs- & phasenabhängiger Soundtrack:** Automatisches Crossfading von Hintergrundmusik und Ambient-Loops (z. B. „Taverne“, „Spannung“, „Bosskampf“, „Romantik“) anhand der erkannten `[emotion: …]`-Tags und 5e-Kampfevents (`CombatEvent`).
- [ ] **1-Klick-Battlemap-Generierung aus Text:** Wenn der Spielleiter einen neuen Ort improvisiert, erzeugt `stable-diffusion.cpp` eine Top-Down-Karte, aus deren Helligkeits-/Strukturwerten automatisch Wände, Hindernisse und Sichtlinien für die 5e-Engine abgeleitet werden.

### 💌 Tagebuch-Synchronisation & Cozy-Lebensbegleiter (Real-Life Companion)
- [ ] **Cozy Focus- & Pomodoro-Modus:** Fokus-Timer (inspiriert von *Spirit City: Lofi Sessions*), bei dem der 3D/2D-Avatar am Schreibtisch mitarbeitet, liest oder Musik hört, Pausen ankündigt und erledigte Aufgaben feiert.
- [ ] **Abend-Reflexion & Monatsrückblick:** Optionaler Journaling-Modus, in dem die Figur den Tag mit dem Nutzer reflektiert, Gewohnheiten (`habits` / `plans`) spielerisch begleitet und am Monatsende einen persönlichen Rückblick verfasst.

### 🎙️ Echtzeit-Sprachdialog, Berührung & Visuelle Wahrnehmung (Ideen aus *Open-LLM-VTuber*)
- [ ] **Silero-VAD für Sprachanruf und Unterbrechen:** Silero-VAD (ONNX/WASM) statt reinem RMS-Pegel (`voiceCapture.ts`), damit Tastaturklappern, Atemgeräusche und die eigene Stimme der Figur aus Lautsprechern nicht als Sprache zählen. Das Unterbrechen selbst ist erledigt (25.10.2026); bis dahin gilt dort die 2,5-fache Schwelle für 300 ms.
- [ ] **Visuelle Wahrnehmung („Mitguck-Modus“ für Bildschirm & Webcam):** Optionaler Live-Blick bei Sprachanrufen oder für das Desktop-Pet, der bei Vision-fähigen Modellen einen heruntergerechneten Snapshot des aktiven Fensters oder der Webcam mitschickt, damit die Figur auf das aktuelle Geschehen reagieren kann.
- [ ] **Körperzonen-abhängige Touch-Reaktionen im Hauptfenster:** Im Desktop-Pet erledigt (Kopf/Körper, Hormone
  `headpat`/`poke`, 26.10.2026); offen für den Avatar im Chat: Live2D (`hitTest` auf `Head`, `Face`, `Body`) und 3D per
  Raycasting, mit denselben Reaktionen.
- [ ] **Satzweiser „Bubble-Sync“ in der Stage:** Im Desktop-Pet erledigt (`streamingTts.onSentence`, 26.10.2026); offen
  für den Stage-Modus (Sprecher-Porträt zeigt den gerade gesprochenen Satz samt Ausdruck).
- [ ] **OBS- / Streaming-Overlay-Modus:** Die transparente Pet-Ansicht (`index.html?pet=true`, `DesktopPet.tsx`) über den
  eingebauten Web-Server (`web_server.rs`) als Browser-Source für OBS anbieten – ohne Tauri-Fensteraufrufe, Zustand
  per WebSocket statt Tauri-Events.


