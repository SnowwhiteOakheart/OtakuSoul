// Voice gallery: the voice settings list voices of all engines that need no key; one is taken over
// with a click (engine and voice set together). Edge voices come from the internet; without it the
// gallery says how to get voices.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, close } = await launch();
try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.setWindowSize(1400, 900);
  await browser.$('button=Einstellungen').click();
  await browser.$('#settings-tab-voice').click();
  const gallery = await browser.$('[data-voice-gallery]');
  await gallery.waitForDisplayed({ timeout: 10_000 });
  await gallery.$('button*=Stimmen anhören und vergleichen').click();
  await browser.waitUntil(
    async () => (await browser.$$('[data-gallery-voice]')).length > 0 || (await gallery.getText()).includes('Noch keine Stimmen'),
    { timeout: 30_000, timeoutMsg: 'Galerie lädt nicht' },
  );
  const entries = await browser.$$('[data-gallery-voice^="edge:"]');
  if (entries.length === 0) {
    console.log('Stimmen-Galerie: ohne Internet keine Edge-Stimmen – Hinweis angezeigt.');
  } else {
    // A voice other than the chosen one, taken over: the engine and voice fields follow.
    const pick = entries.length > 1 ? entries[1] : entries[0];
    const key = await pick.getAttribute('data-gallery-voice');
    const voiceId = key.slice('edge:'.length);
    const use = await pick.$('button=Übernehmen');
    if (await use.isExisting()) await use.click();
    await browser.waitUntil(async () => (await pick.getText()).includes('Gewählt'), { timeout: 5000, timeoutMsg: 'Stimme nicht übernommen' });
    const engine = await browser.$('[aria-describedby="voice-engine-hint"]').getValue();
    assert.equal(engine, 'edge');
    assert.equal(await browser.$('[aria-describedby="voice-found-hint"]').getValue(), voiceId);
    await browser.saveScreenshot(path.join(screenshotDir, '96-stimmen-galerie.png'));
    console.log(`Stimmen-Galerie: ${entries.length} Edge-Stimmen, ${voiceId} übernommen.`);
  }
} finally {
  await close();
}
