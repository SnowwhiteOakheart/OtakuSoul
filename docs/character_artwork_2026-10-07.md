# Charakterporträts und Emotionsbilder

Am 07.10.2026 wurden neun Grundporträts ersetzt: Cosmos, Echidna, Emilia, Hazel Williams,
Hifumi Yamamoto, Makise Kurisu, Rory Mercury, Vivy und Yue. Erst nach Fertigstellung dieser
Porträts wurden Emotionsvarianten für alle 19 bislang nicht versorgten, mitgelieferten Charaktere erzeugt.
Die vorhandenen sieben No-Game-No-Life-Sätze bleiben erhalten.

## Dateien und Einbindung

- `presets/cards/`: neun importierte PNG-Charakterkarten, mit Emotionsbildern in `expressions/<slug>/`.
- `presets/sakura-succubus-3/`: sechs Charaktere, mit Emotionsbildern in `expressions/<slug>/`.
- `presets/crypt-of-shadows/`: vier Helden, mit Emotionsbildern in `expressions/<slug>/`.

Jeder Satz enthält `neutral.webp`, `happy.webp`, `sad.webp`, `angry.webp`, `surprised.webp`
und `relaxed.webp` mit 640 × 800 Pixeln und sRGB-Profil. Das neutrale Bild stammt aus dem
fertigen Grundporträt; bei Amadeus und Holo wurde auch der neutrale Ausdruck einzeln angeglichen,
damit Bildausschnitt und Hintergrund zu den neuen Varianten passen. Die fünf weiteren Varianten
sind jeweils einzeln erzeugte Bilder.
Die Zuordnung steht unter `data.extensions.expressions` mit relativen Pfaden.

Bei den PNG-Karten bleiben die eingebetteten `chara`-Daten erhalten und enthalten ebenfalls die
Bildzuordnungen. JSON-Karten mit identischem Dateistamm ermöglichen der bestehenden Preset-Suche,
auch älteren importierten Karten die neuen Emotionssätze zuzuordnen. Die Suche verhindert doppelte
Charaktere anhand von Dateistamm und Name. Beschreibungen, Dialoge, Übersetzungen und andere
vorhandene Erweiterungen werden erhalten.

Die lokalen Sicherungen der ursprünglichen Bilder liegen unter `output/character-artwork/originals/`.
Dieser Ausgabeordner wird nicht mit Git veröffentlicht.

## Erzeugung

Verwendet wurde ausschließlich das integrierte `image_gen`-Werkzeug. Die neun Grundporträts
wurden neu erzeugt, danach wurde jedes Grundporträt als strenge Bildreferenz für seine Varianten verwendet.
Die vollständigen lokalen Erzeugungsprotokolle liegen in `output/character-artwork/portraits-generated.json`
und `output/character-artwork/expressions-generated.json`; die beiden neutralen Korrekturen
stehen in `output/character-artwork/neutral-adjustments.json`.

Gemeinsamer Prompt für neue Grundporträts:

> Create a completely new polished anime illustration for a character card, single character portrait,
> 4:5 vertical, head to mid torso, face fully visible, looking toward camera, calm neutral mouth,
> both eyes open, arms and hands outside frame. [Character description and setting.]
> Detailed clean linework and soft painterly shading, consistent refined anime style, soft light
> upper left, restrained rich colors, gently blurred background. New composition and artwork.
> No text, letters, logo, watermark, signature or border. Wholesome fully clothed.

Gemeinsamer Prompt für jede Emotionsvariante:

> Use case: identity-preserve. Asset type: single anime character emotion portrait.
> Input image 1 is the strict visual reference and edit target for [character].
> Produce ONE image, NOT a contact sheet. Change ONLY facial expression: [emotion and personality].
> Preserve facial identity, age, hairstyle, eye color, costume, accessories, pose, camera angle,
> exact framing, background, lighting and art style from the reference. Face should be clearly readable.
> No added text, letters, UI overlays, logo, watermark or signature. No extra limbs or characters.
> Retain all clothing coverage. Output portrait 4:5, 640x800 target.

Die Mimik wird pro Zustand konkret beschrieben:

- `happy`: warmes Lächeln, angehobene Mundwinkel, weichere Augen und angehobene Wangen.
- `sad`: angehobene innere Brauen, gesenkte Mundwinkel, melancholischer Blick.
- `angry`: zusammengezogene, abgesenkte Brauen, fokussierte Augen, angespannter Mund.
- `surprised`: angehobene Brauen, größere Augen, leicht geöffneter runder Mund.
- `relaxed`: ruhiges geschlossenes Lächeln, entspannte Brauen, weich halbgeschlossene Augen.

Vivy, Kurisu, Echidna, Hifumi und Yue erhalten eher zurückhaltende, zur Persönlichkeit passende
Ausdrücke; Cosmos ist expressiver. Rory wird ausdrücklich altersgerecht und ohne sexualisierte
Darstellung gezeigt.

## Beschreibungen für die neuen Grundporträts

**cosmos** (`presets/sakura-succubus-3/cosmos.png`):

> Cosmos, adult cat-eared maid with shoulder-length fluffy pastel pink hair, violet eyes, pink cat ears, paw hair clip, black and white modest maid dress. Cozy cafe.

**echidna** (`presets/cards/Echidna The Witch of Greed.png`):

> Echidna from Re:Zero, adult Witch of Greed, long white hair, deep black eyes, green butterfly hairpin, elegant high-neck black funeral dress. Dreamlike garden with tea pavilion.

**emilia** (`presets/cards/Emilia.png`):

> Emilia from Re:Zero, silver hair, amethyst eyes, pointed half-elf ears, white flower hair ornament with purple ribbon, modest white and lavender high-neck fantasy dress. Soft snowy forest.

**hazel_williams** (`presets/sakura-succubus-3/hazel_williams.png`):

> Hazel Williams, athletic adult woman with tanned skin, dark blonde high ponytail, vivid green eyes and two small ivory horns. Modest white tennis shirt and racket partially visible. Sunny tennis court.

**hifumi_yamamoto** (`presets/sakura-succubus-3/hifumi_yamamoto.png`):

> Hifumi Yamamoto, graceful adult woman, very long straight black hair, pale skin, calm dark eyes and two subtle small ivory horns. Deep red and gold traditional kimono fully closed with green obi. Tatami tea room and cherry blossoms.

**makise_kurisu** (`presets/cards/Makise Kurisu.png`):

> Makise Kurisu from Steins;Gate, adult scientist, long straight chestnut hair, violet blue eyes, white button-up shirt and loose red tie with khaki jacket resting at her shoulders. Soft laboratory background.

**rory_mercury** (`presets/cards/Rory Mercury.png`):

> Rory Mercury from GATE, youthful childlike appearance, very long straight black hair with red ribbons, red eyes, modest black and red priestly gothic dress fully covering chest and shoulders. Calm friendly expression. Atmospheric old temple. Strictly age appropriate, no sexualization, no cleavage, no suggestive pose.

**vivy** (`presets/cards/Vivy.png`):

> Vivy from Vivy Fluorite Eye's Song, long flowing cobalt blue hair, sapphire blue eyes, small earpiece, subtle mechanical markings at neck, modest white and blue high-neck idol stage dress fully covering chest and shoulders. Soft cool futuristic stage.

**yue** (`presets/sakura-succubus-3/yue.png`):

> Yue, regal adult queen, long silver white hair, ruby red eyes, ornate dark curved horns, elaborate black royal gown with gold details and lace, high neckline, ruby necklace. Moonlit throne hall.

## Prüfung

Alle 114 WebP-Dateien wurden dekodiert und auf Abmessungen, sRGB-Profil, unterschiedliche Bilddaten
und existierende relative Bildpfade geprüft. Die Metadaten der 19 Karten wurden mit den Sicherungen
verglichen: Beschreibungen, Dialoge und bestehende Erweiterungen sind erhalten. PNG- und JSON-Karten
besitzen identische Charakterdaten. Die vollständigen Bildsätze wurden in sieben Übersichten angesehen.
Die lokalen Tests der Portrait-Auswahl im Arbeitsverzeichnis bestanden (14 Tests).
