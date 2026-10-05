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
  // Smooth scrolling takes a moment.
  await browser.waitUntil(() => option.isDisplayed({ withinViewport: true }), { timeout: 3000, timeoutMsg: 'Option nicht im sichtbaren Bereich' });
  await browser.saveScreenshot(path.join(screenshotDir, '34-einstellung-angesprungen.png'));

  // A different settings page while the settings are already open.
  await openPalette('Prompt');
  await browser.keys('Enter');
  await browser.waitUntil(async () => (await browser.$('#settings-tab-prompt').getAttribute('aria-selected')) === 'true', { timeout: 5000, timeoutMsg: 'Seitenwechsel bei offener Ansicht' });

  // Image models and LoRAs: the settings page for images.
  await openPalette('lora');
  await browser.keys('Enter');
  await browser.waitUntil(async () => (await browser.$('#settings-tab-image').getAttribute('aria-selected')) === 'true', { timeout: 5000, timeoutMsg: 'Bild-Einstellungen nicht geöffnet' });

  // An integration tab.
  await openPalette('galerie');
  await browser.keys('Enter');
  await browser.$('button*=Bild-Einstellungen').waitForExist({ timeout: 10_000 });
  // Voices: per character and for the Stage narrator, saved inside the settings.
  await openPalette('whisper');
  await browser.keys('Enter');
  const target = await browser.$('#setting-voice-target');
  await target.waitForDisplayed({ timeout: 10_000 });
  await target.selectByAttribute('value', 'stage_narrator');
  await browser.$('h2=Stimme & Voice Call').waitForDisplayed();
  await browser.saveScreenshot(path.join(screenshotDir, '51-einstellungen-stimme.png'));
  await browser.$('#settings-panel-voice').$('button=Speichern').click();
  await browser.waitUntil(() => browser.execute(() => document.body.textContent.includes('Stimme gespeichert.')), { timeout: 5000, timeoutMsg: 'Speichern ohne Rückmeldung' });

  await openPalette('vram');
  await browser.keys('Enter');
  await browser.$('#setting-image-provider').waitForDisplayed({ timeout: 10_000 });
  await browser.saveScreenshot(path.join(screenshotDir, '52-einstellungen-bilder.png'));
  console.log('Befehlspalette: Option, Seitenwechsel bei offener Ansicht, Bild-/Stimmeinstellungen und Integrationsreiter bestanden.');
} finally {
  await close();
}
