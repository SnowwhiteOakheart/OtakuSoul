// Überholte Erinnerungen: die Reflexion löst eine widerlegte Erinnerung ab. Sie erscheint im
// Gedächtnis durchgestrichen mit Grund, fehlt im nächsten Prompt und lässt sich wiederherstellen.
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
const pageText = () => browser.execute(() => document.body.innerText);

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  const charId = (await invoke('load_settings')).active_character_id;
  // Learned by the model (auto) – a memory the user wrote is only flagged, never retired.
  const id = Number(sql(`INSERT INTO soul_episodic_memory (character_id, category, content, significance, created_at, last_accessed_at, origin)
    VALUES ('${charId}', 'fact', 'User wohnt in München', 3, 1, 1, 'auto') RETURNING id;`));
  const manual = await invoke('add_episodic_memory', { charId, category: 'fact', content: 'User arbeitet in München', significance: 3 });

  const open = await browser.$('button[aria-label="Kognitives Gedächtnis öffnen"]');
  await open.waitForExist({ timeout: 20_000 });
  await jsClick(open);
  await browser.$('button=Reflexion starten').waitForDisplayed({ timeout: 10_000 });
  mock.stats.memoryRouterResult = {
    no_significant_change: false,
    memory_supersede: [{ id, reason: 'User ist nach Hamburg gezogen' }, { id: manual, reason: 'Jobwechsel' }, { id: 99_999, reason: 'erfunden' }],
  };
  await jsClick(await browser.$('button=Reflexion starten'));
  await browser.$('p*=Reflexion abgeschlossen').waitForDisplayed({ timeout: 20_000 });
  const routerPrompt = mock.stats.memoryRequests.at(-1);
  assert.ok(routerPrompt.includes(`#${id} [fact] User wohnt in München`), 'Router sieht die Erinnerung nicht mit ID');

  assert.equal(sql(`SELECT needs_review || '|' || (superseded_at IS NULL) FROM soul_episodic_memory WHERE id = ${manual};`), '1|1', 'Manuelle Erinnerung wurde abgelöst statt markiert');
  await browser.$('p*=2 Widersprüche verarbeitet').waitForExist({ timeout: 5000 }).catch(() => {});
  assert.ok((await pageText()).includes('2 Widersprüche verarbeitet'), 'Widersprüche nicht gezählt');
  await jsClick(await browser.$('button*=Episoden & Themen'));
  await jsClick(await browser.$('label*=Überholte Erinnerungen anzeigen'));
  const outdated = await browser.$('[data-superseded-memory]');
  await outdated.waitForDisplayed({ timeout: 10_000, timeoutMsg: 'Überholte Erinnerung fehlt' });
  const text = await outdated.getText();
  assert.ok(text.includes('User wohnt in München') && text.includes('Überholt: User ist nach Hamburg gezogen'), `Unerwartet: ${text}`);
  assert.ok((await pageText()).includes('Ein neueres Gespräch widerspricht dem („Jobwechsel“). Stimmt es noch?'), 'Prüfhinweis nennt den Widerspruch nicht');
  await browser.saveScreenshot(path.join(screenshotDir, '104-ueberholte-erinnerung.png'));

  // An outdated memory is in no prompt any more.
  await jsClick(await browser.$('button[aria-label="Aktualisieren"] + button[aria-label="Schließen"]'));
  await browser.$('button=Reflexion starten').waitForExist({ reverse: true, timeout: 10_000, timeoutMsg: 'Gedächtnis schließt nicht' });
  const before = mock.stats.chat;
  await browser.$('textarea[aria-label="Nachricht"]').setValue('Weißt du noch, wo ich wohne? München?');
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000 });
  assert.ok(!JSON.stringify(mock.stats.lastChatRequest).includes('User wohnt in München'), 'Überholte Erinnerung landet im Prompt');

  // Taking it back makes it active again.
  await invoke('restore_superseded_memory', { charId, id });
  const active = await invoke('get_cognitive_overview', { charId, userName: 'User' });
  assert.ok(active.recent_memories.some((m) => m.id === id), 'Wiederhergestellte Erinnerung ist nicht aktiv');
  assert.ok(!(await pageText()).includes('erfunden'), 'Erfundene ID wurde verarbeitet');
  console.log('Überholte Erinnerungen: Router mit IDs, Ablösung mit Grund im Gedächtnis, nicht mehr im Prompt, Wiederherstellen bestanden.');
} finally {
  await close();
}
