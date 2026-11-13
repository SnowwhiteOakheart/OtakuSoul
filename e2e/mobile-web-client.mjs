// Mobiler Web-Client: Nachrichten, Bilder und Befehle vom Handy laufen durch den Chat des
// Hauptfensters; Verlauf, Live-Text, Bilder, Auswahl und Porträt kommen über den WebSocket zurück.
import assert from 'node:assert/strict';
import { launch } from './harness.mjs';

const { browser, mock, close } = await launch({});
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const port = 18_000 + Math.floor(Math.random() * 1000);
  const config = await invoke('get_web_server_config');
  await invoke('save_web_server_config', { config: { ...config, host: '127.0.0.1', port } });
  await invoke('start_web_server');
  const status = await invoke('get_web_server_status');
  const { auth_token: token } = status;
  assert.ok(Array.isArray(status.addresses), 'Adressliste fehlt');
  const base = `http://127.0.0.1:${port}`;
  await browser.waitUntil(async () => (await fetch(`${base}/`).catch(() => null))?.ok, { timeout: 10_000, timeoutMsg: 'Server nicht erreichbar' });

  // A port in use is an error at start, not a server that only looks like it runs.
  await invoke('stop_web_server');
  const blocker = (await import('node:net')).createServer();
  await new Promise((resolve) => blocker.listen(port, '127.0.0.1', resolve));
  let bindError = '';
  try {
    await invoke('start_web_server');
  } catch (e) {
    bindError = String(e?.message ?? e);
  }
  assert.ok(!(await invoke('get_web_server_status')).is_running, `Server meldet trotz belegtem Port „läuft“ (${bindError})`);
  await new Promise((resolve) => blocker.close(resolve));
  await invoke('start_web_server');
  await browser.waitUntil(async () => (await fetch(`${base}/`).catch(() => null))?.ok, { timeout: 10_000, timeoutMsg: 'Server nach Neustart nicht erreichbar' });

  // Auth and input checks.
  assert.equal((await fetch(`${base}/api/status`)).status, 401, 'Status ohne Token');
  const headers = { 'Content-Type': 'application/json', 'X-Otaku-Token': token };
  const post = (message, extra = {}, h = headers) =>
    fetch(`${base}/api/chat`, { method: 'POST', headers: h, body: JSON.stringify({ message, ...extra }) });
  const command = (body) => fetch(`${base}/api/command`, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal((await post('hi', {}, { 'Content-Type': 'application/json' })).status, 401, 'Chat ohne Token');
  assert.equal((await post('   ')).status, 400, 'Leere Nachricht');
  assert.equal((await post('x'.repeat(8001))).status, 413, 'Zu lange Nachricht');
  assert.equal((await post('', { image: 'data:image/svg+xml;base64,PHN2Zz4=' })).status, 415, 'SVG angenommen');
  assert.equal((await command({ action: 'deleteEverything' })).status, 400, 'Unbekannter Befehl angenommen');
  const page = await (await fetch(`${base}/`)).text();
  assert.ok(page.includes('/api/ws') && page.includes('/api/command'), 'Seite fehlt');

  // WebSocket: state, menu, history.
  const messages = [];
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/ws?token=${token}`);
  socket.onmessage = (e) => messages.push(JSON.parse(e.data));
  const latest = (type) => messages.findLast((m) => m.type === type);
  const last = () => latest('history')?.messages ?? [];
  const waitFor = (check, what, timeout = 30_000) => browser.waitUntil(check, {
    timeout,
    timeoutMsg: `${what}: ${JSON.stringify(messages.slice(-6).map((m) => ({ ...m, portrait: undefined })))}`,
  });
  await waitFor(() => latest('state')?.characterName, 'Kein Zustand', 10_000);
  // A message while the chat is still loading is refused with "busy": wait until the greeting is in.
  await waitFor(() => last().length > 0, 'Chat nicht geladen');
  await waitFor(() => latest('catalog')?.chats?.length > 0 && latest('catalog')?.characters?.length > 0, 'Keine Auswahl');
  const firstChat = latest('catalog').chatId;
  assert.ok(firstChat, 'Offener Chat fehlt in der Auswahl');

  // A message from the phone goes through the desktop chat.
  mock.stats.chatReply = 'Antwort fürs Handy.';
  assert.equal((await post('Hallo vom Handy')).status, 202);
  await waitFor(() => last().some((m) => m.role === 'assistant' && m.text.includes('Antwort fürs Handy')), 'Antwort kam nicht an');
  assert.ok(last().some((m) => m.role === 'user' && m.text === 'Hallo vom Handy' && m.id), 'Eigene Nachricht ohne ID');
  assert.ok((await browser.execute(() => document.body.innerText)).includes('Hallo vom Handy'), 'Nachricht fehlt am Desktop');

  // A picture from the phone is stored in the chat and can be loaded back, but only with the token
  // and only while it is in the history.
  mock.stats.chatReply = 'Schönes Bild.';
  assert.equal((await post('Schau mal', { image: PNG })).status, 202);
  await waitFor(() => last().some((m) => m.role === 'user' && m.images?.length), 'Bild kam nicht im Verlauf an');
  const { file } = last().findLast((m) => m.images?.length).images[0];
  const picture = await fetch(`${base}/api/attachment?file=${encodeURIComponent(file)}`, { headers: { 'X-Otaku-Token': token } });
  assert.equal(picture.status, 200, 'Bild nicht abrufbar');
  assert.equal(picture.headers.get('content-type'), 'image/png');
  assert.equal((await fetch(`${base}/api/attachment?file=${encodeURIComponent(file)}`)).status, 401, 'Bild ohne Token');
  assert.equal((await fetch(`${base}/api/attachment?file=x%2Fy.png`, { headers: { 'X-Otaku-Token': token } })).status, 404, 'Fremde Datei');
  await waitFor(() => last().some((m) => m.role === 'assistant' && m.text.includes('Schönes Bild')), 'Antwort aufs Bild fehlt');

  // New variant, back to the first one, edit.
  let reply = last().findLast((m) => m.role === 'assistant');
  mock.stats.chatReply = 'Zweite Fassung.';
  assert.equal((await command({ action: 'regenerate', id: reply.id })).status, 202);
  await waitFor(() => last().some((m) => m.id === reply.id && m.swipes === 2 && m.text.includes('Zweite Fassung')), 'Neue Variante fehlt');
  await command({ action: 'swipe', id: reply.id, index: 0 });
  await waitFor(() => last().some((m) => m.id === reply.id && m.swipe === 0 && m.text.includes('Schönes Bild')), 'Variantenwechsel fehlt');
  const own = last().findLast((m) => m.role === 'user');
  await command({ action: 'edit', id: own.id, text: 'Schau mal, geändert' });
  await waitFor(() => last().some((m) => m.id === own.id && m.text === 'Schau mal, geändert'), 'Bearbeiten fehlt');
  await command({ action: 'regenerate', id: 'gibt-es-nicht' });
  await waitFor(() => latest('notice')?.code === 'notFound', 'Kein Hinweis bei unbekannter Nachricht', 10_000);

  // Live text while the reply is written, then stop from the phone.
  mock.stats.chatReply = 'Es war einmal ein langer Satz, der nie zu Ende geschrieben wird, weil jemand stoppt.';
  mock.stats.chatChunkSize = 8;
  mock.stats.stallChatAfter = 3;
  assert.equal((await post('Erzähl was')).status, 202);
  await waitFor(() => latest('stream')?.text?.startsWith('Es war'), 'Kein Live-Text');
  assert.equal(latest('state').thinking, true);
  assert.equal((await post('Noch was')).status, 202);
  await waitFor(() => latest('notice')?.code === 'busy', 'Kein „busy“ während der Antwort', 10_000);
  await command({ action: 'stop' });
  await waitFor(() => latest('state')?.thinking === false, 'Stopp vom Handy wirkt nicht');
  delete mock.stats.stallChatAfter;
  delete mock.stats.chatChunkSize;

  // New chat and back.
  await command({ action: 'newChat' });
  await waitFor(() => latest('catalog')?.chatId && latest('catalog').chatId !== firstChat, 'Neuer Chat nicht geöffnet');
  await command({ action: 'openChat', id: firstChat });
  await waitFor(() => latest('catalog')?.chatId === firstChat && last().some((m) => m.text === 'Schau mal, geändert'), 'Zurück zum Chat fehlt');

  // Another character, if there is one, and back.
  const { characters, characterId } = latest('catalog');
  const other = characters.find((c) => c.id !== characterId);
  if (other) {
    await command({ action: 'openCharacter', id: other.id });
    await waitFor(() => latest('catalog')?.characterId === other.id && latest('state')?.characterName === other.name, 'Figurenwechsel fehlt');
    await command({ action: 'openCharacter', id: characterId });
    await waitFor(() => latest('catalog')?.characterId === characterId, 'Zurück zur Figur fehlt');
  }

  // The card's picture comes as a small data URL (in the app it is an asset URL the phone cannot load).
  await waitFor(() => messages.some((m) => m.type === 'state' && m.portrait?.startsWith('data:image/')), 'Porträt kam nicht als data:image an', 15_000);
  const portrait = messages.findLast((m) => m.type === 'state' && m.portrait)?.portrait ?? '';
  assert.ok(portrait.length < 200_000, `Porträt zu groß: ${portrait.length} Zeichen`);

  // The overlay has its own read-only token: it opens the overlay feed and nothing else, and the
  // phone's token does not open the overlay feed.
  const { overlay_token: overlayToken } = await invoke('get_web_server_status');
  assert.ok(overlayToken && overlayToken !== token, 'Kein eigenes Overlay-Token');
  assert.equal((await fetch(`${base}/api/status`, { headers: { 'X-Otaku-Token': overlayToken } })).status, 401, 'Overlay-Token öffnet den Status');
  assert.equal((await post('vom Overlay', {}, { 'Content-Type': 'application/json', 'X-Otaku-Token': overlayToken })).status, 401, 'Overlay-Token darf schreiben');
  const opens = (url) => new Promise((resolve) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => resolve(null);
  });
  assert.equal(await opens(`ws://127.0.0.1:${port}/api/ws?token=${overlayToken}`), null, 'Overlay-Token öffnet den Chat-Feed');
  assert.equal(await opens(`ws://127.0.0.1:${port}/api/overlay-ws?token=${token}`), null, 'Handy-Token öffnet das Overlay');
  const overlay = await opens(`ws://127.0.0.1:${port}/api/overlay-ws?token=${overlayToken}`);
  assert.ok(overlay, 'Overlay-Token öffnet das Overlay nicht');
  let overlayClosed = false;
  overlay.onclose = () => { overlayClosed = true; };
  // A new overlay token cuts off the overlay, the phone stays connected.
  await invoke('regenerate_overlay_token');
  await browser.waitUntil(() => overlayClosed, { timeout: 10_000, timeoutMsg: 'Overlay blieb nach neuem Overlay-Token offen' });
  assert.equal(socket.readyState, WebSocket.OPEN, 'Handy wurde vom neuen Overlay-Token getrennt');

  // A new token ends the open connection; the old one no longer works.
  let closed = false;
  socket.onclose = () => { closed = true; };
  await invoke('regenerate_web_server_token');
  await browser.waitUntil(() => closed, { timeout: 10_000, timeoutMsg: 'Verbindung blieb nach neuem Token offen' });
  assert.equal((await post('noch da?')).status, 401, 'Altes Token gilt noch');

  await invoke('stop_web_server');
  console.log('Mobiler Web-Client: Chat, Bilder, Live-Text, Stopp, Varianten, Bearbeiten, Chat-/Figurenwechsel, Porträt, Tokens, Port-Fehler.');
} finally {
  await close();
}
