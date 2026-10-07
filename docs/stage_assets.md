# Stage-Grafiken

Die 69 Grafiken unter `public/stage/` wurden am 07.10.2026 nach
[`todo_assets.md`](../todo_assets.md) neu gestaltet. Dateinamen und Einbindung bleiben erhalten.

Die 15 Tokens sind direkt gezeichnete Vektorgrafiken mit facettierten Licht- und Schattenflächen,
unterschiedlichen Silhouetten und hervorgehobenen Augen. Sie sind auf den Kreis mit Mittelpunkt
128/128 und Radius 120 begrenzt; die App zeichnet den äußeren Rahmen. Die vier Heldenillustrationen
zeigen dieselben Merkmale in einem ausgearbeiteten Anime-/Fantasy-Stil.

Die 38 Kacheln verwenden die vorgegebene Palette und Licht von links oben. Die drei Steinböden
haben identische Fugen an den Außenkanten, die drei Grasvarianten identische Grundfarben am Rand.
Wasser, Wand und Straße lassen sich in beide Richtungen wiederholen, der Bach waagerecht.
Die beiden Wagenhälften stammen aus einer zusammenhängenden 128 × 64-Zeichnung.
Objekte besitzen transparente Hintergründe. Alle zwölf Zustandssymbole verwenden ausschließlich
`currentColor` und Konturen mit Strichstärke 2.

## Prüfung

- Vorhandene Vitest-Prüfung: `npm test -- src/test/stageAssets.test.ts`.
- Zusätzlich alle SVGs als XML und mit `rsvg-convert` geprüft: erlaubte Elemente,
  Abmessungen, Dateigrößen, höchstens eine Nachkommastelle, eindeutige IDs mit Dateinamenpräfix.
- Transparenz außerhalb der Tokenkreise und bei Objektkacheln kontrolliert.
- Gegenüberliegende Rasterkanten der wiederholbaren Böden pixelgenau verglichen;
  bei Stein- und Grasvarianten auch untereinander. 3×3-Ansichten visuell geprüft.
- Tokens in 256 px und 48 px, Kacheln und Heldenporträts visuell angesehen.
- Vier PNGs auf 768 × 1024 px normalisiert und mit einem sRGB-Profil gespeichert.

## Erzeugung der Porträts

Die SVGs wurden als Vektorgeometrie erstellt, ohne Rasterbilder, Filter oder externe Ressourcen.
Für die PNGs wurde das integrierte `image_gen`-Werkzeug verwendet. Die folgenden Prompts
wurden jeweils als eigene Bildanfrage mit dem gemeinsamen Rahmen kombiniert.

Gemeinsamer Rahmen:

> Use case: stylized-concept. Project asset: original fantasy RPG hero card portrait.
> Generate ONE finished high quality anime fantasy illustration, portrait 3:4,
> 768x1024 PNG sRGB. Half figure head to hips, looking slightly toward camera.
> Consistent refined painterly anime style, anatomically convincing hands and detailed face,
> rich restrained colors, soft light from upper left, slightly blurred background.
> Youth appropriate. No text, letters, logos, watermark, signature or border.

**Thorin (`public/stage/heroes/thorin.png`):**

> Stocky dwarf warrior, broad weathered face, bushy copper red beard with TWO clearly
> braided strands with steel clasps, steel helmet with nasal guard, chainmail and plate
> shoulders, battle axe and round shield. Forge and mountain fortress, distant ember glow.

**Lyra (`public/stage/heroes/lyra.png`):**

> High elf mage, long silver blue hair, pointed ears, narrow violet eyes, dark blue robe
> with tiny abstract star embroidery, small radiant star above one hand, spellbook in
> other hand. Nighttime tower library.

**Finn (`public/stage/heroes/finn.png`):**

> Young adult halfling rogue, mischievous handsome face, curly brown hair, green leather
> hood, two daggers and thieves tools at belt. City rooftops at twilight.

**Althea (`public/stage/heroes/althea.png`):**

> Human cleric woman, friendly confident face, golden blonde braid, white tabard with a
> GOLD SUN DISC emblem (purely pictorial), sun amulet and mace. Bright temple with warm sun rays.
