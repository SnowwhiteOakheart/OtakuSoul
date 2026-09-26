# No Game No Life - characters, scenes and lorebooks (German)

A ready-made Soul Stage campaign set in the world of *No Game No Life*: seven character cards (six canon
characters and one user persona), twelve Soul Stage scenes - one per episode of Season 1 - and three
lorebooks covering Disboard's rules, races/locations and cast. The texts are **German**, matching this
fork's German UI, and were built from a detailed episode-by-episode research pass (Fandom wiki, MyAnimeList,
the official Yen Press light novel text for the Ten Pledges) rather than from memory alone.

**Also published to `sow-data`.** Unlike `presets/sakura-succubus-3/`, this set uses real, copyrighted anime
characters (Sora, Shiro, Jibril, ...) rather than original characters. It started local-only for that reason;
after an explicit go-ahead it was published to `SnowwhiteOakheart/sow-data` as well, so it's also reachable
through the app's Soul/Lorebook/Stage Gateway tabs, not just via the manual import below. Scene backgrounds
stay local-only either way - `sow-data` has no backgrounds registry.

| File | Who |
|---|---|
| `sora.json` | Sora - the manipulative strategist half of 『 』(Blank) |
| `shiro.json` | Shiro - the calculating, near-silent other half of Blank |
| `jibril.json` | Jibril - the ancient Flügel, defeated in Chapter 6, now a devoted servant |
| `stephanie_dola.json` | Stephanie Dola - Elkia's earnest, secretly sharp prime minister |
| `izuna_hatsuse.json` | Izuna Hatsuse - the 8-year-old Werebeast gaming prodigy, opponent turned ally |
| `chlammy_zell.json` | Chlammy Zell - early rival, later reluctant ally (= "Kurami Zell" in older fan translations) |
| `fiel_nirvalen.json` | Fiel Nirvalen - Chlammy's protector, a hex-caster elf hiding as a "failed mage" |
| `persona_haru.json` | Haru Shindou as a **user persona** - the third member of Blank, pulled into Disboard alongside Sora and Shiro |

Each card carries description, personality, scenario, one greeting plus alternate greetings and example
dialogues. `{{user}}` and `{{char}}` are filled in by the app, so the cards are not hard-wired to the name
"Haru" - rename the persona freely.

## How the player fits into canon

Sora and Shiro's core sibling bond (and Shiro's genuine separation panic) is left untouched. The player
(default name **Haru Shindou**) is written in as a long-time online-gaming friend who happened to be
physically present when Tet's summons triggered, so all three get pulled into Disboard together. Haru
contributes real-world knowledge and social empathy - a third axis next to Sora's psychological reads and
Shiro's raw calculation - without taking over Sora's role as the team's mastermind.

## Scenes (one per Season 1 episode)

`scenes/` holds twelve **Soul Stage** scenes, named `episode<N>_<title>.json`, following Season 1 beat for
beat:

| # | Scene | Episode title | Tone | Party |
|---|---|---|---|---|
| 1 | Anfänger | Beginner | Comedy | Sora, Shiro, Stephanie |
| 2 | Herausforderer | Challenger | Comedy | Sora, Shiro, Stephanie |
| 3 | Experte | Expert | Epic Fantasy | Sora, Shiro, Stephanie |
| 4 | Großmeister | Grandmaster | Epic Fantasy | Sora, Shiro, Stephanie |
| 5 | Schwaches Feld | Weak Square | Comedy | Sora, Shiro, Stephanie |
| **6** | **Interessant** | **Interesting - the Jibril duel** | **Epic Fantasy** | **Sora, Shiro, Jibril** |
| 7 | Opfer | Sacrifice | Mystery & Noir | Sora, Shiro, Jibril, Stephanie |
| 8 | Falsches Ende | Fake End | Mystery & Noir | Sora, Shiro, Jibril, Stephanie |
| 9 | Himmelswandel | Sky Walk | Horror | Sora, Shiro, Jibril, Stephanie |
| 10 | Blaue Rose | Blue Rose | Slice of Life | + Chlammy, Fiel |
| 11 | Riesentöten | Killing Giant | Sci-Fi | + Chlammy, Fiel (Izuna as opponent) |
| 12 | Regel Nummer Zehn | Rule Number 10 | Epic Fantasy | + Chlammy, Fiel (Izuna joins by the end) |

**Chapter 6 is the requested centerpiece**: Sora, Shiro and Haru jointly challenge Jibril to
"Materialization Shiritori" (a word-chain game where every valid word physically materializes) for her
entire library and her service. The scene's `narrator_style` field explicitly instructs the GM on the
canonical trick - Sora baits her with an unfamiliar Earth term, then springs "Coulomb's Force" once she
takes the bait - and to resolve it with Jibril's genuine, respectful surrender and her pledge of service.

Every scene brings its own world context, starting location, opening narration, GM tone and narrator style,
and pulls in all three lorebooks below. `party` grows chapter by chapter exactly as new characters join the
cast in canon (Jibril from Ch. 6, Chlammy and Fiel from Ch. 10, Izuna at the very end of Ch. 12) - nobody is
listed as an ally before they actually become one in the story.

## Lorebooks

`lorebooks/` holds three lorebooks - German content, English registry-style summaries below:

| Lorebook | Entries | Contents |
|---|---|---|
| No Game No Life – Welt & Gebote | 8 | The Ten Pledges (verified against the official light novel text), Tet's origin/the Suniaster, the "agent plenipotentiary" and cheating rules, Blank's reputation |
| No Game No Life – Rassen & Orte | 9 | The sixteen races overview, Imanity/Flügel/Elf/Werebeast in detail, Elkia, Avant Heim, Elven Gard, the Eastern Union |
| No Game No Life – Figuren | 10 | Quick-reference entries for the whole cast plus lore-only figures: Tet, Riku Dola, Azril, the Eastern Union's Shrine Maiden |

The world/premise entry is `always_on`, everything else is keyword-triggered.

## Avatars

All 8 portraits are done - AI-generated original interpretations of each character's canonical design (see
"About the pictures" below), resized to 700px wide to keep the repo lean. **[AVATAR-PROMPTS.md](AVATAR-PROMPTS.md)**
has the generation prompt and save path used for each, if you want to regenerate one.

## Backgrounds

All 12 are done - one per chapter, matching each scene's `starting_bg` field (e.g.
`Horizontal Elkia Throne Room.png` for Chapter 1), resized to 1376x768 (same convention as
`presets/sakura-succubus-3/backgrounds/`) to keep the repo lean. `tools/import_character_cards.py` deploys
them to `assets/backgrounds/` automatically. **[BACKGROUND-PROMPTS.md](BACKGROUND-PROMPTS.md)** has the
generation prompt and save path used for each, if you want to regenerate one.

## Importing

Everything at once - characters, persona, lorebooks and scenes:

```bash
app/data/envs/sow-linux/bin/python tools/import_character_cards.py presets/no-game-no-life \
    --persona presets/no-game-no-life/persona_haru.json \
    --lorebooks presets/no-game-no-life/lorebooks \
    --scenes presets/no-game-no-life/scenes \
    --scene-group "No Game No Life"
```

`--scene-group` puts all 12 chapters into one **Scene Folder** named "No Game No Life" in the Soul Stage
lobby - a single clickable campaign tile (with a 4-up preview of the chapter backgrounds) instead of 12 loose
scene cards; clicking it opens a view with just these 12 chapters. Safe to omit or re-run - it only adds
scenes to the folder, never creates duplicates.

Import the characters before the scenes: a scene names its party by character name, and the tool warns about
every name it cannot find. Characters that already exist are left alone; `--update-avatars` refreshes only
their picture (handy after you've swapped in the real art), `--replace` overwrites a whole character and
deletes its chats, `--dry-run` shows what would happen without changing anything. Everything can also be
imported by hand in the app: cards under **Create character -> Import character card**, lorebooks in the
lorebook editor, scenes in the Soul Stage lobby.

## About the pictures

The portraits and the 12 scene backgrounds are original AI-generated art in the setting's style, not copies
of official art or screenshots - see [AVATAR-PROMPTS.md](AVATAR-PROMPTS.md) and
[BACKGROUND-PROMPTS.md](BACKGROUND-PROMPTS.md) for the prompts used.

License of the cards and lorebook text: same as the rest of this repository (GPL-3.0). *No Game No Life* is a
trademark of its respective copyright holders (Yuu Kamiya / Media Factory / MADHOUSE); this is unofficial fan
content, not affiliated with them, and is not published outside this repository.
