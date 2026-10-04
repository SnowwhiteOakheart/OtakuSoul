// The command palette reaches settings pages, single options and integration tabs.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, close } = await launch();
const openPalette = async (query) => {
  await browser.keys(['Control', 'k']);
  const search = await browser.$('input[aria-label="Befehle durchsuchen"]');
  await search.waitForDisplayed();
  await search.setValue(query);
  return search;
};

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });

  // An option: the settings open and scroll to it, highlighted.
  await openPalette('tray');
  await browser.saveScreenshot(path.join(screenshotDir, '33-palette-einstellungen.png'));
  await browser.keys('Enter');
  const option = await browser.$('#setting-close-to-tray');
  await option.waitForDisplayed({ timeout: 10_000 });
  await browser.waitUntil(async () => (await option.getAttribute('class')).includes('setting-highlight'), { timeout: 5000, timeoutMsg: 'Option wird nicht hervorgehoben' });
  assert.ok(await option.isDisplayed({ withinViewport: true }), 'Option nicht im sichtbaren Bereich');
  await browser.saveScreenshot(path.join(screenshotDir, '34-einstellung-angesprungen.png'));

  // A different settings page while the settings are already open.
  await openPalette('Prompt');
  await browser.keys('Enter');
  await browser.waitUntil(async () => (await browser.$('#settings-tab-prompt').getAttribute('aria-selected')) === 'true', { timeout: 5000, timeoutMsg: 'Seitenwechsel bei offener Ansicht' });

  // An integration tab.
  await openPalette('lora');
  await browser.keys('Enter');
  await browser.$('h3*=Bild').waitForExist({ timeout: 10_000 });
  console.log('Befehlspalette: Option, Seitenwechsel bei offener Ansicht und Integrationsreiter bestanden.');
} finally {
  await close();
}
