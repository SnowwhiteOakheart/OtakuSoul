// "Show last prompt": after a message the chat menu shows what the model really got.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch();
const jsClick = (element) => browser.execute((el) => el.click(), element);
const textOf = (element) => browser.execute((el) => el.textContent ?? '', element);

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  const before = mock.stats.chat;
  await input.setValue('Wie heißt das Café?');
  await browser.$('button[aria-label="Nachricht senden"]').click();
  await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000 });
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });

  await jsClick(await browser.$('button[aria-label="Weitere Chat-Aktionen"]'));
  await jsClick(await browser.$('button*=Letzten Prompt anzeigen'));
  const dialog = await browser.$('[aria-labelledby="prompt-log-title"]');
  await dialog.waitForDisplayed({ timeout: 5000 });
  await browser.waitUntil(async () => (await textOf(dialog)).includes('Wie heißt das Café?'), { timeout: 5000, timeoutMsg: 'Nachricht fehlt im Prompt' });
  const text = await textOf(dialog);
  assert.ok(text.includes('# Role & Identity'), 'System-Prompt fehlt');
  assert.ok(!text.includes('sk-'), 'API-Schlüssel im Prompt-Log');
  await browser.saveScreenshot(path.join(screenshotDir, '53-letzter-prompt.png'));
  await browser.keys('Escape');
  await dialog.waitForExist({ reverse: true, timeout: 5000 });
  console.log('Prompt-Log: System-Prompt und Nachricht sichtbar, kein Schlüssel, Schließen per Escape bestanden.');
} finally {
  await close();
}
