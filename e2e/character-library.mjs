// Character library for beginners: shipped characters first with a badge, a preview with
// description and greeting, and "chat now" from there.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, close } = await launch();
const jsClick = (element) => browser.execute((el) => el.click(), element);

try {
  await browser.$('button=Charaktere').waitForExist({ timeout: 20_000 });
  await browser.$('button=Charaktere').click();
  const firstPreview = await browser.$('button[aria-label^="Mehr über"]');
  await firstPreview.waitForExist({ timeout: 15_000 });
  const name = (await firstPreview.getAttribute('aria-label')).replace('Mehr über ', '');
  assert.ok(['Shiori Amane', 'Sota Minase', 'Lirwen', 'Faelion'].includes(name), `Erste Karte ist keine Einsteiger-Figur: ${name}`);
  await jsClick(firstPreview);

  const preview = await browser.$('[data-character-preview]');
  await preview.waitForDisplayed({ timeout: 5000, timeoutMsg: 'Vorschau öffnet sich nicht' });
  await browser.pause(300);
  await browser.saveScreenshot(path.join(screenshotDir, '87-figur-vorschau.png'));
  const text = await preview.getText();
  assert.match(text, /Gut für den Einstieg/);
  assert.match(text, /Wer ist das\?/i);
  assert.match(text, /So beginnt euer Chat/i);
  await browser.pause(300);
  await browser.saveScreenshot(path.join(screenshotDir, '87-figur-vorschau.png'));

  await jsClick(await preview.$('button*=Jetzt chatten'));
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 15_000, timeoutMsg: 'Chat öffnet sich nicht' });
  // oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
  const settings = await browser.execute(() => window.__TAURI_INTERNALS__.invoke('load_settings'));
  assert.ok(settings.active_character_id, 'keine Figur ausgewählt');
  console.log(`Figurenbibliothek: ${name} vorn, Vorschau und „Jetzt chatten“ bestanden.`);
} finally {
  await close();
}
