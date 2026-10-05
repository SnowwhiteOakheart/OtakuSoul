// A reply stopped mid-stream keeps its text so far; "Continue" picks it up from there.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, home, close } = await launch();
const sql = (statement) => execFileSync('sqlite3', [path.join(home, 'data', 'otakusoul.db'), statement], { encoding: 'utf8' }).trim();
const jsClick = (element) => browser.execute((el) => el.click(), element);
const lastAssistant = () => sql("SELECT content FROM chat_messages WHERE role = 'assistant' ORDER BY order_index DESC LIMIT 1;");

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  mock.stats.stallChatAfter = 2;
  await input.setValue('Erzähl mir von Kyoto.');
  await browser.$('button[aria-label="Nachricht senden"]').click();

  // Two pieces arrive, then the model hangs; the user stops it.
  const stop = await browser.$('button[aria-label="Generierung abbrechen"]');
  await stop.waitForDisplayed({ timeout: 10_000 });
  await browser.waitUntil(() => browser.execute(() => document.body.textContent.includes('Das ist eine gute')), { timeout: 10_000, timeoutMsg: 'Kein Teiltext' });
  await jsClick(stop);
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 10_000 });
  await browser.waitUntil(() => lastAssistant().startsWith('*lächelt und rückt näher*'), { timeout: 5000, timeoutMsg: 'Teilantwort nicht gespeichert' });
  const partial = lastAssistant();
  assert.ok(partial.length <= 80, `zu lang für eine Teilantwort: ${partial.length}`);
  await browser.waitUntil(() => mock.stats.cancelledChat >= 1, { timeout: 5000, timeoutMsg: 'Verbindung nicht geschlossen' });
  await browser.saveScreenshot(path.join(screenshotDir, '54-teilantwort.png'));

  // Continue completes the same message.
  mock.stats.stallChatAfter = null;
  const bubble = await browser.$(`div[data-message-id]*=${partial.slice(0, 20)}`);
  await jsClick(await bubble.$('button*=Weiter'));
  await browser.waitUntil(() => lastAssistant().length > partial.length + 40, { timeout: 15_000, timeoutMsg: 'Fortsetzen ergänzt nichts' });
  assert.ok(lastAssistant().startsWith(partial), 'Fortsetzen hat den Anfang verändert');
  assert.equal(sql("SELECT count(*) FROM chat_messages WHERE role = 'assistant';"), '2', 'Begrüßung + eine Antwort erwartet');
  console.log('Teilantwort: Stopp behält den Text, Fortsetzen ergänzt dieselbe Nachricht bestanden.');
} finally {
  await close();
}
