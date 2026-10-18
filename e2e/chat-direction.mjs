// Regieanweisung: Umschalter im Composer, die Nachricht geht als ((…)) an das Modell, der System-Prompt
// erklärt die Klammern, der Verlauf zeigt sie als Anweisung.
import assert from 'node:assert/strict';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch();
const jsClick = (element) => browser.execute((el) => el.click(), element);

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  await jsClick(await browser.$('button[aria-label="Regieanweisung"]'));
  await input.setValue('Lass es anfangen zu regnen');
  const before = mock.stats.chat;
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000, timeoutMsg: 'Anweisung nicht gesendet' });
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });

  const sent = JSON.stringify(mock.stats.lastChatMessages);
  assert.ok(sent.includes('((Lass es anfangen zu regnen))'), 'Anweisung fehlt in der Anfrage');
  assert.ok(mock.stats.lastChatSystemPrompt.includes('((double parentheses)) is an out-of-character direction'), 'Regel fehlt im System-Prompt');
  const note = await browser.$('[data-ooc]');
  await note.waitForDisplayed({ timeout: 5000 });
  assert.ok((await note.getText()).includes('Lass es anfangen zu regnen'));
  assert.equal(await browser.$('button[aria-label="Regieanweisung"]').getAttribute('aria-pressed'), 'false');
  await browser.saveScreenshot(path.join(screenshotDir, '93-regieanweisung.png'));
  console.log('Regieanweisung: Umschalter, ((…)) in der Anfrage, Regel im Prompt und Darstellung bestanden.');
} finally {
  await close();
}
