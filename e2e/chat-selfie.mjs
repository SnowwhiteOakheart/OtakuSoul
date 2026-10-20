// Selfie: „Um ein Selfie bitten“ im Chat-Menü lässt das Chat-Modell einen Selfie-Prompt schreiben; das Bild kommt als
// Nachricht der Figur mit Anhang in den Chat. In späteren Prompts steht es nur als Hinweis (die APIs nehmen Bilder nur
// vom Nutzer an).
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

  // A selfie belongs to a chat that has started.
  const first = mock.stats.chat;
  await input.setValue('Wo bist du gerade?');
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > first, { timeout: 20_000 });
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });

  await jsClick(await browser.$('button[aria-label="Weitere Chat-Aktionen"]'));
  const item = await browser.$('button*=Um ein Selfie bitten');
  await item.waitForExist({ timeout: 10_000, timeoutMsg: 'Menüpunkt für das Selfie fehlt' });
  await jsClick(item);
  await browser.waitUntil(async () => {
    const settings = await invoke('load_settings');
    const [session] = await invoke('list_chat_sessions', { characterId: settings.active_character_id });
    const messages = await invoke('get_chat_messages', { chatId: session.id });
    return messages.some((m) => m.role === 'assistant' && m.attachments.some((a) => a.kind === 'image'));
  }, { timeout: 30_000, timeoutMsg: 'Selfie kommt nicht als Nachricht der Figur' });
  assert.ok(JSON.stringify(mock.stats.lastImagePromptRequest).includes('selfie the character takes'), 'Bildart „Selfie“ fehlt');
  await browser.waitUntil(() => browser.execute(() => [...document.querySelectorAll('img')].some((img) => img.alt.includes('Selfie'))),
    { timeout: 15_000, timeoutMsg: 'Selfie wird im Chat nicht angezeigt' });
  await browser.saveScreenshot(path.join(screenshotDir, '122-selfie.png'));

  // The next reply gets the selfie as a note, not as an image of the assistant.
  const before = mock.stats.chat;
  await input.setValue('Süßes Foto!');
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000 });
  const history = mock.stats.lastChatMessages;
  assert.ok(history.some((m) => String(m.content).includes('[Picture sent: Selfie.png]')), 'Hinweis auf das Selfie fehlt im Verlauf');
  assert.ok(!JSON.stringify(history).includes('image_url'), 'Selfie geht als Bild an das Modell');
  console.log('Selfie: Prompt-Art Selfie, Bild als Nachricht der Figur, im Verlauf nur als Hinweis bestanden.');
} finally {
  await close();
}
