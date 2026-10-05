// Background tasks: a failed and a successful reflection show up in the header task list
// with their state and error; "Retry" runs the failed one again.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, home, close } = await launch();
const sql = (statement) => execFileSync('sqlite3', [path.join(home, 'data', 'otakusoul.db'), statement], { encoding: 'utf8' }).trim();
const jsClick = (element) => browser.execute((el) => el.click(), element);
const tasks = (status) => browser.$$(`li[data-task-status="${status}"]`).length;

try {
  const open = browser.$('button[aria-label="Kognitives Gedächtnis öffnen"]');
  await open.waitForDisplayed({ timeout: 20_000 });
  await browser.$('button=Bild').click();
  await open.click();
  await browser.$('input[aria-label="Innere Anspannung & Konflikte"]').waitForDisplayed({ timeout: 15_000 });

  // First reflection fails (unreadable state), the second one works.
  const intensity = Number(sql('SELECT intensity FROM soul_psychology;'));
  sql("UPDATE soul_psychology SET intensity = 'reflection-read-failure';");
  await browser.$('button=Reflexion starten').click();
  await browser.$('p*=Reflexion fehlgeschlagen:').waitForDisplayed();
  await browser.waitUntil(() => browser.$('button=Reflexion starten').isEnabled());
  sql(`UPDATE soul_psychology SET intensity = ${intensity};`);
  mock.stats.memoryRouterResult = { no_significant_change: true };
  await browser.$('button=Reflexion starten').click();
  await browser.$('p=Reflexion abgeschlossen: keine wesentlichen Änderungen.').waitForDisplayed();
  await browser.keys('Escape');

  // The header lists both, the failure with its cause.
  const button = await browser.$('button[aria-label^="Hintergrundaufgaben"]');
  await button.waitForDisplayed({ timeout: 5000 });
  await jsClick(button);
  const list = await browser.$('[role="dialog"][aria-label="Hintergrundaufgaben"]');
  await list.waitForDisplayed();
  assert.equal(await tasks('failed'), 1);
  assert.equal(await tasks('done'), 1);
  assert.ok((await browser.execute((el) => el.textContent, list)).includes('Reflexion:'));
  await browser.saveScreenshot(path.join(screenshotDir, '47-hintergrundaufgaben.png'));

  // Retry runs the reflection again; it succeeds now.
  await jsClick(await browser.$('li[data-task-status="failed"]').$('button=Wiederholen'));
  await browser.waitUntil(async () => (await tasks('done')) === 2, { timeout: 15_000, timeoutMsg: 'Wiederholen wirkt nicht' });

  await jsClick(await list.$('button=Erledigte entfernen'));
  await browser.waitUntil(async () => !(await browser.$('button[aria-label^="Hintergrundaufgaben"]').isExisting()), { timeout: 5000, timeoutMsg: 'Liste nicht geleert' });
  console.log('Hintergrundaufgaben: Status, Fehlerursache, Wiederholen und Aufräumen bestanden.');
} finally {
  await close();
}
