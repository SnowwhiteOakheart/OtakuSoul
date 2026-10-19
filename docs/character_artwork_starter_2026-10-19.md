# Bildauftrag: Neue Einsteigerfiguren

Stand 19.10.2026. Vier frei erfundene Figuren ersetzen künftig Ayu Ikue, Cosmos und Emilia als mitgelieferte
Einsteigerfiguren (die drei wandern nach `otakusoul-data`). Karten und Platzhalterbilder liegen bereits in
`presets/characters/`. Dieses Dokument ist der Auftrag, die Platzhalter durch fertige Bilder zu ersetzen.

## Dateien

| Figur | Karte | Grundporträt | Emotionsbilder | Stil |
|---|---|---|---|---|
| Shiori Amane | `shiori_amane.json` | `shiori_amane.png` | `expressions/shiori_amane/` | Anime |
| Sota Minase | `sota_minase.json` | `sota_minase.png` | `expressions/sota_minase/` | Anime |
| Lirwen | `lirwen.json` | `lirwen.png` | `expressions/lirwen/` | Anime |
| Faelion | `faelion.json` | `faelion.png` | `expressions/faelion/` | **Realistisch** (Film-/Fotolook) |

Jeder Satz besteht aus elf WebP-Dateien: die sechs Stimmungen `neutral`, `happy`, `sad`, `angry`, `surprised`,
`relaxed` und die Zusatzplätze `blush`, `teasing`, `fear`, `disgust`, `crying`. Die Romance-Plätze (`seductive`,
`aroused`, `ecstasy`, `afterglow`) bekommen diese Figuren ausdrücklich **nicht**.

Regeln für den Austausch:

- Dateinamen und Pfade nicht ändern; die Zuordnung steht schon unter `data.extensions.expressions`.
- Grundporträt als PNG, Emotionsbilder als WebP, jeweils **640 × 800 Pixel**, sRGB-Profil.
- Zuerst das Grundporträt erzeugen; `neutral.webp` stammt aus dem fertigen Grundporträt, alle anderen
  Varianten nutzen das Grundporträt als strenge Bildreferenz.
- Die Karten-JSONs (Texte, Übersetzungen) nicht anfassen.
- Jeder Platzhalter trägt in einem weißen Feld seinen Platznamen – so ist sichtbar, welche Datei noch fehlt.

## Gemeinsame Prompts

Grundporträt Anime (Shiori, Sota, Lirwen):

> Create a completely new polished anime illustration for a character card, single character portrait,
> 4:5 vertical, head to mid torso, face fully visible, looking toward camera, calm neutral mouth,
> both eyes open, arms and hands outside frame. [Character description and setting.]
> Detailed clean linework and soft painterly shading, consistent refined anime style, soft light
> upper left, restrained rich colors, gently blurred background. New composition and artwork.
> No text, letters, logo, watermark, signature or border. Wholesome fully clothed.

Grundporträt realistisch (Faelion):

> Create a photorealistic cinematic portrait for a character card, single character, 4:5 vertical,
> head to mid torso, face fully visible, looking toward camera, calm neutral mouth, both eyes open,
> arms and hands outside frame. [Character description and setting.] Realistic adult human actor look
> with natural skin texture, practical film costume, shallow depth of field, soft natural light from the
> upper left, muted earthy color grading, 85mm lens look. Not anime, not illustration, not 3D render.
> Original person, not resembling any real actor. No text, letters, logo, watermark, signature or border.

Emotionsvariante (alle vier; bei Faelion „photorealistic“ statt „anime“):

> Use case: identity-preserve. Asset type: single [anime | photorealistic] character emotion portrait.
> Input image 1 is the strict visual reference and edit target for [character].
> Produce ONE image, NOT a contact sheet. Change ONLY facial expression: [emotion and personality].
> Preserve facial identity, age, hairstyle, eye color, costume, accessories, pose, camera angle,
> exact framing, background, lighting and art style from the reference. Face should be clearly readable.
> No added text, letters, UI overlays, logo, watermark or signature. No extra limbs or characters.
> Retain all clothing coverage. Output portrait 4:5, 640x800 target.

Mimik je Platz:

- `happy`: warmes Lächeln, angehobene Mundwinkel, weichere Augen und angehobene Wangen.
- `sad`: angehobene innere Brauen, gesenkte Mundwinkel, melancholischer Blick.
- `angry`: zusammengezogene, abgesenkte Brauen, fokussierte Augen, angespannter Mund.
- `surprised`: angehobene Brauen, größere Augen, leicht geöffneter runder Mund.
- `relaxed`: ruhiges geschlossenes Lächeln, entspannte Brauen, weich halbgeschlossene Augen.
- `blush`: verlegenes Erröten auf Wangen (bei Lirwen auch Ohrspitzen), Blick leicht abgewandt, scheues Lächeln.
- `teasing`: schelmisches schiefes Grinsen, eine Braue leicht gehoben, wissender Blick.
- `fear`: geweitete Augen, hochgezogene und zusammengezogene Brauen, angespannter, leicht geöffneter Mund.
- `disgust`: gerümpfte Nase, hochgezogene Oberlippe, leicht zurückgezogener Kopf.
- `crying`: Tränen auf den Wangen, glänzende Augen, bebende Lippen, angehobene innere Brauen.

Ausdrucksstärke: Shiori und Faelion zurückhaltend (Faelion lächelt fast nur mit den Augen, `teasing` als kaum
sichtbares Mundwinkelzucken), Sota und Lirwen expressiver. Shiori und Sota sind volljährige Abschlussschüler (18):
erwachsen wirkende Gesichtszüge, Uniform korrekt und vollständig, keinerlei sexualisierte Darstellung.

## Beschreibungen für die Grundporträts

**shiori_amane** (`presets/characters/shiori_amane.png`, Anime):

> Shiori Amane, 18-year-old final-year high school student, petite, shoulder-length dark brown hair loosely
> pinned up with a pencil, round thin gold-rimmed glasses, grey-blue eyes, gentle shy expression. Japanese
> school uniform with dark green blazer and neat ribbon under an oversized beige knit cardigan, a paperback
> peeking from the cardigan pocket. Warm late-afternoon school library with tall bookshelves.

**sota_minase** (`presets/characters/sota_minase.png`, Anime):

> Sota Minase, 18-year-old final-year high school student, lanky, messy black hair falling into his eyes,
> dark brown eyes with faint tired shadows, relaxed confident look. Japanese school uniform with loosened
> tie under an open grey hoodie, large black over-ear headphones around his neck, small plaster on the
> right thumb if visible. Dim after-school computer room with glowing monitors and an arcade stick.

**lirwen** (`presets/characters/lirwen.png`, Anime):

> Lirwen, young elf maiden of Tolkien-inspired high fantasy, slender, long chestnut brown hair with thin braids
> at the temples woven with a silver ribbon, bright moss-green eyes, pointed elven ears, curious open expression,
> faint ink stains on fingertips if visible. Simple long-sleeved moss green and silver grey gown, leather satchel
> strap across the chest with a quill tucked in. Elegant elven colonnade in a valley with a waterfall, golden
> evening light.

**faelion** (`presets/characters/faelion.png`, realistisch):

> Faelion, elven warrior of Tolkien-inspired high fantasy, tall lean adult man, long dark brown hair with warrior
> braids at the sides tied back at the nape, storm-grey eyes, thin pale scar through the left eyebrow, pointed
> elven ears, calm watchful expression. Fitted leather armour in forest green and grey with a grey hooded elven
> cloak, longbow over the shoulder, small carved wooden bird pendant on a worn leather cord. Ancient forest with
> giant silver-barked trees and golden leaves, soft dappled light.

## Prüfung nach dem Austausch

- Alle 44 WebP-Dateien und 4 PNG-Grundporträts dekodierbar, 640 × 800, sRGB, keine Platzhalter mehr
  (kein weißes Platzfeld, Bilddaten je Platz unterschiedlich).
- Pro Figur eine Übersicht aller elf Ausdrücke ansehen: Identität, Kleidung, Ausschnitt und Hintergrund konsistent.
- App starten, unter „Charaktere“ jede Figur öffnen und im Chat mindestens zwei Emotionen auslösen.
