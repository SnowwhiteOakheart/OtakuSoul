// Szenenbild aus dem Chat: „Diesen Moment als Bild“ an einer Antwort lässt das Chat-Modell einen Bild-Prompt für den
// Moment schreiben (Verlauf bis zu dieser Antwort), das Bild erscheint über dem Chat und wird zum Chat-Hintergrund.
import assert from 'node:assert/strict';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  const config = await invoke('get_image_gen_config');
  await invoke('save_image_gen_config', { config: { ...config, provider: 'automatic1111', api_url: mock.url.replace('/v1/chat/completions', '') } });

  await input.setValue('Wir stehen vor dem Schreintor.');
  const before = mock.stats.chat;
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000 });
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });

  // The greeting is the first reply: picture it, so the later message must not be in the story.
  const buttons = await browser.$$('button[aria-label="Diesen Moment als Bild"]');
  await jsClick(buttons[0]);
  const card = await browser.$('figure img');
  await card.waitForDisplayed({ timeout: 30_000, timeoutMsg: 'Szenenbild erscheint nicht' });
  const request = JSON.stringify(mock.stats.lastImagePromptRequest);
  assert.ok(request.includes('moment of the story'), 'Bildart „Moment“ fehlt');
  assert.ok(!request.includes('Schreintor'), 'Verlauf geht über die gewählte Antwort hinaus');
  assert.equal(mock.stats.imagePrompts.at(-1).includes('1girl, shrine gate'), true, 'Prompt des Chat-Modells nicht verwendet');
  await browser.saveScreenshot(path.join(screenshotDir, '103-szenenbild.png'));

  await jsClick(await browser.$('button[aria-label="Als Chat-Hintergrund verwenden"]'));
  await browser.waitUntil(async () => {
    const settings = await invoke('load_settings');
    const sessions = await invoke('list_chat_sessions', { characterId: settings.active_character_id });
    return sessions.some((s) => s.style?.background);
  }, { timeout: 10_000, timeoutMsg: 'Hintergrund nicht gesetzt' });
  console.log('Szenenbild: Moment bis zur gewählten Antwort, Bild über dem Chat, als Hintergrund übernommen bestanden.');
} finally {
  await close();
}
