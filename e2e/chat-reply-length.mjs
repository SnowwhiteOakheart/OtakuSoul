// Antwortlänge pro Chat: die Auswahl unter dem Eingabefeld setzt die Anweisung ans Ende des Prompts und begrenzt
// max_tokens; sie gilt nur für diesen Chat und bleibt nach dem Neuladen erhalten.
import assert from 'node:assert/strict';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch();

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  const picker = await browser.$('select[data-reply-length]');
  await picker.selectByVisibleText('Kurz');
  await browser.waitUntil(async () => (await picker.getValue()) === 'short', { timeout: 5000 });
  await browser.saveScreenshot(path.join(screenshotDir, '97-antwortlaenge.png'));

  await input.setValue('Erzähl mir von dir.');
  const before = mock.stats.chat;
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000, timeoutMsg: 'Nachricht nicht gesendet' });
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });
  const request = mock.stats.lastChatRequest;
  assert.equal(request.max_tokens, 400, 'max_tokens nicht begrenzt');
  // Local/custom servers get trailing system text appended to the last user turn (`system_first`).
  const last = request.messages.at(-1).content.replace(/\nEnd your reply with one tag[^\n]*$/, '').trimEnd();
  assert.ok(last.endsWith('Keep this reply short: one to three sentences.'), 'Längen-Anweisung fehlt am Ende');

  await browser.refresh();
  const again = await browser.$('select[data-reply-length]');
  await again.waitForExist({ timeout: 30_000 });
  await browser.waitUntil(async () => (await again.getValue()) === 'short', { timeout: 10_000, timeoutMsg: 'Wahl nach Neuladen verloren' });
  console.log('Antwortlänge: Auswahl, Anweisung am Ende, max_tokens und Speichern pro Chat bestanden.');
} finally {
  await close();
}
