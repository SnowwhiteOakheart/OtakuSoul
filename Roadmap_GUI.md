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

- [x] **Einstiegsfrage statt Technikwahl (16.10.2026, als Empfehlung umgesetzt):** „Empfohlen für deinen PC“ an Lokal (ab
  6 GB Grafikspeicher) bzw. Cloud; eine eigene dritte Frage war nicht nötig. Ursprünglicher Plan: „Wie möchtest du starten?“ – *Einfach loslegen* (empfohlener Weg je nach
  Hardware), *Mit eigenem Cloud-Konto*, *Ich kenne mich aus* (heutiger Assistent). Hardware-Erkennung entscheidet die
  Empfehlung, der Nutzer bestätigt nur.
- [x] **Modelle mit Klarnamen (16.10.2026):** `prettyModelName`, Ampel `ModelFit` (passt/knapp/zu groß). Ursprünglicher Plan: Anzeige „Bonsai 27B – sehr gut, braucht 7 GB Grafikspeicher“ statt Dateiname;
  Eignung als Ampel (passt / knapp / zu groß), Dateiname nur im Tooltip.
- [x] **Laufzeit unsichtbar machen (16.10.2026):** „Alles automatisch einrichten“ installiert fehlende Laufzeiten (empfohlene
  Variante) und das empfohlene Modell; Laufzeitkarten unter „Selbst auswählen“. Ursprünglicher Plan: llama.cpp-Laufzeit wird im einfachen Weg automatisch passend geladen; die
  Laufzeitkarte erscheint nur im Expertenweg oder bei Fehlern.
- [x] **Cloud-Anbieter geführt (16.10.2026):** Anbieter als Karten mit Kurzbeschreibung und „Wo bekomme ich einen
  Schlüssel?“ (Kosten-Hinweis fehlt noch). Ursprünglicher Plan: Anbieter als Karten mit Kurzbeschreibung, Kosten-Hinweis und Link „Wo bekomme ich
  einen Schlüssel?“; „Eigener Endpunkt“ unter „Weitere“.
- [x] **Fortschritt und Wartezeiten erklären (16.10.2026):** Restzeit „noch ca. x Min.“ beim Ein-Klick-Weg und in der
  Modellliste (`etaText`). Ursprünglicher Plan: Download-/Startzeiten realistisch anzeigen („ca. 4 Minuten“), App bleibt
  währenddessen bedienbar (Charakter wählen, Story ansehen).
- [x] **Abschluss mit Wahl (16.10.2026):** „Geschichte beginnen“ neben „Los geht's“. Ursprünglicher Plan: Letzter Schritt bietet „Mit einer Figur chatten“ oder „Eine Geschichte beginnen“.
- [x] E2E: Einsteiger-Durchlauf von leerem Profil bis zur ersten Antwort ohne Expertenbildschirm (`beginner-journey.mjs`).

## 2. Startseite & Navigation

- [x] **Startseite „Was möchtest du tun?“ (16.10.2026):** `HomeView.tsx` als erster Reiter „Start“ (Einstellung `start_tab`,
  abschaltbar), KI-Status mit „KI ändern“ bzw. „Jetzt einrichten“, Karten Weiterchatten / Geschichte / Hub.
  Ursprünglicher Plan: (statt leerem Chat): Weiterspielen (letzter Chat/letzte Szene), Mit einer
  Figur chatten, Geschichte beginnen, Figur entdecken (Hub). Leere Zustände führen hierher.
- [x] **Kopfzeile aufräumen (16.10.2026):** GPU-Anzeige und Protokoll nur im Expertenmodus, KI-Status auf der Startseite. Symbolknöpfe beschriften oder mit Tooltip + Kurztext versehen; Lokal/Cloud-Umschalter
  als verständlicher Status („Antworten kommen von: Bonsai 27B auf deinem PC“) mit Klick zur Auswahl; GPU-Anzeige nur
  im Expertenmodus oder als Detail.
- [x] **Navigation benennen (16.10.2026):** Untertitel unter jedem Eintrag, unten ausblendbar (`navHints`).
  Ursprünglicher Plan: Seitenleiste mit Untertiteln beim ersten Start („Stage – Geschichten mit mehreren
  Figuren“, „Companion – Assistent auf dem Desktop“), danach kompakt.
- [x] **Einfach-/Expertenmodus (16.10.2026):** `AppSettings.expert_mode`, Schalter oben in den Einstellungen.
  Ursprünglicher Plan: als globale Einstellung (Standard: einfach), schaltet erweiterte Bereiche überall
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
- [x] **Story-Assistent „Eigene Geschichte“ (16.10.2026):** `StoryWizard.tsx` (Genre → Figur → Gefährten → Ausgangslage mit
  zwei Vorlagen je Genre, Würfeln oder eigener Idee), Editor über „Erweiterter Editor“. Ursprünglicher Plan: 4 Schritte – Genre/Stimmung → Wer bist du? (Persona) → Wer begleitet
  dich? (Figuren, Vorschläge) → Ausgangslage (Vorlagen oder eigener Satz, „Würfel mir etwas aus“). Regeln/Technik
  (Akteure pro Runde, SG, Regelwerk) nur unter „Erweitert“; der heutige Editor bleibt für Fortgeschrittene.
- [x] **Vorschau vor dem Start:** Karte zeigt Ausgangslage, Gruppe, was man tun kann; „Starten“ mit einem Klick, ohne
  Zwischenschritte; „Weiterspielen“ für begonnene Geschichten an erster Stelle.
- [x] **Geführte erste Runde (16.10.2026):** `StageGuide.tsx` beim ersten Spiel (Gerät, `stageGuideSeen`), „?“ öffnet sie
  wieder, Erklärung der gewählten Eingabeart unter den Knöpfen. Ursprünglicher Plan: Bei der ersten Szene kurze Einblendungen zu Sagen/Tun/Denken/Regie/Flüstern,
  Vorschlägen, „Weiter“ und Auto-Play (überspringbar, später unter Hilfe abrufbar); Eingabearten mit Beispieltext im
  Platzhalter.
- [x] **Sprache durchziehen (16.10.2026):** Geschichten dreisprachig inkl. Ort/Tageszeit/Vorschläge, Spieltexte
  mitgeliefert, Spielleiter-Name und HUD-Werte übersetzt. Ursprünglicher Plan: Szenen, Vorschläge und Erzähler antworten in der App-Sprache (Szenen pflegen Übersetzungen
  wie Karten mit `otakusoul_i18n`).
- [x] **Stage-Kopfzeile ordnen (16.10.2026):** Bild erzeugen/festhalten, Erzählerstimme und Export im Menü „Mehr“ (mit
  Erklärung), Reiter mit Kurzbeschreibung im Tooltip. Ursprünglicher Plan: wichtigste Aktionen (Lobby, Vorlesen, Atmosphäre) beschriftet, seltene (Export,
  Bild, Sperre) in ein Menü; Reiter „Abenteuer / Taktik & Würfel / Kampagne“ mit Kurzerklärung.
- [x] **Szenen-Editor entrümpeln (16.10.2026):** Abschnitte Geschichte / Figuren / Bild & Klang, Erzählstil, Lorebooks,
  Akteure, Würfel und Regeln unter „Erweitert“ (beim Bearbeiten offen), lesbare Dateinamen (`assetLabel`); Vorschau-Galerie
  für Bilder und Klänge steht noch aus. Ursprünglicher Plan: Abschnitte *Geschichte* (Titel, Ort, Eröffnung, Bild), *Figuren*, *Atmosphäre*,
  *Regeln (Erweitert)*; Bild-/Tonauswahl als Vorschau-Galerie statt Dateinamen; veralteten Ambient-Hinweis entfernen
  (erledigt 16.10.2026).
- [x] **5e-Abenteuer einsteigerfreundlich (16.10.2026):** „So funktioniert ein Kampf“ beim ersten Kampf (Gerät,
  `combat5eGuideSeen`, „?“ öffnet erneut), Tooltip für LP/Verletzungsstufe, Klassentipp in der Gruppenwahl.
  Ursprünglicher Plan: kurze Regel-Einführung („So funktioniert ein Kampf“) beim ersten Kampf,
  Erklärungen zu RK/TP/Zaubergraden per Tooltip, empfohlene Klassen für Einsteiger.
- [x] E2E (`stage-gallery.mjs`, `beginner-journey.mjs`): Einsteiger startet eine mitgelieferte Story aus der Galerie, spielt zwei Runden und setzt sie fort;
  zweiter Durchlauf über den Story-Assistenten.

- [x] **Spieltexte übersetzen (16.10.2026):** Kopie in `presets/locales/`, Laden nach dem Ressourcenpfad, Nachladen aus dem
  Daten-Repo beim Start. Ursprünglicher Befund: Texte, die die App selbst in Geschichten schreibt („Player“, „Dramatic tension“, Startvorschläge
  der Demo), kommen aus `otakusoul-data/locales/*.json`, die nicht mit der App ausgeliefert werden → in deutschen Szenen
  erscheint Englisch. Locales mitliefern (Ressourcen) oder beim Start aus dem Daten-Repo laden.

## 4. Chat & Figuren

- [x] **Figurenwahl mit Vorschau (16.10.2026):** Klick aufs Bild öffnet `CharacterPreviewModal` (Wer ist das, Persönlichkeit,
  Ausgangslage, Begrüßung, „Jetzt chatten“), mitgelieferte Figuren vorn mit „Gut für den Einstieg“. Ursprünglicher Plan: Bibliothek zeigt Kurzbeschreibung, Stimmung/Genre und „Jetzt chatten“; neue Nutzer
  sehen zuerst die mitgelieferten Figuren mit Empfehlung.
- [x] **HUD verständlich (16.10.2026):** „Nachdenken“ statt „Reasoning“ mit Erklärung, Zustandswerte mit Tooltip,
  Kontextanzeige als „Gesprächsgedächtnis: x % belegt“ (Tokens im Expertenmodus). Mitgelieferte Zustandswerte (Affection,
  Energy, Mood, Trust, Intimacy, Sanity) werden im HUD übersetzt angezeigt; ihre Namen bleiben für `<state>` gleich. Ursprünglicher Plan: Werte wie Energie/Stimmung/Reasoning mit Tooltip-Erklärung, standardmäßig reduziert.
- [x] **Chat-Menü gruppieren (16.10.2026):** Lokal/Cloud-Umschalter, Werkzeuge und Prompt-Protokoll nur im Expertenmodus.
  Ursprünglicher Plan: häufige Aktionen (Neuer Chat, Stimme, Gestaltung) oben, Werkzeuge/Prompt-Log unter
  „Erweitert“.
- [x] **Figur erstellen geführt (16.10.2026):** vorhandener KI-Assistent als Hauptknopf „Figur erstellen“, leerer Editor als
  „Leere Karte“, leerer Zustand führt zum Assistenten. Ursprünglicher Plan: Assistent (Name, Aussehen, Persönlichkeit per Vorlagen/Schiebereglern, Begrüßung),
  optional mit KI-Vorschlag; der vollständige Karten-Editor bleibt.

## 5. Einstellungen

- [x] **Reiter umbenennen und ordnen (16.10.2026):** „Lokale KI“, „Cloud-KI“, „Antwortstil“, „Modelle herunterladen“,
  „Prompt (Experten)“ nur im Expertenmodus; Antwortstil zeigt die Vorlagen mit Beschreibung, Regler nur für Experten,
  Server-Tuning ebenso. Ursprünglicher Plan: „KI-Modell“ (lokal/Cloud zusammen), „Antwortstil“ (statt Sampler, mit Vorlagen
  *Kreativ / Ausgewogen / Genau*), „Stimme“, „Bilder“, „Aussehen“, „Erweitert“ (llama-server, Prompt, Sampler-Rohwerte).
- [x] **Jede Option mit Satz (17.10.2026):** Jede Einstellung in allen Reitern (einfach und Experte) hat einen Satz darunter,
  per `aria-describedby` verknüpft (`settings/OptionHint.tsx`), Fachbegriff in Klammern; Sampler-Stichworte als Sätze neu.
  `e2e/settings-hints.mjs` (Teil von `npm run e2e`) meldet jede Option ohne Beschreibung. Ursprünglich: Kurzbeschreibung
  unter jeder Einstellung; Fachbegriff in Klammern; Glossar-Link.
- [x] **Stimme vereinfachen (17.10.2026):** „Stimmen anhören und vergleichen“ (`voice/VoiceGallery.tsx`) listet alle Stimmen
  ohne Schlüssel – installierte lokale Modelle (Vorgaben und Klone), Kokoro, Edge-TTS in der Antwortsprache (Hauptregion
  zuerst) – mit Probehören und „Übernehmen“ (Engine + Stimme zusammen; E2E `voice-gallery.mjs`). Voice-ID, RegEx und RVC
  nur im Expertenmodus (16.10.), Klon-Dialog mit Zuschnitt als geführter Ablauf. Ursprünglich: „Stimme wählen“ mit
  Probehören-Liste über alle Engines; Voice-ID, RegEx, RVC unter „Erweitert“; Klon-Dialog als eigener, geführter Ablauf.
- [x] **Zurücksetzen pro Bereich (17.10.2026):** Antwortstil, Lokale KI (Tuning + Kontext/GPU-Layer nach Empfehlung) und
  Farb-Theme zeigen „N Werte weichen vom Standard ab“ und setzen mit Rückgängig zurück (`ResetSection`,
  `utils/settingDefaults.ts`, Bonsai mit eigenen Standards; E2E `settings-reset.mjs`). Ursprünglich: Zurücksetzen pro Bereich
  und Hinweis, welche Werte vom Standard abweichen.

## 6. Hilfe, Fehler & leere Zustände

- [x] **Kontext-Hilfe (16.10.2026, global):** Fragezeichen in der Kopfzeile und Befehlspalette öffnen `HelpDialog`
  (Erste Schritte, Glossar, Link zur Online-Anleitung); einzelne „?“ gibt es in Stage-Eingabe und Kampf. Ursprünglicher Plan: „?“-Symbol an komplexen Stellen mit Kurztext und Link zur passenden Anleitung (`docs/`).
- [x] **Glossar (16.10.2026):** 18 Begriffe dreisprachig mit Suche im Hilfe-Dialog. Ursprünglicher Plan: (dreisprachig) für LLM, Kontext, Token, GGUF, Quantisierung, LoRA, TTS, Klonen … – aus der App
  erreichbar.
- [x] **Fehlermeldungen mit Lösung (16.10.2026):** `utils/errorFixes.ts` (Schlüssel prüfen, Modell prüfen, lokale KI starten,
  Verbindung prüfen, kleineres Modell, Laufzeit einrichten, KI einrichten) im Chat-Fehlerbanner und in `reportFailure`.
  Ursprünglicher Plan: jede häufige Meldung (kein Modell, zu wenig VRAM, Schlüssel ungültig, Server
  startet nicht, Download abgebrochen) bekommt einen Lösungsknopf („Kleineres Modell wählen“, „Schlüssel prüfen“).
- [x] **Leere Zustände (16.10.2026):** Stage (Galerie), Bibliothek (Assistent), Lorebooks (Erklärung + Hub), Galerie hatte
  bereits einen Hinweis; Seitenleiste „x Bücher“ übersetzt. Ursprünglicher Plan: Stage, Lorebooks, Galerie, Erinnerungen, Companion erklären in einem Satz, wozu sie
  da sind, und bieten den ersten Schritt an.
- [x] **Einsteiger-Anleitung (16.10.2026):** `docs/guide-getting-started{,.de,.ru}.md`, in den READMEs verlinkt. Ursprünglicher
  Plan: `docs/guide-getting-started{,.de,.ru}.md` mit Screenshots (Chat, Story, Stimme).

## 7. Konsistenz & Barrierefreiheit

- [x] (16.10.2026) Begriffe festgelegt (AI.md), `e2e/a11y-sweep.mjs` prüft alle Ansichten auf Bedienelemente ohne Namen;
  gefundene behoben. Ursprünglich: Alle reinen Symbolknöpfe mit `aria-label` **und** sichtbarem Tooltip; einheitliche Begriffe (Szene/Story/
  Geschichte, Figur/Charakter) app-weit festlegen und in allen Locales durchziehen.
- [x] Tastaturbedienung der neuen Abläufe, Fokus-Reihenfolge, Kontrast in allen Themes (17.10.2026): `e2e/keyboard.mjs`
  bedient Story-Assistent, Charakter-Vorschau, Hilfe und Einrichtung ohne Maus (Fokus im Dialog, Tab-Falle, Escape mit
  Fokus-Rückgabe, kein positiver `tabindex`); Genre- und Anbieterwahl sind echte Radio-Gruppen mit Pfeiltasten und einem
  Tab-Halt (`utils/radioGroup.ts`). Kontrast: `e2e/contrast.mjs` misst jeden sichtbaren Text in 5 Themes × hell/dunkel
  gegen den tatsächlichen Hintergrund; behoben: Hinweistexte `slate-500`, Akzentknöpfe Cyberpunk/Midnight/Emerald, helle
  Akzenttexte, Abzeichen „Aktiv“/„Für Einsteiger“/Genre. Der Sweep prüft daneben die Story-Vorschau und kleine Fenster.
- [x] (16.10.2026) Kleine Fenster: der Sweep prüft 1024×700 auf seitlichen Überlauf und Dialoge außerhalb des Fensters –
  ohne Befund. Ursprünglich: Kleine Fenster (≥ 1024×700) ohne abgeschnittene Dialoge; Dialoge mit fester Fußzeile.

## 8. Qualitätssicherung

- [x] (16.10.2026) E2E-Szenario `e2e/beginner-journey.mjs` umgesetzt (Einrichtung → „Geschichte beginnen“ → Hanami-Live
  zwei Runden → Startseite „Weiterspielen“ → Chat), Screenshots 92–95. Ursprünglich: frisches Profil → Einrichtung (einfacher Weg, Mock) → Startseite →
  Story aus der Galerie → zwei Runden → zurück → Chat mit Figur; Screenshots je Schritt.
- [x] (16.10.2026) Textprüfung im Einsteiger-Durchlauf (llama-server, Sampler, Tokens, Reasoning, RegEx, GGUF, SillyTavern,
  „GAME MASTER“ – gefunden und behoben: Spielleiter-Name im Stage-Verlauf). Ursprünglich: Test, der in einfachen Ansichten verbotene Fachbegriffe (GGUF, llama-server, Sampler, RegEx …)
  außerhalb von „Erweitert“ meldet.
- [ ] Kurze Nutzertests mit 2–3 Einsteigern anhand einer Aufgabenliste; Befunde hier als neue Punkte eintragen.
  Aufgabenliste (ohne Hilfe vorlesen, beobachten, wo gezögert wird; Zeit pro Aufgabe notieren):
  1. „Richte die App so ein, dass eine Figur dir antworten kann.“
  2. „Unterhalte dich mit einer Figur, die dir gefällt, und lass eine Antwort neu schreiben.“
  3. „Starte eine kurze Geschichte und spiele drei Züge – einmal mit einem Vorschlag.“
  4. „Erstelle eine eigene Geschichte mit einem Gefährten deiner Wahl.“
  5. „Lass die Figur ihre Antworten vorlesen.“
  6. „Finde heraus, was ‚Kontext‘ bedeutet.“
  7. „Hol dir eine neue Figur aus dem Hub.“

## Reihenfolge (Vorschlag)

1. Abschnitt 3 *Story-Galerie + mitgelieferte Erzählgeschichten + Vorschau/Weiterspielen* (größter Hebel für den
   Einstieg), dazu die Schnellkorrekturen aus Abschnitt 0 (Ambient-Hinweis, englische Standardszene).
2. Abschnitt 1 + 2 *Einrichtung und Startseite* (erster Eindruck).
3. Abschnitt 3 *Story-Assistent und geführte erste Runde*.
4. Abschnitt 5 *Einstellungen mit Einfach/Experte*, dann 4, 6, 7; Abschnitt 8 begleitet jeden Schritt.
