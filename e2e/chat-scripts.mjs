// JavaScript rules (C9) in the real app: QuickJS/WebAssembly starts in a worker under the app's CSP,
// a reply script changes the saved reply, a prompt script only what the model reads, a script with
// an endless loop is stopped and leaves the text alone (its error shows in the settings), and a
// script finds no way out (no fetch, no Tauri).
import assert from 'node:assert/strict';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';

const rule = (name, code, over = {}) => ({ name, code, find: '', replace: '', regex: false, disabled: false, on_input: false, on_output: true, mode: 'save', ...over });
const { browser, mock, close } = await launch({
  expert_mode: true,
  reply_replacements: [
    rule('Markierung', 'function transform(text, info) { return text + " [JS:" + info.role + "/" + info.stage + "]"; }'),
    rule('Endlos', 'function transform(text) { while (true) {} }'),
    rule('Ausbruch', 'function transform(text) { return text + " [fetch:" + typeof fetch + ",tauri:" + typeof globalThis.__TAURI_INTERNALS__ + "]"; }'),
    rule('Prompt', 'function transform(text) { return text.replace("geheim", "PROMPT_JS"); }', { on_input: true, on_output: false, mode: 'prompt' }),
  ],
});
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  mock.stats.chatReply = 'Ich höre zu.';
  await input.setValue('Das ist geheim.');
  const before = mock.stats.chat;
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > before, { timeout: 30_000, timeoutMsg: 'kein Prompt gesendet' });

  // The prompt script changed only what the model reads.
  const sent = JSON.stringify(mock.stats.lastChatRequest.messages);
  assert.ok(sent.includes('Das ist PROMPT_JS.'), `Prompt-Skript fehlt im Prompt: ${sent.slice(-300)}`);

  // The saved reply: marked by the first script, the endless one skipped, the sandbox sealed.
  const settings = await invoke('load_settings');
  let stored = [];
  await browser.waitUntil(async () => {
    const [session] = await invoke('list_chat_sessions', { characterId: settings.active_character_id });
    stored = session ? await invoke('get_chat_messages', { chatId: session.id }) : [];
    return stored.some((m) => m.role === 'assistant' && m.content.includes('[JS:'));
  }, { timeout: 30_000, timeoutMsg: 'Antwort ohne Skript gespeichert (startet WebAssembly unter der CSP?)' });
  const reply = stored.findLast((m) => m.role === 'assistant').content;
  assert.ok(reply.includes('Ich höre zu. [JS:assistant/save] [fetch:undefined,tauri:undefined]'), `gespeicherte Antwort: ${reply}`);
  assert.ok(stored.some((m) => m.role === 'user' && m.content === 'Das ist geheim.'), 'Prompt-Skript hat die gespeicherte Nachricht verändert');
  await browser.waitUntil(async () => (await browser.execute(() => document.body.innerText)).includes('[JS:assistant/save]'), {
    timeout: 10_000,
    timeoutMsg: 'Skript-Ergebnis nicht im Chat',
  });

  // The endless script reports its error in the settings.
  await browser.$('button=Einstellungen').click();
  await browser.$('button[role="tab"]*=Antwortstil').click();
  const codes = await browser.$$('[data-script-code]');
  await browser.waitUntil(async () => codes.length === 4, { timeout: 10_000 });
  const page = await browser.execute(() => document.body.innerText);
  assert.match(page, /Skript fehlgeschlagen, Text blieb unverändert/, 'Fehler des Endlos-Skripts nicht angezeigt');
  await codes[1].scrollIntoView();
  await browser.saveScreenshot(path.join(screenshotDir, '124-javascript-skripte.png'));
  console.log('JavaScript-Skripte: Sandbox startet, Antwort- und Prompt-Skript wirken, Endlosschleife gestoppt, kein Ausweg bestanden.');
} finally {
  await close();
}
