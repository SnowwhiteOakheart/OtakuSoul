// Sensitive tools must wait for approval even when safe tools are auto-approved.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);

try {
  await browser.$('button=Companion').waitForExist({ timeout: 20_000 });
  await browser.$('button=Companion').click();
  await browser.$('button=Desktop-Werkbank (Echte Tools)').waitForExist();
  await browser.$('button=Desktop-Werkbank (Echte Tools)').click();
  await browser.$('select').waitForExist();
  await browser.$('select').selectByAttribute('value', 'read_clipboard');
  assert.match(await browser.$('option[value="read_clipboard"]').getText(), /Freigabe nötig/);
  await browser.$('button=Werkzeug ausführen').click();
  await browser.$('button=Ablehnen').waitForDisplayed();

  const pending = await invoke('get_companion_state');
  assert.equal(pending.settings.auto_approve_safe_tools, true);
  assert.equal(pending.pending_tool_calls.length, 1);
  assert.equal(pending.pending_tool_calls[0].tool_name, 'read_clipboard');
  assert.equal(pending.pending_tool_calls[0].requires_confirmation, true);
  assert.equal(pending.tool_history.length, 0, 'Clipboard must not be read before approval');
  await browser.saveScreenshot(path.join(screenshotDir, '28-companion-freigabe.png'));

  await browser.$('button=Ablehnen').click();
  await browser.waitUntil(async () => !(await browser.$('button=Ablehnen').isExisting()));
  const rejected = await invoke('get_companion_state');
  assert.equal(rejected.pending_tool_calls.length, 0);
  assert.equal(rejected.tool_history.length, 1);
  assert.equal(rejected.tool_history[0].success, false);
  assert.match(rejected.tool_history[0].output, /abgelehnt/);
  console.log('Companion: sensible Werkzeuge warten auf Freigabe und lassen sich ablehnen.');
} finally {
  await close();
}
