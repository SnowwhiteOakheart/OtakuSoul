// Figuren melden sich von selbst: Nach einer Pause greift die Figur des offenen Chats ein fälliges
// Vorhaben auf, ohne dass der Nutzer schreibt; die Nachricht steht im Chat und wird vermerkt, und
// die Figur schreibt nicht noch einmal, bevor der Nutzer antwortet. Einstellungen und Chat-Menü
// zeigen die Schalter.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';

const proactive = {
  enabled: true, idle_minutes: 240, quiet_start_hour: 0, quiet_end_hour: 0, max_per_day: 2, notify: false,
  muted_character_ids: [], sent: [],
};
const { browser, mock, home, close } = await launch({ proactive });
const database = path.join(home, 'data', 'otakusoul.db');
const sql = (statement) => execFileSync('sqlite3', [database, statement], { encoding: 'utf8' }).trim();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);
const ownInstruction = () => mock.stats.lastChatMessages.find((m) => String(m.content).includes('on their own initiative'));

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  const before = mock.stats.chat;
  await input.setValue('Morgen früh habe ich mein Vorstellungsgespräch.');
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000 });
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });

  // The conversation was a day ago, and the interview is due now.
  sql('UPDATE chat_messages SET created_at = created_at - 86400;');
  const settings = await invoke('load_settings');
  const charId = settings.active_character_id;
  const intentionId = await invoke('add_intention', {
    charId, userName: 'User',
    draft: { title: 'Vorstellungsgespräch', details: 'um 9 Uhr', initiator: 'user', time_basis: 'real', due_at: Math.floor(Date.now() / 1000) - 600, due_has_time: true },
  });
  mock.stats.chatReply = '*schreibt dir* Und? Wie lief dein Vorstellungsgespräch?';
  const writtenBefore = mock.stats.chat;
  await browser.execute(() => window.location.reload());
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });

  // The first check runs 15 s after the start.
  await browser.waitUntil(() => mock.stats.chat > writtenBefore && Boolean(ownInstruction()), { timeout: 60_000, timeoutMsg: 'Die Figur meldet sich nicht von selbst' });
  const instruction = String(ownInstruction().content);
  assert.ok(instruction.includes('"Vorstellungsgespräch" (um 9 Uhr) is due now'), `Vorhaben fehlt in der Anweisung: ${instruction}`);
  await browser.waitUntil(() => browser.execute(() => document.body.innerText.includes('Wie lief dein Vorstellungsgespräch')),
    { timeout: 20_000, timeoutMsg: 'Nachricht fehlt im Chat' });
  await browser.waitUntil(async () => (await invoke('load_settings')).proactive.sent.length === 1, { timeout: 10_000, timeoutMsg: 'Nachricht nicht vermerkt' });
  const [sent] = (await invoke('load_settings')).proactive.sent;
  assert.equal(sent.intention_id, intentionId, 'Vorhaben nicht vermerkt');
  assert.equal(sql(`SELECT role FROM chat_messages WHERE id = '${sent.message_id}';`), 'assistant');
  await browser.saveScreenshot(path.join(screenshotDir, '120-von-selbst-gemeldet.png'));

  // Unanswered: no second message, even though the pause is long enough.
  sql('UPDATE chat_messages SET created_at = created_at - 86400;');
  const afterFirst = mock.stats.chat;
  await browser.execute(() => window.location.reload());
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.pause(25_000);
  assert.equal(mock.stats.chat, afterFirst, 'Figur schreibt erneut, bevor der Nutzer antwortet');

  // The chat menu can mute this character; the settings show the details.
  await jsClick(await browser.$('button[aria-label="Weitere Chat-Aktionen"]'));
  await jsClick(await browser.$('button*=Nicht von selbst melden'));
  await browser.waitUntil(async () => (await invoke('load_settings')).proactive.muted_character_ids.includes(charId), { timeout: 10_000, timeoutMsg: 'Stummschalten nicht gespeichert' });
  await jsClick(await browser.$('button=Einstellungen'));
  const section = await browser.$('#setting-proactive');
  await section.waitForExist({ timeout: 15_000 });
  await section.scrollIntoView();
  await browser.$('#setting-proactive-pause').waitForDisplayed({ timeout: 10_000 });
  await browser.saveScreenshot(path.join(screenshotDir, '121-von-selbst-einstellungen.png'));
  console.log('Von selbst melden: fälliges Vorhaben aufgegriffen, vermerkt, keine zweite Nachricht ohne Antwort, Stummschalten und Einstellungen bestanden.');
} finally {
  await close();
}
