// Erinnerungen nach Relevanz: eine alte, passende Erinnerung kommt hinter dem Verlauf in den Prompt,
// obwohl viele neuere wichtiger sind; die Kern-Erinnerungen im System-Prompt bleiben dabei gleich. Das Suchfeld im
// Gedächtnis findet sie über einen Wortteil.
import assert from 'node:assert/strict';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch();
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
// After the history: a trailing system message, or appended to the last user message.
// The memory part of the system prompt (lorebook hits there change with the topic on their own).
const coreMemories = () => (mock.stats.lastChatSystemPrompt.split('### Long-Term Memories')[1] ?? '').split('\n## ')[0];
const afterHistory = () => String(mock.stats.lastChatMessages.at(-1)?.content ?? '');

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  const charId = (await invoke('load_settings')).active_character_id;
  await invoke('add_episodic_memory', { charId, category: 'fact', content: 'Ihr Lieblingstee ist Jasmintee', significance: 2 });
  for (let i = 0; i < 20; i += 1) {
    await invoke('add_episodic_memory', { charId, category: 'event', content: `Spaziergang am Fluss Nummer ${i}`, significance: 5 });
  }

  await send('Welchen Tee magst du eigentlich?');
  const firstSystem = mock.stats.lastChatSystemPrompt;
  const firstCore = coreMemories();
  assert.ok(firstCore.includes('Spaziergang am Fluss'), 'Kern-Erinnerungen fehlen im System-Prompt');
  assert.ok(afterHistory().includes('Ihr Lieblingstee ist Jasmintee'), `Passende Erinnerung fehlt hinter dem Verlauf: ${afterHistory()}`);
  assert.ok(!firstSystem.includes('Jasmintee'), 'Passende Erinnerung gehört nicht in den System-Prompt');

  // The query covers the last two user messages: after two others the tea is no longer asked about.
  await send('Wollen wir an den Fluss gehen?');
  await send('Am Fluss ist es so schön ruhig.');
  assert.ok(!afterHistory().includes('Jasmintee'), 'Unpassende Erinnerung bleibt drin');
  assert.equal(coreMemories(), firstCore, 'Kern-Erinnerungen im System-Prompt ändern sich mit dem Gespräch');

  await jsClick(await browser.$('button[aria-label="Kognitives Gedächtnis öffnen"]'));
  await jsClick(await browser.$('button*=Episoden & Themen'));
  const search = await browser.$('input[aria-label="Erinnerungen durchsuchen"]');
  await search.waitForDisplayed({ timeout: 10_000 });
  await search.setValue('jasmin');
  const pageText = () => browser.execute(() => document.body.innerText);
  await browser.waitUntil(async () => (await pageText()).includes('Ihr Lieblingstee ist Jasmintee'), { timeout: 10_000, timeoutMsg: 'Suche findet die Erinnerung nicht' });
  assert.ok(!(await pageText()).includes('Spaziergang am Fluss Nummer 3'), 'Suche zeigt unpassende Erinnerungen');
  await browser.saveScreenshot(path.join(screenshotDir, '103-erinnerungen-suchen.png'));
  console.log('Relevanz-Abruf: passende Erinnerung hinter dem Verlauf, Kern im System-Prompt stabil, Suche im Gedächtnis bestanden.');
} finally {
  await close();
}
