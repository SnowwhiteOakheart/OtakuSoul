// Overview and snapshot read failures preserve cached data and can be retried.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';
const { browser, home, close } = await launch();
const sql = (statement) => execFileSync('sqlite3', [path.join(home, 'data', 'otakusoul.db'), statement], { encoding: 'utf8' }).trim();
const selectTab = async (index) => {
  const button = (await browser.$$('button[role="tab"]'))[index];
  await button.scrollIntoView({ block: 'nearest', inline: 'center' });
  await button.click();
};
try {
  const open = browser.$('button[aria-label="Kognitives Gedächtnis öffnen"]');
  await open.waitForDisplayed({ timeout: 20_000 });
  await browser.$('button=Bild').click();
  await open.click();
  const tension = browser.$('input[aria-label="Innere Anspannung & Konflikte"]');
  await tension.waitForDisplayed();
  await tension.addValue(' Entwurf am See');
  const draft = await tension.getValue();
  const originalIntensity = Number(sql('SELECT intensity FROM soul_psychology;'));
  sql("UPDATE soul_psychology SET intensity = 'test-overview-read-failure';");
  await browser.$('button[aria-label="Aktualisieren"]').click();
  const overviewError = browser.$('[role="alert"]*=Übersicht konnte nicht geladen werden:');
  await overviewError.waitForDisplayed();
  assert.ok((await overviewError.getText()).includes('intensity'));
  assert.equal(await tension.getValue(), draft);
  await browser.saveScreenshot(path.join(screenshotDir, '37-memory-uebersicht-ladefehler.png'));

  // A completed write is still successful when the following overview read fails.
  await selectTab(3);
  const memory = browser.$('input[aria-label="Neues Wissen / Notiz manuell hinzufügen"]');
  await memory.addValue('Wir trafen uns am See trotz Lesefehler.');
  await browser.$('button=Speichern').click();
  await browser.$('p=Erinnerung gespeichert.').waitForDisplayed();
  assert.equal(await memory.getValue(), '');
  assert.equal(Number(sql("SELECT COUNT(*) FROM soul_episodic_memory WHERE content = 'Wir trafen uns am See trotz Lesefehler.';")), 1);
  assert.equal(await browser.$('div=Noch keine episodischen Erinnerungen gespeichert.').isExisting(), false);
  sql(`UPDATE soul_psychology SET intensity = ${originalIntensity};`);
  await browser.$('button=Übersicht erneut laden').click();
  await overviewError.waitForExist({ reverse: true });
  await browser.$('p=Wir trafen uns am See trotz Lesefehler.').waitForDisplayed();
  await selectTab(0);
  assert.equal(await tension.getValue(), draft);

  await selectTab(6);
  await browser.$('button=Snapshot jetzt anlegen').click();
  await browser.$('p*=Snapshot ').waitForDisplayed();
  const cid = sql('SELECT character_id FROM chat_sessions LIMIT 1;');
  const directory = path.join(home, 'data', 'characters', cid, 'backups');
  const filename = readdirSync(directory).find((file) => file.startsWith('backup_'));
  assert.ok(filename);
  await browser.$(`div=${filename}`).waitForDisplayed();
  renameSync(directory, `${directory}-held`);
  writeFileSync(directory, 'not a directory');
  await browser.$('button=Snapshot-Liste neu laden').click();
  const backupsError = browser.$('[role="alert"]*=Snapshot-Liste konnte nicht geladen werden:');
  await backupsError.waitForDisplayed();
  assert.equal(await browser.$(`div=${filename}`).isDisplayed(), true);
  await browser.saveScreenshot(path.join(screenshotDir, '38-memory-snapshot-ladefehler.png'));
  unlinkSync(directory);
  renameSync(`${directory}-held`, directory);
  await browser.$('button=Snapshot-Liste neu laden').click();
  await backupsError.waitForExist({ reverse: true });
  assert.equal(await browser.$(`div=${filename}`).isDisplayed(), true);
  console.log('Memory-Lesefehler: Übersicht und Snapshots zeigen Ursachen, behalten Daten/Entwürfe und laden beim Wiederholen; erfolgreiche Schreibvorgänge bleiben erfolgreich.');
} catch (error) {
  await browser.saveScreenshot(path.join(screenshotDir, 'memory-read-errors-fehler.png'));
  throw error;
} finally {
  await close();
}
