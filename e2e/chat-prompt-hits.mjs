// Woher die Antwort ihr Wissen hat: ein globales Lorebook mit Stichwort, die Antwort zeigt den Treffer an.
import assert from 'node:assert/strict';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch();
const jsClick = (element) => browser.execute((el) => el.click(), element);

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  // A global lorebook with a keyword from the message.
  await browser.executeAsync((done) => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    const book = { id: 'e2e_hits', name: 'Kyoto-Wissen', description: '', is_global: true, entries: [
      { name: 'Fushimi Inari', key: ['schrein'], exclude_key: [], content: 'Tausend rote Tore.', trigger_type: 'keyword', injection_behavior: 'passive', enabled: true },
    ] };
    invoke('save_lorebook', { lorebook: book }).then(() => done(), (e) => done(String(e)));
  });
  await browser.refresh();
  await input.waitForDisplayed({ timeout: 30_000 });
  await browser.$('textarea[aria-label="Nachricht"]').setValue('Gehen wir zum Schrein?');
  const before = mock.stats.chat;
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000 });
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });
  assert.ok(mock.stats.lastChatSystemPrompt.includes('Tausend rote Tore.'), 'Eintrag nicht im Prompt');

  const badge = await browser.$('button[data-prompt-hits]');
  await badge.waitForExist({ timeout: 10_000, timeoutMsg: 'Treffer-Knopf fehlt an der Antwort' });
  await jsClick(badge);
  const list = await browser.$('[data-prompt-hits-list]');
  await list.waitForDisplayed({ timeout: 5000 });
  const text = await list.getText();
  assert.ok(text.includes('Fushimi Inari') && text.includes('Kyoto-Wissen'), `Treffer fehlt: ${text}`);
  await browser.saveScreenshot(path.join(screenshotDir, '101-wissen-der-antwort.png'));
  console.log('Treffer je Antwort: Lorebook-Eintrag im Prompt, Knopf und Liste mit Buchnamen bestanden.');
} finally {
  await close();
}
