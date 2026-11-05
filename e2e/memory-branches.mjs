// Zeitreise-Zweige: „Ab hier als neuen Chat fortsetzen“ mit eigenem Gedächtnis. Der Zweig kennt
// nur, was bis zur Abzweigung gelernt wurde, der Drawer zeigt „Gedächtnis dieses Zweigs“, und
// die Hauptlinie bleibt unverändert.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';

const { browser, mock, home, close } = await launch();
const database = path.join(home, 'data', 'otakusoul.db');
const sql = (statement) => execFileSync('sqlite3', [database, statement], { encoding: 'utf8' }).trim();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);
const send = async (text) => {
  const before = mock.stats.chat;
  await browser.$('textarea[aria-label="Nachricht"]').setValue(text);
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000 });
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });
};

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  // The automatic reflection learns nothing here (the memories come from the test).
  mock.stats.memoryRouterResult = { no_significant_change: true };
  await send('Ich liebe Gewitter.');
  await send('Ich ziehe bald nach Kyoto.');
  const { active_character_id: charId } = await invoke('load_settings');
  const [chat] = await invoke('list_chat_sessions', { characterId: charId });
  const messages = await invoke('get_chat_messages', { chatId: chat.id });
  // The mock's canned reply mentions Kyoto too: only the user's messages count.
  const byText = (t) => messages.find((m) => m.role === 'user' && m.content.includes(t)).id;
  await invoke('add_episodic_memory', { charId, category: 'fact', content: 'Kai liebt Gewitter', significance: 5, chatId: chat.id, messageIds: [byText('Gewitter')] });
  await invoke('add_episodic_memory', { charId, category: 'event', content: 'Kai zieht nach Kyoto', significance: 5, chatId: chat.id, messageIds: [byText('Kyoto')] });

  // Branch from the reply after the first message, with a memory of its own.
  const reply = messages[messages.findIndex((m) => m.id === byText('Gewitter')) + 1];
  const message = await browser.$(`div[data-message-id="${reply.id}"]`);
  await jsClick(await message.$('button[aria-label="Ab hier als neuen Chat fortsetzen"]'));
  await jsClick(await browser.$('label*=Eigenes Gedächtnis'));
  await jsClick(await browser.$('button=Ab hier als neuen Chat fortsetzen'));
  await browser.waitUntil(async () => (await browser.$('body').getText()).includes('Was wäre, wenn'), { timeout: 10_000, timeoutMsg: 'Zweig nicht geöffnet' });

  const branch = sql("SELECT memory_branch FROM chat_sessions WHERE memory_branch != '';");
  assert.ok(branch, 'Zweig hat kein eigenes Gedächtnis');
  const scoped = `${charId}@branch-${branch}`;
  assert.equal(sql(`SELECT group_concat(content) FROM soul_episodic_memory WHERE character_id = '${scoped}';`), 'Kai liebt Gewitter');
  assert.equal(sql(`SELECT COUNT(*) FROM soul_episodic_memory WHERE character_id = '${charId}';`), '2', 'Hauptlinie verändert');

  // The reply in the branch uses the branch's memory.
  await send('Was weißt du über mich?');
  const prompt = JSON.stringify(mock.stats.lastChatMessages);
  assert.ok(prompt.includes('Kai liebt Gewitter') && !prompt.includes('Kai zieht nach Kyoto'), 'Prompt nutzt nicht das Gedächtnis des Zweigs');

  await jsClick(await browser.$('button[aria-label="Kognitives Gedächtnis öffnen"]'));
  await browser.$('[data-memory-branch]').waitForDisplayed({ timeout: 10_000 });
  await jsClick(await browser.$('button[role="tab"]*=Episoden'));
  await browser.$('p*=Kai liebt Gewitter').waitForDisplayed({ timeout: 10_000 });
  assert.ok(!(await browser.$('p*=Kai zieht nach Kyoto').isExisting()), 'Späteres Erlebnis im Zweig sichtbar');
  await browser.saveScreenshot(path.join(screenshotDir, '122-gedaechtnis-zweig.png'));
  console.log('Zeitreise-Zweige: eigenes Gedächtnis ab dem Abzweig, Prompt und Drawer bestanden.');
} finally {
  await close();
}
