// „Diese Nachricht merken“: aus einer Chat-Nachricht wird eine Erinnerung der Figur mit der Nachricht als Quelle.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';

const { browser, mock, home, close } = await launch();
const database = path.join(home, 'data', 'otakusoul.db');
const sql = (statement) => execFileSync('sqlite3', [database, statement], { encoding: 'utf8' }).trim();
const jsClick = (element) => browser.execute((el) => el.click(), element);

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  const before = mock.stats.chat;
  await input.setValue('*lacht* Ich habe Angst vor Spinnen.');
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000 });
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });

  const buttons = await browser.$$('button[aria-label="Diese Nachricht merken"]');
  // Greeting, user message, reply: the user message is the second.
  await jsClick(buttons[1]);
  const dialog = await browser.$('[data-remember-dialog]');
  await dialog.waitForDisplayed({ timeout: 5000 });
  const text = await dialog.$('textarea');
  assert.equal(await text.getValue(), 'Ich habe Angst vor Spinnen.', 'Vorschlag ohne Aktion erwartet');
  await text.setValue('Hat Angst vor Spinnen');
  await browser.saveScreenshot(path.join(screenshotDir, '102-nachricht-merken.png'));
  await jsClick(await dialog.$('button[type="submit"]'));
  await dialog.waitForExist({ reverse: true, timeout: 10_000, timeoutMsg: 'Dialog schließt nicht' });

  const [chatId, messageId] = sql("SELECT chat_id || '|' || id FROM chat_messages WHERE content LIKE '%Angst vor Spinnen%';").split('|');
  const stored = sql("SELECT category || '|' || origin || '|' || source_chat_id || '|' || source_message_ids FROM soul_episodic_memory WHERE content = 'Hat Angst vor Spinnen';");
  assert.equal(stored, `event|manual|${chatId}|["${messageId}"]`, `Erinnerung ohne Quelle: ${stored}`);
  await browser.$('button*=Gedächtnis öffnen').waitForDisplayed({ timeout: 5000 });
  console.log('Nachricht merken: Vorschlag ohne Aktion, Erinnerung mit Quelle gespeichert, Hinweis mit Gedächtnis-Knopf bestanden.');
} finally {
  await close();
}
