// Screenshots for the READMEs (not part of `npm run e2e`): start page, stories, chat, characters,
// help, settings, setup and a 5e fight, each in a fresh profile against the mock LLM.
// Usage: `xvfb-run -a node e2e/readme-screenshots.mjs [de|en|ru]` → docs/assets/screenshots/<lang>/.
import { mkdirSync, readFileSync } from 'node:fs';
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
    crypt: { title: 'Die Halle der Gruft', location: 'Unter dem alten Kloster', time: 'Mitternacht', tone: 'Düstere Fantasy', action: 'Ich betrete die Gruft.' },
    stageReply:
      '*Shiori atmet tief durch und nickt dir dankbar zu.* „Okay … okay. Wie eine Heldin im letzten Kapitel. Hältst du mir das Heft?“',
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
    crypt: { title: 'The Crypt Hall', location: 'Beneath the old monastery', time: 'Midnight', tone: 'Dark fantasy', action: 'I enter the crypt.' },
    stageReply:
      '*Shiori takes a deep breath and gives you a grateful nod.* "Okay … okay. Like a heroine in the final chapter. Will you hold the booklet for me?"',
  },
  ru: {
    reply: 'Русский',
    persona: 'Кай',
    chatMessage: 'Привет, Сиори! Посоветуешь книгу на весенние каникулы?',
    chatReply:
      '*Сиори поправляет очки, и глаза её загораются.* «Одну? У меня есть список. Нет, подожди – три списка». ' +
      '*Она достаёт из кармана кофты потрёпанную книжку в мягкой обложке.* «Начни с этой. Смотритель маяка, шторм ' +
      'и письмо, которое пришло на сорок лет позже… Прости, я отвлеклась. Ты ведь вернёшь её, да?»',
    narration:
      'Сиори глубоко вдыхает и цепляется за твои слова, как за спасательный круг. «Просто прочитать… да». ' +
      'Тем временем Сота разложил стопку брошюр на двух столах и сортирует страницы в темпе спидрана. ' +
      'Снаружи заполняются последние ряды стульев, а лепестки сакуры залетают прямо за сцену.',
    crypt: { title: 'Зал склепа', location: 'Под старым монастырём', time: 'Полночь', tone: 'Мрачное фэнтези', action: 'Я вхожу в склеп.' },
    stageReply: '*Сиори глубоко вдыхает и благодарно кивает тебе.* «Ладно… ладно. Как героиня в последней главе. Подержишь мне брошюру?»',
  },
}[lang];

const base = { app_language: lang, reply_language: TEXT.reply };

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
  await browser.execute(() => window.location.reload());
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
  await click(await browser.$('[data-index="0"] button'));
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
await session({}, async ({ browser, mock, shot, click, invoke }) => {
  await browser.$('nav').waitForExist({ timeout: 20_000 });
  await invoke('save_persona', { persona: { id: 'default_user', name: TEXT.persona, description: '', avatar_data_url: null } });
  await browser.execute(() => window.location.reload());
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
  Object.assign(mock.stats, { calmPlanner: true, stageEncounter: { action: 'start', enemies: [{ monster: 'goblin', count: 2 }, { monster: 'skeleton', count: 1 }] } });
  await browser.execute(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', ctrlKey: true })));
  const input = await browser.$('form textarea');
  await input.waitForDisplayed({ timeout: 15_000 });
  await input.setValue(TEXT.crypt.action);
  await browser.keys('Enter');
  await browser.$('[data-testid="combat-5e"]').waitForExist({ timeout: 60_000 });
  await browser.waitUntil(() => browser.execute(() => !document.querySelector('[data-testid="combat-5e"][data-busy="true"]')), { timeout: 60_000 });
  await browser.$(`button=${t('stage.stopTurn')}`).waitForExist({ reverse: true, timeout: 60_000 }).catch(() => {});
  await click(await browser.$(`button*=${t('stageGuide.understood')}`));
  await shot('stage-5e-board');
});

console.log(`README-Screenshots (${lang}) nach ${path.relative(root, outDir)} geschrieben.`);
