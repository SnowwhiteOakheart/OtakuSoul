// Read and write failures preserve the markdown draft in the real app/backend.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, home, close } = await launch();
const database = path.join(home, 'data', 'otakusoul.db');
const sql = (statement) => execFileSync('sqlite3', [database, statement], { encoding: 'utf8' }).trim();
const clickButton = async (name) => browser.$(`button=${name}`).click();
const waitForToast = async (message) => browser.$(`p*=${message}`).waitForDisplayed({ timeout: 10_000 });
try {
  const open = browser.$('button[aria-label="Kognitives Gedächtnis öffnen"]');
  await open.waitForDisplayed({ timeout: 20_000 });
  await browser.$('button=Bild').click();
  await open.click();
  const tab = browser.$('button=Markdown-Editor');
  await tab.click();
  const editor = browser.$('textarea[aria-label="Markdown-Editor"]');
  await browser.waitUntil(async () => (await editor.getValue()).includes('Psychological Tension'), { timeout: 10_000 });
  const draft = '## INTERNAL STATE\n- **Psychological Tension**: Erinnerung an den See';
  await editor.click();
  await browser.execute((element) => element.select(), await editor);
  await browser.keys('Backspace');
  // WebKit drops newlines in sendKeys text; send actual Enter keys between lines.
  const lines = draft.split('\n');
  for (let index = 0; index < lines.length; index++) {
    if (index > 0) await browser.keys('Enter');
    if (lines[index]) await editor.addValue(lines[index]);
  }
  assert.equal(await editor.getValue(), draft);

  // Invalid persisted type only in this temporary profile; restore before retry.
  const intensity = sql('SELECT intensity FROM soul_psychology;');
  sql("UPDATE soul_psychology SET intensity = 'test-read-failure';");
  await clickButton('Neu laden');
  await waitForToast('Laden fehlgeschlagen:');
  assert.ok((await browser.$('p*=Laden fehlgeschlagen:').getText()).includes('intensity'));
  assert.equal(await editor.getValue(), draft);
  assert.equal(await browser.$('p=Markdown aus der Datenbank neu geladen.').isExisting(), false);
  await browser.saveScreenshot(path.join(screenshotDir, '32-markdown-ladefehler.png'));
  sql(`UPDATE soul_psychology SET intensity = ${Number(intensity)};`);

  sql("CREATE TRIGGER test_md_failure BEFORE INSERT ON soul_psychology BEGIN SELECT RAISE(ABORT, 'Markdown-Schreibfehler (Test).'); END;");
  await clickButton('In Datenbank übernehmen');
  await waitForToast('Markdown-Schreibfehler (Test).');
  assert.equal(await editor.getValue(), draft);
  assert.equal(await browser.$('p=Markdown in die Datenbank übernommen.').isExisting(), false);
  sql('DROP TRIGGER test_md_failure;');
  await clickButton('In Datenbank übernehmen');
  await waitForToast('Markdown in die Datenbank übernommen.');
  assert.equal(sql('SELECT psychological_tension FROM soul_psychology;'), 'Erinnerung an den See');
  await clickButton('Neu laden');
  await waitForToast('Markdown aus der Datenbank neu geladen.');
  assert.ok((await editor.getValue()).includes('Erinnerung an den See'));
  console.log('Markdown: Lade- und Schreibfehler erhalten den Entwurf; erneutes Speichern und Nachladen bestehen.');
} catch (error) {
  await browser.saveScreenshot(path.join(screenshotDir, 'markdown-errors-fehler.png'));
  throw error;
} finally {
  await close();
}
