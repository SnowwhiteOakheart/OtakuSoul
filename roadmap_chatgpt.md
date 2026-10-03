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

- [ ] Speicherfehler vom Store an die Oberfläche weitergeben und verständlich anzeigen.
- [ ] Erfolgsmeldungen ausschließlich nach erfolgreichem Speichern anzeigen.
- [ ] Eingaben bei Fehlern erhalten und Wiederholen anbieten.
- [ ] Memory-, Psychologie-, Beziehungs-, Tagebuch- und Chat-Editoren auf verschluckte Fehler prüfen.
- [ ] Fehlgeschlagenes Speichern mit Tests absichern, insbesondere manuell angelegte Erinnerungen.

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
