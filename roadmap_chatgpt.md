# Roadmap aus der unabhängigen App-Durchsicht

Stand: 04.10.2026. Grundlage: Quellcode, Funktionsstruktur und vorhandene E2E-Screenshots;
kein vollständiger Praxistest. Die bestehende ROADMAP.md wurde nicht als Grundlage verwendet.

Die Reihenfolge priorisiert Sicherheit und Verlässlichkeit vor zusätzlichen Funktionen.
Abgehakte Punkte sind umgesetzt und geprüft; offene Punkte sind noch keine zugesagten Features.

## 1. Companion-Berechtigungen (höchste Priorität)

- [x] Automatische Freigabe auf eine ausdrückliche Liste bekannter interner Werkzeuge begrenzen.
- [x] MCP-Werkzeuge und unbekannte Werkzeuge grundsätzlich zur Bestätigung vorlegen.
- [x] Schreibende Dateiaktionen auch bei Großschreibung und umgebenden Leerzeichen bestätigen lassen.
- [x] Screenshots und Zwischenablagezugriffe wegen ihrer sensiblen Inhalte bestätigen lassen.
- [x] Regressionstests für Freigabe, Ablehnung, unbekannte Tools und Varianten der Dateiaktionen ergänzen.
- [x] Echte Betriebssystem-Isolation für Skripte mit begrenzten Datei-, Netzwerk- und Prozessrechten entwerfen und umsetzen. *(Ersetzt durch Neuzuschnitt, umgesetzt 04.10.: `allow_code_execution`, standardmäßig aus und nur bis zum Neustart; Backend prüft bei Anfrage und Ausführung; Banner zeigt den vollständigen Code.)*
  *Neuzuschnitt (04.10.):* Eine plattformübergreifende Sandbox (bubblewrap/Landlock, AppContainer, macOS) ist
  unverhältnismäßig. Stattdessen Skript-Ausführung standardmäßig aus, nur per Schalter mit Warnung; vor der
  Bestätigung den vollständigen Skripttext zeigen.
- [x] Berechtigungen und Auswirkungen pro Werkzeug verständlich anzeigen; die Grenzen der Skript-Ausführung klar benennen (`companion/toolEffects.ts`: Wirkungs-Chips im Freigabe-Banner; Hinweis „ohne Sandbox“ am Schalter).

Abnahme: Ohne Bestätigung wird kein unbekanntes oder externes Werkzeug ausgeführt;
Schreibaktionen umgehen die Prüfung nicht durch anders formatierte Argumente.
Arbeitsverzeichnis und Timeout allein gelten nicht als Betriebssystem-Sandbox.

## 2. Speichern und Fehlerrückmeldungen

- [x] Manuelle Erinnerungen und Tagebucheinträge: Schreibfehler weitergeben, Eingaben erhalten und Wiederholen ermöglichen.
- [x] Tagebuchgenerierung und Memory-Backup-Erstellung: Fehler sichtbar anzeigen.
- [x] Psychologie und Beziehung als explizit speicherbare Entwürfe bearbeiten; Schreibfehler erhalten Änderungen.
- [x] Markdown-Editor: Lade- und Schreibfehler erhalten Entwürfe; laufende Vorgänge sperren die Bearbeitung.
- [x] Reflexionsfehler sichtbar halten; SoW-Import und Snapshot-Wiederherstellung bei Schreibfehlern vollständig zurückrollen.
- [x] Memory-Übersicht und Snapshot-Liste: Lesefehler sichtbar anzeigen, geladene Daten erhalten und Wiederholen ermöglichen.
- [x] Chat-Seitenleiste: Titel, Author's Note und Zusammenfassung erhalten Entwürfe und melden Schreibfehler.
- [x] Inline-Nachrichteneditor: Schreibfehler erhalten den Entwurf; Wiederholen übernimmt erst nach erfolgreichem Schreiben.
- [x] Speicherfehler vom Store an die Oberfläche weitergeben und verständlich anzeigen (`store/reportFailure.ts`; Aktionen mit eigener Rückmeldung werfen weiter).
- [x] Erfolgsmeldungen ausschließlich nach erfolgreichem Speichern anzeigen (u. a. Backup, Bild-/Discord-/Web-Einstellungen, Chat-Import, Szenenimport, KI-Charakterentwurf).
- [x] Eingaben bei Fehlern erhalten und Wiederholen anbieten (Formulare bleiben offen, Entwürfe erhalten).
- [x] Memory-, Psychologie-, Beziehungs-, Tagebuch- und Chat-Editoren auf verschluckte Fehler prüfen.
  *Erledigt (04.10.):* Durchgang durch alle Store-Aktionen: Vom Nutzer ausgelöste Aktionen zeigen Fehler an (v. a. Stage-Store, Companion, Ökosystem);
  Hintergrundabrufe dürfen weiter nur protokollieren.
- [x] Fehlgeschlagenes Speichern mit Tests absichern, insbesondere manuell angelegte Erinnerungen.

Abnahme: Ein fehlgeschlagener Speichervorgang leert keine Eingabe und meldet keinen Erfolg.

## 3. Chat senden, abbrechen und wiederholen

- [x] Promptaufbau und alle nachfolgenden Schritte in eine gemeinsame Fehlerbehandlung aufnehmen.
- [x] Generierungszustand bei jedem Fehler und Abbruch zuverlässig zurücksetzen (Arbeitspakete 9, 12–16: `finally`, getrennte Sperren und Abbruchkanäle).
- [x] Bereits gespeicherte Nutzernachrichten beim Wiederholen erkennen; Duplikate vermeiden.
- [x] Stage-Routing, Archivierung und Konsistenzprüfung abbrechen und offene Arbeit später nachholen.
- [x] Stage-Planung und Kontextvorbereitung einschließlich interner Zusammenfassung abbrechen können.
- [x] Abbruchkanäle von Chat und Soul Stage trennen, einschließlich Stage-Stopp im Frontend.
- [x] Parallele native Chat-Anfragen und konkurrierende Stage-Runden, Neu-Generieren und Rast vor ihrem Start ablehnen.
- [x] Warten auf Frontend-Promptvorbereitung und Datei-Lesen nach erfolgreichem Abbruch sofort beenden; späte Resultate verwerfen.
- [x] Native Text-, Gedanken- und Abschlussereignisse an eine eindeutige Generierungs-ID binden.
- [x] Sitzungsabrufe ordnen, alte Verläufe während des Ladens ausblenden und Lesefehler wiederholbar anzeigen.
- [x] Wartende HTTP-Anfragen und inaktive SSE-Streams bei Backend-Abbruch beenden.
- [x] Gleichzeitiges Senden, Sitzungswechsel und verspätete Antworten eindeutig einer Sitzung zuordnen (Arbeitspakete 10, 11, 15: Abrufnummern, `generation_id`, native Sperren).
- [x] Fehler bei Upload, Promptaufbau, Streaming und Antwortspeicherung gezielt testen.

Abnahme: Kein Fehler lässt den Chat dauerhaft beschäftigt zurück; Wiederholen erzeugt keine doppelte Nutzernachricht.

## 4. Konsistenz nach Verlaufsänderungen

- [x] Zusammenfassungen nach Bearbeiten, Löschen und Swipe-Wechsel gezielt verwerfen oder neu erstellen (`discard_stale_summary`: Änderung im zusammengefassten Teil verwirft sie, sie entsteht beim nächsten Überlauf neu).
- [ ] Aus geänderten Nachrichten abgeleitete Erinnerungen erkennen und abgleichen. *(Zusammen mit Abschnitt 5 umsetzen: braucht die Quellverknüpfung.)*
- [ ] Auswirkungen einer Verlaufsänderung auf die Figur verständlich anzeigen.
- [x] Regressionstests für korrigierte und entfernte Ereignisse ergänzen (Rust: alle Änderungswege; Store: Bearbeiten/Swipe).

Abnahme: Entfernte oder ersetzte Ereignisse gelangen nicht über veraltete Zusammenfassungen erneut in den Prompt.

## 5. Soul Memory nachvollziehbar korrigieren

- [ ] Erinnerungen mit Ursprungsunterhaltung und Quellnachrichten verknüpfen.
  *Neuzuschnitt (04.10.):* In Etappen. Zuerst Bearbeiten/Vergessen einzelner Erinnerungen samt Quelle (Chat,
  Nachricht), dann Schutz wichtiger Erinnerungen; Tatsache/Deutung und Änderungshistorie zuletzt.
- [ ] Bestätigte Tatsachen von Modellinterpretationen unterscheiden.
- [ ] Einzelne Erinnerungen bearbeiten und gezielt vergessen können.
- [ ] Wichtige Erinnerungen vor automatischer Überschreibung schützen.
- [ ] Automatische Änderungen mit einer nachvollziehbaren Änderungshistorie versehen.

Abnahme: Der Nutzer kann Herkunft und Änderungen einer Erinnerung nachvollziehen und sie gezielt korrigieren.

## 6. Einstieg bis zur ersten Antwort

- [x] Cloud-Verbindung und Modell im Wizard tatsächlich testen („Verbindung testen“ über `quick_reply`, 90 s Obergrenze).
- [x] Lokalen Modelldownload, Laufzeitinstallation und Serverstart durchgehend begleiten (Laufzeitkarte und Einstiegsmodelle im Wizard; die erste Antwort startet den Server).
- [x] Hardwaregerechte Auswahl und verständliche Fehlerbehebung anbieten (`models_hub::starter_models`: Qwen3 4B/8B, Mistral Nemo 12B, Mistral Small 24B mit SHA-256, Empfehlung nach VRAM; Fehler mit Ursache und Hinweis).
- [x] Mit einer erfolgreichen ersten Charakterantwort abschließen (letzter Schritt holt eine echte Begrüßung des gewählten Charakters).

Abnahme: Eine frische Installation führt ohne Suche in mehreren Einstellungsseiten zum funktionierenden Chat.

## 7. Oberfläche und Orientierung

- [ ] Kompakte Chatansicht und einklappbare Zusatzinformationen anbieten.
- [ ] Werkzeugleisten, HUD und Avatarsteuerung auf das aktuelle Erlebnis fokussieren.
- [x] Statusanzeige an das tatsächlich gewählte Backend anpassen (Cloud zeigt Anbieter-Modell, Klick öffnet die passenden Einstellungen; vor dem Laden der Einstellungen kein Status).
- [x] Einstellungssuche mit direktem Sprung zur passenden Option ergänzen (Befehlspalette: Einstellungsseiten, einzelne Optionen mit Hervorhebung, Integrationsreiter; Suchwörter dreisprachig). *(Neuzuschnitt: Befehlspalette Strg+K um Einstellungsabschnitte erweitern statt eigener Suche; 89/90/93 erst bei konkretem Anlass.)*
- [ ] Kleine Fenster, Tastaturbedienung und verschiedene Themes anhand von E2E-Screenshots prüfen.

Abnahme: Ein funktionierender Cloud-Chat erscheint nicht wegen eines gestoppten lokalen Servers als gestört.

## 8. Lange Geschichten navigieren

- [ ] Volltextsuche im Chat mit Sprung zur Fundstelle ergänzen.
- [ ] Wichtige Szenen mit Lesezeichen markieren können.
- [ ] Ab einer Nachricht einen alternativen Handlungsverlauf beginnen können. *(Neuzuschnitt: „Ab hier als neuen Chat fortsetzen“ statt Verzweigungsbaum. Soul Memory gehört zum Charakter; die Grenze wird benannt statt vollständig getrennt.)*
- [ ] Bei Verzweigungen Verlauf, Zusammenfassung und Erinnerungen konsistent trennen.

Abnahme: Alternative Geschichten beeinflussen sich nicht unbeabsichtigt über gemeinsame abgeleitete Erinnerungen.

## 9. Hintergrundaufgaben sichtbar machen

- [ ] Gemeinsame Aufgabenanzeige für Downloads, Reflexion, Zusammenfassung, Bilder und Modellwechsel schaffen.
- [ ] Laufend, wartend, erfolgreich, fehlgeschlagen und abgebrochen unterscheiden.
- [ ] Abbrechen und Wiederholen anbieten, soweit der jeweilige Vorgang es unterstützt.
- [ ] Wartezeiten durch Modellbelegung oder VRAM-Wechsel erklären.

Abnahme: Der Nutzer erkennt, woran die App arbeitet und warum eine Aufgabe wartet.

## Umsetzung und Prüfung

- Erstes Arbeitspaket: Companion-Freigabeprüfung und Regressionstests; Betriebssystem-Isolation bleibt separat offen.
- Vor jedem Commit: `npm run check`; bei UI-Änderungen zusätzlich `npm run e2e` und visuelle Screenshot-Prüfung.
- Nur eigene Änderungen committen. Ergebnisse und verbleibende Grenzen hier festhalten.

### Erstes Arbeitspaket – 03.10.2026

Die automatische Freigabe nutzt jetzt eine ausdrückliche Liste interner Werkzeuge.
Externe und unbekannte Tools sowie sensible Desktopzugriffe warten auf Bestätigung.
Dateiaktionen werden wie bei der Ausführung normalisiert; ungültige Aktionswerte werden nicht automatisch freigegeben.
Die Beschriftungen für Screenshot und Zwischenablage wurden in Deutsch, Englisch und Russisch angepasst.

`npm run check` bestanden: 358 Rust-Tests und 101 Frontend-Tests; Modell-/GPU-Tests bleiben bewusst ignoriert.
Der erste Lauf in der Sandbox scheiterte am lokalen HTTP-Testserver eines vorhandenen Download-Tests.
Der vollständige Wiederholungslauf mit isoliertem Profil außerhalb der Sandbox bestand.
E2E-Prüfung bestanden: alle acht bisherigen Szenarien sowie der neue Companion-Freigabetest.
Screenshot `e2e/screenshots/28-companion-freigabe.png` visuell geprüft: Freigabehinweis,
Werkzeugargumente und Ablehnen-/Freigeben-Schaltflächen sind vollständig sichtbar.
Der Companion-Test wurde nach dem bereits laufenden Gesamtlauf separat ausgeführt und ist künftig
in `npm run e2e` und `npm run e2e:run` integriert.
Betriebssystem-Isolation und detaillierte Berechtigungsanzeigen bleiben offen.

### Zweites Arbeitspaket – 03.10.2026

Manuelle Erinnerungen und Tagebucheinträge geben Schreibfehler an die Formulare weiter.
Bei einem Fehler bleiben Text, Titel, Kategorie, Bedeutung und Stimmung erhalten; erneutes Speichern ist möglich.
Erfolgsmeldungen und das Leeren der Eingaben erfolgen erst nach erfolgreichem Schreiben.
Während des Schreibens sind die jeweiligen Felder und der Speicherknopf gesperrt.
Fehler bei Tagebuchgenerierung und Memory-Backup-Erstellung werden ebenfalls angezeigt.

Zusätzlich wurde ein im E2E-Test gefundener Layoutfehler behoben: Der Memory-Drawer rendert
per Portal in `document.body`, statt durch den `backdrop-filter` der HUD-Leiste begrenzt zu werden.
Ein Regressionstest prüft die Platzierung außerhalb des HUD.

Sieben neue Frontend-Regressionstests prüfen unter anderem Fehler, Wiederholen, Doppelsenden und Drawer-Platzierung.
Der neue E2E-Test erzwingt echte SQLite-Schreibfehler mit temporären Triggern ausschließlich im Wegwerfprofil.
Er prüft erhaltene Eingaben, ausbleibende Erfolgsmeldungen und genau einen gespeicherten Eintrag nach Wiederholung.
Screenshot `e2e/screenshots/29-erinnerung-speicherfehler.png` wurde visuell geprüft.

Offen in Abschnitt 2: Psychologie-/Beziehungsfelder mit Entwürfen statt Speichern bei jedem Tastendruck,
Fehler bei Markdown-Nachladen und weiteren Chat-Editoren sowie konsistente Rückmeldungen bei Aktualisierungsfehlern.
`npm run check` bestanden: 358 Rust-Tests und 108 Frontend-Tests.
Der aktuelle Build wurde mit `npm run e2e` erstellt; anschließend bestand die gesamte Suite
mit `npm run e2e:run` (zehn Szenarien einschließlich Companion-Freigabe und Memory-Schreibfehlern).
Die Screenshot-Prüfung bestätigt den vollständigen Drawer, die sichtbare Fehlermeldung und den erhaltenen Entwurf.

### Drittes Arbeitspaket – 03.10.2026

Psychologie und Beziehung schreiben jetzt erst beim ausdrücklichen Speichern statt bei jeder Eingabe.
Texte, Intensität, Glaubenssätze, Vorlieben und Meilensteine bilden einen gemeinsamen Entwurf pro Reiter.
Ein sichtbarer Hinweis kennzeichnet ungespeicherte Änderungen; Verwerfen stellt die gespeicherten Werte wieder her.
Schreibfehler werden angezeigt, ohne den Entwurf zu löschen oder Erfolg zu melden.

Entwürfe überleben Reiterwechsel und das Schließen des Inspectors, solange die Chatansicht gemountet bleibt.
Sie werden nach Charakter und Persona getrennt. Laufende Speichervorgänge sperren die Felder auch nach Wiederöffnen.
Beim Charakter-/Personawechsel wird die alte Übersicht entfernt; verspätete Antworten für einen anderen Kontext werden ignoriert.
Nach erfolgreichem Schreiben bleibt der gespeicherte Wert auch dann verfügbar, wenn das anschließende Nachladen fehlschlägt.

Neun zusätzliche Frontend-Tests prüfen unter anderem Fehler/Wiederholen, Verwerfen, Kontextwechsel,
Schließen während eines Speichervorgangs und fehlgeschlagenes Nachladen nach erfolgreichem Schreiben.
Der neue E2E-Test prüft ausbleibende Datenbankänderungen beim Tippen und erzwingt echte SQLite-Schreibfehler
für beide Reiter ausschließlich im Wegwerfprofil.

Offen in Abschnitt 2 bleiben Markdown-Nachladen, weitere Chat-Editoren und sichtbare Rückmeldungen für reine Lesefehler.
Entwürfe werden noch nicht dauerhaft auf der Festplatte gesichert.

`npm run check` bestanden: 358 Rust-Tests und 117 Frontend-Tests.
Der aktuelle Build wurde mit `npm run e2e` erstellt; der abschließende Gesamtlauf mit `npm run e2e:run`
bestand alle elf Szenarien. WebKit-spezifische Textauswahl und die Auswahl des sichtbaren Verwerfen-Knopfs
wurden im neuen Test korrigiert. Screenshots 30–31 wurden visuell geprüft: Entwurf, Speicheraktionen
und Fehlerhinweis sind vollständig sichtbar.

### Viertes Arbeitspaket – 03.10.2026

`fetchMemoryMarkdown` gibt Lesefehler weiter und ersetzt den Zustand nicht durch leere Inhalte.
Der manuelle Nachladevorgang verwirft Entwürfe und meldet Erfolg ausschließlich nach erfolgreichem Lesen beider Dateien.
Lade-/Schreibfehler werden angezeigt; Wiederholen bleibt möglich. Dateiauswahl, Text und Aktionen sind währenddessen gesperrt.
Der kurzlebige, dateiübergreifende „Gespeichert!“-Knopf wurde durch die Erfolgsmeldung nach dem jeweiligen Schreibvorgang ersetzt.

Markdown-Entwürfe und laufende Vorgänge liegen wie die anderen Editoren im Drawer und überleben Reiterwechsel und Schließen.
Charakter und Persona erhalten getrennte Entwürfe; verspätete Lese-/Schreibergebnisse überschreiben keinen anderen Kontext.
Beim Kontextwechsel werden die gespeicherten Markdown-Texte geleert, bis die richtigen Inhalte geladen wurden.
Hintergrund-Nachladefehler nach bereits abgeschlossener Reflexion, Wiederherstellung oder Import bleiben protokolliert;
sie ändern das Ergebnis des bereits erfolgreichen Hauptvorgangs nicht nachträglich.

Sieben zusätzliche Frontend-Regressionstests prüfen Fehler/Wiederholen, Sperren, Reiterwechsel, Schließen und verspätete Ergebnisse.
Der zusätzliche E2E-Test prüft echte SQLite-Lese- und Schreibfehler, erhaltene Texte, fehlende Erfolgsmeldungen
und erneutes Speichern/Nachladen im Wegwerfprofil.

Offen bleiben weitere Chat-Editoren und einheitlich sichtbare Fehler beim Nachladen der übrigen Memory-Daten.
Sämtliche Entwürfe bleiben nur während der gemounteten Chatansicht erhalten; eine dauerhafte Entwurfssicherung ist weiterhin offen.

Der abschließende aktuelle Build bestand `npm run e2e` auf einem separaten Xvfb-Display mit allen zwölf Szenarien.
Die gesperrte Desktop-Sitzung hatte zuvor WebKit-Screenshots und Animationsabfragen blockiert;
Xvfb wurde ausschließlich als temporäres Testwerkzeug verwendet. Ein veralteter WebDriver-Elementverweis
im Entwurfstest wurde durch Auswahl des aktuellen Felds behoben.
Screenshot `e2e/screenshots/32-markdown-ladefehler.png` wurde visuell geprüft: Der Entwurf und die tatsächliche
Ladefehlerursache sind sichtbar. Ein dabei gefundener Übersetzungs-Platzhalterfehler wurde in allen drei Sprachen
korrigiert und durch Prüfung der konkreten Fehlermeldung abgesichert.

### Fünftes Arbeitspaket – 03.10.2026

Der Inline-Nachrichteneditor schließt erst nach erfolgreichem Schreiben. Der Store gibt Schreibfehler weiter,
und die Oberfläche zeigt sie mit der konkreten Ursache an. Bei Fehlern bleibt der bearbeitete Text erhalten,
während der gespeicherte Nachrichtentext unverändert bleibt. Erneutes Speichern übernimmt die Korrektur.
Leere Entwürfe schließen den Editor nicht und werden nicht geschrieben.

Text, Speichern und Abbrechen sind während des Schreibens gesperrt. Die Swipe-Navigation ist während
geöffneter Bearbeitung gesperrt, damit der Entwurf nicht versehentlich eine andere Antwortvariante korrigiert.
Ein verspätetes Ergebnis nach einem Chatwechsel aktualisiert den aktuell sichtbaren Verlauf nicht.

Sechs zusätzliche Frontend-Tests prüfen Fehler/Wiederholen, Sperren und Doppelsenden, leere Entwürfe,
Abbrechen, Variantenwechsel und verspätete Speicherergebnisse. Ein neuer E2E-Test erzwingt einen echten
SQLite-Schreibfehler im Wegwerfprofil und prüft ursprünglichen Datenbanktext, erhaltenen Entwurf und Wiederholung.

Offen bleiben Umbenennen, Author's Note und Zusammenfassung in der Chat-Seitenleiste sowie einheitliche
Lesefehler der übrigen Memory-Daten. Inline-Entwürfe sind noch nicht über Virtualisierung oder Chatwechsel hinweg gesichert.
Das Abgleichen abgeleiteter Zusammenfassungen und Erinnerungen nach Nachrichtenkorrekturen bleibt in Abschnitt 4 offen.

`npm run check` bestanden: 358 Rust-Tests und 130 Frontend-Tests.
Der aktuelle Build bestand `npm run e2e` unter Xvfb mit allen 13 Szenarien.
Screenshot `e2e/screenshots/33-chat-bearbeitungsfehler.png` wurde visuell geprüft: Entwurf,
erneut verfügbare Speicheraktionen und die konkrete Fehlerursache sind vollständig sichtbar.
Die erste Prüfung in der Sandbox scheiterte an gesperrten lokalen Testports;
mit erweitertem Zugriff liefen die Prüfungen erfolgreich durch.

### Sechstes Arbeitspaket – 03.10.2026

Titelbearbeitung schließt erst nach erfolgreichem Speichern. Author's Note, Zusammenfassung und Zurücksetzen
melden Schreibfehler mit konkreter Ursache; Erfolgsmeldungen erscheinen ausschließlich nach Erfolg.
Die betroffenen Felder und Aktionen sind während des Schreibens gesperrt, auch nach Wiederöffnen.

Notiz- und Zusammenfassungsentwürfe liegen nach Chat-ID getrennt in der Seitenleiste. Schließen, Reiterwechsel,
Chatwechsel und externe Änderungen an Sitzungsdaten überschreiben offene Entwürfe nicht.
Ein verspäteter Speichervorgang entfernt ausschließlich den Entwurf des ursprünglichen Chats und Felds.
Die Notiztiefe 0 wird beim Laden und Speichern erhalten; zuvor ersetzte ein Fallback sie durch 2.

Umbenennen und Author's Note geben Fehler weiter. Nach erfolgreichem Schreiben wird nur die betroffene
Sitzung im Store angepasst, ohne einen zweiten Ladevorgang, der den Schreibstatus verfälschen könnte.
Sieben Frontend-Regressionstests prüfen Fehler/Wiederholen, Sperren, leere Titel, Entwurfserhalt,
Chatwechsel, verspätete Ergebnisse und Zusammenfassungs-Reset.
Ein E2E-Test erzwingt echte SQLite-Schreibfehler für alle drei Editoren und das Zurücksetzen im Wegwerfprofil.

Offen bleiben einheitlich sichtbare Lesefehler für übrige Memory-Daten sowie die weiteren offenen Punkte
in Abschnitt 2. Entwürfe sind nicht dauerhaft gesichert und überleben kein Unmount der Chatansicht.
Konflikte mit laufender automatischer Zusammenfassung und das Abgleichen abgeleiteter Daten bleiben gesonderte Arbeit.

`npm run check` bestanden: 358 Rust-Tests und 137 Frontend-Tests.
Der aktuelle Build bestand `npm run e2e` unter Xvfb mit allen 14 Szenarien.
Screenshots `34-chat-titelfehler.png`, `35-chat-notizfehler.png` und
`36-chat-zusammenfassungsfehler.png` wurden visuell geprüft: Die erhaltenen Entwürfe,
Speicheraktionen und konkreten Fehlerursachen sind vollständig sichtbar.

### Siebtes Arbeitspaket – 03.10.2026

Memory-Übersicht (Psychologie, Beziehung, Episoden, Tagebuch, Heilungsprotokoll) und Snapshot-Liste
halten Lesefehler im Store fest und zeigen sie mit konkreter Ursache im Drawer an. Bereits geladene
Daten und offene Entwürfe bleiben erhalten; ein Hinweis erklärt, dass die Daten veraltet sein können.
Leere Listen werden bei einem Ladefehler oder laufendem Abruf nicht als fehlende Einträge dargestellt.
Übersicht und Snapshots können unabhängig erneut geladen werden; Erfolg entfernt den jeweiligen Fehlerhinweis.

Nur der neueste Abruf im noch passenden Kontext darf Daten, Fehler und Ladezustand aktualisieren.
Charakterwechsel leert auch die Snapshot-Liste und alte Fehler; Personawechsel leert den Fehler der Übersicht.
Erfolgreiche Schreibvorgänge bleiben erfolgreich, wenn das anschließende Nachladen fehlschlägt.
Das verhindert, dass Wiederholen eines vermeintlich gescheiterten Schreibvorgangs doppelte Einträge anlegt.

Die Snapshot-Auflistung im Backend behandelt ausschließlich ein fehlendes Verzeichnis als leere Liste.
Fehler bei Verzeichnis- oder Metadatenzugriff werden weitergegeben statt eine unvollständige Liste anzuzeigen.
Elf Frontend-Tests prüfen Ladefehler/Wiederholen, erhaltene Daten und Entwürfe, leere Erstladeansichten,
überholte Antworten, Kontextwechsel und erfolgreiche Schreibvorgänge mit fehlgeschlagenem Nachladen.
Zwei Rust-Tests prüfen fehlendes versus ungültiges Backup-Verzeichnis und fehlerhafte Snapshot-Metadaten.
Ein neuer E2E-Test erzwingt SQLite- und Dateisystem-Lesefehler im Wegwerfprofil und prüft auch einen erfolgreichen
Erinnerungseintrag bei fehlgeschlagenem Nachladen.

Offen bleiben weitere Fehlerpfade bei Reflexion/Import/Wiederherstellung sowie allgemeine Entwurfssicherung,
Generierungsfehler und Konsistenz nach Verlaufsänderungen. Entwürfe sind weiterhin nur im gemounteten Chat gesichert.

`npm run check` bestanden: 360 Rust-Tests und 148 Frontend-Tests.
Der aktuelle Build bestand `npm run e2e` unter Xvfb mit allen 15 Szenarien.
Screenshots `37-memory-uebersicht-ladefehler.png` und `38-memory-snapshot-ladefehler.png`
wurden visuell geprüft: Entwurf bzw. gecachte Snapshot-Liste, konkrete Ursache,
Hinweis auf möglicherweise veraltete Daten und Wiederholen sind vollständig sichtbar.

### Achtes Arbeitspaket – 03.10.2026

SoW-Import liest alle vorhandenen Dateien vor dem Schreiben. Fehlende optionale Dateien bleiben erlaubt;
ungültige UTF-8-Dateien, falsche Verzeichnisarten und Zugriffsfehler werden weitergegeben. Import und
Snapshot-Wiederherstellung schreiben Psychologie, Beziehung, Episoden, Tagebuch und Heilungsprotokoll
jeweils in einer SQLite-Transaktion. Auch ein später Fehler rollt alle Änderungen dieses Vorgangs zurück.
Die verbindungsgebundenen SQL-/Markdown-Helfer werden ebenfalls von den bisherigen einzelnen APIs verwendet.

Die Wiederherstellung löst den Dateinamen aus der Oberfläche jetzt im Backup-Verzeichnis des ausgewählten
Charakters auf; zuvor wurde der Dateiname als Pfad im Arbeitsverzeichnis gesucht.
Psychologie und Beziehung werden übernommen, Sammlungen werden ergänzt. Der Bestätigungstext benennt dies
nun korrekt. Wiederholte erfolgreiche Wiederherstellungen können weiterhin Tagebucheinträge duplizieren;
ein vollständiger Austausch der Sammlungen oder weitere Deduplizierung ist nicht Teil dieses Pakets.
Snapshot-Erstellung gibt Leseprobleme weiter und schreibt kein unvollständiges Backup bei SQL-Lesefehlern.

Reflexion gibt Fehler weiter, setzt ihren Beschäftigtzustand zuverlässig zurück und hält Fehler auch für
automatische Vorgänge sichtbar. Lese-, Snapshot-, Heilungsprotokoll-, Themen- und Tagebuch-Schreibfehler
werden nicht mehr verschluckt. Der automatische Snapshot muss vor dem Anwenden der Patches erstellt werden.
Die mehrstufige Reflexion ist weiterhin nicht atomar: Spätere Fehler können bereits gespeicherte Änderungen
zurücklassen. Der Fehlerhinweis fordert deshalb zur Prüfung der Daten und des Snapshots vor erneutem Start auf.

Import, Wiederherstellung, Snapshot-Erstellung und Reflexion sind gegenseitig gesperrt, solange ein Vorgang läuft,
auch über Reiterwechsel und Schließen hinweg. Verspätete Reflexionsresultate und Nachladevorgänge wechseln nicht
in einen anderen Charakter-/Persona-Kontext. Markdown-Lesefehler nach erfolgreichem Schreiben bleiben separat
sichtbar; Wiederholen lädt nur die Texte und erhält Entwürfe.

Vier Rust-Regressionstests prüfen späte Rollbacks und Wiederholen, ungültige Importdateien/-verzeichnisse
und das Verhindern eines unvollständigen Snapshots. Zehn Frontend-Tests prüfen sichtbare Reflexionsfehler,
Wiederholen, Sperren, Kontextwechsel, Import-/Wiederherstellungsfehler und erfolgreiches Schreiben bei
fehlgeschlagenem Markdown-Nachladen. Ein E2E-Test prüft reale Reflexionsfehler sowie Transaktions-Rollbacks
und Wiederholen für Import und Wiederherstellung im Wegwerfprofil.

Offen bleiben atomare Reflexion, vollständige Snapshot-/Wiederherstellungssemantik, allgemeine Entwurfssicherung,
Chat-Generierungsfehler und Konsistenz nach Verlaufsänderungen.

`npm run check` bestanden: 364 Rust-Tests und 158 Frontend-Tests.
Der abschließende aktuelle Build bestand `npm run e2e` unter Xvfb mit allen 16 Szenarien.
Der erste Lauf stoppte an einer reservierten `error`-Eigenschaft in der Rückgabe des Import-Testcodes;
nach Änderung der Test-Rückgabe und Ergänzung des Schutzes für Kontextwechsel wurde der aktuelle Build erneut geprüft.
Screenshots `39-memory-reflexionsfehler.png` und `40-memory-wiederherstellungsfehler.png` wurden visuell geprüft:
Die konkreten Fehlerursachen, erneute Aktionen und der Hinweis auf mögliche Teiländerungen sind sichtbar.

### Neuntes Arbeitspaket – 04.10.2026

Senden, Neu generieren und Fortsetzen behandeln Promptaufbau und Antwortspeicherung im selben Fehlerpfad.
Der Generierungszustand wird in `finally` zurückgesetzt; die Sperre gilt beim Senden bereits während
Sitzungserstellung, Upload und Nutzernachricht-Speicherung. Parallele Generierungsaufrufe werden ignoriert.
Upload-/Nutzernachricht-Schreibfehler geben den ungespeicherten Text und Dateien an den Composer zurück,
ohne inzwischen neu getippte Eingaben zu überschreiben. Eine fehlende aktive Sitzung wird ausdrücklich gemeldet.

Fehler nach Speicherung der Nutzernachricht werden separat und sichtbar im Composer gehalten, statt eine
ungespeicherte Fehlermeldung als vermeintliche Assistentenantwort einzufügen. Wiederholen verwendet die ID der
bereits gespeicherten Nutzernachricht. Swipe und Fortsetzen wiederholen ebenfalls ihre ursprüngliche Aktion.
Ein fehlgeschlagener Antwort-Schreibvorgang verändert HUD, Kontextanzeige und Zusammenfassung nicht.
Wiederholen nach einem Antwort-Schreibfehler erzeugt eine neue Modellantwort; die gescheiterte Antwort wird noch nicht zwischengespeichert.

Abbruch verhindert eine Anfrage nach noch laufendem Upload/Promptaufbau und verwirft eine noch nicht
zur Speicherung übergebene Antwort. Bereits laufende Datenbankschreibvorgänge bleiben wirksam.
Die Sperre bleibt bis zum Abschluss des ursprünglichen Vorgangs bestehen, damit kein zweiter Chatlauf den
gemeinsamen nativen Abbruch-Merker zurücksetzt. Abbruchfehler werden angezeigt. Stream-Puffer werden nach
Fehler/Abbruch geleert; native Chat-Ereignisse werden nur für den zugehörigen aktiven Chat angezeigt.
Verspätete Prompt-, Modell- und Speicherresultate überschreiben keinen anderen sichtbaren Chat.
Fehlgeschlagenes Nachladen der Sitzungsliste nach erfolgreichem Schreiben wird separat protokolliert.

Fünfzehn Frontend-Tests prüfen Prompt-/Upload-/Streaming-/Schreibfehler, sichtbares Wiederholen ohne doppelte
Nutzernachricht, Vorbereitungssperren, Abbruchfehler, Abbruch während Prompt-/Nutzernachricht-Speicherung
und verspätete Modell-/Schreibergebnisse nach Chatwechsel. Ein E2E-Test erzwingt echte SQLite-Schreibfehler
für Nutzer- und Assistentennachricht im Wegwerfprofil und prüft Entwurfserhalt und Wiederholen.

Offen bleiben vollständig geordnete Sitzungswechsel, ein Generationstoken in nativen Ereignissen,
Abbruch bei blockierenden Netzwerk-/Vorbereitungsschritten und die Wiederaufnahme einer abgebrochenen
Antwort. Upload-Dateien können nach einem späteren Fehler verwaist zurückbleiben. Der gesamte Punkt zu
Sitzungswechseln sowie die umfassende Abbruch-Abnahme bleiben deshalb offen.

`npm run check` bestanden: 367 Rust-Tests im aktuellen Arbeitsstand und 173 Frontend-Tests.
Der aktuelle Build wurde mit `npm run e2e` erstellt. Der erste Gesamtlauf stoppte im neuen Test,
weil der Fehler-Toast den Senden-Knopf überlagerte. Der Test schließt den Hinweis jetzt ausdrücklich,
bevor er den nächsten Fehlerpfad prüft. Der korrigierte Einzeltest und der anschließende vollständige
Lauf mit `npm run e2e:run` unter Xvfb bestanden alle 17 Szenarien.
Screenshot `41-chat-generierungsfehler.png` wurde visuell geprüft: Die Nutzernachricht steht genau einmal
im Verlauf; konkrete Antwort-Schreibfehlerursache und Wiederholen-Knopf sind vollständig sichtbar.
Die parallel entstandenen Änderungen an optionalen Inhalten gehören nicht zu diesem Arbeitspaket.

### Zehntes Arbeitspaket – 04.10.2026

Sitzungsauswahl, Sitzungsliste und Chat-Erstellung prüfen nach jedem asynchronen Schritt eine Abrufnummer
und den Charakter-Kontext. Nur der zuletzt gestartete Vorgang darf den sichtbaren Zustand ändern.
Der Verlauf wird beim Wechsel sofort ausgeblendet, statt unter einem anderen Sitzungstitel stehen zu bleiben.
`isChatLoading` kennzeichnet die Ladephase; `chatLoadError` hält die Ursache sichtbar. Wiederholen lädt nur
den Verlauf bzw. die Sitzungsliste. Der Composer behält seinen Entwurf und sperrt Senden bis zum erfolgreichen Laden.
Fehler der automatischen Chat-Erstellung geben ihre Ursache an den Composer weiter, bevor eine Nutzernachricht geschrieben wird.
Späte Stimmenkonfigurationen eines anderen Charakters und Sitzungslisten eines früheren Navigationszustands werden ignoriert.

Navigation stoppt ausstehende Chat-Sprachausgabe und fordert den Abbruch der laufenden Generierung an. Generierungsresultate prüfen zusätzlich die
Abrufnummer; auch A → B → A kann eine alte Modellantwort nicht in den aktuellen Verlauf übernehmen.
Ein bereits laufender Datenbankschreibvorgang bleibt wirksam, aber sein spätes Ergebnis überschreibt keinen
neu geladenen Verlauf. Ein nach Navigation erstellter Chat wird nicht durch ein älteres Hintergrund-Listenresultat verdrängt.

Das Backend meldet Abbruch über einen Watch-Signalzähler. `with_abort` beendet wartende asynchrone Vorbereitung,
HTTP-Anfragen ohne Antwortheader und SSE-Streams ohne weitere Daten, indem deren Futures fallen gelassen werden.
Der Abbruch-Merker wird am Anfang des Chat-Commands zurückgesetzt; eine spätere Stream-Initialisierung
löscht ihn nicht erneut. Das Zurücksetzen für eine neue Runde macht alte Wartevorgänge nicht wieder gültig.
Abbruch spült auch keine unvollständigen Thought-Tags aus dem Stream-Puffer als Nachrichtentext nach.
Direkte interne Generierungen und synchrone Datei-/Datenbankvorgänge behalten ihre bisherige Semantik.

Drei Rust-Tests prüfen antwortlose HTTP-Anfragen, inaktive Streams mit unvollständigem Tag und Abbruch
mit unmittelbar folgendem Zurücksetzen. Dreizehn zusätzliche Frontend-Tests prüfen überlappende Abrufe,
Lesefehler/Wiederholen, Sendesperren, Charakterwechsel, automatische Erstellung, verspätete Stimmenkonfiguration
und A → B → A bei fehlgeschlagenem Navigationsabbruch. Ein neuer E2E-Test prüft reale SQLite-Lesefehler,
Entwurfserhalt, geschlossene HTTP-Verbindungen beim Abbruch/Chatwechsel und Antworten im richtigen neuen Chat.

Offen bleiben IDs in nativen Stream-Ereignissen, sofortiges Beenden noch laufender Frontend-Prompt-/Upload-
Vorbereitung, Wiederaufnahme abgebrochener Antworten und die Koordination paralleler Chat-/Stage-Vorgänge.
Chat-Erstellung ist mehrstufig; Fehler nach der ersten Datenbankanlage können eine leere Sitzung zurücklassen.
Die umfassende Generierungs-/Abbruch-Abnahme bleibt deshalb offen.

Validierung: Der vollständige Check besteht mit 370 Rust-Tests (6 absichtlich ignoriert) und 186 Frontend-Tests.
Alle 18 E2E-Szenarien bestehen unter Xvfb mit dem frisch gebauten aktuellen App-Stand. Der vorhandene
Nachrichten-Editor-Test wartet nun auf den klickbaren Bearbeiten-Knopf und den tatsächlich geöffneten Editor;
damit bleibt die Prüfung auch bei verzögertem Hover-/Layout-Update stabil. Screenshot
`e2e/screenshots/42-chat-verlauf-ladefehler.png` wurde geprüft: Ursache und Wiederholen sind sichtbar,
der Entwurf bleibt erhalten und der alte Verlauf wird ausgeblendet. Parallel entstandene Änderungen
an optionalen Inhalten gehören nicht zu diesem Arbeitspaket.

### Elftes Arbeitspaket – 04.10.2026

Jeder Lauf beim Senden, Neu-Generieren, Fortsetzen oder Wiederholen erhält eine neue UUID im Store.
Der Chat-Command reicht sie separat von der Modell-Payload an die Inferenz weiter. Native Tokens,
Gedanken, Abschlussereignisse und das Command-Ergebnis enthalten dieselbe `generation_id`.
Die API-Listener nutzen die aus Rust generierten Ereignistypen. Interne Modell-Anfragen und Stage
behalten ihre eigenen bisherigen Ereignisse; die ID wird nicht an den Modellanbieter gesendet.

ChatView nimmt Ereignisse nur bei laufender Generierung, passender ID und passender Sitzung an.
Fremde Abschlüsse dürfen weder den aktuellen Stream leeren noch Sprachausgabe oder Emotionserkennung
starten. Navigation und Abbruch verwerfen die ID; scheitert der Abbruch im unveränderten Kontext,
wird die ursprüngliche ID wieder eingesetzt. Eine neue Anfrage im selben Chat erhält trotzdem eine neue ID.
Nach Anfrageende bleibt die letzte ID für noch laufende Emotionserkennung erhalten; deren
Resultat prüft nach dem Await erneut ID und Sitzung, damit ein neuer Lauf es zuverlässig entwertet.

Die zuletzt übernommenen Stream-Tests wurden um die Anfrage-IDs erweitert: Fremde Ereignisse,
anonyme/abgebrochene Ereignisse sowie passende und verspätete Emotionserkennung werden geprüft.
Ein weiterer Frontend-Test prüft unterschiedliche IDs im selben Chat. Ein Rust-Test prüft die
ID im serialisierten Ereignisvertrag. Der Sitzungs-E2E-Test injiziert zusätzlich alte native Ereignisse
während einer antwortlosen Anfrage und prüft, dass sie nicht angezeigt werden.

Die zunächst uncommittete Umsetzung wurde nach den zwischenzeitlichen Übersetzungsänderungen
auf dem aktuellen Stand erneut integriert. Ergebnisse des vorherigen Builds gelten deshalb
nicht als Abnahme dieses neuen Stands.

Offen bleiben sofortiges Beenden der Frontend-Prompt-/Upload-Vorbereitung, Wiederaufnahme abgebrochener
Antworten und die Koordination paralleler Chat-/Stage-Vorgänge mit ihrem gemeinsamen Abbruch-Merker.
Die ID filtert native Chat-Ereignisse; sie ersetzt keine getrennten Abbruchkanäle dieser Bereiche.

Validierung auf dem aktuellen Stand: 371 Rust-Tests (6 im Bibliothekslauf absichtlich ignoriert)
und 191 Frontend-Tests bestehen; Formatierung, Clippy, Lint und TypeScript sind geprüft.
`npm run e2e` hat den aktuellen Build erstellt; der erste Lauf stoppte im vorhandenen
Seitenleisten-Test, weil der Hover-Klick das Umbenennen-Feld noch nicht geöffnet hatte.
Der Test wartet nun auf den klickbaren Knopf und das tatsächlich geöffnete Feld.
Der korrigierte Einzeltest und der vollständige Lauf mit `npm run e2e:run` unter Xvfb
bestehen alle 18 Szenarien. Screenshot `e2e/screenshots/43-chat-stream-identitaet.png`
wurde visuell geprüft: Keine fremden Tokens/Gedanken erscheinen, Abbruch bleibt verfügbar.
Die bereits committeten Übersetzungsänderungen bleiben erhalten; optionale Inhalte werden nicht mitcommittet.

### Zwölftes Arbeitspaket – 04.10.2026

Chat und Soul Stage besitzen im AppState getrennte Inferenz-Clients und damit eigene Abbruch-Merker
und Watch-Signalzähler. Stage-Runden, Neu-Generieren und Rast nutzen den Stage-Client; der Chat
behält seinen Client. Der neue Command `abort_stage_turn` beendet nur Stage-Anfragen. Der
Stage-Stoppknopf ruft diesen Befehl auf, statt den Chat-Abbruch zu verwenden. Autoplay und
Stage-Sprachausgabe werden beim Stage-Stopp weiterhin abgeschaltet.

Ein Rust-Test startet wartende Futures in beiden Bereichen und prüft, dass weder Abbruch noch
Zurücksetzen den jeweils anderen Bereich beeinflussen. Zwei Frontend-Tests prüfen die Befehlswahl,
Autoplay/Sprachausgabe und Weitergabe eines Stage-Abbruchfehlers ohne Chat-Abbruch.
Der bestehende Sitzungs-E2E-Test prüft zusätzlich echte wartende HTTP-Anfragen in beiden Richtungen:
Stage-Abbruch erhält die Chat-Verbindung, Chat-Abbruch erhält die Stage-Verbindung; der jeweils
zuständige Stopp beendet anschließend die Anfrage.

Offen bleiben die Koordination mehrerer Runden innerhalb desselben Bereichs, sofortiger Abbruch
von Stage-Planung/direkten internen Modell-Aufrufen und Frontend-Prompt-/Upload-Vorbereitung sowie
Wiederaufnahme abgebrochener Antworten. Die Trennung betrifft die Abbruchsignale, nicht eine
Ressourcenplanung für gleichzeitig laufende Modelle oder getrennte Zugriffe auf den Stage-Weltzustand.

Validierung: Der vollständige Check besteht mit 372 Rust-Tests (6 im Bibliothekslauf absichtlich
ignoriert) und 193 Frontend-Tests. `npm run e2e` hat den aktuellen App-Stand frisch gebaut und
alle 18 Szenarien unter Xvfb erfolgreich abgeschlossen, einschließlich der Abbruchprüfung
in beiden Richtungen. Screenshot `e2e/screenshots/44-stage-getrennter-abbruch.png` wurde
visuell geprüft: Stage bleibt nach einem Chat-Abbruch aktiv und bietet seinen eigenen Stopp an.
Optionale Inhalte bleiben außerhalb dieses Arbeitspakets.

### Dreizehntes Arbeitspaket – 04.10.2026

Der Stage-Planer wartet nicht mehr bis zum Antwortende, nachdem Stopp gedrückt wurde. Sein interner
Modell-Aufruf liegt in `with_abort`; dies beendet auch wartende HTTP-Header oder Antwortkörper.
Die gemeinsame Sprecher-Vorbereitung `history::prepare` liegt ebenfalls in diesem Abbruchrahmen:
Kontextzählung, Kontextanpassung und interne Zusammenfassungen sind damit abbrechbar. Abbruch
liefert ausdrücklich `None`, statt eine leere oder unvollständige Modellanfrage weiterzugeben.

Planer, Erzähler und Charaktere beenden die Runde bei abgebrochener Vorbereitung über `finish_turn`.
Auch ein abgebrochener Planer-Aufruf endet dort, bevor ein Ersatzplan, Mechanik oder neue Erzählung
angewendet wird. Die bereits eingegebene Spielerzeile und zuvor abgeschlossene Arbeit bleiben
im Szenenzustand gespeichert; der aktuelle Sprecher wird wieder PLAYER. Die Runde ist keine
Transaktion: bereits erfolgte Zustandsänderungen und fertig erstellte Zusammenfassungen bleiben bestehen.
Abgebrochene Zusammenfassungen rücken ihren Cursor nicht weiter.

Zwei Rust-Tests prüfen einen direkten Modell-Aufruf mit begonnenem, aber nicht abgeschlossenem
Antwortkörper und eine bereits abgebrochene Kontextvorbereitung ohne Änderung an Verlauf/Zusammenfassung.
Der Sitzungs-E2E-Test stoppt zusätzlich einen Planer ohne HTTP-Antwort, prüft die gespeicherte Spielerzeile,
unveränderte Welt und das Ausbleiben einer neuen Erzähler-Anfrage. Nach erneutem Laden bleibt die Zeile
erhalten; die nächste normale Runde funktioniert wieder.

Offen bleiben Abbruch von Routing sowie Archiv-/Konsistenz-Aufrufen am Rundenende, Koordination mehrerer
Runden im selben Bereich, Frontend-Prompt-/Upload-Vorbereitung und Wiederaufnahme abgebrochener Antworten.
Interne direkte Modellaufrufe außerhalb der Stage-Planung behalten ihre bisherige Abbruchsemantik.

Validierung: Der vollständige Check auf dem aktuellen Stand besteht mit 371 Rust-Tests
(6 im Bibliothekslauf absichtlich ignoriert) und 195 Frontend-Tests. `npm run e2e` hat den
aktuellen Build erstellt. Der erste Lauf bestand den neuen Planungsabbruch, stoppte danach
aber im vorhandenen Seitenleisten-Test an einer veralteten DOM-Referenz beim Schließen
des erfolgreich gespeicherten Titelfelds. Die Warteabfrage prüft nun direkt die Abwesenheit
des Felds im DOM. Der korrigierte Einzeltest und der vollständige Lauf mit `npm run e2e:run`
unter Xvfb bestehen alle 18 Szenarien. Screenshot `e2e/screenshots/45-stage-planungsabbruch.png`
wurde geprüft: Die Spielerzeile steht im Verlauf, die wartende Planung bietet Stopp an.
Die committeten Änderungen zur Titelanpassung bleiben erhalten.

### Vierzehntes Arbeitspaket – 04.10.2026

Routing, Arc-Archivierung und Faktenprüfung verwenden ebenfalls `with_abort`. Stopp beendet
wartende Modell-Anfragen auch ohne HTTP-Antwort. Nach abgebrochenem Routing endet die Runde
über `finish_turn`, ohne eine Ersatzfigur sprechen zu lassen. Fertige Beiträge bleiben gespeichert.
Ein abgebrochener Archiv-Aufruf legt keinen Ersatzarchiveintrag an; der abgeschlossene Arc bleibt
für die nächste Runde offen. Bereits fertig archivierte Arcs werden weiterhin nicht doppelt bearbeitet.

Eine abgebrochene Faktenprüfung verändert keine Fakten und behält den fälligen Prüfungszähler.
Die nächste Runde prüft erneut. Erst ein tatsächlich beendeter Aufruf setzt den Zähler wie bisher
zurück; reguläre Fehler/ungültige Antworten behalten ihre bisherige Behandlung. Nach bereits
angefordertem Stage-Stopp wird keine Prüfung gestartet und der Zähler nicht weiter erhöht.
Ein gesättigtes Hochzählen verhindert Überlauf bei wiederholt abgebrochener fälliger Prüfung.

Ein Rust-Test prüft, dass bereits gestoppte Archiv-/Faktenarbeit den Zustand unverändert lässt.
Ein neuer E2E-Test hält reale HTTP-Anfragen für alle drei Schritte an, stoppt über die UI und
prüft die geschlossenen Verbindungen. Fertige Beiträge bleiben erhalten; Archiv/Faktenprüfung
werden nach Abbruch in einer neuen Runde nachgeholt. Fakten und fälliger Zähler bleiben auch
nach erneutem Laden erhalten, das Archiv wird genau einmal geschrieben.

Offen bleiben mehrere konkurrierende Runden im selben Bereich, Frontend-Prompt-/Upload-Vorbereitung,
Wiederaufnahme abgebrochener Antworten und die Fehlerbehandlung direkter Modell-Aufrufe.
Bereits ausgeführte Mechanik und abgeschlossene Beiträge werden durch Stopp nicht zurückgerollt.

Validierung: `npm run check` besteht mit 372 Rust-Tests (6 im Bibliothekslauf absichtlich
ignoriert) und 195 Frontend-Tests. `npm run e2e` baut die aktuelle App und besteht unter Xvfb
alle 19 Szenarien. Der neue Einzeltest bestand ebenfalls; seine Szene enthält eine zweite
Figur, damit tatsächlich eine Routing-Anfrage entsteht. Screenshot
`e2e/screenshots/46-stage-rundenende-abbruch.png` wurde geprüft: Die Faktenprüfung wartet,
die fertigen Beiträge stehen im Verlauf und Stopp bleibt erreichbar.


### Fünfzehntes Arbeitspaket – 04.10.2026

Native Chat-Anfragen erhalten eine eigene Sperre im AppState. Stage-Runde, Neu-Generieren
und Rast teilen eine zweite Sperre. `try_lock` lehnt konkurrierende Aufrufe sofort ab;
keine zusätzliche Anfrage wird eingereiht. Die Prüfung erfolgt vor Abbruch-Reset,
Kontextvorbereitung und Änderungen am Szenenzustand. Chat und Stage können unabhängig
voneinander laufen. Guards werden bei Erfolg, Fehler und Abbruch automatisch freigegeben;
die Stage-Rundensperre umfasst auch die abschließende Memory-Übernahme im Command.

Chat meldet einen neuen Fehlercode mit deutscher, englischer und russischer Übersetzung.
Stage verwendet den bestehenden Hinweis auf eine laufende Runde. Der Sitzungs-/Abbruch-E2E-Test
ruft die nativen Befehle zusätzlich direkt auf: Eine zweite Chat-Anfrage sowie Stage-Runde,
Neu-Generieren und Rast müssen während laufender Inferenz sofort scheitern. Modell-Anfragezahlen,
Verbindungsabbruch und Szenenzustand zeigen, dass die erste Anfrage davon unberührt bleibt.
Nach einem fehlgeschlagenen Stage-Rastaufruf funktioniert die nächste Runde; nach einem
Chat-Netzwerkfehler funktioniert die nächste native Anfrage. Bestehende Abbruch- und
Sitzungswechselprüfungen decken die erneute Freigabe nach Stopp und erfolgreichem Abschluss ab.

Die Sperren koordinieren diese nativen Commands. Andere Stage-Editor-/Navigationsbefehle,
interne Modellaufrufe und die Frontend-Antwortspeicherung liegen außerhalb ihres Umfangs.
Offen bleiben insbesondere sofortiger Abbruch laufender Frontend-Prompt-/Upload-Vorbereitung,
Wiederaufnahme abgebrochener Antworten und die Koordination von Stage-Verlaufsänderungen
mit einer laufenden Runde.

Validierung bewusst auf die Änderung begrenzt: Rust-Formatierung und Clippy (`--lib`,
Warnungen als Fehler), Lint für die betroffenen Übersetzungen und den E2E-Test sowie
TypeScript bestehen. Der aktuelle App-Build besteht unter Xvfb den erweiterten
`chat-sessions-abort.mjs` und `stage-upkeep-abort.mjs`. Die Screenshots
`45-stage-planungsabbruch.png` und `46-stage-rundenende-abbruch.png` wurden erneut geprüft:
Die ursprüngliche Runde bleibt nach abgelehnten Zusatzaufrufen bedienbar; Stopp ist erreichbar.
Die vollständige Test-Suite wurde für dieses abgegrenzte Paket nicht erneut gestartet.


### Sechzehntes Arbeitspaket – 04.10.2026

Senden, Neu-Generieren und Fortsetzen besitzen je einen AbortController für die Vorbereitung.
Nach erfolgreichem nativen Stopp beendet `waitWithAbort` das Warten auf Promptaufbau und
Datei-Lesen, ohne deren Ergebnis abzuwarten. Späte Erfolge und Fehler werden konsumiert;
sie starten keine neue Modell-Anfrage und beeinflussen keinen späteren Lauf. Ein gescheiterter
nativer Abbruch lässt die Vorbereitung dagegen weiterlaufen und behält die bestehende Fehlermeldung.

Lorebook-Auswertung und deren Ersatzabfragen sowie Prompt-Zusammenbau nutzen dasselbe Signal.
Abgebrochene Lore-Auswertung verändert weder Spannung noch Warnton und startet keine weiteren
Fallback-Abfragen. Datei-Lesen prüft das Signal vor der Base64-Aufbereitung. Anhänge werden
nacheinander vorbereitet und gespeichert, damit Stopp weitere Uploads verhindert.

Bereits gestartete native Datei-/Datenbankschreibvorgänge werden weiterhin abgewartet und behalten
die Sendesperre. Die darunterliegende Blob-/IPC-Arbeit wird nicht physisch beendet; ihr spätes
Resultat wird verworfen. Bereits geschriebene Anhänge können ohne gespeicherte Nutzernachricht
zurückbleiben. Ungespeicherte Texte/Dateien werden über den bestehenden Composer-Fehlerpfad erhalten.
Gespeicherte Nutzernachrichten bleiben bei abgebrochener Promptvorbereitung im Verlauf.

Gezielte Tests prüfen sofortiges Ende wartender Vorbereitung für alle drei Chat-Aktionen,
späte Datei-/Promptresultate nach einem neuen Lauf und das Abwarten begonnener Upload-Schreibvorgänge.
Der bisherige Uploadfehlertest erhält außerdem eine explizite Datei-Leseimplementierung,
damit er den tatsächlichen Uploadfehler und nicht eine fehlende jsdom-Blob-Methode prüft.
Zwei Tests mit der echten Lore-Promptfunktion prüfen späte Erfolge und Fehler ohne Nebenwirkungen.
Der Chat-E2E-Test hält die Prompt-IPC-Transportantwort an, stoppt über den Composer und prüft
Sendebereitschaft ohne Promptresultat, wirkungslose späte Antwort und den nächsten normalen Chatlauf.

Offen bleiben Wiederaufnahme abgebrochener Antworten, Bereinigung verwaister Anhänge und
Koordination von Stage-Verlaufsänderungen mit laufenden Runden.

Validierung gezielt: 39 Frontend-Tests aus Generierungs-, Sitzungs-, Stream- und Prompt-Abbruchtests
bestehen; ein zusätzlich ergänzter Test für fehlgeschlagenen nativen Stopp besteht ebenfalls
(40 geprüfte Fälle insgesamt). Lint und TypeScript bestehen. Die frisch gebaute App besteht unter
Xvfb den erweiterten `chat-generation-errors.mjs`. Im ersten Lauf konnte die Testvorrichtung die
schreibgeschützte Tauri-Aufruffunktion nicht ersetzen; die korrigierte Vorrichtung hält stattdessen
die Prompt-Transportantwort über fetch an. Screenshot `48-chat-vorbereitungsabbruch.png` wurde
geprüft: Die gespeicherte Spielerzeile bleibt sichtbar und der neue Entwurf ist sendebereit.
Die vollständige Suite und unveränderte Rust-Tests wurden nicht erneut ausgeführt.
