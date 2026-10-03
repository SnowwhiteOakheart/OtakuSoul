// Real SQLite write failures must retain sidebar drafts and allow retry.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, home, close } = await launch();
const sql = (statement) => execFileSync('sqlite3', [path.join(home, 'data', 'otakusoul.db'), statement], { encoding: 'utf8' }).trim();
const row = () => JSON.parse(sql("SELECT json_object('title', title, 'author_note', author_note, 'author_note_depth', author_note_depth, 'summary', summary, 'summary_until', summary_until) FROM chat_sessions LIMIT 1;"));
const block = () => sql("CREATE TRIGGER test_sidebar_failure BEFORE UPDATE ON chat_sessions BEGIN SELECT RAISE(ABORT, 'Seitenleisten-Schreibfehler (Test).'); END;");
const unblock = () => sql('DROP TRIGGER test_sidebar_failure;');
const replace = async (selector, value) => {
  const field = browser.$(selector);
  await field.click();
  await browser.execute((element) => element.select(), await field);
  await browser.keys('Backspace');
  await field.addValue(value);
};
const failed = async (action, prefix) => {
  const button = browser.$(action === 'Titel speichern' ? 'button[aria-label="Titel speichern"]' : `button=${action}`);
  await button.click();
  await browser.$(`p*=${prefix}`).waitForDisplayed();
  await browser.waitUntil(() => button.isEnabled());
};
try {
  const toggle = browser.$('button[title^="Gespräche, Author"]');
  await toggle.waitForDisplayed({ timeout: 20_000 });
  await toggle.click();
  const original = row();
  const sidebar = browser.$('aside[aria-label="Gespräche"]');
  await sidebar.$('[class~="group"]').moveTo();
  await sidebar.$('button[aria-label="Umbenennen"]').click();
  await replace('input[aria-label="Neuer Titel"]', 'Unser Seeabenteuer');
  block();
  await failed('Titel speichern', 'Titel konnte nicht gespeichert werden:');
  assert.equal(await browser.$('input[aria-label="Neuer Titel"]').getValue(), 'Unser Seeabenteuer');
  assert.deepEqual(row(), original);
  await browser.saveScreenshot(path.join(screenshotDir, '34-chat-titelfehler.png'));
  unblock();
  await browser.$('button[aria-label="Titel speichern"]').click();
  await browser.$('input[aria-label="Neuer Titel"]').waitForExist({ reverse: true });
  assert.equal(row().title, 'Unser Seeabenteuer');

  await browser.$('button=Author\'s Note').click();
  await replace('#author-note-input', 'Ayu spricht leise und nachdenklich.');
  // Set depth through a real input event so React receives the change.
  await browser.execute(() => {
    const depth = document.querySelector('#author-note-depth');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(depth, '0');
    depth.dispatchEvent(new Event('input', { bubbles: true }));
    depth.dispatchEvent(new Event('change', { bubbles: true }));
  });
  block();
  await failed("Author's Note speichern", 'Author’s Note konnte nicht gespeichert werden:');
  assert.equal(row().author_note, original.author_note);
  assert.equal(await browser.$('#author-note-input').getValue(), 'Ayu spricht leise und nachdenklich.');
  // Closing and tab changes must retain the failed draft.
  await sidebar.$('button[aria-label="Schließen"]').click();
  await toggle.click();
  await browser.$('button=Chats').click();
  await browser.$('button=Author\'s Note').click();
  assert.equal(await browser.$('#author-note-input').getValue(), 'Ayu spricht leise und nachdenklich.');
  assert.equal(await browser.$('#author-note-depth').getValue(), '0');
  await browser.saveScreenshot(path.join(screenshotDir, '35-chat-notizfehler.png'));
  unblock();
  await browser.$('button=Author\'s Note speichern').click();
  await browser.$('p=Author\'s Note gespeichert.').waitForDisplayed();
  assert.equal(row().author_note, 'Ayu spricht leise und nachdenklich.');
  assert.equal(row().author_note_depth, 0);

  await replace('#chat-summary-input', 'Wir trafen uns am See.');
  block();
  await failed('Zusammenfassung speichern', 'Zusammenfassung konnte nicht gespeichert werden:');
  assert.equal(row().summary, original.summary);
  assert.equal(await browser.$('#chat-summary-input').getValue(), 'Wir trafen uns am See.');
  await browser.saveScreenshot(path.join(screenshotDir, '36-chat-zusammenfassungsfehler.png'));
  unblock();
  await browser.$('button=Zusammenfassung speichern').click();
  await browser.waitUntil(() => row().summary === 'Wir trafen uns am See.');
  await replace('#chat-summary-input', 'Noch nicht gespeicherter Entwurf.');
  block();
  await failed('Neu beginnen', 'Zusammenfassung konnte nicht gespeichert werden:');
  assert.equal(row().summary, 'Wir trafen uns am See.');
  assert.equal(await browser.$('#chat-summary-input').getValue(), 'Noch nicht gespeicherter Entwurf.');
  unblock();
  await browser.$('button=Neu beginnen').click();
  await browser.waitUntil(async () => (await browser.$('#chat-summary-input').getValue()) === '');
  assert.equal(row().summary, '');
  assert.equal(row().summary_until, -1);
  console.log('Chat-Seitenleiste: Titel, Notiz mit Tiefe 0 und Zusammenfassung erhalten Entwürfe bei SQLite-Fehlern; Wiederholen und Zurücksetzen bestanden.');
} catch (error) {
  await browser.saveScreenshot(path.join(screenshotDir, 'chat-sidebar-errors-fehler.png'));
  throw error;
} finally {
  await close();
}
