// Animated tour for the top of the READMEs (not part of `npm run e2e`): start page, a chat reply
// streaming in, a story turn, a 3D avatar and a 5e fight, each scene with a short caption.
// Frames are screenshots with their real timestamps; ffmpeg turns them into a GIF.
// Usage: `node e2e/readme-demo.mjs [de|en|ru]` (Linux: `xvfb-run -a …`) → docs/assets/demo/<lang>.gif.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lang = process.argv[2] ?? 'en';
const outFile = path.join(root, 'docs', 'assets', 'demo', `${lang}.gif`);
mkdirSync(path.dirname(outFile), { recursive: true });
const frameDir = mkdtempSync(path.join(tmpdir(), 'otakusoul-demo-'));

const locale = JSON.parse(readFileSync(path.join(root, 'presets', 'locales', 'ui', `${lang}.json`), 'utf8'));
const t = (key) => {
  if (typeof locale[key] !== 'string') throw new Error(`Kein Text für ${key}`);
  return locale[key];
};

const TEXT = {
  de: {
    reply: 'Deutsch',
    persona: 'Kai',
    captions: {
      home: 'KI-Charaktere – privat auf deinem PC',
      chat: 'Chatte mit Charakteren, die sich an dich erinnern',
      story: 'Spiele Geschichten mit einer KI-Spielleitung',
      avatar: '3D-, Live2D- und Inochi2D-Avatare',
      dice: 'Würfeln wie am Tisch: 5e-Regeln mit Spielbrett',
    },
    chatMessage: 'Hey Shiori! Hast du einen Buchtipp für die Ferien?',
    chatReply:
      '*Shiori schiebt die Brille hoch, und ihre Augen leuchten auf.* „Einen? Ich habe eine Liste. Nein, warte – drei Listen.“ ' +
      '*Sie zieht ein abgegriffenes Taschenbuch aus der Strickjacke.* „Fang mit diesem hier an. Ein Leuchtturmwärter, ein Sturm ' +
      'und ein Brief, der vierzig Jahre zu spät ankommt …“',
    narration:
      'Shiori holt tief Luft und klammert sich an deine Worte, als wären sie ein Rettungsring. „Einfach lesen … ja.“ ' +
      'Sota verteilt derweil die Hefte auf zwei Tische, und draußen wehen die Kirschblüten bis hinter die Bühne.',
    stageReply: '*Shiori atmet tief durch und nickt dir dankbar zu.* „Okay … okay. Wie eine Heldin im letzten Kapitel.“',
    crypt: { title: 'Die Halle der Gruft', location: 'Unter dem alten Kloster', time: 'Mitternacht', tone: 'Düstere Fantasy', action: 'Ich betrete die Gruft.',
      narration: 'Fackellicht flackert über die Grabnischen. Aus der Dunkelheit kratzen Krallen – zwei Goblins und ein Skelett stellen sich euch in den Weg!' },
  },
  en: {
    reply: 'English',
    persona: 'Kai',
    captions: {
      home: 'AI characters – private on your own PC',
      chat: 'Chat with characters who remember you',
      story: 'Play stories with an AI game master',
      avatar: '3D, Live2D and Inochi2D avatars',
      dice: 'Roll dice like at the table: 5e rules on a battle map',
    },
    chatMessage: 'Hey Shiori! Do you have a book tip for the holidays?',
    chatReply:
      '*Shiori pushes up her glasses and her eyes light up.* "One? I have a list. No, wait – three lists." ' +
      '*She pulls a well-worn paperback out of her cardigan.* "Start with this one. A lighthouse keeper, a storm ' +
      'and a letter that arrives forty years too late …"',
    narration:
      'Shiori takes a deep breath and clings to your words like a lifebuoy. "Just read it … yes." ' +
      'Meanwhile Sota spreads the booklets over two tables, and outside cherry blossoms drift all the way behind the stage.',
    stageReply: '*Shiori takes a deep breath and gives you a grateful nod.* "Okay … okay. Like a heroine in the final chapter."',
    crypt: { title: 'The Crypt Hall', location: 'Beneath the old monastery', time: 'Midnight', tone: 'Dark fantasy', action: 'I enter the crypt.',
      narration: 'Torchlight flickers over the burial niches. Claws scrape in the dark – two goblins and a skeleton block your way!' },
  },
  ru: {
    reply: 'Русский',
    persona: 'Кай',
    captions: {
      home: 'ИИ-персонажи – приватно на твоём ПК',
      chat: 'Общайся с персонажами, которые тебя помнят',
      story: 'Играй в истории с ИИ-ведущим',
      avatar: '3D-, Live2D- и Inochi2D-аватары',
      dice: 'Кубики как за столом: правила 5e на игровом поле',
    },
    chatMessage: 'Привет, Сиори! Посоветуешь книгу на каникулы?',
    chatReply:
      '*Сиори поправляет очки, и глаза её загораются.* «Одну? У меня есть список. Нет, подожди – три списка». ' +
      '*Она достаёт из кармана кофты потрёпанную книжку.* «Начни с этой. Смотритель маяка, шторм ' +
      'и письмо, которое пришло на сорок лет позже…»',
    narration:
      'Сиори глубоко вдыхает и цепляется за твои слова, как за спасательный круг. «Просто прочитать… да». ' +
      'Тем временем Сота раскладывает брошюры на два стола, а лепестки сакуры залетают прямо за сцену.',
    stageReply: '*Сиори глубоко вдыхает и благодарно кивает тебе.* «Ладно… ладно. Как героиня в последней главе».',
    crypt: { title: 'Зал склепа', location: 'Под старым монастырём', time: 'Полночь', tone: 'Мрачное фэнтези', action: 'Я вхожу в склеп.',
      narration: 'Свет факела дрожит на погребальных нишах. Во тьме скребут когти – два гоблина и скелет преграждают вам путь!' },
  },
}[lang];

// A neutral model name instead of "mock" in the title bar; the mock answers whatever is asked for.
const base = { app_language: lang, reply_language: TEXT.reply, cloud_model: 'mistral-small' };

/** Frames in order: screenshot file, time taken and, for the last frame of a shot, how long to hold it. */
const frames = [];

async function session(settings, run) {
  const app = await launch({ ...base, ...settings });
  const { browser } = app;
  await browser.setWindowSize(1400, 900);
  const invoke = (command, args = {}) =>
    // oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
    browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
  const grab = async () => {
    const file = path.join(frameDir, `${String(frames.length).padStart(4, '0')}.png`);
    await browser.saveScreenshot(file);
    frames.push({ file, t: Date.now() });
  };
  /** Records frames while `action` runs (at least `minMs`), then holds the last one for `holdMs`. */
  const record = async (action, { minMs = 0, holdMs = 0 } = {}) => {
    const state = { done: false };
    const start = Date.now();
    const loop = (async () => {
      while (!state.done || Date.now() - start < minMs) await grab();
    })();
    await action();
    state.done = true;
    await loop;
    frames.at(-1).hold = holdMs;
  };
  const hold = async (ms) => {
    await browser.pause(400);
    await grab();
    frames.at(-1).hold = ms;
  };
  // A caption pill in the middle of the title bar; it is part of the screenshot.
  const caption = (text) =>
    browser.execute((label) => {
      let pill = document.getElementById('readme-demo-caption');
      if (!pill) {
        pill = document.createElement('div');
        pill.id = 'readme-demo-caption';
        Object.assign(pill.style, {
          position: 'fixed', left: '50%', top: '9px', transform: 'translateX(-50%)', zIndex: '2147483647',
          padding: '8px 22px', borderRadius: '999px', font: '600 19px/1.2 system-ui, sans-serif', color: '#fff',
          background: 'linear-gradient(90deg, rgba(124,58,237,.95), rgba(219,39,119,.95))',
          boxShadow: '0 10px 40px rgba(0,0,0,.55)', pointerEvents: 'none', whiteSpace: 'nowrap',
        });
        document.body.appendChild(pill);
      }
      pill.textContent = label;
    }, text);
  const click = (element) => browser.execute((el) => el.click(), element);
  const clickText = (text) =>
    browser.execute((label) => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
      button?.click();
      return !!button;
    }, text);
  const tab = (n) => browser.execute((key) => window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true })), String(n));
  const persona = async () => {
    await invoke('save_persona', { persona: { id: 'default_user', name: TEXT.persona, description: '', avatar_data_url: null } });
    await browser.refresh();
    await browser.pause(1000);
  };
  try {
    await run({ ...app, grab, record, hold, caption, click, clickText, tab, invoke, persona });
  } finally {
    await app.close();
  }
}

// 1. Start page, chat and a story turn.
await session({ start_tab: 'home', stage_last_scene: '', active_character_id: 'shiori_amane' }, async (s) => {
  const { browser, mock, record, hold, caption, click, clickText, tab, persona } = s;
  Object.assign(mock.stats, {
    calmPlanner: true, chatReply: TEXT.chatReply, chatChunkSize: 5, chatDelay: 45,
    stageNarration: TEXT.narration, stageReply: TEXT.stageReply, narratorDelay: 90,
  });
  await browser.$('[data-home]').waitForDisplayed({ timeout: 30_000 });
  await persona();
  await browser.$('[data-home-card="stage"]').waitForDisplayed({ timeout: 30_000 });
  await caption(TEXT.captions.home);
  await hold(1800);

  await click(await browser.$('[data-home-card="chat"]'));
  const message = await browser.$(`textarea[aria-label="${t('chat.inputLabel')}"]`);
  await message.waitForDisplayed({ timeout: 15_000 });
  await caption(TEXT.captions.chat);
  await browser.pause(800);
  await message.click();
  // Type a few letters at a time, one frame each.
  for (let i = 0; i < TEXT.chatMessage.length; i += 4) {
    await browser.keys(TEXT.chatMessage.slice(i, i + 4).split(''));
    await s.grab();
  }
  const send = await browser.$(`button[aria-label="${t('chat.send')}"]`);
  // It stays locked until the chat of the character is open, which can take a while on a cold start.
  await send.waitForEnabled({ timeout: 45_000 });
  await record(async () => {
    await click(send);
    await browser.waitUntil(() => browser.execute((end) => document.body.innerText.includes(end), TEXT.chatReply.slice(-20)), { timeout: 60_000 });
  }, { holdMs: 2600 });

  await tab(3);
  await browser.$('[data-story-gallery]').waitForDisplayed({ timeout: 15_000 });
  await caption(TEXT.captions.story);
  await hold(1200);
  await click(await browser.$('[data-gallery-collection="starter_stories"]'));
  await browser.$('[data-story="story_hanami_live"]').waitForDisplayed({ timeout: 10_000 });
  await click(await browser.$('[data-story="story_hanami_live"] > div button'));
  const preview = await browser.$('[data-story-preview]');
  await preview.waitForDisplayed({ timeout: 10_000 });
  await hold(1600);
  await click(await preview.$('button.bg-accent-600'));
  await browser.$('form textarea').waitForDisplayed({ timeout: 15_000 });
  const suggestion = JSON.parse(readFileSync(path.join(root, 'presets/stories/scenes/story_hanami_live.json'), 'utf8'))
    .extensions.otakusoul_story.choices[lang][1].text;
  await browser.pause(600);
  await clickText(t('stageGuide.understood'));
  const before = mock.stats.stageNarrator ?? 0;
  await record(async () => {
    await click(await browser.$(`button*=${suggestion.slice(0, 12)}`));
    await browser.waitUntil(() => (mock.stats.stageNarrator ?? 0) > before, { timeout: 30_000 });
    // The guide may pop up during the turn; close it so it doesn't cover the story.
    await browser.waitUntil(async () => {
      await clickText(t('stageGuide.understood'));
      return !(await browser.execute((stop) => [...document.querySelectorAll('button')].some((b) => b.textContent === stop), t('stage.stopTurn')));
    }, { timeout: 90_000, interval: 300 });
  }, { holdMs: 2600 });
});

// 2. The same chat with a bundled 3D avatar, which moves on its own.
await session({ avatar_mode: '3d', active_character_id: 'shiori_amane' }, async ({ browser, record, caption, persona }) => {
  await browser.$(`textarea[aria-label="${t('chat.inputLabel')}"]`).waitForDisplayed({ timeout: 30_000 });
  await persona();
  await browser.$(`textarea[aria-label="${t('chat.inputLabel')}"]`).waitForDisplayed({ timeout: 30_000 });
  await browser.$('canvas').waitForDisplayed({ timeout: 30_000 });
  await caption(TEXT.captions.avatar);
  await browser.pause(4000);
  await record(() => browser.pause(2500), { holdMs: 300 });
});

// 3. A 5e fight on the battle map of the crypt.
await session({}, async ({ browser, mock, record, caption, clickText, invoke, persona }) => {
  await browser.$('nav').waitForExist({ timeout: 20_000 });
  await persona();
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
        rules: { ruleset: '5e', hero_classes: { player: 'fighter', Lirwen: 'wizard' }, control_companions: false, map_id: 'crypt_hall' },
      },
      world: { ...scene.world, location: TEXT.crypt.location, time_of_day: TEXT.crypt.time },
      combat: { ...scene.combat, is_active: false, combatants: [], events: [] },
    },
  });
  Object.assign(mock.stats, { calmPlanner: true, stageNarration: TEXT.crypt.narration, stageEncounter: { action: 'start', enemies: [{ monster: 'goblin', count: 2 }, { monster: 'skeleton', count: 1 }] } });
  await browser.execute(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', ctrlKey: true })));
  const input = await browser.$('form textarea');
  await input.waitForDisplayed({ timeout: 15_000 });
  await caption(TEXT.captions.dice);
  await input.setValue(TEXT.crypt.action);
  await record(async () => {
    await browser.keys('Enter');
    await browser.$('[data-testid="combat-5e"]').waitForExist({ timeout: 60_000 });
    await browser.waitUntil(async () => {
      await clickText(t('stageGuide.understood'));
      return browser.execute(() => !document.querySelector('[data-testid="combat-5e"][data-busy="true"]'));
    }, { timeout: 60_000, interval: 300 });
    await browser.$(`button=${t('stage.stopTurn')}`).waitForExist({ reverse: true, timeout: 60_000 }).catch(() => {});
    await clickText(t('stageGuide.understood'));
  }, { holdMs: 3200 });
});

// Frame durations from the timestamps (capped, so slow app starts don't freeze the animation).
const list = frames.map((frame, i) => {
  const next = frames[i + 1];
  const gap = next && !frame.hold ? Math.min(next.t - frame.t, 450) : (frame.hold ?? 1000);
  return `file '${frame.file.replaceAll('\\', '/')}'\nduration ${(gap / 1000).toFixed(3)}`;
});
// The concat demuxer ignores the duration of the last entry unless the file is listed once more.
list.push(`file '${frames.at(-1).file.replaceAll('\\', '/')}'`);
const listFile = path.join(frameDir, 'frames.txt');
writeFileSync(listFile, list.join('\n'));
const filter =
  'fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];' +
  '[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle';
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-filter_complex', filter, '-loop', '0', outFile], { stdio: 'inherit' });
rmSync(frameDir, { recursive: true, force: true });
console.log(`README-Animation (${lang}): ${path.relative(root, outFile)} aus ${frames.length} Bildern.`);
