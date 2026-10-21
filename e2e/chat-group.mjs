// Gruppen-Chat: Lirwen in Altheas Chat einladen; die Angesprochene antwortet zuerst, die Regie reicht an Althea weiter,
// dann ist der Nutzer dran. Variante bleibt beim Sprecher, „Jetzt antwortet …“ lässt eine Figur gezielt sprechen.
import assert from 'node:assert/strict';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);
const messages = async () => {
  const settings = await invoke('load_settings');
  const [session] = await invoke('list_chat_sessions', { characterId: settings.active_character_id });
  return invoke('get_chat_messages', { chatId: session.id });
};
const idle = () => browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 30_000 });

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  const host = (await invoke('load_settings')).active_character_id;
  const lirwen = (await invoke('scan_characters')).find((c) => c.card.data.name === 'Lirwen');

  // Invite Lirwen from the chat sidebar.
  await browser.$('button[title^="Gespräche, Author"]').click();
  await jsClick(await browser.$('button[role="tab"]=Gruppe'));
  await jsClick(await browser.$('button=Charakter einladen'));
  const picker = await browser.$('[data-guest-picker]');
  await picker.waitForDisplayed({ timeout: 5000 });
  await picker.$('input[type="search"]').setValue('Lirw');
  await jsClick(await picker.$('button*=Lirwen'));
  await browser.$(`[data-guest="${lirwen.id}"]`).waitForDisplayed({ timeout: 5000 });
  await browser.$('[data-guest-avatars]').waitForExist({ timeout: 5000 });
  await jsClick(await browser.$('aside button[aria-label="Schließen"]'));

  // Lirwen is addressed (no routing needed), then the director hands over to Althea, then it is the user's turn.
  const hostName = (await invoke('scan_characters')).find((c) => c.id === host).card.data.name;
  mock.stats.chatRoutes = [hostName];
  const before = mock.stats.chat;
  await input.setValue('Lirwen, was meinst du?');
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat >= before + 2, { timeout: 30_000, timeoutMsg: 'Keine zwei Antworten' });
  await idle();
  await browser.pause(500);
  assert.equal(mock.stats.chat, before + 2, 'Die Runde endet nicht beim Nutzer');
  let stored = await messages();
  const replies = stored.filter((m) => m.role === 'assistant').slice(-2);
  assert.deepEqual(replies.map((m) => m.speaker_id), [lirwen.id, '']);
  assert.ok(mock.stats.lastChatRoutingPrompt.includes('[CHAT — ROUTING]'), 'Regie nicht gefragt');
  assert.ok(mock.stats.lastChatSystemPrompt.includes('## Others in this conversation'), 'Gruppenabschnitt fehlt');
  // The avatar shows who spoke last: Althea, the chat's own character.
  assert.equal(await browser.$('[data-avatar-speaker]').getAttribute('data-avatar-speaker'), 'host');
  await browser.saveScreenshot(path.join(screenshotDir, '104-gruppen-chat.png'));

  // A new variant of Lirwen's reply stays Lirwen's.
  const lirwenReply = replies[0];
  await jsClick(await browser.$(`[data-message-id="${lirwenReply.id}"] button[aria-label="Neu generieren"]`));
  await browser.waitUntil(async () => (await messages()).find((m) => m.id === lirwenReply.id)?.swipes.length === 2,
    { timeout: 20_000, timeoutMsg: 'Keine neue Variante' });
  await idle();
  assert.equal((await messages()).find((m) => m.id === lirwenReply.id).speaker_id, lirwen.id);

  // "Answer now" lets Lirwen speak without a new message.
  const count = (await messages()).length;
  await jsClick(await browser.$('button[aria-label="Lirwen jetzt antworten lassen"]'));
  await browser.waitUntil(async () => (await messages()).length === count + 1, { timeout: 20_000, timeoutMsg: '„Jetzt antwortet“ ohne Antwort' });
  stored = await messages();
  assert.equal(stored.at(-1).speaker_id, lirwen.id);
  assert.equal(stored.at(-2).role, 'assistant', 'Es wurde eine Nutzernachricht angelegt');
  await browser.waitUntil(async () => (await browser.$('[data-avatar-speaker]').getAttribute('data-avatar-speaker')) === lirwen.id,
    { timeout: 5000, timeoutMsg: 'Avatar folgt nicht dem Sprecher' });

  // "Show everyone": all characters as portraits, the last speaker highlighted.
  await jsClick(await browser.$('button[aria-label="Alle zeigen"]'));
  const tiles = await browser.$$('[data-group-portraits] [data-portrait-speaker]');
  assert.equal(tiles.length, 2);
  assert.equal(await browser.$(`[data-portrait-speaker="${lirwen.id}"]`).getAttribute('aria-current'), 'true');
  await browser.saveScreenshot(path.join(screenshotDir, '106-gruppe-alle-zeigen.png'));
  // "Group chat" next to "New chat": a new chat with the invitation already open.
  const chatsBefore = (await invoke('list_chat_sessions', { characterId: host })).length;
  await jsClick(await browser.$('button[title^="Gespräche, Author"]'));
  await jsClick(await browser.$('button[role="tab"]=Chats'));
  await jsClick(await browser.$('button=Gruppenchat'));
  const startPicker = await browser.$('[data-guest-picker]');
  await startPicker.waitForDisplayed({ timeout: 10_000 });
  await jsClick(await startPicker.$('button*=Lirwen'));
  await browser.$(`[data-guest="${lirwen.id}"]`).waitForDisplayed({ timeout: 5000 });
  const sessions = await invoke('list_chat_sessions', { characterId: host });
  assert.equal(sessions.length, chatsBefore + 1, 'Kein neuer Chat angelegt');
  const started = sessions.find((s) => s.title.startsWith('Gruppenchat'));
  assert.ok(started?.title.startsWith('Gruppenchat'), `Titel: ${started?.title}`);
  assert.deepEqual(started.members, [lirwen.id]);
  await browser.saveScreenshot(path.join(screenshotDir, '107-gruppenchat-starten.png'));
  console.log('Gruppen-Chat: Einladen, Ansprache vor Regie, Runde bis zum Nutzer, Variante, „Jetzt antwortet“, Avatare und „Gruppenchat“-Start bestanden.');
} finally {
  await close();
}
