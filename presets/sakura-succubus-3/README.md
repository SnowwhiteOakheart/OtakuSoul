# Sakura Succubus 3 - characters, scenes and lorebooks (German)

A ready-made set for the visual novel *Sakura Succubus 3*: seven character cards (six characters and
one user persona), six Soul Stage scenes and three lorebooks. The texts are **German**, because they
were written for the German UI of this fork.

| File | Who |
|---|---|
| `ayu_ikue.json` | Ayu - the tsundere pop idol |
| `marina_wakatsuki.json` | Marina - the corporate CEO |
| `cosmos.json` | Cosmos - the playful cat girl |
| `hazel_williams.json` | Hazel - the tomboy tennis pro |
| `hifumi_yamamoto.json` | Hifumi - the actress, a Yamato Nadeshiko |
| `yue.json` | Yue - the dethroned succubus queen |
| `persona_hiroki.json` | Hiroki as a **user persona** - who *you* are in the chat |

Each card carries description, personality, scenario, one greeting plus two alternate greetings
(the app offers them as variants of the first message) and three example dialogues. `{{user}}` and
`{{char}}` are filled in by the app, so the cards are not hard-wired to the name "Hiroki".

Names and occupations follow the game's own script (Ayu **Ikue**, Marina **Wakatsuki**, Hifumi
**Yamamoto**, an actress; Hiroki is a photographer at the tabloid *Sakura Daily*).

The files are plain **chara_card_v2** JSON and work in SillyTavern, Chub and anything else that
reads that format. Every card points at its `<name>.png` next to it through
`extensions.sow_avatar` (relative to the card), and at its matching Live2D model through
`extensions.sow_live2d`.

## Scenes and lorebooks

`scenes/` holds six **Soul Stage** scenes, `lorebooks/` three lorebooks for the same universe - German
as well, and written from the game's own story rather than from a summary of it.

| Scene | Tone | Party |
|---|---|---|
| Redaktionsschluss | Slice of Life | Cosmos, Ayu |
| Der Wohltätigkeitsball | Mystery & Noir | Marina, Ayu |
| Wohnungskrieg | Comedy | all six |
| Audienz im Thronsaal | Epic Fantasy | Yue, Marina, Hazel |
| Ein Tee zu zweit | Romance | Hifumi |
| Matchball | Slice of Life | Hazel, Cosmos |

Every scene brings its own world context, starting location, opening narration and narrator style, uses
Hiroki as the persona and pulls in all three lorebooks:

| Lorebook | Entries | Contents |
|---|---|---|
| Sakura Succubus 3 – Welt | 10 | succubi, the realm and the portal, Hiroki's scent, the shared flat, the newspaper, secrecy, the rules of the harem |
| Sakura Succubus 3 – Figuren | 10 | all six women, Hiroki, and the side characters around them |
| Sakura Succubus 3 – Orte | 9 | flat, newsroom, cosplay cafe, board floor, stage, tennis court, tea room, throne hall, receptions |

The world entry is `always_on`, everything else is triggered by keywords, so the lorebooks cost almost
nothing until they are needed.

## Importing

Everything at once - characters, persona, lorebooks and scenes:

```bash
app/data/envs/sow-linux/bin/python tools/import_character_cards.py presets/sakura-succubus-3 \
    --persona presets/sakura-succubus-3/persona_hiroki.json \
    --lorebooks presets/sakura-succubus-3/lorebooks \
    --scenes presets/sakura-succubus-3/scenes
```

Import the characters before the scenes: a scene names its party by character name, and the tool warns
about every name it cannot find.
Fetch the matching Live2D models before or after importing:

```bash
app/data/envs/sow-linux/bin/python tools/fetch_live2d_models.py --all
```

Characters that already exist are left alone. `--update-avatars` refreshes only their picture,
`--update-live2d` links their Live2D models, `--update-scenes` updates scene metadata (like backgrounds)
while preserving existing chat logs, and all keep existing chats and settings;
`--replace` overwrites the whole character and deletes its chats.
`--dry-run` shows what would happen. Everything can also be imported in the app itself: cards under
**Create character -> Import character card**, lorebooks in the lorebook editor, scenes in the Soul Stage
lobby. Backgrounds from `backgrounds/` are deployed automatically to `assets/backgrounds/`.

## Backgrounds

`backgrounds/` holds nine 16:9 widescreen anime visual novel background scenes (empty scenery without characters,
so Live2D models and dialogue boxes render unobstructed):

- **6 Story Backgrounds:**
  - `Horizontal Tokyo Living Room.png` (Scene: *Wohnungskrieg*)
  - `Horizontal Newsroom Office.png` (Scene: *Redaktionsschluss*)
  - `Horizontal Gala Ballroom.png` (Scene: *Der Wohltätigkeitsball*)
  - `Horizontal Succubus Throne Room.png` (Scene: *Audienz im Thronsaal*)
  - `Horizontal Japanese Tea Room.png` (Scene: *Ein Tee zu zweit*)
  - `Horizontal Tennis Court.png` (Scene: *Matchball*)
- **3 Character Lore Backgrounds:**
  - `Horizontal Idol Stage.png` (Ayu Ikue - Concert Idol Stage)
  - `Horizontal Corporate Office.png` (Marina Wakatsuki - Penthouse Executive Office)
  - `Horizontal Cosplay Cafe.png` (Cosmos - Cosplay Maid Cat Café)

## About the pictures

The avatars are **AI generated** from the prompts in [AVATAR-PROMPTS.md](AVATAR-PROMPTS.md). They
show original characters described by archetype - a blonde idol with twintails, a CEO in a suit, a
cat girl in a maid uniform and so on - and use no artwork, sprite or reference image from the game.
The game's own art stays where it is, inside its archives.

License of the cards and pictures: same as the rest of this repository (GPL-3.0). *Sakura Succubus*
is a trademark of its publisher; this is unofficial fan content and not affiliated with them.
