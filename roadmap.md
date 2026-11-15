# 🗺️ OtakuSoul – Roadmap (offen)

> Stand: 15.11.2026 (nach 0.7.9). Diese Datei ist die **einzige** Liste offener Punkte; `roadmap_abgeschlossen.md`
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
| A5 | Signierte Installer (Windows, macOS) | ★★★ | S–M | Zertifikat bzw. Apple-Konto (Kosten) |
| **T** | **Wartet auf Tester – erst nach deren Rückmeldung** | | | |
| T1 | Nutzertests mit 2–3 Einsteigern (früher A4) | ★★★ | S | Testpersonen |
| T2 | Stage: separates Spielleiter-Modell (früher E8) | – | M–L | Nutzerfeedback, Messung |
| **B** | **Als Nächstes – baut auf Vorhandenem auf** | | | |
| B4 | Teilen: erster echter Durchlauf über ein Issue | ★★ | S | dein GitHub-Konto, Repo-Einstellung |
| B7 | Benachrichtigungsklick unter macOS (Windows und Linux erledigt) | ★ | M | Mac |
| **C** | **Später – größere Vorhaben** | | | |
| C1 | Zugriff von unterwegs (Relay), danach Handy-App | ★★★ | XL | Relay-Dienst, Sicherheitskonzept |
| C6 | Mehrere Pets gleichzeitig | ★ | L | – |
| C7 | Mitguck-Modus (Bildschirm/Webcam) | ★★ | L | Vision-Modell, Datenschutzkonzept |
| **D** | **Plattformen & Technik – nur mit Hardware oder bei Gelegenheit** | | | |
| D1 | Desktop-Pet unter macOS | ★★ | M | Mac |
| D2 | Apple Metal: richtiger GPU-Speicher | ★★ | S | Mac |
| D3 | Desktop-Pet unter Linux – Folgestufe | ★ | M | X11-, GNOME-, KDE-Systeme |
| **E** | **Geparkt – wartet auf andere oder nur bei Bedarf** | | | |
| E1 | `tauri-specta` (wartet auf stabile 2.0) | – | L | – |
| E2 | TADA 3B Deutsch (wartet auf CrispASR) | – | S | – |
| E3 | HIP/ROCm, SYCL | – | M | AMD-/Intel-GPU, Nachfrage |
| E4 | Fehlende Inochi2D-Funktionen | – | M | Modell, das sie nutzt |
| E5 | Lokale Embeddings fürs Gedächtnis | – | M | Messung, dass FTS5 nicht reicht |
| E6 | VRoid-Anmeldung über `otakusoul://`-Link | – | S | Berichte über belegten Port |
| E7 | Hörbuch-Export (vorerst gestrichen, 02.11.2026) | ★ | M | – |
| E9 | Linux-Abhängigkeiten ohne Wartung (früher D6): wartet auf zbus-6-Plugins, keyring bzw. Tauri 3 | ★★ | M | stabile Upstream-Versionen, KDE-/GNOME-Prüfplatz |

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
- [ ] **A5 · Signierte Installer:** Windows-Code-Signierung (gegen die SmartScreen-Warnung) und macOS-Notarisierung (statt
  Rechtsklick → Öffnen bzw. `xattr`) im Release-Workflow. *Nutzen:* Die Warnungen sind die größte Hürde beim ersten Start.
  *Kosten:* Zertifikat bzw. Apple Developer Account (~99 $/Jahr) – Entscheidung des Nutzers.

## T. Wartet auf Tester – erst nach deren Rückmeldung

> Diese Punkte brauchen andere Menschen. Sie ruhen, bis die Tester Rückmeldung gegeben haben; Befunde dann als
> neue Punkte in A/B eintragen. Stand 15.11.2026: Ersteinrichtung, Hub-Hinweise und automatische Laufzeit-Einrichtung
> sind neu – genau das prüfen Aufgabe 1 und 7 von T1.

- [ ] **T1 · Nutzertests mit 2–3 Einsteigern** (früher A4) anhand einer Aufgabenliste; Befunde hier als neue Punkte eintragen.
  Ohne Hilfe vorlesen, beobachten, wo gezögert wird, Zeit pro Aufgabe notieren:
  1. „Richte die App so ein, dass eine Figur dir antworten kann.“
  2. „Unterhalte dich mit einer Figur, die dir gefällt, und lass eine Antwort neu schreiben.“
  3. „Starte eine kurze Geschichte und spiele drei Züge – einmal mit einem Vorschlag.“
  4. „Erstelle eine eigene Geschichte mit einem Gefährten deiner Wahl.“
  5. „Lass die Figur ihre Antworten vorlesen.“
  6. „Finde heraus, was ‚Kontext‘ bedeutet.“
  7. „Hol dir eine neue Figur aus dem Hub.“
  8. „Lass Musik für deine Geschichte erzeugen.“ (neu seit 0.7.2)
- [ ] **T2 · Separates Spielleiter-Modell** (früher E8) – zurückgestellt (15.11.2026), Plan in `roadmap_spielleiter_als_seperates_modell.md`
  (lokal). Steuernde Stage-Aufrufe (Planer, Routing, Kampfwahl, Archiv, Faktenprüfung) an ein eigenes Instruct-Modell statt ans
  Erzählmodell. Lohnt vor allem bei RP-Fine-Tunes als Erzählmodell oder für „lokal erzählen, Cloud plant“. Erst messen
  (Reparatur-/Fehlerquote des Planer-JSON, Ersatzwahl beim Routing, Planer-Latenz je Modell), dann nur Phase A (zweiter
  Endpoint über `StageLlm`); ein zweiter lokaler llama-server kostet auf 8–12-GB-Karten mehr, als er bringt.

## B. Als Nächstes – baut auf Vorhandenem auf

- [ ] **B4 · Eigene Figuren, Geschichten und Lorebooks teilen – Rest:** Der Weg „Paket + vorbefülltes Issue“ steht (Prüfung, ZIP im Repo-Layout,
  Lizenzwahl, Altersmarke, Issue-Vorlagen in beiden Daten-Repos; siehe `roadmap_abgeschlossen.md`). Seit 04.11.2026 prüft der
  Workflow `einreichung.yml` in beiden Daten-Repos jedes Issue „Beitrag: …“ automatisch (`tools/check_submission.py`: Archiv,
  Prüfsummen, Lizenz, Altersmarke/Repository, lokale Pfade, `vroid:`, Dubletten, Repo-Regeln) und kommentiert das Ergebnis; das
  Label `aufnehmen` legt Branch und Pull Request an. Offen: der erste echte Durchlauf mit einem Issue (dabei sehen, ob GitHub
  Anhänge ohne Anmeldung ausliefert und ob die Vorlage per `template=` greift), die Einstellung „Allow GitHub Actions to create and
  approve pull requests“ (sonst nur Ein-Klick-Link). Lorebooks beisteuern ist seit 15.11.2026 da (Knopf in der
  Lorebook-Ansicht, `check_lorebook`, Paket nach `lorebooks_gateway/`, Prüfung und Aufnahme in beiden Daten-Repos; E2E
  `lorebook-contribute.mjs`, dessen Paket `check_submission.py` annimmt). *Risiko:* Inhaltsprüfung und Moderation bleiben beim
  Betreiber.
- [ ] **B7 · Klick auf die Benachrichtigung öffnet den Chat – macOS:** Windows (`notify_chat`, Toast) und Linux/BSD
  (15.11.2026: Plugin-Benachrichtigung mit `charId`/`chatId`, Klick über `on_action`/D-Bus, `register_notification_click`)
  erledigt. Unter Linux noch einmal in einer echten Sitzung (GNOME, KDE, dunst) klicken. macOS: das Plugin meldet Klicks
  dort ebenfalls über `on_action` – mit einem Mac ausprobieren, sonst `UNUserNotificationCenter`-Delegate.

## C. Später – größere Vorhaben

- [ ] **C1 · Zugriff von unterwegs:** Web-Client außerhalb des WLANs über eine verschlüsselte Relay-Verbindung ohne
  Portfreigabe, mit Push-Benachrichtigungen; danach eine eigene Handy-App über Tauri 2 (Android/iOS) prüfen. *Nutzen:*
  größte Lücke gegenüber Character.AI, Kindroid und Replika; *aber:* braucht einen Relay-Dienst und ein Sicherheitskonzept.
- [ ] **C6 · Mehrere Pets:** Bei Gruppenchats mehrere Figuren gleichzeitig, die sich anschauen und nacheinander sprechen
  (eigene Fenster, gemeinsame Physik). Speicher je Pet-Webview: ~57 MB JS-Heap mit VRM-Figur (D4, 15.11.2026).
- [ ] **C7 · Mitguck-Modus:** Optionaler Live-Blick bei Sprachanrufen oder fürs Pet: ein verkleinerter Schnappschuss
  des aktiven Fensters oder der Webcam für Vision-Modelle. Nur mit deutlicher Anzeige und Freigabe je Sitzung.

> Alleinstellungsmerkmal: Das Desktop-Pet zusammen mit Gedächtnis und proaktiven Nachrichten –
> „Deine Figur lebt auf deinem PC.“ Punkte, die das stärken (C6), haben bei gleicher Bewertung Vorrang.

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

- [ ] **E9 · Nicht mehr gepflegte Linux-Abhängigkeiten** (früher D6, geparkt 15.11.2026): `proc-macro-error` und glib 0.18
  (RUSTSEC-2024-0429) kommen aus den GTK-3-Bindings von Tauri 2, `zbus_names`/`zvariant`/`zvariant_derive` aus zbus 5 über die
  Tauri-Plugins notification/opener/single-instance, keyring/secret-service und unsere eigene Abhängigkeit. Für keinen Elternteil
  gibt es eine stabile Version mit zbus 6 bzw. neuer GTK-Linie (nur 3.0-Alpha bzw. secret-service 6.0-rc). Wiederaufnehmen, sobald
  eine davon stabil ist; dann zusammen mit dem Umbau auf zbus 6, das keine blockierende API mehr hat (Sperrbildschirm in
  `desktop_windows.rs`, KWin-Brücke `kwin_bridge.rs`). Details und Prüfliste: `docs/ungepflegte-abhaengigkeiten-2026-11-07.md`.

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
