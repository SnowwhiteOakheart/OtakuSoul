// Beziehungs-Atlas: Überzeugungen oben, Erlebnisse auf der Zeitachse; eine passende
// Erinnerung ist mit der Überzeugung verbunden, ein Klick zeigt Text und Verbindungen.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.waitUntil(async () => !!(await invoke('load_settings')).active_character_id, { timeout: 30_000 });
  const charId = (await invoke('load_settings')).active_character_id;
  const overview = await invoke('get_cognitive_overview', { charId, userName: 'User' });
  await invoke('update_psychology', { charId, psychology: { ...overview.psychology, core_identity: ['Hat Angst vor Gewitter'] } });
  await invoke('add_episodic_memory', { charId, category: 'event', content: 'Das Gewitter am See hat mich erschreckt', significance: 4, chatId: null, messageIds: null });
  await invoke('add_episodic_memory', { charId, category: 'fact', content: 'Sammelt gern Muscheln', significance: 2, chatId: null, messageIds: null });
  await invoke('add_diary_entry', { charId, title: 'Abend', entryText: 'Das Gewitter geht mir nicht aus dem Kopf.', mood: 'Anxious' });

  const open = await browser.$('button[aria-label="Kognitives Gedächtnis öffnen"]');
  await open.waitForExist({ timeout: 20_000 });
  await jsClick(open);
  await jsClick(await browser.$('button[role="tab"]=Atlas'));
  // Psyche, two experiences, the diary entry and the default goal.
  await browser.waitUntil(async () => (await browser.$$('[data-atlas-node]')).length >= 4, {
    timeout: 15_000, timeoutMsg: 'Zu wenige Punkte im Atlas',
  });

  // An SVG group has no click(); a dispatched click reaches React the same way.
  await browser.execute((el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true })), await browser.$('[data-atlas-node="identity:0"]'));
  const detail = await browser.$('[data-atlas-detail]');
  await detail.waitForDisplayed({ timeout: 5000 });
  const text = await detail.getText();
  assert.ok(text.includes('Hat Angst vor Gewitter') && text.includes('Geprägt durch:') && text.includes('Das Gewitter am See'), `Verbindung fehlt: ${text}`);
  assert.ok(!text.includes('Muscheln'), 'Unpassende Erinnerung verbunden');
  await browser.saveScreenshot(path.join(screenshotDir, '120-gedaechtnis-atlas.png'));
  console.log('Atlas: Überzeugung mit passendem Erlebnis verbunden, Details per Klick bestanden.');
} finally {
  await close();
}
