# Roadmap aus der unabhängigen App-Durchsicht

Stand: 03.10.2026. Grundlage: Quellcode, Funktionsstruktur und vorhandene E2E-Screenshots;
kein vollständiger Praxistest. Die bestehende ROADMAP.md wurde nicht als Grundlage verwendet.

Die Reihenfolge priorisiert Sicherheit und Verlässlichkeit vor zusätzlichen Funktionen.
Abgehakte Punkte sind umgesetzt und geprüft; offene Punkte sind noch keine zugesagten Features.

## 1. Companion-Berechtigungen (höchste Priorität)

- [x] Automatische Freigabe auf eine ausdrückliche Liste bekannter interner Werkzeuge begrenzen.
- [x] MCP-Werkzeuge und unbekannte Werkzeuge grundsätzlich zur Bestätigung vorlegen.
- [x] Schreibende Dateiaktionen auch bei Großschreibung und umgebenden Leerzeichen bestätigen lassen.
- [x] Screenshots und Zwischenablagezugriffe wegen ihrer sensiblen Inhalte bestätigen lassen.
- [x] Regressionstests für Freigabe, Ablehnung, unbekannte Tools und Varianten der Dateiaktionen ergänzen.
- [ ] Echte Betriebssystem-Isolation für Skripte mit begrenzten Datei-, Netzwerk- und Prozessrechten entwerfen und umsetzen.
- [ ] Berechtigungen und Auswirkungen pro Werkzeug verständlich anzeigen; die Grenzen der Skript-Ausführung klar benennen.

Abnahme: Ohne Bestätigung wird kein unbekanntes oder externes Werkzeug ausgeführt;
Schreibaktionen umgehen die Prüfung nicht durch anders formatierte Argumente.
Arbeitsverzeichnis und Timeout allein gelten nicht als Betriebssystem-Sandbox.

## 2. Speichern und Fehlerrückmeldungen

- [x] Manuelle Erinnerungen und Tagebucheinträge: Schreibfehler weitergeben, Eingaben erhalten und Wiederholen ermöglichen.
- [x] Tagebuchgenerierung und Memory-Backup-Erstellung: Fehler sichtbar anzeigen.
- [x] Psychologie und Beziehung als explizit speicherbare Entwürfe bearbeiten; Schreibfehler erhalten Änderungen.
- [x] Markdown-Editor: Lade- und Schreibfehler erhalten Entwürfe; laufende Vorgänge sperren die Bearbeitung.
- [ ] Speicherfehler vom Store an die Oberfläche weitergeben und verständlich anzeigen.
- [ ] Erfolgsmeldungen ausschließlich nach erfolgreichem Speichern anzeigen.
- [ ] Eingaben bei Fehlern erhalten und Wiederholen anbieten.
- [ ] Memory-, Psychologie-, Beziehungs-, Tagebuch- und Chat-Editoren auf verschluckte Fehler prüfen.
- [x] Fehlgeschlagenes Speichern mit Tests absichern, insbesondere manuell angelegte Erinnerungen.

Abnahme: Ein fehlgeschlagener Speichervorgang leert keine Eingabe und meldet keinen Erfolg.

## 3. Chat senden, abbrechen und wiederholen

- [ ] Promptaufbau und alle nachfolgenden Schritte in eine gemeinsame Fehlerbehandlung aufnehmen.
- [ ] Generierungszustand bei jedem Fehler und Abbruch zuverlässig zurücksetzen.
- [ ] Bereits gespeicherte Nutzernachrichten beim Wiederholen erkennen; Duplikate vermeiden.
- [ ] Gleichzeitiges Senden, Sitzungswechsel und verspätete Antworten eindeutig einer Sitzung zuordnen.
- [ ] Fehler bei Upload, Promptaufbau, Streaming und Antwortspeicherung gezielt testen.

Abnahme: Kein Fehler lässt den Chat dauerhaft beschäftigt zurück; Wiederholen erzeugt keine doppelte Nutzernachricht.

## 4. Konsistenz nach Verlaufsänderungen

- [ ] Zusammenfassungen nach Bearbeiten, Löschen und Swipe-Wechsel gezielt verwerfen oder neu erstellen.
- [ ] Aus geänderten Nachrichten abgeleitete Erinnerungen erkennen und abgleichen.
- [ ] Auswirkungen einer Verlaufsänderung auf die Figur verständlich anzeigen.
- [ ] Regressionstests für korrigierte und entfernte Ereignisse ergänzen.

Abnahme: Entfernte oder ersetzte Ereignisse gelangen nicht über veraltete Zusammenfassungen erneut in den Prompt.

## 5. Soul Memory nachvollziehbar korrigieren

- [ ] Erinnerungen mit Ursprungsunterhaltung und Quellnachrichten verknüpfen.
- [ ] Bestätigte Tatsachen von Modellinterpretationen unterscheiden.
- [ ] Einzelne Erinnerungen bearbeiten und gezielt vergessen können.
- [ ] Wichtige Erinnerungen vor automatischer Überschreibung schützen.
- [ ] Automatische Änderungen mit einer nachvollziehbaren Änderungshistorie versehen.

Abnahme: Der Nutzer kann Herkunft und Änderungen einer Erinnerung nachvollziehen und sie gezielt korrigieren.

## 6. Einstieg bis zur ersten Antwort

- [ ] Cloud-Verbindung und Modell im Wizard tatsächlich testen.
- [ ] Lokalen Modelldownload, Laufzeitinstallation und Serverstart durchgehend begleiten.
- [ ] Hardwaregerechte Auswahl und verständliche Fehlerbehebung anbieten.
- [ ] Mit einer erfolgreichen ersten Charakterantwort abschließen.

Abnahme: Eine frische Installation führt ohne Suche in mehreren Einstellungsseiten zum funktionierenden Chat.

## 7. Oberfläche und Orientierung

- [ ] Kompakte Chatansicht und einklappbare Zusatzinformationen anbieten.
- [ ] Werkzeugleisten, HUD und Avatarsteuerung auf das aktuelle Erlebnis fokussieren.
- [ ] Statusanzeige an das tatsächlich gewählte Backend anpassen.
- [ ] Einstellungssuche mit direktem Sprung zur passenden Option ergänzen.
- [ ] Kleine Fenster, Tastaturbedienung und verschiedene Themes anhand von E2E-Screenshots prüfen.

Abnahme: Ein funktionierender Cloud-Chat erscheint nicht wegen eines gestoppten lokalen Servers als gestört.

## 8. Lange Geschichten navigieren

- [ ] Volltextsuche im Chat mit Sprung zur Fundstelle ergänzen.
- [ ] Wichtige Szenen mit Lesezeichen markieren können.
- [ ] Ab einer Nachricht einen alternativen Handlungsverlauf beginnen können.
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
