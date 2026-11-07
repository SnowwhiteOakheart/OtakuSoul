// Takes localized chat screenshots and creates a short README GIF and a shareable MP4.
// Usage after e2e:build: node e2e/readme-memory-demo.mjs [en|de|ru]
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './harness.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const lang = process.argv[2] ?? 'en';
const scenes = {
  en: ['English', 'I have a piano recital tomorrow. I’m nervous about the first piece.',
    'You’ve practiced for this. Take one breath before the first note. I’ll be rooting for you!',
    'Kai has a piano recital tomorrow and is nervous about the first piece.',
    'Hi Shiori! I’m back.', 'Welcome back, Kai! How did your piano recital go?',
    'Today · Tell Shiori about your plans', 'Later · Start a new chat'],
  de: ['Deutsch', 'Morgen habe ich ein Klavierkonzert. Vor dem ersten Stück bin ich nervös.',
    'Du hast dafür geübt. Atme vor dem ersten Ton einmal tief durch. Ich drücke dir die Daumen!',
    'Kai hat morgen ein Klavierkonzert und ist vor dem ersten Stück nervös.',
    'Hey Shiori, ich bin wieder da!', 'Schön, dass du wieder da bist, Kai! Wie lief dein Klavierkonzert?',
    'Heute · Erzähl Shiori von deinen Plänen', 'Später · Starte einen neuen Chat'],
  ru: ['Русский', 'Завтра я выступаю на концерте. Волнуюсь перед первой пьесой на фортепиано.',
    'Ты столько репетировал. Глубоко вдохни перед первой нотой. Я буду за тебя болеть!',
    'Кай завтра играет на концерте и волнуется перед первой пьесой на фортепиано.',
    'Привет, Сиори! Я вернулся.', 'С возвращением, Кай! Как прошёл твой концерт?',
    'Сегодня · Расскажи Сиори о своих планах', 'Позже · Начни новый чат'],
};
assert.ok(Object.hasOwn(scenes, lang), 'Sprache muss en, de oder ru sein');
const [language, first, answer, memory, later, recall, firstCaption, laterCaption] = scenes[lang];
const t = JSON.parse(await readFile(path.join(root, 'presets/locales/ui', lang + '.json'), 'utf8'));
const temp = await mkdtemp(path.join(tmpdir(), 'otakusoul-memory-demo-'));
const output = path.join(root, 'docs/assets/demo', lang + '-memory');
const hero = path.join(root, 'docs/assets/screenshots', lang, 'memory-chat.png');
const frames = [];

try {
  const { browser, mock, close } = await launch({
    app_language: lang, reply_language: language, active_character_id: 'shiori_amane',
    cloud_model: 'Demo',
  });
  try {
    await browser.setWindowSize(1400, 900);
    const invoke = (command, args) =>
      // oxlint-disable-next-line no-underscore-dangle -- Tauri IPC im isolierten Demoprofil
      browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
    const input = () => browser.$('textarea[aria-label="' + t['chat.inputLabel'] + '"]');
    const capture = async (duration) => {
      const name = String(frames.length).padStart(3, '0') + '.png';
      await browser.saveScreenshot(path.join(temp, name));
      frames.push({ name, duration });
    };
    const send = async (message, reply, record = false) => {
      mock.stats.chatReply = reply;
      mock.stats.chatChunkSize = 4;
      mock.stats.chatDelay = 75;
      await input().waitForDisplayed({ timeout: 30_000 });
      await input().setValue(message);
      const sendButton = await browser.$('button[aria-label="' + t['chat.send'] + '"]');
      await sendButton.waitForEnabled({ timeout: 30_000 });
      if (record) await capture(0.8);
      await browser.execute((button) => button.click(), sendButton);
      await browser.waitUntil(async () => {
        if (await browser.execute((text) => document.body.innerText.includes(text), reply)) return true;
        if (record) await capture(0.18);
        return false;
      }, { timeout: 30_000, interval: 100, timeoutMsg: 'Demo-Antwort fehlt: ' + reply });
    };
    const caption = (label) => browser.execute((text) => {
      document.getElementById('demo-caption')?.remove();
      if (!text) return;
      const banner = document.createElement('div');
      banner.id = 'demo-caption';
      banner.textContent = text;
      Object.assign(banner.style, {
        position: 'fixed', top: '6px', left: '50%', transform: 'translateX(-50%)',
        zIndex: '2147483647', padding: '6px 18px', borderRadius: '20px',
        background: '#6d28d9', color: 'white', font: '600 18px system-ui', pointerEvents: 'none',
      });
      document.body.appendChild(banner);
    }, label);

    await input().waitForDisplayed({ timeout: 30_000 });
    await invoke('save_persona', {
      persona: { id: 'default_user', name: lang === 'ru' ? 'Кай' : 'Kai', description: '', avatar_data_url: null },
    });
    await browser.refresh();
    await caption(firstCaption);
    await send(first, answer);
    await capture(4);

    // Die vorherige Unterhaltung wird als Erinnerung hinterlegt. Der Abruf im neuen Chat ist echt.
    await invoke('add_episodic_memory', {
      charId: 'shiori_amane', category: 'event', content: memory, significance: 9,
    });
    await caption(laterCaption);
    await browser.$('button[title="' + t['chat.sessionsTooltip'] + '"]').click();
    const newChat = await browser.$('button=' + t['chatSidebar.newChat']);
    await newChat.waitForClickable();
    await capture(0.9);
    await newChat.click();
    const closeSidebar = await browser.$('button[title="' + t['common.close'] + '"]');
    if (await closeSidebar.isDisplayed()) await closeSidebar.click();
    await send(later, recall, true);
    const prompt = mock.stats.lastChatMessages.map(({ content }) => content).join('\n');
    assert.ok(prompt.includes(memory), 'Der neue Chat hat Shioris Erinnerung nicht erhalten');
    assert.ok(!prompt.includes(first), 'Der neue Chat enthält noch den vorherigen Verlauf');

    await capture(4);
    await caption('');
    await browser.saveScreenshot(hero);
  } finally {
    await close();
  }

  const list = path.join(temp, 'frames.txt');
  const timings = frames.map(({ name, duration }) => "file '" + name + "'\nduration " + duration);
  await writeFile(list, timings.join('\n') + "\nfile '" + frames.at(-1).name + "'\n");
  const encode = (...args) => execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'concat', '-i', list, ...args,
  ], { stdio: 'inherit' });
  encode('-filter_complex', 'fps=6,scale=1000:-2,split[a][b];[a]palettegen[p];[b][p]paletteuse',
    '-loop', '0', output + '.gif');
  encode('-vf', 'fps=24,scale=1280:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', output + '.mp4');
  console.log(lang + ': Chat-Screenshot, GIF und MP4 erstellt.');
} finally {
  await rm(temp, { recursive: true, force: true });
}
