// Real PDF import through the built app, with synthetic compressed/Unicode fixtures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { launch } from './harness.mjs';

const { browser, home, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const fixture = (name) => readFileSync(new URL(`./fixtures/pdf/${name}`, import.meta.url)).toString('base64');

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  for (const [name, expected] of [['mehrseitig.pdf', ['Grüße aus Köln', 'Zweite Seite']], ['unicode.pdf', ['日本語']]]) {
    const attachment = await invoke('save_attachment', { chatId: 'pdf-e2e', name, data: fixture(name) });
    assert.equal(attachment.kind, 'text');
    assert.equal(attachment.mime, 'application/pdf');
    assert.equal(attachment.truncated, false);
    for (const text of expected) assert.ok(attachment.text.includes(text), `${name}: ${attachment.text}`);
    assert.equal(readFileSync(path.join(home, 'data', 'attachments', attachment.file), 'utf8'), attachment.text);
  }
  for (const [name, data, code] of [
    ['ohne-text.pdf', fixture('ohne-text.pdf'), 'backend.attachment.empty'],
    ['defekt.pdf', Buffer.from('not a PDF').toString('base64'), 'backend.attachment.unreadable'],
  ]) {
    const failure = await browser.execute(async (payload) => {
      try {
        // oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
        await window.__TAURI_INTERNALS__.invoke('save_attachment', payload);
        return null;
      } catch (error) {
        return String(error);
      }
    }, { chatId: 'pdf-e2e', name, data });
    assert.equal(JSON.parse(failure).code, code);
  }
  console.log('PDF-Anhänge: mehrseitige komprimierte Inhalte, WinAnsi, Unicode, gespeicherter Text und Fehlerfälle bestanden.');
} finally {
  await close();
}
