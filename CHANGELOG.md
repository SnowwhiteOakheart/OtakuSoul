# Changelog

## [0.7.8]

### Neu

- Desktop-Pet mit Alltag: Bindung je Figur, Hunger- und Langeweile-Hinweise, Lieblingsessen, Begrüßung, Pausen-Erinnerung, Fokus-Modus beim Pomodoro, Briefe bei neuen Nachrichten, Wetter-Requisiten (optional), Fußspuren und Sandburgen.
- Mehr Physik beim Desktop-Pet: Griffe an Hand, Kragen und Fuß, Ziehen über den Boden, Aufprall-Reaktionen, Fensterkanten greifen, Mauszeiger jagen, schrittweises Aufrappeln und eine optionale Ragdoll (Standard aus).
- Neues Pet-Menü als Ring um die Figur, Ess-Animation, Gast-Pet, Streicheln, Timer/Pomodoro, Spähen am Rand, ausblendbare Kleidungsteile; Live2D-, VMD- und VRoid-Hub-Modelle.
- Handy-Web-Client am echten Chat (Live-Text, Bilder) und OBS-Overlay mit eigenem Nur-Lese-Token.
- Avatar wahlweise rechts neben dem Chat, Breite ziehbar.

### Behoben

- Überdeckungen und Zuschnitt bei Dialogen, Menüs und der Chat-Werkzeugleiste.
- Companion-Reiterleiste bricht um; Sprechblase des Pets bleibt beim Ziehen schmal; Companion-Seite lädt schneller.
- macOS-Build: Linken der ONNX-Runtime (CoreML) schlug seit 0.7.6 fehl.

[Release Notes auf Deutsch und Englisch](packaging/release-notes/v0.7.8.md)

## [0.7.7]

### Neu

- Lautstärkeregler-Popover direkt im Chat und im Abenteuerdialog (Stage) zum Regeln und Stummschalten von Musik, Stimmen (TTS) und Soundeffekten.
- Standard-Lautstärke der Musikwiedergabe auf 60 % angehoben.

### Behoben

- Schichtungsreihenfolge (Z-Index) korrigiert: Das Menü „Mehr“ in der Stage-Leiste liegt nicht mehr hinter Chatverlauf und Gruppenanzeige.

[Release Notes auf Deutsch, Englisch und Russisch](packaging/release-notes/v0.7.7.md)

## [0.7.6]

### Neu

- Gemeinsame Ansicht für Chat, Gruppe und Spielbrett in 5e-Abenteuern mit Karte. Der Kartenfokus lässt sich direkt am Brett ein- und ausschalten.
- Umschaltbare Draufsicht und 2.5D-Diorama mit zusammenhängendem Mauerwerk, Zoom und Zentrierung.
- Initiative und Aktionsleiste am Brett sowie Laufwegvorschau mit Bewegungskosten.
- Hub-Reiter **Welten** für Charaktere, Szenarien, Lorebooks und Sammlungen.
- Live2D-ZIP-Import mit Erkennung verschachtelter Modelle und Auswahl bei mehreren Varianten. Offizielle Modell-Downloadlinks in Charakterkarten.

### Geändert

- Kampf und Erkundung verwenden den gemeinsamen Rust-Kern `otakusoul-rules5e`. Ein fest vorgegebener Testablauf prüft die Ergebnisse.
- Abhängigkeiten aktualisiert und lokale Kokoro-Sprachausgabe auf die neuere ONNX-Schnittstelle umgestellt.

[Release Notes auf Deutsch, Englisch und Russisch](packaging/release-notes/v0.7.6.md)

## Frühere Versionen

[Archiv der Release Notes](packaging/release-notes/) · [Alle GitHub-Releases](https://github.com/SnowwhiteOakheart/OtakuSoul/releases)

[0.7.8]: https://github.com/SnowwhiteOakheart/OtakuSoul/compare/v0.7.7...v0.7.8
[0.7.7]: https://github.com/SnowwhiteOakheart/OtakuSoul/compare/v0.7.6...v0.7.7
[0.7.6]: https://github.com/SnowwhiteOakheart/OtakuSoul/compare/v0.7.5...v0.7.6
