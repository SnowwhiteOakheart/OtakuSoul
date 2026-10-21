// Off-Screen im Gruppen-Chat: Nach einer langen Pause erzählt die Figur statt eines Traums, was sie inzwischen mit
// einem Gast erlebt hat; beide Figuren behalten das als Erinnerung.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';

const proactive = {
  enabled: true, idle_minutes: 4320, quiet_start_hour: 0, quiet_end_hour: 0, max_per_day: 3, notify: false,
  dreams: true, offscreen: true, muted_character_ids: [], sent: [],
};
const { browser, mock, home, close } = await launch({ proactive });
const database = path.join(home, 'data', 'otakusoul.db');
const sql = (statement) => execFileSync('sqlite3', [database, statement], { encoding: 'utf8' }).trim();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const offscreenInstruction = () => mock.stats.lastChatMessages.find((m) => String(m.content).includes('spent some time together'));

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  const before = mock.stats.chat;
  await input.setValue('Bis morgen, ihr zwei!');
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000 });
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });

  // Sota joins the chat as a guest.
  const { active_character_id: hostId } = await invoke('load_settings');
  const characters = await invoke('scan_characters');
  const guest = characters.find((c) => c.id === 'sota_minase');
  assert.ok(guest, 'Sota fehlt');
  const [session] = await invoke('list_chat_sessions', { characterId: hostId });
  await invoke('set_chat_members', { chatId: session.id, members: [guest.id] });

  sql('UPDATE chat_messages SET created_at = created_at - 36000;');
  mock.stats.chatReply = '*grinst* Sota hat mir heute Nacht beigebracht, wie man einen Speedrun durch die Bibliothek macht …';
  const startedWith = mock.stats.chat;
  await browser.execute(() => window.location.reload());
  await input.waitForDisplayed({ timeout: 30_000 });

  await browser.waitUntil(() => mock.stats.chat > startedWith && Boolean(offscreenInstruction()), { timeout: 60_000, timeoutMsg: 'Keine Off-Screen-Erzählung' });
  const instruction = String(offscreenInstruction().content);
  assert.ok(instruction.includes('and Sota Minase ('), `Gast fehlt in der Anweisung: ${instruction}`);
  assert.ok(!JSON.stringify(mock.stats.lastChatMessages).includes('about a dream'), 'Traum statt Off-Screen');
  await browser.waitUntil(() => browser.execute(() => document.body.innerText.includes('Speedrun durch die Bibliothek')),
    { timeout: 20_000, timeoutMsg: 'Erzählung fehlt im Chat' });

  // Both remember it.
  const remembers = async (id, other) => (await invoke('search_episodic_memories', { charId: id, query: 'Speedrun Bibliothek' }))
    .some((m) => m.content.includes(other) && m.content.includes('Speedrun'));
  const hostName = characters.find((c) => c.id === hostId).card.data.name;
  await browser.waitUntil(async () => (await remembers(hostId, 'Sota')) && (await remembers(guest.id, hostName)),
    { timeout: 10_000, timeoutMsg: 'Erinnerung fehlt bei einer der beiden Figuren' });
  await browser.saveScreenshot(path.join(screenshotDir, '127-off-screen.png'));
  console.log('Off-Screen: Erzählung mit dem Gast statt Traum, Erinnerung bei beiden Figuren bestanden.');
} finally {
  await close();
}
