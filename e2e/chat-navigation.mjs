// Long stories: search the chat and jump to the hit, bookmark a scene and reach it from the
// sidebar, continue from a message as a new chat (history up to there, original unchanged).
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));
const jsClick = (element) => browser.execute((el) => el.click(), element);
// getText() comes back empty for some WebKit elements; the DOM text is reliable.
const textOf = async (element) => browser.execute((el) => el.textContent ?? '', await element);

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  for (const text of ['Erzähl mir vom Leuchtturm.', 'Und was ist mit dem Hafen?', 'Gute Nacht!']) {
    const before = mock.stats.chat;
    await input.setValue(text);
    await browser.$('button[aria-label="Nachricht senden"]').click();
    await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000 });
    await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });
  }

  // Search: Ctrl+F, the hit is highlighted.
  await browser.keys(['Control', 'f']);
  const search = await browser.$('input[aria-label="Im Chat suchen"]');
  await search.waitForDisplayed();
  await search.setValue('Leuchtturm');
  await browser.keys('Enter');
  await browser.$('span=1 von 1').waitForDisplayed();
  await browser.$('.message-flash').waitForExist({ timeout: 5000 });
  assert.match(await textOf(browser.$('.message-flash')), /Leuchtturm/);
  await shot('38-chat-suche');
  await browser.keys('Escape');

  // Bookmark the harbour question; the sidebar lists it and jumps to it.
  const harbour = await browser.$('div[data-message-id]*=Hafen');
  await jsClick(await harbour.$('button[aria-label="Lesezeichen setzen"]'));
  await harbour.$('button[aria-label="Lesezeichen entfernen"]').waitForExist({ timeout: 5000 });
  await jsClick(await browser.$('button[title^="Gespräche, Author"]'));
  const bookmarks = await browser.$('ul[aria-label="Lesezeichen"]');
  await bookmarks.waitForDisplayed();
  assert.match(await textOf(bookmarks), /Hafen/);
  await shot('39-chat-lesezeichen');
  await jsClick(await bookmarks.$('button'));
  await browser.$('.message-flash').waitForExist({ timeout: 5000 });
  await jsClick(await browser.$('button[title^="Gespräche, Author"]'));

  // Continue from the harbour question as a new chat.
  const sessionsBefore = (await invoke('list_chat_sessions', { characterId: (await invoke('load_settings')).active_character_id })).length;
  await jsClick(await harbour.$('button[aria-label="Ab hier als neuen Chat fortsetzen"]'));
  await jsClick(await browser.$('button=Ab hier als neuen Chat fortsetzen'));
  await browser.waitUntil(async () => (await browser.$('body').getText()).includes('(Abzweig)'), { timeout: 10_000, timeoutMsg: 'Abzweig nicht geöffnet' });
  const shown = await browser.execute(() => [...document.querySelectorAll('[data-message-id]')].map((el) => el.textContent));
  assert.ok(shown.some((t) => t.includes('Hafen')) && !shown.some((t) => t.includes('Gute Nacht')), `Verlauf des Abzweigs falsch: ${shown.length}`);
  const sessions = await invoke('list_chat_sessions', { characterId: (await invoke('load_settings')).active_character_id });
  assert.equal(sessions.length, sessionsBefore + 1);
  await shot('40-chat-abzweig');
  console.log('Chat-Navigation: Suche, Lesezeichen und Abzweig bestanden.');
} finally {
  await close();
}
