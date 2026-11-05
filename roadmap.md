# 🗺️ OtakuSoul – Roadmap (offen)

> Stand: 02.11.2026 (nach 0.7.2). Diese Datei ist die **einzige** Liste offener Punkte; `roadmap_abgeschlossen.md`
> (nur lokal, nicht im Repository) enthält alles Erledigte. Offene Punkte sind Vorschläge, keine zugesagten Features.
> Erledigtes wird abgehakt und beim nächsten Aufräumen nach `roadmap_abgeschlossen.md` verschoben.

## So ist priorisiert

Jeder Punkt hat drei Angaben:
- **Nutzen:** ★★★ viele Nutzer merken es sofort · ★★ spürbar für eine Gruppe · ★ Feinschliff oder Nische.
- **Aufwand:** S (Tage) · M (1–2 Wochen) · L (mehrere Wochen) · XL (eigenes Projekt).
- **Braucht:** was außer Code nötig ist (Hardware, Konto, Geld, andere Personen).

Reihenfolge innerhalb einer Stufe = vorgeschlagene Reihenfolge. Leitfrage: *Was macht die App für neue Nutzer
zugänglicher oder verlässlicher, und was baut auf schon Vorhandenem auf?*

| # | Punkt | Nutzen | Aufwand | Braucht |
|---|---|---|---|---|
| **A** | **Jetzt – Ausgeliefertes absichern** | | | |
| A1 | VRoid Hub mit echtem Konto testen, dann bei pixiv melden | ★★★ | S | Release-Build, VRoid-Konto |
| A2 | Musik: Prüfstand mit echter GPU, Titel der Starter-Geschichten ausliefern | ★★★ | S–M | GPU, Zeit zum Anhören |
| A3 | Sync zwischen Geräten und Sprechblasen im Alltag prüfen | ★★ | S | zwei Geräte, Nextcloud o. Ä. |
| A4 | Nutzertests mit 2–3 Einsteigern | ★★★ | S | Testpersonen |
| A5 | Signierte Installer (Windows, macOS) | ★★★ | S–M | Zertifikat bzw. Apple-Konto (Kosten) |
| **B** | **Als Nächstes – baut auf Vorhandenem auf** | | | |
| B4 | Teilen: Lorebooks, automatische Prüfung der Einreichung | ★★ | M | Prüfablauf im Daten-Repo |
| B5 | ~~Webtoon-Export~~ erledigt (05.11.2026), Rest: Szenenbilder je Panel | ★ | S | – |
| B6 | OBS-Overlay: 3D-/Live2D-Modell statt Porträt | ★ | M | – |
| B7 | Benachrichtigungsklick unter Linux und macOS | ★ | S (Linux) / M (macOS) | Mac für macOS |
| **C** | **Später – größere Vorhaben** | | | |
| C1 | Zugriff von unterwegs (Relay), danach Handy-App | ★★★ | XL | Relay-Dienst, Sicherheitskonzept |
| C2 | Beziehungs-Atlas (Gedächtnis als Graph) | ★★ | L | – |
| C3 | Zeitreise-Checkpoints (Verzweigung samt Gedächtnisstand) | ★★ | L | – |
| C4 | Abend-Reflexion und Monatsrückblick | ★★ | M | – |
| C5 | Fokus-/Pomodoro-Modus mit Avatar | ★ | M | – |
| C6 | Mehrere Pets gleichzeitig | ★ | L | – |
| C7 | Mitguck-Modus (Bildschirm/Webcam) | ★★ | L | Vision-Modell, Datenschutzkonzept |
| C8 | Battlemap aus Text erzeugen | ★ | L | Bildmodell, ungewisse Qualität |
| C9 | Skript-Hook für eigenen Code | ★ | L | echte Sandbox |
| **D** | **Plattformen & Technik – nur mit Hardware oder bei Gelegenheit** | | | |
| D1 | Desktop-Pet unter macOS | ★★ | M | Mac |
| D2 | Apple Metal: richtiger GPU-Speicher | ★★ | S | Mac |
| D3 | Desktop-Pet unter Linux – Folgestufe | ★ | M | X11-, GNOME-, KDE-Systeme |
| D4 | E2E-Test fürs Pet-Fenster, Speicher des Pet-Webviews | ★ | M | – |
| D5 | Wackelige E2E-Tests beobachten | ★ | – | – |
| **E** | **Geparkt – wartet auf andere oder nur bei Bedarf** | | | |
| E1 | `tauri-specta` (wartet auf stabile 2.0) | – | L | – |
| E2 | TADA 3B Deutsch (wartet auf CrispASR) | – | S | – |
| E3 | HIP/ROCm, SYCL | – | M | AMD-/Intel-GPU, Nachfrage |
| E4 | Fehlende Inochi2D-Funktionen | – | M | Modell, das sie nutzt |
| E5 | Lokale Embeddings fürs Gedächtnis | – | M | Messung, dass FTS5 nicht reicht |
| E6 | VRoid-Anmeldung über `otakusoul://`-Link | – | S | Berichte über belegten Port |
| E7 | Hörbuch-Export (vorerst gestrichen, 02.11.2026) | ★ | M | – |

## Leitlinien für neue Oberflächen

1. **Klartext vor Fachbegriff.** Die Oberfläche sagt, *was* etwas bewirkt („Wie kreativ antwortet die Figur?“), der
   Fachbegriff steht höchstens klein daneben („Temperatur“). Ein Glossar erklärt den Rest.
2. **Einfach zuerst, Experte auf Wunsch.** Jede Seite zeigt zuerst das, was die meisten brauchen; technische Optionen
   liegen hinter „Erweitert“ bzw. im Expertenmodus – nichts geht verloren.
3. **Immer ein nächster Schritt.** Kein leerer Bildschirm ohne Handlungsangebot; jede Fehlermeldung nennt eine Lösung
   (mit Knopf, wenn möglich).
4. **Sinnvolle Vorgaben.** Was der Nutzer nicht einstellt, funktioniert trotzdem gut (Hardware-Erkennung, empfohlene
   Modelle, Vorlagen).
5. **Eine Sprache.** Oberfläche, mitgelieferte Inhalte und Antworten folgen der gewählten App-Sprache (de/en/ru/ja
   mitgeliefert, weitere als JSON-Datei in `<Daten>/locales/ui/` ohne neuen Build).
6. **Prüfbar.** Jeder Schritt endet mit einem E2E-Durchlauf aus Einsteigersicht und Screenshots in
   `e2e/screenshots/`, die vor dem Abhaken angesehen werden.

---

## A. Jetzt – Ausgeliefertes absichern

> Diese Funktionen sind in 0.7.2 enthalten, aber noch nicht unter echten Bedingungen geprüft. Ein Fehler hier trifft
> sofort Nutzer, deshalb zuerst.

- [ ] **A1 · VRoid Hub mit echtem Konto testen, dann bei pixiv melden.** Nur mit Secret möglich
  (`VROID_CLIENT_SECRET=… npm run tauri:linux` oder Release-Build): Anmeldung, Liste, Hinzufügen, Laden im Chat und im
  Desktop-Pet, Token-Erneuerung, Abmelden. Danach bei pixiv melden (Prüfung zur „Certified App“,
  <https://developer.vroid.com/en/api/recognize.html>); bis dahin liefert VRoid Hub nur eigene und zum Download
  freigegebene Modelle, mit Ratenlimit je App. Rahmen und Pflichten: siehe [Referenz: VRoid Hub](#referenz-vroid-hub).
- [ ] **A2 · Musik: Prüfstand mit echter GPU, Titel der Starter-Geschichten ausliefern.** Laufzeit installieren, Modell
  „Standard“ und „XL“ laden, „Fehlende Titel erzeugen“; dabei notieren: Dauer pro Titel, VRAM-Höchstwert, Rückkehr des
  Chat-Modells, Abbrechen mitten im Titel, Klang (z. B. Elfengesang bei `mystery`), Überblenden in der Stage. Danach die
  Titel der Starter-Geschichten und des Gruft-Abenteuers erzeugen, anhören und unter `otakusoul-data/music/<set>/`
  ausliefern (Ablauf: `docs/stage_music.md`, „Titel ausliefern“). *Nutzen:* Ohne mitgelieferte Titel bleibt die Stage für
  Nutzer ohne starke GPU stumm.
  - Echter Lauf 03.11.2026 (RTX 5090 Laptop, schnelle Leitung): Laufzeit, Standard, XL und beide LMs geladen (8 parallele
    Segmente je Datei); alle 6 Titel der Frostweiler-Geschichte erzeugt: Standard ~17 s je Titel (102 s gesamt), XL ~25 s
    (150 s gesamt); VRAM-Höchstwert ~8,4 GB (Plan `Parallel`); Abbrechen mitten im Titel stoppt `ace-server` sofort, gibt
    den VRAM frei und hinterlässt keine halbe Datei.
  - Gefunden und behoben (`8eddf2d`): Ein Download-Segment blieb bei ~70 KB/s hängen und hielt den Modell-Download
    minutenlang auf; Verbindungen unter 1/8 der schnellsten (15-s-Fenster) werden jetzt ersetzt. Auffällig: Der
    abgebrochene Laufzeit-Download vom 02.11. (238 MB) wurde nicht fortgesetzt, sondern neu begonnen. Behoben (05.11.2026):
    Laufzeiten luden über eine Verbindung direkt in die Zieldatei, die jeder Versuch neu anlegte. Jetzt nehmen sie den
    Weg der Modelle (`model_files::download_spec`: `.part`, mehrere Verbindungen, Fortsetzen, SHA-256); ein fertiges,
    geprüftes Archiv wird wiederverwendet, nach der Installation gelöscht.
  - Alle Titel erzeugt (XL, 03.11.2026, 97 MB MP3): Frostweiler 6, Kirschblüten 5, Arcade-Stick 4, Ryokan 5,
    Kepler-9 5, Gruft 8 (~24 s je Titel). Mit geladenem Chat-Modell (~10 GB) wählt die App `Parallel`: Spitze 15 GB
    von 24 GB, Chat-Modell bleibt geladen. GPU geprüft: `ace-server` läuft auf der RTX (100 %), die iGPU-Last
    stammt von `dwm`, der WebView und dem Claude-Fenster.
  - Gefunden und behoben (`cac1a2b`): Eine vor der Musikfunktion begonnene Geschichte (Gruft Akt 1) hatte keinen
    Musik-Abschnitt; erst „Von vorn beginnen“ holte ihn nach. Jetzt ergänzt schon das Fortsetzen fehlende oder leere
    `extensions`-Schlüssel still aus dem Preset (eine Ebene tief, damit später ausgelieferte `tracks` ankommen).
  - Ausgeliefert (03.11.2026): 33 Titel als MP3 in `otakusoul-data/music/<set>/` (`b62e4f8`), `tracks` in den acht
    Szenen (`55f074e`). Neu: `tools/story_music.py` (`plan`, `generate`, `ship`) für weitere Geschichten ohne App,
    Doku in `docs/stage_music.md`.
  - **Noch offen:** Klang anhören (Standard-Titel zum Vergleich: `<Daten>/music/standard_backup/frozen_bells_standard`;
    Elfengesang bei `mystery`), Überblenden in der Stage, Rückkehr des Chat-Modells bei Plan `Sequential` (nur mit
    weniger freiem VRAM), Nachladen der Titel in einer frischen Installation (Hub-Download, SHA-256) einmal sehen.
- [ ] **A3 · Sync zwischen Geräten und Sprechblasen im Alltag prüfen.** Sync: zwei Geräte gegen Nextcloud und einen
  geteilten Ordner, Hinweis beim Start, Wiederherstellen mit Sicherheitskopie (Protokoll-Test gegen eigene Nextcloud:
  `cargo test --lib real_webdav_server -- --ignored`, siehe `AI.md`). Sprechblasen: passt die Satzaufteilung nach
  Textlänge zur echten Stimme, auch bei Erzählerstimme für Aktionen?
- [ ] **A4 · Nutzertests mit 2–3 Einsteigern** anhand einer Aufgabenliste; Befunde hier als neue Punkte eintragen.
  Ohne Hilfe vorlesen, beobachten, wo gezögert wird, Zeit pro Aufgabe notieren:
  1. „Richte die App so ein, dass eine Figur dir antworten kann.“
  2. „Unterhalte dich mit einer Figur, die dir gefällt, und lass eine Antwort neu schreiben.“
  3. „Starte eine kurze Geschichte und spiele drei Züge – einmal mit einem Vorschlag.“
  4. „Erstelle eine eigene Geschichte mit einem Gefährten deiner Wahl.“
  5. „Lass die Figur ihre Antworten vorlesen.“
  6. „Finde heraus, was ‚Kontext‘ bedeutet.“
  7. „Hol dir eine neue Figur aus dem Hub.“
  8. „Lass Musik für deine Geschichte erzeugen.“ (neu seit 0.7.2)
- [ ] **A5 · Signierte Installer:** Windows-Code-Signierung (gegen die SmartScreen-Warnung) und macOS-Notarisierung (statt
  Rechtsklick → Öffnen bzw. `xattr`) im Release-Workflow. *Nutzen:* Die Warnungen sind die größte Hürde beim ersten Start.
  *Kosten:* Zertifikat bzw. Apple Developer Account (~99 $/Jahr) – Entscheidung des Nutzers.

## B. Als Nächstes – baut auf Vorhandenem auf

- [ ] **B4 · Eigene Figuren und Geschichten teilen – Rest:** Der Weg „Paket + vorbefülltes Issue“ steht (Prüfung, ZIP im Repo-Layout,
  Lizenzwahl, Altersmarke, Issue-Vorlagen in beiden Daten-Repos; siehe `roadmap_abgeschlossen.md`). Seit 04.11.2026 prüft der
  Workflow `einreichung.yml` in beiden Daten-Repos jedes Issue „Beitrag: …“ automatisch (`tools/check_submission.py`: Archiv,
  Prüfsummen, Lizenz, Altersmarke/Repository, lokale Pfade, `vroid:`, Dubletten, Repo-Regeln) und kommentiert das Ergebnis; das
  Label `aufnehmen` legt Branch und Pull Request an. Offen: der erste echte Durchlauf mit einem Issue (dabei sehen, ob GitHub
  Anhänge ohne Anmeldung ausliefert und ob die Vorlage per `template=` greift), die Einstellung „Allow GitHub Actions to create and
  approve pull requests“ (sonst nur Ein-Klick-Link) und Lorebooks beisteuern. *Risiko:* Inhaltsprüfung und Moderation bleiben beim
  Betreiber.
- [x] **B5 · Webtoon-Export:** erledigt (05.11.2026). Stage-Menü „Als Webtoon exportieren“: PNG-Bildspalte, je Zeile ein
  Panel mit Ort, Stimmungsporträt und Sprechblase, lange Akte in mehreren Bildern (`webtoon.rs`, `services/webtoon.ts`).
  Nachrichten merken sich ihren Hintergrund (`SceneTurnMessage.bg`), Ortswechsel erscheinen also erst in Akten ab jetzt.
  Möglicher Rest: in der Sitzung erzeugte Szenenbilder an ihre Nachricht hängen und als eigene Panels zeigen.
- [ ] **B6 · OBS-Overlay mit Modell:** Das Overlay (`/overlay`) zeigt heute das Porträt mit Sprechblase und Stimmung. Offen: das
  3D-/Live2D-Modell selbst als Browser-Quelle; dafür müssten Modelldateien über den Web-Server ausgeliefert und die Viewer
  ohne Tauri-Fensteraufrufe laufen.
- [ ] **B7 · Klick auf die Benachrichtigung öffnet den Chat – Linux und macOS:** Unter Windows erledigt (`notify_chat`).
  Linux: `notify-rust` mit `wait_for_action` (klein); macOS: `UNUserNotificationCenter`-Delegate (braucht einen Mac).

## C. Später – größere Vorhaben

- [ ] **C1 · Zugriff von unterwegs:** Web-Client außerhalb des WLANs über eine verschlüsselte Relay-Verbindung ohne
  Portfreigabe, mit Push-Benachrichtigungen; danach eine eigene Handy-App über Tauri 2 (Android/iOS) prüfen. *Nutzen:*
  größte Lücke gegenüber Character.AI, Kindroid und Replika; *aber:* braucht einen Relay-Dienst und ein Sicherheitskonzept.
- [ ] **C2 · Beziehungs-Atlas:** Interaktive Knotenansicht des SQLite-Gedächtnisses (`psyche`, `relationship`,
  `episodes`, `diary`, `plans`), in der Verbindungen zeigen, welche Erlebnisse welche Überzeugungen geformt haben.
- [ ] **C3 · Zeitreise-Checkpoints:** Von einem Punkt der Beziehungs-Chronik aus einen neuen Zweig starten („Was wäre,
  wenn …?“) – mit eigenem Gedächtnisstand. Braucht Gedächtnis-Snapshots je Zweig; sinnvoll nach C2.
- [ ] **C4 · Abend-Reflexion und Monatsrückblick:** Optionaler Journaling-Modus; die Figur reflektiert den Tag, begleitet
  `habits`/`plans` und schreibt am Monatsende einen Rückblick. *Baut auf:* Tagebuch und proaktiven Nachrichten.
- [ ] **C5 · Fokus-/Pomodoro-Modus:** Fokus-Timer, bei dem der Avatar mitarbeitet, Pausen ankündigt und erledigte
  Aufgaben feiert (inspiriert von *Spirit City: Lofi Sessions*).
- [ ] **C6 · Mehrere Pets:** Bei Gruppenchats mehrere Figuren gleichzeitig, die sich anschauen und nacheinander sprechen
  (eigene Fenster, gemeinsame Physik). Erst nach D4 (Speicherbedarf des Pet-Webviews).
- [ ] **C7 · Mitguck-Modus:** Optionaler Live-Blick bei Sprachanrufen oder fürs Pet: ein verkleinerter Schnappschuss
  des aktiven Fensters oder der Webcam für Vision-Modelle. Nur mit deutlicher Anzeige und Freigabe je Sitzung.
- [ ] **C8 · Battlemap aus Text:** Improvisiert der Spielleiter einen Ort, erzeugt `stable-diffusion.cpp` eine
  Draufsicht, aus der Wände, Hindernisse und Sichtlinien für die 5e-Engine abgeleitet werden. Ungewiss, ob die
  Erkennung zuverlässig genug wird – zuerst einen kleinen Versuch.
- [ ] **C9 · Skript-Hook für eigenen Code:** Regex-Skripte und Quick-Replies gibt es; offen ist ein Hook, der eigenen
  Code (z. B. JavaScript) auf Ein-/Ausgabe anwendet. Nur in einer echten Sandbox ohne Netz und ohne Zugriff auf die App
  (z. B. QuickJS als WebAssembly im Worker), weil importierte Skripte fremder Herkunft sein können.

> Alleinstellungsmerkmal: Das Desktop-Pet zusammen mit Gedächtnis und proaktiven Nachrichten –
> „Deine Figur lebt auf deinem PC.“ Punkte, die das stärken (B3, B6, C4), haben bei gleicher Bewertung Vorrang.

## D. Plattformen & Technik – nur mit Hardware oder bei Gelegenheit

> Desktop-Pet, Stand 01.11.2026 (Windows): eigenes Fenster mit Click-Through, Ziehen, Werfen, Kontextmenü; Figur,
> Stimmung, Gesten, Lippensync und satzweise Chat-Antworten aus dem Hauptfenster; Leerlauf-Verhalten, Sitzen auf dem
> Boden und auf Fensterkanten, Streicheln nach Körperzone; Schwerkraft, mehrere Monitore; Pause bei Vollbild und
> Sperre; Tray-Eintrag, Tastenkürzel, Schalter „Beim Start öffnen“. Details: `AI.md` Abschnitt 10.

- [ ] **D1 · Desktop-Pet unter macOS:** Fenster-Scanner über `CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly |
  kCGWindowListExcludeDesktopElements)` (`kCGWindowBounds`, Ebene 0, eigene PID ausnehmen), Berechtigung
  „Bildschirmaufnahme“ für Fenstertitel prüfen und erklären; Maustastenstatus (`NSEvent.pressedMouseButtons`) für
  sofortiges Drag-Ende und Werfen; Vollbild/Sperre (`CGSessionCopyCurrentDictionary`).
- [ ] **D2 · Apple Metal:** `recommendedMaxWorkingSetSize` statt des gesamten Arbeitsspeichers als GPU-Speicher
  (falsche Modellempfehlungen auf Macs).
- [ ] **D3 · Desktop-Pet unter Linux – Folgestufe:** Grundstufe und KDE Wayland erledigt (30.10.2026). Offen:
  Fensterkanten in X11-Sitzungen über `_NET_CLIENT_LIST_STACKING`; GNOME-Wayland (bleibt ohne Click-Through und Kanten);
  Musik/Takt über den PipeWire-Monitor; Stehen auf Fenstern und Werfen von Hand unter KDE prüfen.
- [ ] **D4 · Pet-Fenster absichern:** E2E-Test mit tauri-driver und zweitem Fenster (Öffnen, Zustand vom Hauptfenster,
  Ausblenden, Wiederkehr beim Start); Speicher des zweiten Webviews messen und ggf. Modelldaten aus dem Hauptfenster
  übergeben statt erneut zu lesen.
- [ ] **D5 · Wackelige E2E-Tests beobachten:** `chat-sidebar-errors` (einmal Entwurfsvergleich) und `stage-5e` (einmal
  veraltetes Element `button[aria-label*="gegen"]`, 16.10.2026). Bei erneutem Auftreten Ursache suchen.

## E. Geparkt – wartet auf andere oder nur bei Bedarf

- [ ] **E1 · `tauri-specta`:** Erzeugte Command-Wrapper, sobald es eine stabile 2.0 gibt (Stand 20.10.2026:
  2.0.0-rc.25, verlangt exakte specta-Pins; betrifft über 250 Befehle). Bis dahin prüft `commandCheck.test.ts`.
- [ ] **E2 · TADA 3B Deutsch:** Vorgabestimme in CrispASR v0.8.43 nur noch 8 % verständlich (v0.8.41: 92 %); der deutsche
  Klon spricht mit vorgesprochenem KI-Hinweis nur den Hinweis. Neuere CrispASR-Version abwarten; alternativ den Hinweis
  als eigenen Clip vorweg erzeugen (Entscheidung des Nutzers). Englisch ist unbetroffen.
- [ ] **E3 · Weitere Laufzeit-Backends** (HIP/ROCm, SYCL) neben CUDA, Vulkan, Metal und CPU – nur bei Nachfrage.
- [ ] **E4 · Fehlende Inochi2D-Funktionen:** Emission/Bump-Licht, BC7-Texturen, `translate_children`, verschachtelte
  Mesh-Gruppen – erst mit einem Modell, das sie nutzt (Aka, Midori und Nagatoro brauchen sie nicht).
- [ ] **E5 · Lokale Embeddings fürs Gedächtnis** – nur falls FTS5 messbar nicht reicht: kleines GGUF-Embedding-Modell
  über llama-server (`--embedding`), Vektoren als BLOB in SQLite, Brute-Force-Kosinus, Fusion mit BM25 per RRF.
- [ ] **E6 · VRoid-Anmeldung über `otakusoul://vroidhub/callback`** (`tauri-plugin-deep-link`), falls der feste Port
  47823 bei Nutzern oft belegt ist.

- [ ] **E7 · Hörbuch-Export** – vorerst gestrichen (Entscheidung 02.11.2026), niedrigste Priorität: Sprachclips eines
  Kapitels (Erzähler- und Charakterstimmen) zu einer Audiodatei mit Kapitelmarken zusammenfügen.

---

## Referenz: VRoid Hub

> Doku: <https://developer.vroid.com/en/api/quick-start.html>. App angelegt am 31.10.2026
> (<https://hub.vroid.com/oauth/applications>). Client-ID (öffentlich): `f-gDzdEkE8LVgYq9Qv7j_Z2d-6-_gekmc-pzU_eYaYI`.
> Secret als GitHub-Actions-Secret `VROID_CLIENT_SECRET`. Umsetzung: `modules/vroid_hub.rs`, `avatars/VroidHubPanel.tsx`,
> `AI.md` Abschnitt 6.

**App-Einstellungen bei VRoid Hub** (bei Abweichungen hier nachziehen): Scope nur `default`; Plattformen
Windows/macOS/Linux; App-Altersfreigabe R-18 (wegen der optionalen 18+-Inhalte); VRM 0.0 und 1.0; Modell-Nutzung:
Änderung Nein, Weitergabe Nein, Avatar Ja, sexuelle Darstellung Nein, Gewalt Nein, Namensnennung Ja; für
Einzelpersonen, nicht kommerziell; nur Modelle „für alle Altersstufen“. Diese Angaben filtern serverseitig, welche
Modelle die API liefert. Für die App gilt dauerhaft: **VRoid-Modelle nie in sexuellen Inhalten und nie in Kampfszenen.**

**Pflichten aus den Entwicklerbedingungen** (<https://policies.pixiv.net/en.html#vroidhubdeveloper>, gelesen 01.11.2026):
- Nur der angemeldete Nutzer, dem VRoid Hub das Modell freigibt, darf es benutzen (Art. 4 Abs. 2 Nr. 1).
- Die App muss den hinterlegten App-Einstellungen entsprechen und die API nur für den angegebenen Zweck nutzen
  (Art. 4 Abs. 2 Nr. 2, Abs. 3). Ändert sich etwas, zuerst die Einstellungen bei VRoid anpassen.
- Modelldaten nicht außerhalb der App nutzen, keine Funktion zum Teilen mit Dritten; Bilder und Texte von VRoid Hub
  (Icons, Nutzernamen) nur in der App (Art. 6 Nr. 8, 9).
- Keine Nutzung für obszöne Inhalte (Art. 6 Nr. 10); Werk und Ansehen der Urheber wahren (Art. 4 Abs. 2 Nr. 3).
- Nichts bauen, was VRoid Hub nachbildet (Art. 6 Nr. 2): VRoid-Modelle nicht in den eigenen Hub oder die
  Avatar-Registry aufnehmen (betrifft auch B4).
- Fertige App bei pixiv melden (Art. 7, siehe A1); immer die aktuelle API-Version nutzen (Art. 9).
