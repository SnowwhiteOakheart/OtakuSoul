// Reflection failures are visible; imports/restores roll back late SQLite failures.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';
const { browser, mock, home, close } = await launch();
const sql = (statement) => execFileSync('sqlite3', [path.join(home, 'data', 'otakusoul.db'), statement], { encoding: 'utf8' }).trim();
const tab = async (index) => {
  const button = (await browser.$$('button[role="tab"]'))[index];
  await button.scrollIntoView({ block: 'nearest', inline: 'center' });
  await button.click();
};
const counts = () => sql('SELECT json_object(\'diary\', (SELECT COUNT(*) FROM soul_diary), \'memories\', (SELECT COUNT(*) FROM soul_episodic_memory), \'healing\', (SELECT COUNT(*) FROM soul_healing_log));');
const confirmRestore = async () => {
  await browser.$('button[title="Diesen Snapshot wiederherstellen"]').click();
  await browser.$('[aria-labelledby="confirm-dialog-title"] button[data-autofocus]').click();
};
try {
  const open = browser.$('button[aria-label="Kognitives Gedächtnis öffnen"]');
  await open.waitForDisplayed({ timeout: 20_000 });
  await browser.$('button=Bild').click();
  await open.click();
  await browser.$('input[aria-label="Innere Anspannung & Konflikte"]').waitForDisplayed();
  const intensity = Number(sql('SELECT intensity FROM soul_psychology;'));
  sql("UPDATE soul_psychology SET intensity = 'reflection-read-failure';");
  await browser.$('button=Reflexion starten').click();
  await browser.$('p*=Reflexion fehlgeschlagen:').waitForDisplayed();
  await browser.waitUntil(() => browser.$('button=Reflexion starten').isEnabled());
  assert.equal(await browser.$('p*=Reflexion abgeschlossen:').isExisting(), false);
  await browser.saveScreenshot(path.join(screenshotDir, '39-memory-reflexionsfehler.png'));
  sql(`UPDATE soul_psychology SET intensity = ${intensity};`);
  mock.stats.memoryRouterResult = { no_significant_change: true };
  await browser.$('button=Reflexion starten').click();
  await browser.$('p=Reflexion abgeschlossen: keine wesentlichen Änderungen.').waitForDisplayed();
  assert.equal(await browser.$('p*=Reflexion fehlgeschlagen:').isExisting(), false);

  const cid = sql('SELECT character_id FROM chat_sessions LIMIT 1;');
  await tab(6);
  await browser.$('button=Snapshot jetzt anlegen').click();
  await browser.$('p*=Snapshot ').waitForDisplayed();
  const directory = path.join(home, 'data', 'characters', cid, 'backups');
  const filename = readdirSync(directory).find((file) => file.startsWith('backup_'));
  assert.ok(filename);
  const file = path.join(directory, filename);
  const snapshot = JSON.parse(readFileSync(file, 'utf8'));
  snapshot.psychology.psychological_tension = 'Wiederhergestellter Snapshot';
  writeFileSync(file, JSON.stringify(snapshot));
  const beforeRestore = counts();
  const beforeTension = sql('SELECT psychological_tension FROM soul_psychology;');
  const beforeDiary = Number(sql('SELECT COUNT(*) FROM soul_diary;'));
  sql("CREATE TRIGGER test_restore_failure BEFORE INSERT ON soul_healing_log BEGIN SELECT RAISE(ABORT, 'Snapshot-Schreibfehler (Test).'); END;");
  await confirmRestore();
  await browser.$('p*=Wiederherstellung fehlgeschlagen:').waitForDisplayed();
  assert.ok((await browser.$('p*=Wiederherstellung fehlgeschlagen:').getText()).includes('Snapshot-Schreibfehler (Test).'));
  assert.equal(counts(), beforeRestore);
  assert.equal(sql('SELECT psychological_tension FROM soul_psychology;'), beforeTension);
  await browser.saveScreenshot(path.join(screenshotDir, '40-memory-wiederherstellungsfehler.png'));
  sql('DROP TRIGGER test_restore_failure;');
  await confirmRestore();
  await browser.$('p*=wiederhergestellt.').waitForDisplayed();
  assert.equal(sql('SELECT psychological_tension FROM soul_psychology;'), 'Wiederhergestellter Snapshot');
  assert.equal(Number(sql('SELECT COUNT(*) FROM soul_diary;')), beforeDiary + snapshot.diary_entries.length);
  console.log('Memory-Vorgänge: Reflexionsfehler sichtbar und wiederholbar; Snapshot-Wiederherstellung rollt späte Schreibfehler vollständig zurück und besteht beim Wiederholen.');
} catch (error) {
  await browser.saveScreenshot(path.join(screenshotDir, 'memory-operations-fehler.png'));
  throw error;
} finally {
  await close();
}
