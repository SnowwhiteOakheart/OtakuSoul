// Real write failures must retain an unsaved draft or retry the saved user message exactly once.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';
const { browser, home, close } = await launch();
const sql = (statement) => execFileSync('sqlite3', [path.join(home, 'data', 'otakusoul.db'), statement], { encoding: 'utf8' }).trim();
try {
  await browser.$('[class~="group/bubble"]').waitForDisplayed({ timeout: 20_000 });
  const input = browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 20_000 });
  sql("CREATE TRIGGER test_user_failure BEFORE INSERT ON chat_messages WHEN NEW.role = 'user' BEGIN SELECT RAISE(ABORT, 'Nutzernachricht-Schreibfehler (Test).'); END;");
  await input.addValue('Unser Gespräch über den See.');
  await browser.$('button[aria-label="Nachricht senden"]').click();
  await browser.$('[role="alert"]*=Nutzernachricht-Schreibfehler (Test).').waitForDisplayed();
  await browser.waitUntil(async () => await input.getValue() === 'Unser Gespräch über den See.');
  assert.equal(sql("SELECT count(*) FROM chat_messages WHERE role = 'user';"), '0');
  await browser.$('[role="alert"] button[aria-label="Schließen"]').click();
  await browser.$('[role="alert"]').waitForExist({ reverse: true });
  sql('DROP TRIGGER test_user_failure;');
  sql("CREATE TRIGGER test_reply_failure BEFORE INSERT ON chat_messages WHEN NEW.role = 'assistant' BEGIN SELECT RAISE(ABORT, 'Antwort-Schreibfehler (Test).'); END;");
  await browser.$('button[aria-label="Nachricht senden"]').click();
  await browser.$('[role="alert"]*=Antwort-Schreibfehler (Test).').waitForDisplayed({ timeout: 20_000 });
  assert.equal(await input.getValue(), '');
  assert.equal(sql("SELECT count(*) FROM chat_messages WHERE role = 'user';"), '1');
  await browser.saveScreenshot(path.join(screenshotDir, '41-chat-generierungsfehler.png'));
  sql('DROP TRIGGER test_reply_failure;');
  await browser.$('button=Erneut versuchen').click();
  await browser.waitUntil(async () => sql("SELECT count(*) FROM chat_messages WHERE role = 'assistant' AND order_index > 0;") === '1', { timeout: 20_000 });
  await browser.$('[role="alert"]').waitForExist({ reverse: true });
  assert.equal(sql("SELECT count(*) FROM chat_messages WHERE role = 'user';"), '1');
  console.log('Chat: Schreibfehler erhalten ungespeicherten Entwurf; Antwort-Wiederholung erzeugt keine doppelte Nutzernachricht.');
} catch (failure) {
  await browser.saveScreenshot(path.join(screenshotDir, 'chat-generation-errors-fehler.png'));
  throw failure;
} finally {
  await close();
}
