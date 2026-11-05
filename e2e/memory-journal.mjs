// Tagebuch-Modus: Nach einem Gespräch schreibt die Figur ab der Abendstunde (hier 0 Uhr) ihre
// Abend-Reflexion ins Tagebuch – einmal je Tag – und schickt eine Gute-Nacht-Nachricht. Der
// Monatsrückblick lässt sich im Tagebuch-Reiter von Hand schreiben.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';

const { browser, mock, home, close } = await launch({ journal: { enabled: true, evening_hour: 0, check_in: true, monthly: false } });
const database = path.join(home, 'data', 'otakusoul.db');
const sql = (statement) => execFileSync('sqlite3', [database, statement], { encoding: 'utf8' }).trim();
const jsClick = (element) => browser.execute((el) => el.click(), element);

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.$('textarea[aria-label="Nachricht"]').setValue('Ich hatte heute eine wichtige Prüfung.');
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > 0, { timeout: 20_000 });
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });
  const chatsBefore = mock.stats.chat;

  // The first look comes 30 s after the start.
  await browser.waitUntil(() => sql("SELECT COUNT(*) FROM soul_diary WHERE kind = 'evening';") === '1', {
    timeout: 90_000, interval: 1000, timeoutMsg: 'Keine Abend-Reflexion geschrieben',
  });
  const request = mock.stats.journalRequests?.at(-1);
  assert.ok(request?.user.includes('Ich hatte heute eine wichtige Prüfung.'), 'Gespräch des Tages fehlt im Prompt');
  assert.match(sql("SELECT title FROM soul_diary WHERE kind = 'evening';"), /^Abend-Reflexion, /);
  await browser.waitUntil(() => mock.stats.chat > chatsBefore, { timeout: 30_000, timeoutMsg: 'Keine Gute-Nacht-Nachricht' });
  assert.ok(JSON.stringify(mock.stats.lastChatMessages).includes('good-night message'), 'Gute-Nacht-Anweisung fehlt');

  await jsClick(await browser.$('button[aria-label="Kognitives Gedächtnis öffnen"]'));
  await jsClick(await browser.$('button[role="tab"]*=Tagebuch'));
  await jsClick(await browser.$('button=Monatsrückblick schreiben'));
  await browser.waitUntil(() => sql("SELECT COUNT(*) FROM soul_diary WHERE kind = 'monthly';") === '1', { timeout: 20_000, timeoutMsg: 'Kein Monatsrückblick' });
  await browser.$('h4*=Monatsrückblick').waitForDisplayed({ timeout: 10_000 });
  // Only one evening entry per day.
  assert.equal(sql("SELECT COUNT(*) FROM soul_diary WHERE kind = 'evening';"), '1');
  await browser.saveScreenshot(path.join(screenshotDir, '121-tagebuch-modus.png'));
  console.log('Tagebuch-Modus: Abend-Reflexion, Gute-Nacht-Nachricht und Monatsrückblick bestanden.');
} finally {
  await close();
}
