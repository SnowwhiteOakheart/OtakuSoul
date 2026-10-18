// Chat-Export/-Import im SillyTavern-Format: das Backend schreibt die Datei (der Webview kann nicht herunterladen),
// sie trägt die ST-Felder und lässt sich wieder importieren; der Import erscheint in der Chat-Seitenleiste.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { clickSend, launch } from './harness.mjs';

const { browser, mock, home, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  await input.setValue('Erzähl mir vom Tempel.');
  const before = mock.stats.chat;
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000 });
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });

  const settings = await invoke('load_settings');
  const [session] = await invoke('list_chat_sessions', { characterId: settings.active_character_id });
  const target = path.join(home, 'export.jsonl');
  await invoke('export_chat_jsonl', { chatId: session.id, charName: 'Althea', userName: 'User', targetPath: target });
  const lines = readFileSync(target, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(lines[0].chat_metadata && 'note_prompt' in lines[0].chat_metadata, 'ST-Kopfzeile fehlt');
  assert.ok(lines.some((line) => line.mes === 'Erzähl mir vom Tempel.' && line.is_user), 'Nachricht fehlt');
  assert.ok(lines.slice(1).every((line) => Array.isArray(line.swipe_info) && typeof line.send_date === 'number'), 'ST-Felder fehlen');

  await invoke('import_chat_jsonl', { characterId: settings.active_character_id, jsonlContent: readFileSync(target, 'utf8'), titleOverride: 'Rundreise' });
  // An import through IPC bypasses the store: reload so the list shows it.
  await browser.execute(() => window.location.reload());
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.$('button[title^="Gespräche, Author"]').click();
  await browser.$('//aside//*[normalize-space()="Rundreise"]').waitForDisplayed({ timeout: 10_000, timeoutMsg: 'Import fehlt in der Seitenleiste' });
  console.log('Chat-JSONL: Datei mit ST-Feldern geschrieben, wieder importiert und in der Seitenleiste bestanden.');
} finally {
  await close();
}
