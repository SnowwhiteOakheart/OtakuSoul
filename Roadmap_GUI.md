# 🧭 OtakuSoul – Roadmap Bedienbarkeit & Story-Einstieg

> Stand: 16.10.2026. Ziel: Wer die App zum ersten Mal öffnet, soll ohne Vorwissen über LLMs, GGUF, Sampler oder
> Prompts in wenigen Minuten chatten **und** eine Geschichte beginnen können – und Fortgeschrittene behalten die volle
> Kontrolle. Erledigtes wird hier abgehakt und nach Abschluss eines Abschnitts in `roadmap_abgeschlossen.md`
> zusammengefasst.

## Leitlinien (gelten für jeden Punkt)

1. **Klartext vor Fachbegriff.** Die Oberfläche sagt, *was* etwas bewirkt („Wie kreativ antwortet die Figur?“), der
   Fachbegriff steht höchstens klein daneben („Temperatur“). Ein Glossar erklärt den Rest.
2. **Einfach zuerst, Experte auf Wunsch.** Jede Seite zeigt zuerst das, was die meisten brauchen; technische Optionen
   liegen hinter „Erweitert“ bzw. im Expertenmodus – nichts geht verloren.
3. **Immer ein nächster Schritt.** Kein leerer Bildschirm ohne Handlungsangebot; jede Fehlermeldung nennt eine Lösung
   (mit Knopf, wenn möglich).
4. **Sinnvolle Vorgaben.** Was der Nutzer nicht einstellt, funktioniert trotzdem gut (Hardware-Erkennung, empfohlene
   Modelle, Vorlagen).
5. **Eine Sprache.** Oberfläche, mitgelieferte Inhalte und Antworten folgen der gewählten App-Sprache (de/en/ru).
6. **Prüfbar.** Jeder Abschnitt endet mit einem E2E-Durchlauf aus Einsteigersicht und Screenshots in
   `e2e/screenshots/`, die vor dem Abhaken angesehen werden.

## 0. Bestandsaufnahme (Befunde aus den E2E-Screenshots)

| Bereich | Befund | Screenshot |
|---|---|---|
| Kopfzeile | Umschalter „Lokales LLM / Cloud-API“, GPU-Anzeige, „Cloud mock“ und vier Symbolknöpfe ohne Beschriftung (⌘, >_, ✨, ⓘ) – für Einsteiger nicht deutbar. | `01-start.png` |
| Einrichtung | Begriffe „GGUF-Modell“, „llama.cpp-Laufzeit“, „Eigener OpenAI-kompatibler Endpunkt“; installierte Modelle erscheinen als Dateinamen (`Ternary-Bonsai-27B-PQ2_0`). | `35-…`, `37-assistent-lokal.png` |
| Einstellungen | Reiter „llama-server & Tuning“, „Sampler & Presets“, „Modell-Hub (GGUF)“; kein Einfach-/Expertenmodus. | `51-einstellungen-stimme.png` |
| Stimme | „TTS-Engine“, „Voice-ID (manuell)“, „Zusätzlicher Ausschluss-RegEx“ und RVC stehen gleichrangig neben den Grundfunktionen. | `51-…` |
| Stage-Start | Ohne Szene nur Lade-Platzhalter; kein Willkommen, keine Erklärung, was Stage ist. | `09-stage-start.png` |
| Story-Lobby | Drei Filterzeilen (Ordner, Presets/Eigene, Regelwerk) übereinander; **„Presets (0)“** – außer dem 5e-Abenteuer gibt es keine mitgelieferten Erzählgeschichten. | `79-abenteuer-lobby.png` |
| Stage-Spiel | Eingabearten Sagen/Tun/Denken/Regie/Flüstern ohne Erklärung; mehrere reine Symbolknöpfe; Standardszene und Vorschläge auf Englisch bei deutscher Oberfläche. | `10-stage-live.png` |
| Szenen-Editor | Technische Felder („Maximale Akteure pro Runde“, SG-Würfelproben) gleichrangig mit Titel/Ort; Dateinamen statt Vorschauen; **veralteter Hinweis** „Ambient-Ton erst in einem späteren Update“ (wird längst abgespielt). | `19-szenen-editor.png` |

## 1. Erster Start & Einrichtung

- [ ] **Einstiegsfrage statt Technikwahl:** „Wie möchtest du starten?“ – *Einfach loslegen* (empfohlener Weg je nach
  Hardware), *Mit eigenem Cloud-Konto*, *Ich kenne mich aus* (heutiger Assistent). Hardware-Erkennung entscheidet die
  Empfehlung, der Nutzer bestätigt nur.
- [ ] **Modelle mit Klarnamen:** Anzeige „Bonsai 27B – sehr gut, braucht 7 GB Grafikspeicher“ statt Dateiname;
  Eignung als Ampel (passt / knapp / zu groß), Dateiname nur im Tooltip.
- [ ] **Laufzeit unsichtbar machen:** llama.cpp-Laufzeit wird im einfachen Weg automatisch passend geladen; die
  Laufzeitkarte erscheint nur im Expertenweg oder bei Fehlern.
- [ ] **Cloud-Anbieter geführt:** Anbieter als Karten mit Kurzbeschreibung, Kosten-Hinweis und Link „Wo bekomme ich
  einen Schlüssel?“; „Eigener Endpunkt“ unter „Weitere“.
- [ ] **Fortschritt und Wartezeiten erklären:** Download-/Startzeiten realistisch anzeigen („ca. 4 Minuten“), App bleibt
  währenddessen bedienbar (Charakter wählen, Story ansehen).
- [ ] **Abschluss mit Wahl:** Letzter Schritt bietet „Mit einer Figur chatten“ oder „Eine Geschichte beginnen“.
- [ ] E2E: Einsteiger-Durchlauf von leerem Profil bis zur ersten Antwort ohne Expertenbildschirm.

## 2. Startseite & Navigation

- [ ] **Startseite „Was möchtest du tun?“** (statt leerem Chat): Weiterspielen (letzter Chat/letzte Szene), Mit einer
  Figur chatten, Geschichte beginnen, Figur entdecken (Hub). Leere Zustände führen hierher.
- [ ] **Kopfzeile aufräumen:** Symbolknöpfe beschriften oder mit Tooltip + Kurztext versehen; Lokal/Cloud-Umschalter
  als verständlicher Status („Antworten kommen von: Bonsai 27B auf deinem PC“) mit Klick zur Auswahl; GPU-Anzeige nur
  im Expertenmodus oder als Detail.
- [ ] **Navigation benennen:** Seitenleiste mit Untertiteln beim ersten Start („Stage – Geschichten mit mehreren
  Figuren“, „Companion – Assistent auf dem Desktop“), danach kompakt.
- [ ] **Einfach-/Expertenmodus** als globale Einstellung (Standard: einfach), schaltet erweiterte Bereiche überall
  zu; Befehlspalette findet auch versteckte Optionen.

## 3. Einstieg in Geschichten (Stage) – Schwerpunkt

> 16.10.2026: Galerie, Vorschau, Weiterspielen und Wiederaufnahme der letzten Geschichte umgesetzt (siehe Häkchen).

- [x] **Story-Galerie statt Lobby-Verwaltung:** umgesetzt in `StoryGallery.tsx` (Genre-Titelkarten statt Bildern; echte
  Titelbilder später). große Karten mit Titelbild, Genre, Dauer („ca. 30–60 Min.“),
  Schwierigkeit, Spielerzahl/Gefährten und Inhaltshinweisen; Filter in *einer* Zeile (Genre, Länge, Regeln), Ordner
  und Import unter „Verwalten“.
- [x] **Mitgelieferte Erzählgeschichten (Inhalte, 16.10.2026):** `presets/stories/scenes/` mit fünf Geschichten
  (Fantasy/Emilia, Alltag, Krimi, Horror light mit Ayu & Cosmos, Sci-Fi solo), de/en/ru, Story-Daten
  `extensions.otakusoul_story` (`StoryInfo` in `ScenePreview.story`, eigene Startvorschläge); Galerie-Anzeige folgt.
  Ursprünglicher Plan (Galerie-Anzeige erledigt): 3–5 kurze, hochwertige Starter-Stories (z. B. Fantasy-Abenteuer,
  Slice-of-Life-Schulfest, Krimi, Science-Fiction, Horror light) – dreisprachig, mit Startbild, Ambient, Zielen und
  passenden Gefährten aus den mitgelieferten Figuren; die englische Standardszene ersetzen.
- [x] **Hub-Szenen mit Story-Daten (16.10.2026):** alle 45 Szenen in `otakusoul-data` (plus Paket-Kopien) tragen
  `otakusoul_story`, übersetzte Startorte und Tageszeiten; Format in dessen `AI.md` beschrieben.
- [ ] **Story-Assistent „Eigene Geschichte“:** 4 Schritte – Genre/Stimmung → Wer bist du? (Persona) → Wer begleitet
  dich? (Figuren, Vorschläge) → Ausgangslage (Vorlagen oder eigener Satz, „Würfel mir etwas aus“). Regeln/Technik
  (Akteure pro Runde, SG, Regelwerk) nur unter „Erweitert“; der heutige Editor bleibt für Fortgeschrittene.
- [x] **Vorschau vor dem Start:** Karte zeigt Ausgangslage, Gruppe, was man tun kann; „Starten“ mit einem Klick, ohne
  Zwischenschritte; „Weiterspielen“ für begonnene Geschichten an erster Stelle.
- [ ] **Geführte erste Runde:** Bei der ersten Szene kurze Einblendungen zu Sagen/Tun/Denken/Regie/Flüstern,
  Vorschlägen, „Weiter“ und Auto-Play (überspringbar, später unter Hilfe abrufbar); Eingabearten mit Beispieltext im
  Platzhalter.
- [ ] **Sprache durchziehen:** Szenen, Vorschläge und Erzähler antworten in der App-Sprache (Szenen pflegen Übersetzungen
  wie Karten mit `otakusoul_i18n`).
- [ ] **Stage-Kopfzeile ordnen:** wichtigste Aktionen (Lobby, Vorlesen, Atmosphäre) beschriftet, seltene (Export,
  Bild, Sperre) in ein Menü; Reiter „Abenteuer / Taktik & Würfel / Kampagne“ mit Kurzerklärung.
- [ ] **Szenen-Editor entrümpeln:** Abschnitte *Geschichte* (Titel, Ort, Eröffnung, Bild), *Figuren*, *Atmosphäre*,
  *Regeln (Erweitert)*; Bild-/Tonauswahl als Vorschau-Galerie statt Dateinamen; veralteten Ambient-Hinweis entfernen
  (erledigt 16.10.2026).
- [ ] **5e-Abenteuer einsteigerfreundlich:** kurze Regel-Einführung („So funktioniert ein Kampf“) beim ersten Kampf,
  Erklärungen zu RK/TP/Zaubergraden per Tooltip, empfohlene Klassen für Einsteiger.
- [ ] E2E: Einsteiger startet eine mitgelieferte Story aus der Galerie, spielt zwei Runden und setzt sie fort;
  zweiter Durchlauf über den Story-Assistenten.

- [ ] **Spieltexte übersetzen:** Texte, die die App selbst in Geschichten schreibt („Player“, „Dramatic tension“, Startvorschläge
  der Demo), kommen aus `otakusoul-data/locales/*.json`, die nicht mit der App ausgeliefert werden → in deutschen Szenen
  erscheint Englisch. Locales mitliefern (Ressourcen) oder beim Start aus dem Daten-Repo laden.

## 4. Chat & Figuren

- [ ] **Figurenwahl mit Vorschau:** Bibliothek zeigt Kurzbeschreibung, Stimmung/Genre und „Jetzt chatten“; neue Nutzer
  sehen zuerst die mitgelieferten Figuren mit Empfehlung.
- [ ] **HUD verständlich:** Werte wie Energie/Stimmung/Reasoning mit Tooltip-Erklärung, standardmäßig reduziert.
- [ ] **Chat-Menü gruppieren:** häufige Aktionen (Neuer Chat, Stimme, Gestaltung) oben, Werkzeuge/Prompt-Log unter
  „Erweitert“.
- [ ] **Figur erstellen geführt:** Assistent (Name, Aussehen, Persönlichkeit per Vorlagen/Schiebereglern, Begrüßung),
  optional mit KI-Vorschlag; der vollständige Karten-Editor bleibt.

## 5. Einstellungen

- [ ] **Reiter umbenennen und ordnen:** „KI-Modell“ (lokal/Cloud zusammen), „Antwortstil“ (statt Sampler, mit Vorlagen
  *Kreativ / Ausgewogen / Genau*), „Stimme“, „Bilder“, „Aussehen“, „Erweitert“ (llama-server, Prompt, Sampler-Rohwerte).
- [ ] **Jede Option mit Satz:** Kurzbeschreibung unter jeder Einstellung; Fachbegriff in Klammern; Glossar-Link.
- [ ] **Stimme vereinfachen:** „Stimme wählen“ mit Probehören-Liste über alle Engines; Voice-ID, RegEx, RVC unter
  „Erweitert“; Klon-Dialog als eigener, geführter Ablauf.
- [ ] **Zurücksetzen pro Bereich** und Hinweis, welche Werte vom Standard abweichen.

## 6. Hilfe, Fehler & leere Zustände

- [ ] **Kontext-Hilfe:** „?“-Symbol an komplexen Stellen mit Kurztext und Link zur passenden Anleitung (`docs/`).
- [ ] **Glossar** (dreisprachig) für LLM, Kontext, Token, GGUF, Quantisierung, LoRA, TTS, Klonen … – aus der App
  erreichbar.
- [ ] **Fehlermeldungen mit Lösung:** jede häufige Meldung (kein Modell, zu wenig VRAM, Schlüssel ungültig, Server
  startet nicht, Download abgebrochen) bekommt einen Lösungsknopf („Kleineres Modell wählen“, „Schlüssel prüfen“).
- [ ] **Leere Zustände überall:** Stage, Lorebooks, Galerie, Erinnerungen, Companion erklären in einem Satz, wozu sie
  da sind, und bieten den ersten Schritt an.
- [ ] **Einsteiger-Anleitung** `docs/guide-getting-started{,.de,.ru}.md` mit Screenshots (Chat, Story, Stimme).

## 7. Konsistenz & Barrierefreiheit

- [ ] Alle reinen Symbolknöpfe mit `aria-label` **und** sichtbarem Tooltip; einheitliche Begriffe (Szene/Story/
  Geschichte, Figur/Charakter) app-weit festlegen und in allen Locales durchziehen.
- [ ] Tastaturbedienung der neuen Abläufe (Galerie, Assistenten), Fokus-Reihenfolge, Kontrast in allen Themes.
- [ ] Kleine Fenster (≥ 1024×700) ohne abgeschnittene Dialoge; Dialoge mit fester Fußzeile.

## 8. Qualitätssicherung

- [ ] E2E-Szenario `e2e/beginner-journey.mjs`: frisches Profil → Einrichtung (einfacher Weg, Mock) → Startseite →
  Story aus der Galerie → zwei Runden → zurück → Chat mit Figur; Screenshots je Schritt.
- [ ] Textprüfung: Test, der in einfachen Ansichten verbotene Fachbegriffe (GGUF, llama-server, Sampler, RegEx …)
  außerhalb von „Erweitert“ meldet.
- [ ] Kurze Nutzertests mit 2–3 Einsteigern anhand einer Aufgabenliste; Befunde hier als neue Punkte eintragen.

## Reihenfolge (Vorschlag)

1. Abschnitt 3 *Story-Galerie + mitgelieferte Erzählgeschichten + Vorschau/Weiterspielen* (größter Hebel für den
   Einstieg), dazu die Schnellkorrekturen aus Abschnitt 0 (Ambient-Hinweis, englische Standardszene).
2. Abschnitt 1 + 2 *Einrichtung und Startseite* (erster Eindruck).
3. Abschnitt 3 *Story-Assistent und geführte erste Runde*.
4. Abschnitt 5 *Einstellungen mit Einfach/Experte*, dann 4, 6, 7; Abschnitt 8 begleitet jeden Schritt.
