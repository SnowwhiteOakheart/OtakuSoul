# 🎨 todo_assets.md – Grafiken für 5e-Spielbrett & Starter-Abenteuer

> Wofür: Schritt 2 (Spielbrett) und Schritt 5 (Starter-Abenteuer) aus [`Roadmap_DND.md`](Roadmap_DND.md).
> Wer: Die Grafiken werden mit ChatGPT oder Gemini erstellt (SVG als Code, Porträts als Bild) und dann hier abgelegt.
> Die Karten selbst (welche Kachel wo liegt) baut Claude als JSON – dafür werden nur die Kacheln gebraucht.
> Abhaken: `[x]`, sobald die Datei am Zielort liegt; Claude prüft danach Technik und Nahtlosigkeit.

---

## 0. Regeln für alle Grafiken

### Inhalt & Rechte
- Nur eigene, neu erzeugte Motive. **Keine** bekannten Figuren, Logos, Wasserzeichen, Signaturen oder **Text/Schrift**
  im Bild. Kein „D&D“, keine Markenzeichen.
- Jugendfrei: keine Nacktheit, kein Blut/Gore (Untote dürfen gruselig, nicht eklig sein).

### Stil (einheitlich über alle Sätze)
- **Draufsicht** (exakt von oben, 90°), Norden = oben. **Licht von links oben**; Schatten als dunklere Flächen nach
  rechts unten (keine Filter-Effekte).
- **Flacher, leicht gemalter Vektorstil:** klare Formen, 2–4 Tonwerte pro Material, dünne dunkle Konturen
  (`stroke-width` 1–2 bei 64er-Kacheln). Wirkung: düsteres Fantasy-Brettspiel, gut lesbar auch klein (32 px).
- Passt zur App (dunkles Slate-Design, Akzent Violett) und zu den vorhandenen NPC-Archetypen in `public/npc/*.svg`.

### Farbpalette (bitte verwenden, kleine Abweichungen sind ok)

| Zweck | Farben |
|---|---|
| Stein/Dungeon | `#1e222b` (Fuge/Schatten) · `#2b2f3a` · `#3b4252` · `#4c566a` · `#5e6779` (Licht) |
| Holz | `#4a3322` · `#6b4a2f` · `#8a6240` |
| Metall/Gold | `#6b7480` · `#9aa3ad` · `#c9a227` · `#e0c25a` |
| Wasser | `#1f3f4f` · `#2f5d73` · `#3f7d95` · `#7fb3c4` (Glanz) |
| Moos/Gras | `#2f4a2a` · `#3f6b35` · `#4f7f3f` · `#5e8f48` · `#7aa35a` |
| Erde/Weg | `#5c4329` · `#7a5c3a` · `#8c6b45` · `#a3835a` |
| Laub/Rinde | `#24401f` · `#2f5a2a` · `#3d7a34` · `#5a3d24` |
| Fels | `#4a4e55` · `#6b6f75` · `#8a8e94` |
| Magie/Böse | `#6d28d9` · `#8b5cf6` · `#22c55e` (Nekrolicht, sparsam) |
| Haut/Kontur | Kontur `#0f172a`; Hauttöne frei, natürlich |

### Technik SVG (Kacheln und Tokens)
- Reines SVG 1.1, **nur** diese Elemente: `svg g path rect circle ellipse polygon polyline line defs linearGradient
  radialGradient stop clipPath`. **Nicht erlaubt:** `<text>`, `<image>`, `<script>`, `<style>`-Blöcke, `<filter>`,
  `<foreignObject>`, externe Links/`href`, Schriften, eingebettete Rasterbilder (base64).
- Farben als Attribute (`fill="#…"`), keine CSS-Klassen. Keine IDs doppelt; Gradient-IDs mit Dateinamen-Präfix
  (z. B. `id="floor_stone_1-g1"`), damit mehrere Kacheln auf einer Seite nicht kollidieren.
- Dateigröße: Kacheln ≤ 12 KB, Tokens ≤ 20 KB. Koordinaten auf höchstens 1 Nachkommastelle runden.

### Technik Bilder (nur Porträts, Abschnitt D)
- PNG, **768 × 1024 px** (Hochformat 3:4), sRGB, ohne Rand und ohne Text.

### Ablage & Namen
- Kleinbuchstaben, Unterstrich, englisch: `floor_stone_1.svg`. Genau die Namen aus den Tabellen verwenden.
- Zielordner stehen bei jedem Abschnitt. Nach dem Ablegen kurz Bescheid sagen – Claude prüft (gültiges SVG, erlaubte
  Elemente, Nahtlosigkeit im 3×3-Test, Größe) und erzeugt PNG-Fassungen, wo nötig.

---

## A. Kachelsatz „Dungeon“ (Akt 2 und 3) – Zielordner `public/stage/tiles/dungeon/`

**Format:** `width="64" height="64" viewBox="0 0 64 64"`, füllt die ganze Fläche (kein transparenter Rand), außer bei
Objekten (siehe Spalte „Typ“).

* **Boden**-Kacheln müssen **nahtlos** sein: links/rechts und oben/unten passen ohne sichtbare Kante aneinander
  (Fugen genau an den Rändern bei 0 und 64 oder durchgehend gleich).
* **Objekt**-Kacheln haben einen **transparenten Hintergrund** – die App legt sie über eine Bodenkachel.
* **Türen** sind waagerecht gezeichnet (Wand verläuft links→rechts, Durchgang nach oben/unten); für senkrechte Wände
  dreht die App sie um 90°.

| ☐ | Datei | Typ | Beschreibung |
|---|---|---|---|
| [x] | `floor_stone_1.svg` | Boden | Grob behauene, graue Steinplatten (2×2 große Platten pro Kachel), feine dunkle Fugen. Nahtlos. |
| [x] | `floor_stone_2.svg` | Boden | Wie 1, andere Plattenaufteilung (1 große + 2 kleine), ein feiner Riss. Nahtlos und mit 1 kombinierbar. |
| [x] | `floor_stone_3.svg` | Boden | Wie 1, mit etwas Moos in einer Fuge und ein paar Steinkrümeln. Nahtlos, mit 1/2 kombinierbar. |
| [x] | `wall_stone.svg` | Boden (blockiert) | Wand von oben: dicht gemauerte, dunklere Steinblöcke mit hellerer Oberkante links oben. Nahtlos in alle Richtungen, deutlich dunkler/massiver als der Boden. |
| [x] | `door_closed.svg` | Objekt | Geschlossene Holztür mit zwei Eisenbändern, quer über die Kachel (ca. 64×20, mittig), links und rechts kurze Steinpfosten. |
| [x] | `door_open.svg` | Objekt | Dieselbe Tür, geöffnet: Türblatt um 90° aufgeklappt am linken Pfosten, Durchgang frei. |
| [x] | `door_locked.svg` | Objekt | Wie `door_closed`, zusätzlich großes Vorhängeschloss in Gold/Metall mittig. |
| [x] | `rubble.svg` | Objekt (schwieriges Gelände) | Lose Steinbrocken und Geröll, verteilt über ca. 70 % der Fläche. |
| [x] | `water_shallow.svg` | Boden (schwieriges Gelände) | Flache, dunkle Pfütze/Wasserfläche über Stein, leichte Glanzlinien. Nahtlos. |
| [x] | `pit.svg` | Boden (blockiert) | Tiefe Grube/Abgrund: schwarzes Loch mit gebrochener Steinkante, fast die ganze Kachel. |
| [x] | `pillar.svg` | Objekt (blockiert) | Runde Steinsäule von oben (Kreis, Ø ca. 48), Schattenwurf nach rechts unten. |
| [x] | `stairs_down.svg` | Objekt | Treppe nach unten: Stufen werden nach oben hin dunkler (führt in die Tiefe), Pfeilform durch Stufen erkennbar. |
| [x] | `stairs_up.svg` | Objekt | Treppe nach oben: Stufen werden nach oben heller. |
| [x] | `chest_closed.svg` | Objekt | Holztruhe mit Metallbeschlägen, geschlossen, von oben (ca. 40×28). |
| [x] | `chest_open.svg` | Objekt | Dieselbe Truhe offen, goldener Schimmer im Inneren. |
| [x] | `sarcophagus.svg` | Objekt (blockiert) | Steinsarkophag von oben, schlichte Ornamente, längs (ca. 30×58). |
| [x] | `altar.svg` | Objekt (blockiert) | Steinaltar mit zwei Kerzen und einer Schale. |
| [x] | `altar_dark.svg` | Objekt (blockiert) | Wie `altar`, aber schwarzer Stein, violett leuchtende Runen-Linien (abstrakte Muster, **keine** Schriftzeichen) und grünliches Licht in der Schale. Bossraum Akt 3. |
| [x] | `bones.svg` | Objekt (Deko) | Ein paar verstreute Knochen und ein Schädel, klein, nicht eklig. |
| [x] | `trap_plate.svg` | Objekt | Druckplatte im Boden: quadratische, leicht abgesenkte Steinplatte mit feinem Spalt rundum (nach Entdeckung sichtbar). |
| [x] | `lever.svg` | Objekt | Wandhebel mit Holzgriff auf kleiner Metallplatte. |
| [x] | `brazier.svg` | Objekt (blockiert) | Eisernes Feuerbecken mit Glut und Flammen (orange/gelb), runde Form. |
| [x] | `cobweb.svg` | Objekt (Deko) | Spinnennetz in einer Ecke (oben links), halbtransparent hell. |

---

## B. Kachelsatz „Wald“ (Akt 1: Waldstraße mit Hinterhalt) – Zielordner `public/stage/tiles/forest/`

Gleiche Regeln wie A (64×64, Boden nahtlos, Objekte transparent).

| ☐ | Datei | Typ | Beschreibung |
|---|---|---|---|
| [x] | `grass_1.svg` | Boden | Kurzes Gras, mehrere Grüntöne, kleine Halmgruppen. Nahtlos. |
| [x] | `grass_2.svg` | Boden | Wie 1 mit ein paar winzigen Blüten (weiß/gelb). Nahtlos, mit 1 kombinierbar. |
| [x] | `grass_3.svg` | Boden | Wie 1 mit etwas höherem Gras und einem kleinen Stein. Nahtlos, mit 1/2 kombinierbar. |
| [x] | `dirt_road.svg` | Boden | Festgetretene Erdstraße mit zwei Wagenspuren (waagerecht). Nahtlos in alle Richtungen (auch als Fläche nutzbar). |
| [x] | `road_edge.svg` | Objekt | Übergang Straße→Gras: Grasbüschel, die von **oben** in die Kachel ragen (unterer Teil transparent). Die App dreht sie für alle Seiten. |
| [x] | `tree.svg` | Objekt (blockiert) | Laubbaumkrone von oben, rund, fast kachelfüllend (Ø ca. 60), dunkler Schatten unten rechts. |
| [x] | `tree_pine.svg` | Objekt (blockiert) | Nadelbaum von oben: sternförmige Nadelkrone, dunkelgrün. |
| [x] | `bush.svg` | Objekt (schwieriges Gelände) | Dichtes Gebüsch, 2–3 runde Blattballen. |
| [x] | `rock.svg` | Objekt (blockiert) | Großer Felsbrocken von oben, kantig, grau. |
| [x] | `log.svg` | Objekt (schwieriges Gelände) | Umgestürzter Baumstamm waagerecht, sichtbare Jahresringe an einem Ende. |
| [x] | `wagon_left.svg` | Objekt (blockiert) | **Linke Hälfte** eines umgestürzten Planwagens (mit rechtem Teil zusammen 128×64): Deichsel, Vorderrad, zerrissene Plane. |
| [x] | `wagon_right.svg` | Objekt (blockiert) | **Rechte Hälfte** desselben Wagens: Hinterrad, verstreute Ladung. Muss nahtlos an `wagon_left` anschließen. |
| [x] | `crates.svg` | Objekt (blockiert) | Zwei gestapelte Holzkisten und ein Sack. |
| [x] | `campfire.svg` | Objekt (blockiert) | Lagerfeuer im Steinkreis mit Flammen. |
| [x] | `stream.svg` | Boden (schwieriges Gelände) | Flacher Bach waagerecht durch die Kachel (oben/unten Gras-Ufer). Links/rechts nahtlos. |

---

## C. Spielfiguren (Tokens) – Zielordner `public/stage/tokens/`

**Format:** `width="256" height="256" viewBox="0 0 256 256"`. Motiv **im Kreis** (Mittelpunkt 128/128, Radius 120),
außerhalb transparent – die App zeichnet Rahmen, LP-Ring und Markierungen selbst (also **kein** eigener Rahmen).
Ansicht: **Brustbild/Kopf von vorn** (wie ein Porträt-Medaillon, nicht von oben). Kreis-Hintergrund in einer
gedämpften Farbe passend zur Figur. Gut erkennbar bei 48 px.

### Helden (Starter-Gruppe)

| ☐ | Datei | Figur |
|---|---|---|
| [x] | `hero_thorin.svg` | **Thorin Eisenfaust** – Zwerg, Kämpfer. Breites Gesicht, buschiger kupferroter Bart in zwei Zöpfen, Stahlhelm mit Nasenschutz, Kettenhemd, Schulterplatte. Hintergrund dunkles Rot. |
| [x] | `hero_lyra.svg` | **Lyra Sternenweberin** – Hochelfe, Magierin. Lange silberblaue Haare, spitze Ohren, schmale Augen in Violett, dunkelblaue Robe mit Sternenstickerei, kleiner leuchtender Stern über der Hand. Hintergrund Nachtblau. |
| [x] | `hero_finn.svg` | **Finn Flinkfinger** – Halbling, Schurke. Junges, verschmitztes Gesicht, braune Locken, Kapuze aus grünem Leder, Dolchgriff über der Schulter. Hintergrund dunkles Grün. |
| [x] | `hero_althea.svg` | **Althea Sonnenglanz** – Mensch, Klerikerin. Freundliche Frau, goldblonder Zopf, weißer Wappenrock mit goldener Sonnenscheibe (Symbol, keine Schrift), leichter Glanz um den Kopf. Hintergrund warmes Gold/Bernstein. |

### Monster (SRD) und Boss

| ☐ | Datei | Figur |
|---|---|---|
| [x] | `monster_goblin.svg` | Goblin: kleine grüne Kreatur, große spitze Ohren, gelbe Augen, Lederkappe, freches Grinsen. |
| [x] | `monster_kobold.svg` | Kobold: kleines echsenartiges Wesen, rostrote Schuppen, Hörnchen, Speer über der Schulter. |
| [x] | `monster_wolf.svg` | Wolf: grauer Wolfskopf, gefletschte Zähne, bernsteinfarbene Augen. |
| [x] | `monster_skeleton.svg` | Skelett: Totenschädel mit glimmenden blauen Augenpunkten, rostiger Helm, Schildrand. |
| [x] | `monster_zombie.svg` | Zombie: fahlgrüne Haut, leerer Blick, zerrissene Bauernkleidung (nicht eklig). |
| [x] | `monster_bandit.svg` | Bandit: Mensch mit Tuch vor Mund/Nase, Kapuze, Narbe über der Augenbraue. |
| [x] | `monster_giant_rat.svg` | Riesenratte: Rattenkopf, rote Augen, gelbe Nagezähne. |
| [x] | `monster_orc.svg` | Ork: graugrüne Haut, Hauer, Kriegsbemalung (Striche, keine Zeichen), Fellumhang. |
| [x] | `monster_ghoul.svg` | Ghul: hagere, fahle Gestalt, lange Krallen am Bildrand, hungrige Augen. |
| [x] | `monster_shadow.svg` | Schatten: fast schwarze, rauchige Silhouette mit zwei weißen Augenpunkten. |
| [x] | `monster_necromancer.svg` | Nekromant (Boss Akt 3): bleicher Mann mit Kapuzenrobe in Schwarz/Violett, grünes Nekrolicht in der Hand, Knochenschmuck. |
| [x] | `monster_hobgoblin.svg` | Hobgoblin: orangerote Haut, disziplinierter Blick, Plattenhelm mit Wangenschutz, Schildkante. |
| [x] | `monster_bugbear.svg` | Grottenschrat: großer, zottelig behaarter Goblinoid, Bärenschnauze, Morgenstern über der Schulter. |
| [x] | `monster_giant_spider.svg` | Riesenspinne: schwarzbrauner Spinnenkopf von vorn, acht glänzende Augen, Kieferklauen, Netzfäden am Rand. |
| [x] | `monster_dire_wolf.svg` | Schreckenswolf: massiger dunkelgrauer Wolfskopf, Narben, gelbe Augen (größer und wilder als der Wolf). |
| [x] | `monster_ogre.svg` | Oger: breites Gesicht, schiefe Hauer, Fellumhang, grober Holzknüppel am Bildrand. |

---

## D. Heldenporträts für die Charakterkarten – Zielordner `public/stage/heroes/`

**Format:** PNG 768 × 1024 (Hochformat), **halbe Figur** (Kopf bis Hüfte), Blick leicht zur Kamera, neutraler,
leicht unscharfer Fantasy-Hintergrund passend zur Figur, **kein Text**. Stil: hochwertige Anime-/Fantasy-Illustration
(passt zu den Charakterkarten der App), weiches Licht von links oben. Aussehen exakt wie die Tokens in C.

| ☐ | Datei | Figur & Hintergrund |
|---|---|---|
| [x] | `thorin.png` | Thorin wie in C, Streitaxt oder Langschwert und Rundschild; Hintergrund Schmiede/Bergfestung mit Glut. |
| [x] | `lyra.png` | Lyra wie in C, Zauberbuch und kleine Sternlichter; Hintergrund nächtliche Bibliothek/Turm. |
| [x] | `finn.png` | Finn wie in C, zwei Dolche, Diebeswerkzeug am Gürtel; Hintergrund Dächer einer Stadt in der Dämmerung. |
| [x] | `althea.png` | Althea wie in C, Streitkolben und Sonnenamulett; Hintergrund heller Tempel mit Sonnenstrahlen. |

---

## E. Optional: Zustands-Symbole – Zielordner `public/stage/conditions/`

Nur falls die Standard-Icons der App nicht reichen. `viewBox="0 0 24 24"`, **einfarbig** mit `fill="currentColor"`
bzw. `stroke="currentColor"` (die App färbt sie), Strichstärke 2, keine Füllflächen über 50 %.

| ☐ | Datei | Bedeutung |
|---|---|---|
| [x] | `blinded.svg` | Blind (durchgestrichenes Auge) |
| [x] | `charmed.svg` | Bezaubert (Herz mit Funken) |
| [x] | `frightened.svg` | Verängstigt (erschrockenes Gesicht) |
| [x] | `grappled.svg` | Gepackt (greifende Hand) |
| [x] | `incapacitated.svg` | Kampfunfähig (Spirale) |
| [x] | `paralyzed.svg` | Gelähmt (Blitz durch Figur) |
| [x] | `poisoned.svg` | Vergiftet (Tropfen mit Totenkopf-Punkt) |
| [x] | `prone.svg` | Liegend (liegende Figur) |
| [x] | `restrained.svg` | Festgesetzt (Kette) |
| [x] | `stunned.svg` | Betäubt (Sterne um Kopf) |
| [x] | `unconscious.svg` | Bewusstlos (geschlossenes Auge mit drei kleinen Wellen darüber, keine Buchstaben) |
| [x] | `concentration.svg` | Konzentration (Kreis mit Punkt) |

---

## F. Fertige Prompts zum Kopieren

**Für SVG-Kacheln (A, B):**

> Erstelle eine SVG-Datei für eine Top-Down-Spielbrettkachel eines Fantasy-Brettspiels. Exakte Draufsicht, Norden
> oben, Licht von links oben, Schatten als dunklere Flächen nach rechts unten. Flacher, leicht gemalter Vektorstil mit
> 2–4 Tonwerten pro Material und dünnen dunklen Konturen (#0f172a, stroke-width 1–2). Format: `width="64" height="64"
> viewBox="0 0 64 64"`. Nur die Elemente svg, g, path, rect, circle, ellipse, polygon, polyline, line, defs,
> linearGradient, radialGradient, stop, clipPath; kein text, image, script, style, filter, keine externen Links.
> Farben nur als Attribute, Gradient-IDs mit dem Präfix „{DATEINAME}-“. Höchstens 12 KB.
> {BODEN: Die Kachel muss nahtlos kacheln – linke/rechte und obere/untere Kante passen exakt aneinander.}
> {OBJEKT: Hintergrund transparent, das Objekt liegt mittig auf einer Bodenkachel.}
> Motiv: {BESCHREIBUNG AUS DER TABELLE}. Palette: {FARBEN AUS ABSCHNITT 0}. Gib nur den SVG-Code aus.

**Für Tokens (C):**

> Erstelle eine SVG-Datei für eine runde Spielfigur (Token) eines Fantasy-Brettspiels: Brustbild von vorn wie ein
> Medaillon. Format `width="256" height="256" viewBox="0 0 256 256"`, Motiv innerhalb eines Kreises (Mittelpunkt
> 128/128, Radius 120, per clipPath), außerhalb transparent, **kein eigener Rahmen**. Flacher Vektorstil mit weichen
> Schattierungen, dunkle Konturen #0f172a, Licht von links oben, gut erkennbar bei 48 px. Erlaubte Elemente wie bei
> Kacheln, kein Text. Höchstens 20 KB. Figur: {BESCHREIBUNG}. Gib nur den SVG-Code aus.

**Für Porträts (D):**

> Hochwertige Anime-Fantasy-Illustration, halbe Figur (Kopf bis Hüfte), Hochformat 3:4 (768×1024), Blick leicht zur
> Kamera, weiches Licht von links oben, leicht unscharfer Hintergrund: {HINTERGRUND}. Figur: {BESCHREIBUNG AUS C}.
> Kein Text, keine Schrift, kein Logo, kein Wasserzeichen, kein Rahmen.

---

## G. Prüfliste vor der Übergabe

Neu gestaltet und geprüft am **07.10.2026**: alle 74 Assets (70 SVGs und vier PNGs), einschließlich der fünf ergänzten Monster-Tokens.
Details und Porträt-Prompts: [`docs/stage_assets.md`](docs/stage_assets.md).

- [x] Dateiname exakt wie in der Tabelle, im richtigen Ordner.
- [x] SVG öffnet im Browser, keine verbotenen Elemente, Größe im Rahmen.
- [x] Bodenkacheln 3×3 nebeneinander ohne sichtbare Kanten (Claude prüft das zusätzlich automatisch).
- [x] Objekte mit transparentem Hintergrund, Tokens ohne eigenen Rahmen.
- [x] Keine Schrift, keine Marken, jugendfrei.

**Reihenfolge nach Bedarf:** zuerst A (Dungeon) und die Tokens aus C (Helden, Goblin, Skelett, Zombie) – damit lässt
sich Schritt 2 vollständig bauen. B, D, die übrigen Monster und E folgen bis Schritt 5.
