// Wiederholungen: der Schalter „Abwechslungsreicher schreiben“ schickt DRY/XTC an den Server, und eine Antwort,
// die die vorige fast wörtlich kopiert, wird einmal automatisch neu geschrieben (Kopie bleibt als Variante).
import assert from 'node:assert/strict';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch({ reroll_repeats: true });
const jsClick = (element) => browser.execute((el) => el.click(), element);

try {
  await browser.$('button=Einstellungen').click();
  await browser.$('button[role="tab"]*=Antwortstil').click();
  const variety = await browser.$('#setting-vary-wording');
  await variety.waitForExist({ timeout: 10_000 });
  assert.equal(await variety.getAttribute('aria-checked'), 'false');
  await jsClick(variety);
  await browser.waitUntil(async () => (await variety.getAttribute('aria-checked')) === 'true', { timeout: 5000, timeoutMsg: 'Schalter bleibt aus' });
  await browser.saveScreenshot(path.join(screenshotDir, '94-abwechslung.png'));
  await browser.$('button=Chat').click();

  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  await input.setValue('Wohin gehen wir morgen?');
  let before = mock.stats.chat;
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000 });
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });
  // The backend sends f32 values (0.800000011…).
  assert.equal(mock.stats.lastChatRequest.dry_multiplier?.toFixed(2), '0.80', 'DRY fehlt in der Anfrage');
  assert.equal(mock.stats.lastChatRequest.xtc_threshold?.toFixed(2), '0.10', 'XTC fehlt in der Anfrage');

  // The mock answers the same again: the app rewrites it once (one more request) as a second swipe.
  before = mock.stats.chat;
  await input.setValue('Und danach?');
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat >= before + 2, { timeout: 30_000, timeoutMsg: 'Wiederholung nicht neu geschrieben' });
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });
  const counter = await browser.$('span[aria-label="Variante 2 von 2"]');
  await counter.waitForExist({ timeout: 10_000, timeoutMsg: 'Kopie nicht als Variante erhalten' });
  await browser.saveScreenshot(path.join(screenshotDir, '95-wiederholung-neu.png'));
  await browser.pause(1000);
  assert.equal(mock.stats.chat, before + 2, 'neu geschriebene Antwort wurde erneut neu geschrieben');
  console.log('Wiederholungen: Abwechslungs-Schalter (DRY/XTC) und einmaliges Neu-Schreiben als Variante bestanden.');
} finally {
  await close();
}
