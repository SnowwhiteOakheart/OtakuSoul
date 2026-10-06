// Soul Memory with sources: a memory learned from a chat message names its origin and source;
// editing that message flags it for review (hint with "Review" opens the drawer); it can be
// kept, pinned and forgotten, and the history records every step.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';

const { browser, mock, home, close } = await launch();
const database = path.join(home, 'data', 'otakusoul.db');
const sql = (statement) => execFileSync('sqlite3', [database, statement], { encoding: 'utf8' }).trim();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  const before = mock.stats.chat;
  await input.setValue('Ich heiße Hiroki.');
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000 });
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });

  // A memory the model learned from that message (as the memory pipeline stores it).
  const characterId = (await invoke('load_settings')).active_character_id;
  const [chatId, messageId] = sql("SELECT chat_id || '|' || id FROM chat_messages WHERE content = 'Ich heiße Hiroki.';").split('|');
  sql(`INSERT INTO soul_episodic_memory (character_id, category, content, significance, created_at, last_accessed_at, source_chat_id, source_message_ids, origin)
       VALUES ('${characterId}', 'fact', 'Der Nutzer heißt Hiroki', 3, 1, 1, '${chatId}', '["${messageId}"]', 'auto');`);
  const memoryId = sql("SELECT id FROM soul_episodic_memory WHERE content = 'Der Nutzer heißt Hiroki';");
  sql(`INSERT INTO soul_memory_history (memory_id, character_id, action, content_after, at) VALUES (${memoryId}, '${characterId}', 'created', 'Der Nutzer heißt Hiroki', 1);`);

  // Edit the source message: the hint offers to review.
  const own = await browser.$('div[data-message-id]*=Ich heiße Hiroki.');
  await jsClick(await own.$('button[aria-label="Nachricht bearbeiten"]'));
  const editor = await browser.$('textarea[aria-label="Nachricht bearbeiten"]');
  await editor.waitForDisplayed();
  await editor.setValue('Ich heiße Kenji.');
  await browser.$('button=Speichern').click();
  const review = await browser.$('button=Prüfen');
  await review.waitForDisplayed({ timeout: 10_000 });
  assert.equal(sql(`SELECT needs_review FROM soul_episodic_memory WHERE id = ${memoryId};`), '1');
  await jsClick(review);

  // The drawer shows the memory with origin, source and the review note.
  const tab = await browser.$('button*=Episoden & Themen');
  await tab.waitForDisplayed({ timeout: 10_000 });
  await jsClick(tab);
  const note = await browser.$('div[role="note"]*=wurde geändert oder gelöscht');
  await note.waitForDisplayed({ timeout: 10_000 });
  assert.ok(await browser.$('span=vom Modell abgeleitet').isExisting());
  assert.ok(await browser.$('button*=Quelle: Chat').isExisting());
  await shot('41-erinnerung-pruefen');

  await jsClick(await browser.$('button=Passt so'));
  await browser.waitUntil(() => sql(`SELECT needs_review FROM soul_episodic_memory WHERE id = ${memoryId};`) === '0', { timeout: 5000, timeoutMsg: 'Bestätigen wirkt nicht' });
  // Each action reloads the overview; its buttons are locked until then.
  const pin = await browser.$('button[aria-label="Anheften"]');
  await pin.waitForEnabled({ timeout: 5000 });
  await jsClick(pin);
  await browser.waitUntil(() => sql(`SELECT pinned FROM soul_episodic_memory WHERE id = ${memoryId};`) === '1', { timeout: 5000, timeoutMsg: 'Anheften wirkt nicht' });
  await jsClick(await browser.$('button[aria-label="Verlauf"]'));
  await browser.$('ol[aria-label="Verlauf"]').waitForDisplayed();
  await shot('42-erinnerung-verlauf');

  const forget = await browser.$('button[aria-label="Vergessen"]');
  await forget.waitForEnabled({ timeout: 5000 });
  await jsClick(forget);
  // No dialog: the memory disappears, the toast offers "Undo", then it is forgotten.
  await browser.$('div[role="note"]').waitForExist({ reverse: true, timeout: 5000 }).catch(() => {});
  await browser.waitUntil(() => sql(`SELECT count(*) FROM soul_episodic_memory WHERE id = ${memoryId};`) === '0', { timeout: 15_000, timeoutMsg: 'Vergessen wirkt nicht' });
  const actions = sql(`SELECT group_concat(action, ',') FROM (SELECT action FROM soul_memory_history WHERE memory_id = ${memoryId} ORDER BY id);`);
  assert.equal(actions, 'created,source_changed,confirmed,pinned,forgotten');
  console.log('Soul Memory: Herkunft, Quelle, Prüfen nach Nachrichtenänderung, Anheften, Vergessen und Verlauf bestanden.');
} finally {
  await close();
}
