// A failed write keeps the form draft; retry stores it once and only then reports success.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, home, close } = await launch();
const database = path.join(home, 'data', 'otakusoul.db');
const sql = (statement) => execFileSync('sqlite3', [database, statement], { encoding: 'utf8' }).trim();
try {
  await browser.$('button[aria-label="Kognitiven Seelenspeicher öffnen"]').waitForDisplayed({ timeout: 20_000 });
  await browser.$('button[aria-label="Kognitiven Seelenspeicher öffnen"]').click();
  const memoryTab = browser.$('button*=Episoden & Themen');
  await memoryTab.scrollIntoView({ block: 'nearest', inline: 'center' });
  await memoryTab.click();

  // Fail real SQLite writes in the disposable profile, without changing production IPC.
  sql("CREATE TRIGGER test_memory_failure BEFORE INSERT ON soul_episodic_memory BEGIN SELECT RAISE(ABORT, 'Memory-Schreibfehler (Test).'); END;");
  sql("CREATE TRIGGER test_diary_failure BEFORE INSERT ON soul_diary BEGIN SELECT RAISE(ABORT, 'Tagebuch-Schreibfehler (Test).'); END;");

  const memory = browser.$('input[aria-label="Neues Wissen / Notiz manuell hinzufügen"]');
  await memory.setValue('Unser Versprechen am See.');
  await browser.$('button=Speichern').click();
  await browser.$('p*=Memory-Schreibfehler (Test).').waitForDisplayed();
  assert.equal(await memory.getValue(), 'Unser Versprechen am See.');
  assert.equal(await browser.$('p=Erinnerung gespeichert.').isExisting(), false);
  assert.equal(sql('SELECT count(*) FROM soul_episodic_memory;'), '0');
  await browser.saveScreenshot(path.join(screenshotDir, '29-erinnerung-speicherfehler.png'));

  sql('DROP TRIGGER test_memory_failure;');
  await browser.$('button=Speichern').click();
  await browser.$('p=Erinnerung gespeichert.').waitForDisplayed();
  assert.equal(await memory.getValue(), '');
  assert.equal(sql("SELECT count(*) FROM soul_episodic_memory WHERE content = 'Unser Versprechen am See.';"), '1');

  const diaryTab = browser.$('button*=Tagebuch (');
  await diaryTab.scrollIntoView({ block: 'nearest', inline: 'center' });
  await diaryTab.click();
  const title = browser.$('input[aria-label="Titel des Eintrags …"]');
  const text = browser.$('textarea[aria-label="Eintrag selbst verfassen"]');
  await title.setValue('Am See');
  await text.setValue('Heute haben wir ein Versprechen gegeben.');
  await browser.$('button=Tagebucheintrag speichern').click();
  await browser.$('p*=Tagebuch-Schreibfehler (Test).').waitForDisplayed();
  assert.equal(await title.getValue(), 'Am See');
  assert.equal(await text.getValue(), 'Heute haben wir ein Versprechen gegeben.');
  assert.equal(await browser.$('p=Tagebucheintrag gespeichert.').isExisting(), false);
  assert.equal(sql('SELECT count(*) FROM soul_diary;'), '0');
  sql('DROP TRIGGER test_diary_failure;');
  await browser.$('button=Tagebucheintrag speichern').click();
  await browser.$('p=Tagebucheintrag gespeichert.').waitForDisplayed();
  assert.equal(await title.getValue(), '');
  assert.equal(await text.getValue(), '');
  assert.equal(sql('SELECT count(*) FROM soul_diary;'), '1');
  console.log('Memory: Speicherfehler erhalten Entwürfe; Wiederholen speichert Erinnerung und Tagebuch genau einmal.');
} catch (e) {
  await browser.saveScreenshot(path.join(screenshotDir, 'memory-save-errors-fehler.png'));
  throw e;
} finally {
  await close();
}
