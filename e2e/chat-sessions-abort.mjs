// History read failures, an HTTP endpoint that never responds, and navigation during generation.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';
const { browser, home, mock, close } = await launch();
const sql = (statement) => execFileSync('sqlite3', [path.join(home, 'data', 'otakusoul.db'), statement], { encoding: 'utf8' }).trim();
const openSessions = () => browser.$('button[title="Gespräche, Author\'s Note & HUD-Presets öffnen"]').click();
try {
  await browser.$('[class~="group/bubble"]').waitForDisplayed({ timeout: 20_000 });
  const oldChat = sql('SELECT id FROM chat_sessions LIMIT 1;');
  const input = browser.$('textarea[aria-label="Nachricht"]');
  await input.addValue('Mein Entwurf bleibt erhalten.');
  await openSessions();
  sql('ALTER TABLE chat_messages RENAME TO chat_messages_hidden;');
  await browser.$('button[aria-current="true"]').click();
  await browser.$('[role="alert"]*=Chatverlauf konnte nicht geladen werden').waitForDisplayed();
  await browser.$('button[title="Schließen"]').click();
  assert.equal(await input.getValue(), 'Mein Entwurf bleibt erhalten.');
  assert.equal(await browser.$('button[aria-label="Nachricht senden"]').isEnabled(), false);
  assert.equal((await browser.$$('[class~="group/bubble"]')).length, 0);
  await browser.saveScreenshot(path.join(screenshotDir, '42-chat-verlauf-ladefehler.png'));
  sql('ALTER TABLE chat_messages_hidden RENAME TO chat_messages;');
  await browser.$('button=Erneut versuchen').click();
  await browser.$('[class~="group/bubble"]').waitForDisplayed();
  assert.equal(await input.getValue(), 'Mein Entwurf bleibt erhalten.');

  mock.stats.stallChat = true;
  await browser.$('button[aria-label="Nachricht senden"]').click();
  await browser.waitUntil(() => mock.stats.chat >= 1);
  await browser.$('button[aria-label="Generierung abbrechen"]').click();
  await browser.$('button[aria-label="Nachricht senden"]').waitForDisplayed({ timeout: 5_000 });
  await browser.waitUntil(() => mock.stats.cancelledChat >= 1);
  assert.equal(sql(`SELECT count(*) FROM chat_messages WHERE chat_id = '${oldChat}' AND role = 'assistant';`), '1');

  await input.addValue('Diese Anfrage wird durch den Chatwechsel beendet.');
  await browser.$('button[aria-label="Nachricht senden"]').click();
  await browser.waitUntil(() => mock.stats.chat >= 2);
  await openSessions();
  await browser.$('button=Neuer Chat').click();
  await browser.waitUntil(() => sql('SELECT count(*) FROM chat_sessions;') === '2');
  await browser.waitUntil(() => mock.stats.cancelledChat >= 2);
  await browser.$('button[title="Schließen"]').click();
  await browser.$('button[aria-label="Nachricht senden"]').waitForDisplayed();
  const newChat = sql(`SELECT id FROM chat_sessions WHERE id != '${oldChat}' LIMIT 1;`);
  mock.stats.stallChat = false;
  await input.addValue('Ein neues Gespräch.');
  await browser.waitUntil(async () => await browser.$('button[aria-label="Nachricht senden"]').isEnabled());
  await browser.$('button[aria-label="Nachricht senden"]').click();
  await browser.waitUntil(() => sql(`SELECT count(*) FROM chat_messages WHERE chat_id = '${newChat}' AND role = 'assistant';`) === '2', { timeout: 20_000 });
  assert.equal(sql(`SELECT count(*) FROM chat_messages WHERE chat_id = '${oldChat}' AND role = 'assistant';`), '1');
  assert.equal(sql(`SELECT count(*) FROM chat_messages WHERE chat_id = '${newChat}' AND role = 'user';`), '1');
  console.log('Sitzungen: Lesefehler erhalten Entwürfe; Abbruch und Chatwechsel schließen antwortlose HTTP-Anfragen; neue Antworten gehören zum neuen Chat.');
} catch (failure) {
  await browser.saveScreenshot(path.join(screenshotDir, 'chat-sessions-abort-fehler.png'));
  throw failure;
} finally {
  await close();
}
