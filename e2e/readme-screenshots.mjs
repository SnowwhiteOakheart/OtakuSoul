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

// UI texts straight from the locale file, so selectors follow the chosen language.
const locale = readFileSync(path.join(root, 'src', 'i18n', 'locales', `${lang}.ts`), 'utf8');
const t = (key) => {
  const match = locale.match(new RegExp(`"${key.replace(/\./g, '\\.')}":\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  if (!match) throw new Error(`Kein Text für ${key}`);
  return JSON.parse(`"${match[1]}"`);
};

const TEXT = {
  de: {
    reply: 'Deutsch',
    persona: 'Kai',
    chatMessage: 'Hey Ayu! Hast du Lust, morgen mit mir zum Hanami in den Ueno-Park zu gehen?',
    chatReply:
      '*Ayus Augen leuchten auf, und sie klatscht begeistert in die Hände.* „Hanami? Mit dir? Natürlich! Ich packe Onigiri ein ' +
      'und die Thermoskanne mit Matcha – und du bringst die Picknickdecke mit, ja?“ *Sie lächelt verlegen.* ' +
      '„Ich hab sogar einen Lieblingsplatz unter der alten Kirsche am Teich. Da ist es abends wunderschön, wenn die Laternen angehen.“',
    narration:
      'Ayu holt tief Luft und klammert sich an deine Worte, als wären sie ein Rettungsring. „So wie immer … ja.“ ' +
      'Cosmos kramt derweil in ihrem Rucksack und zieht triumphierend eine Sicherheitsnadel hervor. ' +
      'Draußen zählt der Moderator schon die Minuten herunter, und die Kirschblüten wehen bis hinter den Vorhang.',
    crypt: { title: 'Die Halle der Gruft', location: 'Unter dem alten Kloster', time: 'Mitternacht', tone: 'Düstere Fantasy', action: 'Ich betrete die Gruft.' },
    stageReply:
      '*Ayu atmet tief durch und nickt dir dankbar zu.* „Okay … okay. Wenn du da bist, schaffe ich das. Hilfst du mir mit dem Ärmel?“',
  },
  en: {
    reply: 'English',
    persona: 'Kai',
    chatMessage: 'Hey Ayu! Do you want to go to the hanami in Ueno Park with me tomorrow?',
    chatReply:
      '*Ayu\'s eyes light up and she claps her hands excitedly.* "Hanami? With you? Of course! I\'ll pack onigiri and the ' +
      'thermos with matcha – and you bring the picnic blanket, okay?" *She smiles shyly.* "I even have a favourite spot ' +
      'under the old cherry tree by the pond. It\'s beautiful in the evening when the lanterns come on."',
    narration:
      'Ayu takes a deep breath and clings to your words like a lifebuoy. "Like always … yes." ' +
      'Meanwhile Cosmos rummages through her backpack and triumphantly pulls out a safety pin. ' +
      'Outside, the host is already counting down the minutes, and cherry blossoms drift all the way behind the curtain.',
    crypt: { title: 'The Crypt Hall', location: 'Beneath the old monastery', time: 'Midnight', tone: 'Dark fantasy', action: 'I enter the crypt.' },
    stageReply:
      '*Ayu takes a deep breath and gives you a grateful nod.* "Okay … okay. If you\'re here, I can do this. Will you help me with the sleeve?"',
  },
  ru: {
    reply: 'Русский',
    persona: 'Кай',
    chatMessage: 'Привет, Аю! Пойдёшь со мной завтра на ханами в парк Уэно?',
    chatReply:
      '*Глаза Аю загораются, и она восторженно хлопает в ладоши.* «Ханами? С тобой? Конечно! Я возьму онигири и термос с матчей, ' +
      'а ты принесёшь плед для пикника, ладно?» *Она смущённо улыбается.* «У меня даже есть любимое место под старой вишней у пруда. ' +
      'Вечером там чудесно, когда зажигаются фонарики».',
    narration:
      'Аю глубоко вдыхает и цепляется за твои слова, как за спасательный круг. «Как всегда… да». ' +
      'Тем временем Космос роется в рюкзаке и торжествующе вытаскивает английскую булавку. ' +
      'Снаружи ведущий уже отсчитывает минуты, а лепестки сакуры залетают прямо за занавес.',
    crypt: { title: 'Зал склепа', location: 'Под старым монастырём', time: 'Полночь', tone: 'Мрачное фэнтези', action: 'Я вхожу в склеп.' },
    stageReply: '*Аю глубоко вдыхает и благодарно кивает тебе.* «Ладно… ладно. Если ты рядом, я справлюсь. Поможешь мне с рукавом?»',
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
await session({ start_tab: 'home', stage_last_scene: '', active_character_id: 'ayu_ikue' }, async ({ browser, mock, shot, click, tab, invoke }) => {
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
await session({ onboarding_completed: false, active_character_id: 'ayu_ikue' }, async ({ browser, shot, click }) => {
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
        rules: { ruleset: '5e', hero_classes: { player: 'fighter', 'Ayu Ikue': 'wizard' }, control_companions: false, map_id: 'crypt_hall' },
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
