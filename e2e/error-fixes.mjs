// Errors with a way out: a chat that cannot reach its cloud AI offers "check connection",
// which opens the cloud settings.
import assert from 'node:assert/strict';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';

// Port 9 (discard) refuses connections, like a wrong address or a provider that is down.
const { browser, close } = await launch({ cloud_endpoint: 'http://127.0.0.1:9/v1/chat/completions' });

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  await input.setValue('Hallo?');
  await clickSend(browser);
  const fix = await browser.$('[data-error-fix]');
  await fix.waitForDisplayed({ timeout: 30_000, timeoutMsg: 'Kein Lösungsknopf am Chat-Fehler' });
  assert.equal(await fix.getText(), 'Verbindung prüfen');
  await browser.pause(300);
  await browser.saveScreenshot(path.join(screenshotDir, '88-fehler-loesung.png'));
  await browser.execute((el) => el.click(), fix);
  await browser.$('#settings-tab-providers').waitForExist({ timeout: 15_000, timeoutMsg: 'Einstellungen öffnen sich nicht' });
  await browser.waitUntil(async () => (await browser.$('#settings-tab-providers').getAttribute('aria-selected')) === 'true', {
    timeout: 10_000,
    timeoutMsg: 'Cloud-Einstellungen öffnen sich nicht',
  });
  console.log('Fehler mit Lösung: Chat-Fehler bietet „Verbindung prüfen“ und öffnet die Cloud-Einstellungen bestanden.');
} finally {
  await close();
}
