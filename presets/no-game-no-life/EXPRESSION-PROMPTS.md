# Expression-Portraits für das No-Game-No-Life-Preset

Die sieben kanonischen Charakterkarten besitzen jeweils sechs aufeinander abgestimmte 2D-Portraits:
`neutral`, `happy`, `sad`, `angry`, `surprised` und `relaxed`. Die Bilder wurden mit dem eingebauten
Imagegen-Werkzeug aus dem jeweiligen vorhandenen Basispotrait als visueller Referenz erzeugt.

## Gemeinsamer Prompt-Aufbau

Für jeden Charakter wurde ein kontaktbogenartiges Bild mit exakt zwei Spalten und drei Zeilen erzeugt. Die
Reihenfolge war immer:

1. oben links: neutral
2. oben rechts: fröhlich
3. mittig links: traurig
4. mittig rechts: wütend
5. unten links: überrascht
6. unten rechts: entspannt

Der gemeinsame Kern des Prompts lautete sinngemäß:

> Nutze das bereitgestellte Portrait als strenge Referenz für Figur, Kleidung, Farbpalette, Zeichenstil und
> Kamera. Erzeuge sechs zusammenpassende Brustportraits derselben Figur in einem exakten 2x3-Kontaktbogen.
> Bewahre Gesicht, Haare, Augen, Kleidung, Hintergrund und Beleuchtung; ändere nur Mimik und kleine, zur
> Emotion passende Haltungsdetails. Keine Beschriftung, keine Rahmen, keine weiteren Figuren, kein
> Wasserzeichen und keine Kostüm- oder Frisuränderung.

Die emotionsspezifischen Beschreibungen wurden pro Figur an ihre Persönlichkeit angepasst (beispielsweise
Soras selbstsicheres Grinsen, Shiros sehr zurückhaltendes Lächeln und Stephanies empörte Wut). Bei Shiro und
Izuna wurde zusätzlich eine strikt altersgerechte, nicht sexualisierte Darstellung verlangt.

Die sechs Panels wurden anschließend auf 640x800 Pixel vereinheitlicht und als WebP mit Qualitätsstufe 88
unter `expressions/<character>/<emotion>.webp` gespeichert. Die relativen Pfade stehen im
`extensions.expressions`-Objekt der jeweiligen Character Card.
