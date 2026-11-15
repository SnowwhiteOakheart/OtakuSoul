// Screenshots for the READMEs (not part of `npm run e2e`): start page, stories, chat, characters,
// help, settings, setup, a 5e fight and the Song/Image Studio, each in a fresh profile against the mock LLM.
// Usage: `xvfb-run -a node e2e/readme-screenshots.mjs [de|en]` → docs/assets/screenshots/<lang>/.
import { copyFileSync, mkdirSync, readFileSync, truncateSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lang = process.argv[2] ?? 'en';
const outDir = path.join(root, 'docs', 'assets', 'screenshots', lang);
mkdirSync(outDir, { recursive: true });

// UI texts straight from the bundled locale file, so selectors follow the chosen language.
const locale = JSON.parse(readFileSync(path.join(root, 'presets', 'locales', 'ui', `${lang}.json`), 'utf8'));
const t = (key) => {
  if (typeof locale[key] !== 'string') throw new Error(`Kein Text für ${key}`);
  return locale[key];
};

const TEXT = {
  de: {
    reply: 'Deutsch',
    persona: 'Kai',
    chatMessage: 'Hey Shiori! Hast du einen Buchtipp für die Frühlingsferien?',
    chatReply:
      '*Shiori schiebt die Brille hoch, und ihre Augen leuchten auf.* „Einen? Ich habe eine Liste. Nein, warte – drei Listen.“ ' +
      '*Sie zieht ein abgegriffenes Taschenbuch aus der Strickjacke.* „Fang mit diesem hier an. Ein Leuchtturmwärter, ein Sturm ' +
      'und ein Brief, der vierzig Jahre zu spät ankommt … Entschuldige, ich bin abgeschweift. Du gibst es mir aber zurück, ja?“',
    narration:
      'Shiori holt tief Luft und klammert sich an deine Worte, als wären sie ein Rettungsring. „Einfach lesen … ja.“ ' +
      'Sota hat derweil den Stapel Hefte auf zwei Tische verteilt und sortiert mit Speedrun-Tempo die Seiten. ' +
      'Draußen füllen sich die letzten Stuhlreihen, und die Kirschblüten wehen bis hinter die Bühne.',
    crypt: { title: 'Die Halle der Gruft', location: 'Unter dem alten Kloster', time: 'Mitternacht', tone: 'Düstere Fantasy', action: 'Ich betrete die Gruft.',
      narration: 'Fackellicht flackert über die Grabnischen. Aus der Dunkelheit kratzen Krallen – zwei Goblins und ein Skelett stellen sich euch in den Weg!' },
    stageReply:
      '*Shiori atmet tief durch und nickt dir dankbar zu.* „Okay … okay. Wie eine Heldin im letzten Kapitel. Hältst du mir das Heft?“',
    studio: {
      // [title, style, lyrics, bpm, seconds]
      songs: [
        ['Kirschblüten über der Bühne', 'J-Pop, verträumt, Klavier, warme Frauenstimme', '[Verse]\nRosa Blätter auf der Bühne\nUnd mein Herz schlägt viel zu laut\n\n[Chorus]\nLies einfach weiter, Shiori\nJeder Satz ein kleiner Mut', 92, 150],
        ['Neon über Kepler-9', 'Synthwave, treibend, analoge Synthesizer', '', 118, 180],
        ['Lagerfeuer in Frostweiler', 'Folk, Laute und Flöte, ruhig', '[Verse]\nSchnee auf den Dächern\nGlut in der Hand', 76, 120],
      ],
      // [source, title, description]
      images: [
        ['presets/characters/shiori_amane.png', 'Shiori in der Bibliothek', 'anime girl with glasses in a sunny school library, warm light'],
        ['presets/characters/lirwen.png', 'Lirwen im Elfenwald', 'elven mage in an ancient forest, soft green light'],
        ['presets/characters/sota_minase.png', 'Sota am Schulfest', 'cheerful anime boy at a school festival, cherry blossoms'],
        ['presets/characters/faelion.png', 'Faelion', 'elven ranger portrait, silver hair, autumn forest'],
        ['presets/crypt-of-shadows/althea.png', 'Althea', 'paladin with a glowing shield, fantasy portrait'],
        ['presets/crypt-of-shadows/lyra.png', 'Lyra', 'rogue with a hooded cloak, candlelight'],
      ],
      newImage: ['Abend am Leuchtturm', 'anime girl reading a letter by a lighthouse at sunset, wind, soft colors, detailed'],
    },
  },
  en: {
    reply: 'English',
    persona: 'Kai',
    chatMessage: 'Hey Shiori! Do you have a book tip for the spring break?',
    chatReply:
      '*Shiori pushes up her glasses and her eyes light up.* "One? I have a list. No, wait – three lists." ' +
      '*She pulls a well-worn paperback out of her cardigan.* "Start with this one. A lighthouse keeper, a storm ' +
      'and a letter that arrives forty years too late … Sorry, I got carried away. You will give it back, right?"',
    narration:
      'Shiori takes a deep breath and clings to your words like a lifebuoy. "Just read it … yes." ' +
      'Meanwhile Sota has spread the pile of booklets over two tables and is sorting the pages at speedrun pace. ' +
      'Outside, the last rows of chairs are filling up, and cherry blossoms drift all the way behind the stage.',
    crypt: { title: 'The Crypt Hall', location: 'Beneath the old monastery', time: 'Midnight', tone: 'Dark fantasy', action: 'I enter the crypt.',
      narration: 'Torchlight flickers over the burial niches. Claws scrape in the dark – two goblins and a skeleton block your way!' },
    stageReply:
      '*Shiori takes a deep breath and gives you a grateful nod.* "Okay … okay. Like a heroine in the final chapter. Will you hold the booklet for me?"',
    studio: {
      songs: [
        ['Cherry Blossoms on Stage', 'J-pop, dreamy, piano, warm female vocals', '[Verse]\nPink petals on the stage\nAnd my heart beats far too loud\n\n[Chorus]\nJust keep reading, Shiori\nEvery line a little brave', 92, 150],
        ['Neon over Kepler-9', 'synthwave, driving, analog synths', '', 118, 180],
        ['Campfire in Frostweiler', 'folk, lute and flute, calm', '[Verse]\nSnow on the rooftops\nEmbers in my hand', 76, 120],
      ],
      images: [
        ['presets/characters/shiori_amane.png', 'Shiori in the library', 'anime girl with glasses in a sunny school library, warm light'],
        ['presets/characters/lirwen.png', 'Lirwen in the elven wood', 'elven mage in an ancient forest, soft green light'],
        ['presets/characters/sota_minase.png', 'Sota at the school festival', 'cheerful anime boy at a school festival, cherry blossoms'],
        ['presets/characters/faelion.png', 'Faelion', 'elven ranger portrait, silver hair, autumn forest'],
        ['presets/crypt-of-shadows/althea.png', 'Althea', 'paladin with a glowing shield, fantasy portrait'],
        ['presets/crypt-of-shadows/lyra.png', 'Lyra', 'rogue with a hooded cloak, candlelight'],
      ],
      newImage: ['Evening at the lighthouse', 'anime girl reading a letter by a lighthouse at sunset, wind, soft colors, detailed'],
    },
  },
}[lang];
if (!TEXT) throw new Error(`Nur de oder en, nicht ${lang}`);

// A neutral model name instead of "mock" in the title bar; the mock answers whatever is asked for.
const base = { app_language: lang, reply_language: TEXT.reply, cloud_model: 'mistral-small' };

/** One fresh app per scene group; `run` gets helpers for screenshots, clicks and tabs. */
async function session(settings, run) {
  const app = await launch({ ...base, ...settings });
  const { browser } = app;
  await browser.setWindowSize(1400, 900);
  const helpers = {
    ...app,
    shot: async (name) => {
      await browser.pause(600);
      await browser.saveScreenshot(path.join(outDir, `${name}.png`));
      console.log(`  ${lang}/${name}.png`);
    },
    click: (element) => browser.execute((el) => el.click(), element),
    // Ctrl+1 … 9 in the order of the sidebar (home, chat, stage, companion, characters, lorebooks, hub, integrations, settings).
    tab: (n) => browser.execute((key) => window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true })), String(n)),
    // oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
    invoke: (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args),
  };
  try {
    await run(helpers);
  } finally {
    await app.close();
  }
}

// 1. Stories, start page and chat in one profile, as a newcomer would meet them.
await session({ start_tab: 'home', stage_last_scene: '', active_character_id: 'shiori_amane' }, async ({ browser, mock, shot, click, tab, invoke }) => {
  Object.assign(mock.stats, { calmPlanner: true, stageNarration: TEXT.narration, stageReply: TEXT.stageReply, chatReply: TEXT.chatReply });
  await browser.$('[data-home]').waitForDisplayed({ timeout: 30_000 });
  // A named player instead of "User" (the persona is read at start).
  await invoke('save_persona', { persona: { id: 'default_user', name: TEXT.persona, description: '', avatar_data_url: null } });
  await browser.refresh();
  await browser.pause(1000);
  await browser.$('[data-home]').waitForDisplayed({ timeout: 30_000 });

  await tab(3);
  await browser.$('[data-story-gallery]').waitForDisplayed({ timeout: 15_000 });
  await shot('story-gallery');

  await click(await browser.$('[data-gallery-collection="starter_stories"]'));
  await browser.$('[data-story="story_hanami_live"]').waitForDisplayed({ timeout: 10_000 });
  await click(await browser.$('[data-story="story_hanami_live"] > div button'));
  const preview = await browser.$('[data-story-preview]');
  await preview.waitForDisplayed({ timeout: 10_000 });
  await shot('story-preview');
  await click(await preview.$('button.bg-accent-600'));

  const input = await browser.$('form textarea');
  await input.waitForDisplayed({ timeout: 15_000 });
  const before = mock.stats.stageNarrator;
  const suggestion = JSON.parse(readFileSync(path.join(root, 'presets/stories/scenes/story_hanami_live.json'), 'utf8'))
    .extensions.otakusoul_story.choices[lang][1].text;
  await click(await browser.$(`button*=${suggestion.slice(0, 12)}`));
  await browser.waitUntil(() => mock.stats.stageNarrator > before, { timeout: 30_000 });
  await browser.$(`button=${t('stage.stopTurn')}`).waitForExist({ reverse: true, timeout: 60_000 });
  await click(await browser.$(`button*=${t('stageGuide.understood')}`));
  await shot('story-play');

  await click(await browser.$(`button=${t('stage.stories')}`));
  await browser.$('[data-story-gallery]').waitForDisplayed({ timeout: 10_000 });
  await click(await browser.$(`button=${t('gallery.create')}`));
  await browser.$('[data-story-wizard]').waitForDisplayed({ timeout: 10_000 });
  await shot('story-wizard');
  await browser.keys('Escape');

  await tab(1);
  await browser.$('[data-home-card="stage"]').waitForDisplayed({ timeout: 10_000 });
  await shot('home');

  await click(await browser.$('[data-home-card="chat"]'));
  const message = await browser.$(`textarea[aria-label="${t('chat.inputLabel')}"]`);
  await message.waitForDisplayed({ timeout: 15_000 });
  await message.setValue(TEXT.chatMessage);
  const send = await browser.$(`button[aria-label="${t('chat.send')}"]`);
  await send.waitForEnabled({ timeout: 20_000 });
  await click(send);
  await browser.waitUntil(() => browser.execute((reply) => document.body.innerText.includes(reply), TEXT.chatReply.slice(-30)), { timeout: 30_000 });
  await shot('chat');

  await tab(5);
  await browser.pause(800);
  await shot('character-library');
  // The preview button of the first card (each card has several buttons).
  const previewLabel = t('characterPreview.open').split('{{')[0];
  await click((await browser.$$(`[data-index="0"] button[aria-label^="${previewLabel}"]`))[0]);
  await browser.$('[data-character-preview]').waitForDisplayed({ timeout: 10_000 });
  await shot('character-preview');
  await browser.keys('Escape');

  await click(await browser.$(`button[aria-label="${t('help.open')}"]`));
  await browser.$('[data-help]').waitForDisplayed({ timeout: 10_000 });
  await click(await browser.$(`button[role="tab"]=${t('help.tabGlossary')}`));
  await shot('help-glossary');
  await browser.keys('Escape');

  await tab(9);
  await browser.pause(800);
  await shot('settings');
});

// 2. First start: the local way (automatic setup, models installed for development) and
// the cloud providers.
await session({ onboarding_completed: false, active_character_id: 'shiori_amane' }, async ({ browser, shot, click }) => {
  const dialog = await browser.$('[role="dialog"]');
  await dialog.waitForDisplayed({ timeout: 30_000 });
  await click(await dialog.$(`button=${t('onboarding.next')}`));
  await click(await dialog.$(`button*=${t('onboarding.localTitle')}`));
  await browser.$(`button*=${t('onboarding.expressButton')}`).waitForExist({ timeout: 20_000 }).catch(() => {});
  await shot('setup-local');
  await click(await dialog.$(`button*=${t('onboarding.cloudTitle')}`));
  await browser.$('#onboarding-api-key').waitForDisplayed({ timeout: 10_000 });
  await shot('setup-ai');
});

// 3. A 5e fight on the battle map of the crypt.
await session({}, async ({ browser, mock, shot, invoke }) => {
  await browser.$('nav').waitForExist({ timeout: 20_000 });
  await invoke('save_persona', { persona: { id: 'default_user', name: TEXT.persona, description: '', avatar_data_url: null } });
  await browser.refresh();
  await browser.pause(1000);
  await browser.$('nav').waitForExist({ timeout: 20_000 });
  const scene = await invoke('get_stage_state');
  await invoke('save_stage_scene', {
    sceneState: {
      ...scene,
      definition: {
        ...scene.definition,
        title: TEXT.crypt.title,
        starting_location: TEXT.crypt.location,
        time_of_day: TEXT.crypt.time,
        gm_tone: TEXT.crypt.tone,
        rules: { ruleset: '5e', hero_classes: { player: 'fighter', 'Lirwen': 'wizard' }, control_companions: false, map_id: 'crypt_hall' },
      },
      world: { ...scene.world, location: TEXT.crypt.location, time_of_day: TEXT.crypt.time },
      combat: { ...scene.combat, is_active: false, combatants: [], events: [] },
    },
  });
  Object.assign(mock.stats, { calmPlanner: true, stageNarration: TEXT.crypt.narration, stageEncounter: { action: 'start', enemies: [{ monster: 'goblin', count: 2 }, { monster: 'skeleton', count: 1 }] } });
  await browser.execute(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', ctrlKey: true })));
  const input = await browser.$('form textarea');
  await input.waitForDisplayed({ timeout: 15_000 });
  await input.setValue(TEXT.crypt.action);
  await browser.keys('Enter');
  await browser.$('[data-testid="combat-5e"]').waitForExist({ timeout: 60_000 });
  await browser.waitUntil(() => browser.execute(() => !document.querySelector('[data-testid="combat-5e"][data-busy="true"]')), { timeout: 60_000 });
  await browser.$(`button=${t('stage.stopTurn')}`).waitForExist({ reverse: true, timeout: 60_000 }).catch(() => {});
  await shot('stage-5e-board');
});

// 4. Song Studio and Image Studio with a few finished works in their folders.
await session({}, async ({ browser, home, shot, click, invoke }) => {
  await browser.$('nav').waitForExist({ timeout: 20_000 });
  const S = TEXT.studio;
  // Like an installed setup: the sd.cpp runtime and one image model (a sparse file of the catalog
  // size is enough to count as installed; nothing is started here).
  const runtime = path.join(home, 'data', 'runtimes', 'sd.cpp');
  const server = path.join(runtime, 'master-vulkan', process.platform === 'win32' ? 'sd-server.exe' : 'sd-server');
  mkdirSync(path.dirname(server), { recursive: true });
  writeFileSync(server, '');
  writeFileSync(path.join(runtime, 'current.json'), JSON.stringify({ build: 'master-1104-5dcfa79', backend: 'vulkan', server_path: server, library_dirs: [] }));
  const models = path.join(home, 'data', 'image-models');
  mkdirSync(models, { recursive: true });
  const model = path.join(models, 'animagine-xl-4.0-opt.safetensors');
  writeFileSync(model, '');
  truncateSync(model, 6_938_350_040);
  await invoke('save_persona', { persona: { id: 'default_user', name: TEXT.persona, description: '', avatar_data_url: null } });
  await browser.refresh();
  await browser.pause(1000);
  await browser.$('nav').waitForExist({ timeout: 20_000 });
  // Toasts (e.g. "settings loaded") would sit over the pictures.
  const closeToasts = () => browser.execute((label) => {
    for (const button of document.querySelectorAll(`[role="status"] button[aria-label="${label}"]`)) button.click();
  }, t('common.close'));

  // Songs: the files only need to exist; title, request and lyrics come from the origin JSON.
  const songs = path.join(home, 'songs');
  mkdirSync(songs, { recursive: true });
  await invoke('set_studio_folder', { kind: 'songs', path: songs });
  S.songs.forEach(([title, caption, lyrics, bpm, duration], index) => {
    const file = path.join(songs, `${title}.mp3`);
    writeFileSync(file, Buffer.from('ID3'));
    writeFileSync(`${file}.json`, JSON.stringify({
      title, lyrics, seed: 1000 + index,
      request: { title, caption, lyrics, vocal_language: lang, duration, bpm, versions: 1, model_id: 'standard' },
    }));
    const age = Date.now() / 1000 - index * 600;
    utimesSync(file, age, age);
  });
  await click(await browser.$(`button=${t('nav.music')}`));
  const list = await browser.$('[data-testid="song-list"]');
  await list.waitForDisplayed({ timeout: 15_000 });
  await browser.waitUntil(() => browser.execute((el, title) => el.textContent.includes(title), list, S.songs[0][0]), { timeout: 10_000 });
  await click((await list.$$(`button[aria-label="${t('songStudio.reuse')}"]`))[0]);
  await browser.waitUntil(async () => (await browser.$('#song-title').getValue()) === S.songs[0][0], { timeout: 5000 });
  await closeToasts();
  await shot('song-studio');

  // Images: the starter portraits with a request each.
  const images = path.join(home, 'images');
  mkdirSync(images, { recursive: true });
  await invoke('set_studio_folder', { kind: 'images', path: images });
  S.images.forEach(([source, title, prompt], index) => {
    const file = path.join(images, `${title}.png`);
    copyFileSync(path.join(root, source), file);
    writeFileSync(`${file}.json`, JSON.stringify({
      title, seed: 4200 + index, width: 832, height: 1216, license: 'CreativeML Open RAIL++-M',
      request: { title, prompt, negative: '', model_id: 'animagine-xl-4', aspect: '2:3', count: 1 },
    }));
    const age = Date.now() / 1000 - index * 600;
    utimesSync(file, age, age);
  });
  await click(await browser.$(`button=${t('nav.images')}`));
  const gallery = await browser.$('[data-testid="image-gallery"]');
  await gallery.waitForDisplayed({ timeout: 15_000 });
  await browser.$('#image-title').setValue(S.newImage[0]);
  await browser.$('#image-prompt').setValue(S.newImage[1]);
  // Thumbnails load once in view (blob URLs: the folder is outside the asset scope).
  await browser.waitUntil(
    () => browser.execute((el) => [...el.querySelectorAll('img')].filter((img) => img.complete && img.naturalWidth > 0).length >= 6, gallery),
    { timeout: 20_000, timeoutMsg: 'Vorschaubilder laden nicht' },
  );
  await closeToasts();
  // Typing scrolled the form down: back to the top, so model and gallery are in view.
  await browser.execute(() => {
    document.activeElement?.blur();
    for (const el of document.querySelectorAll('[data-testid="image-studio"], [data-testid="image-studio"] *')) {
      if (el.scrollTop > 0) el.scrollTop = 0;
    }
  });
  await shot('image-studio');
});

console.log(`README-Screenshots (${lang}) nach ${path.relative(root, outDir)} geschrieben.`);
