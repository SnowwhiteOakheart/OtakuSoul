// Mobiler Web-Client: eine Nachricht vom Handy läuft durch den Chat des Hauptfensters, Antwort und Verlauf kommen über den WebSocket zurück.
import assert from 'node:assert/strict';
import { launch } from './harness.mjs';

const { browser, mock, close } = await launch({});
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const port = 18_000 + Math.floor(Math.random() * 1000);
  const config = await invoke('get_web_server_config');
  await invoke('save_web_server_config', { config: { ...config, host: '127.0.0.1', port } });
  await invoke('start_web_server');
  const { auth_token: token } = await invoke('get_web_server_status');
  const base = `http://127.0.0.1:${port}`;
  await browser.waitUntil(async () => (await fetch(`${base}/`).catch(() => null))?.ok, { timeout: 10_000, timeoutMsg: 'Server nicht erreichbar' });

  // Auth and input checks.
  assert.equal((await fetch(`${base}/api/status`)).status, 401, 'Status ohne Token');
  const post = (message, headers = { 'X-Otaku-Token': token }) =>
    fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ message }) });
  assert.equal((await post('hi', {})).status, 401, 'Chat ohne Token');
  assert.equal((await post('   ')).status, 400, 'Leere Nachricht');
  assert.equal((await post('x'.repeat(8001))).status, 413, 'Zu lange Nachricht');
  const page = await (await fetch(`${base}/`)).text();
  assert.ok(page.includes('/api/ws') && !page.includes('Fantasie'), 'Seite fehlt');

  // WebSocket: first state, then history.
  const messages = [];
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/ws?token=${token}`);
  socket.onmessage = (e) => messages.push(JSON.parse(e.data));
  await browser.waitUntil(() => messages.some((m) => m.type === 'state'), { timeout: 10_000, timeoutMsg: 'Kein Zustand' });
  const state = messages.find((m) => m.type === 'state');
  assert.ok(state.characterName, 'Figurenname fehlt');

  // A message while the chat is still loading is refused with "busy": wait until the greeting is in.
  const last = () => [...messages].reverse().find((m) => m.type === 'history')?.messages ?? [];
  await browser.waitUntil(() => last().length > 0, { timeout: 30_000, timeoutMsg: 'Chat nicht geladen' });

  mock.stats.chatReply = 'Antwort fürs Handy.';
  const sent = await post('Hallo vom Handy');
  assert.equal(sent.status, 202);
  const dump = async () => (await browser.execute(() => document.body.innerText)).slice(-300);
  try {
    await browser.waitUntil(() => last().some((m) => m.role === 'assistant' && m.text.includes('Antwort fürs Handy')), { timeout: 30_000 });
  } catch {
    throw new Error(`Antwort kam nicht beim Handy an: ${JSON.stringify(messages.map((m) => ({ ...m, portrait: undefined })))} | ${await dump()}`);
  }
  assert.ok(last().some((m) => m.role === 'user' && m.text === 'Hallo vom Handy'));

  // The same message is in the desktop chat.
  const desktop = await browser.execute(() => document.body.innerText);
  assert.ok(desktop.includes('Hallo vom Handy'), 'Nachricht fehlt am Desktop');

  socket.close();
  await invoke('stop_web_server');
  console.log('Mobiler Web-Client: Auth, Chat vom Handy, Antwort und Verlauf über WebSocket.');
} finally {
  await close();
}
