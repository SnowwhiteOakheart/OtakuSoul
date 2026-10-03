// Failed inline message edits preserve the draft and the saved message until retry succeeds.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, home, close } = await launch();
const sql = (statement) => execFileSync('sqlite3', [path.join(home, 'data', 'otakusoul.db'), statement], { encoding: 'utf8' }).trim();
try {
  const bubble = browser.$('[class~="group/bubble"]');
  await bubble.waitForDisplayed({ timeout: 20_000 });
  await bubble.moveTo();
  const edit = browser.$('button[aria-label="Nachricht bearbeiten"]');
  await edit.waitForDisplayed({ timeout: 20_000 });
  const original = JSON.parse(sql("SELECT json_object('id', id, 'content', content) FROM chat_messages ORDER BY order_index LIMIT 1;"));
  sql("CREATE TRIGGER test_chat_edit_failure BEFORE UPDATE ON chat_messages BEGIN SELECT RAISE(ABORT, 'Nachrichten-Schreibfehler (Test).'); END;");
  await edit.click();
  const editor = browser.$('textarea[aria-label="Nachricht bearbeiten"]');
  await editor.click();
  await browser.execute((element) => element.select(), await editor);
  await browser.keys('Backspace');
  await editor.addValue('Unser Treffen am See.');
  await browser.$('button=Speichern').click();
  await browser.$('p*=Nachrichten-Schreibfehler (Test).').waitForDisplayed();
  assert.equal(await editor.getValue(), 'Unser Treffen am See.');
  assert.equal(JSON.parse(sql(`SELECT json_quote(content) FROM chat_messages WHERE id = '${original.id}';`)), original.content);
  await browser.saveScreenshot(path.join(screenshotDir, '33-chat-bearbeitungsfehler.png'));
  sql('DROP TRIGGER test_chat_edit_failure;');
  await browser.$('button=Speichern').click();
  await editor.waitForExist({ reverse: true });
  assert.equal(JSON.parse(sql(`SELECT json_quote(content) FROM chat_messages WHERE id = '${original.id}';`)), 'Unser Treffen am See.');
  await browser.$('[class~="group/bubble"]').moveTo();
  await browser.$('button[aria-label="Nachricht bearbeiten"]').click();
  assert.equal(await browser.$('textarea[aria-label="Nachricht bearbeiten"]').getValue(), 'Unser Treffen am See.');
  await browser.$('button=Abbrechen').click();
  console.log('Chat: Schreibfehler erhält Nachrichtenentwurf; Wiederholen speichert die Korrektur im Backend.');
} catch (error) {
  await browser.saveScreenshot(path.join(screenshotDir, 'chat-edit-errors-fehler.png'));
  throw error;
} finally {
  await close();
}
