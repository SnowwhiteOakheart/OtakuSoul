// Per-chat style: background picture, text size, bubbles and an ambient loop are set in the
// sidebar, stored with the chat and shown/played in the chat view.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, home, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const sql = (statement) => execFileSync('sqlite3', [path.join(home, 'data', 'otakusoul.db'), statement], { encoding: 'utf8' }).trim();
const jsClick = (element) => browser.execute((el) => el.click(), element);
const choose = async (selector, value) => {
  const select = await browser.$(selector);
  await select.waitForExist({ timeout: 10_000 });
  await browser.waitUntil(async () => (await select.$$('option')).length > 1 || value === '', { timeout: 10_000 });
  await select.selectByAttribute('value', value);
};

/** A short WAV for the ambient loop. */
const wavFile = () => {
  const file = path.join(home, 'regen.wav');
  const samples = 800;
  const wav = Buffer.alloc(44 + samples * 2, 1);
  wav.write('RIFF'); wav.writeUInt32LE(36 + samples * 2, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  writeFileSync(file, wav);
  return file;
};
const loops = () => browser.execute(() => (window.__ambient ?? []).filter((a) => a.loop && !a.paused).length);

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.execute(() => {
    const Original = window.Audio;
    window.__ambient = [];
    window.Audio = function (src) {
      const audio = new Original(src);
      window.__ambient.push(audio);
      return audio;
    };
  });
  const picture = await invoke('import_stage_asset', { filePath: path.resolve('presets/sakura-succubus-3/backgrounds/Horizontal Tokyo Living Room.png'), kind: 'backgrounds' });
  const rain = await invoke('import_stage_asset', { filePath: wavFile(), kind: 'ambient' });

  await browser.waitUntil(() => sql('SELECT count(*) FROM chat_sessions;') !== '0', { timeout: 15_000 });
  await jsClick(await browser.$('button[title^="Gespräche, Author"]'));
  await jsClick(await browser.$('button[role="tab"]=Gestaltung'));
  await choose('#chat-style-background', picture);
  await choose('#chat-style-text', 'large');
  await choose('#chat-style-bubbles', 'subtle');
  await choose('#chat-style-ambient', rain);

  await browser.waitUntil(() => sql('SELECT style_json FROM chat_sessions LIMIT 1;').includes(rain), { timeout: 5000, timeoutMsg: 'Gestaltung nicht gespeichert' });
  const style = JSON.parse(sql('SELECT style_json FROM chat_sessions LIMIT 1;'));
  assert.deepEqual([style.background, style.text_size, style.bubbles, style.ambient], [picture, 'large', 'subtle', rain]);

  await browser.waitUntil(() => browser.execute(() => [...document.querySelectorAll('div[aria-hidden]')].some((d) => d.style.backgroundImage.includes('url('))), { timeout: 10_000, timeoutMsg: 'Hintergrund fehlt' });
  assert.ok(await browser.$('[data-text-size="large"][data-bubbles="subtle"]').isExisting(), 'Textgröße/Blasen nicht angewendet');
  await browser.waitUntil(async () => (await loops()) >= 1, { timeout: 10_000, timeoutMsg: 'Ambient-Klang läuft nicht' });
  await jsClick(await browser.$('button[title^="Gespräche, Author"]'));
  await browser.pause(400);
  await browser.saveScreenshot(path.join(screenshotDir, '56-chat-gestaltung.png'));

  // Reset: defaults again, sound stops.
  await jsClick(await browser.$('button[title^="Gespräche, Author"]'));
  await jsClick(await browser.$('button=Zurücksetzen'));
  await browser.waitUntil(() => sql('SELECT style_json FROM chat_sessions LIMIT 1;') === '', { timeout: 5000, timeoutMsg: 'Zurücksetzen nicht gespeichert' });
  await browser.waitUntil(async () => (await loops()) === 0, { timeout: 5000, timeoutMsg: 'Ambient-Klang läuft weiter' });
  console.log('Chat-Gestaltung: Hintergrund, Textgröße, Blasen und Ambient-Klang gespeichert, angezeigt und zurückgesetzt bestanden.');
} finally {
  await close();
}
