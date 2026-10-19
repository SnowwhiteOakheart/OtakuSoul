// Gedächtnis aufräumen: das Modell schlägt eine Gruppe vor; Verwerfen ändert nichts, Übernehmen
// fasst zusammen und löst die alten Erinnerungen ab (wiederherstellbar). Angepinnte sieht es nie.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, home, close } = await launch();
const database = path.join(home, 'data', 'otakusoul.db');
const sql = (statement) => execFileSync('sqlite3', [database, statement], { encoding: 'utf8' }).trim();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);
const active = () => sql('SELECT COUNT(*) FROM soul_episodic_memory WHERE superseded_at IS NULL;');

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const charId = (await invoke('load_settings')).active_character_id;
  const insert = (content, pinned = 0) => Number(sql(`INSERT INTO soul_episodic_memory (character_id, category, content, significance, created_at, last_accessed_at, origin, pinned)
    VALUES ('${charId}', 'fact', '${content}', 3, 1, 1, 'auto', ${pinned}) RETURNING id;`));
  const a = insert('User mag Grüntee');
  const b = insert('User trinkt abends Jasmintee');
  insert('Geheimes Passwort ist Mondlicht', 1);
  const before = active();

  const open = await browser.$('button[aria-label="Kognitives Gedächtnis öffnen"]');
  await open.waitForExist({ timeout: 20_000 });
  await jsClick(open);
  await jsClick(await browser.$('button*=Episoden & Themen'));
  mock.stats.cleanupResult = { groups: [{ memory_ids: [a, b, 99_999], category: 'fact', title: 'Tee', summary: 'User trinkt gern Tee: tagsüber Grüntee, abends Jasmintee' }] };

  const cleanup = await browser.$('button=Gedächtnis aufräumen');
  await cleanup.waitForDisplayed({ timeout: 10_000 });
  await jsClick(cleanup);
  const proposal = await browser.$('[data-cleanup-proposal]');
  await proposal.waitForDisplayed({ timeout: 20_000, timeoutMsg: 'Kein Aufräum-Vorschlag' });
  const sent = JSON.stringify(mock.stats.lastCleanupMessages);
  assert.ok(sent.includes(`#${a} [fact] User mag Grüntee`), 'Modell sieht die Erinnerungen nicht');
  assert.ok(!sent.includes('Mondlicht'), 'Angepinnte Erinnerung geht ans Modell');
  assert.equal(active(), before, 'Vorschlag hat schon etwas geändert');
  await browser.saveScreenshot(path.join(screenshotDir, '106-gedaechtnis-aufraeumen.png'));

  await jsClick(await proposal.$('button=Verwerfen'));
  await proposal.waitForExist({ reverse: true, timeout: 5000 });
  assert.equal(active(), before, 'Verwerfen hat etwas geändert');

  await jsClick(await browser.$('button=Gedächtnis aufräumen'));
  await browser.$('[data-cleanup-proposal]').waitForDisplayed({ timeout: 20_000 });
  await jsClick(await (await browser.$('[data-cleanup-proposal]')).$('button*=Übernehmen'));
  await browser.$('[data-cleanup-proposal]').waitForExist({ reverse: true, timeout: 10_000, timeoutMsg: 'Übernehmen schließt den Vorschlag nicht' });
  const summary = sql("SELECT id FROM soul_episodic_memory WHERE content = 'User trinkt gern Tee: tagsüber Grüntee, abends Jasmintee' AND superseded_at IS NULL;");
  assert.ok(summary, 'Zusammenfassung fehlt');
  assert.equal(sql(`SELECT COUNT(*) FROM soul_episodic_memory WHERE superseded_by = ${summary};`), '2', 'Alte Erinnerungen nicht abgelöst');
  assert.equal(Number(active()), Number(before) - 1);
  console.log('Gedächtnis aufräumen: Vorschlag ohne Änderung, Verwerfen, Übernehmen mit Ablösung, Angepinntes geschützt bestanden.');
} finally {
  await close();
}
