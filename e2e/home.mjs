// Start page: opens first, tells which AI answers, leads into chat and stories, and can be
// skipped in favour of the chat (the hint for a missing AI is covered by src/test/homeView.test.tsx).
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const jsClick = (browser, element) => browser.execute((el) => el.click(), element);

{
  const { browser, close } = await launch({ start_tab: 'home', stage_last_scene: '' });
  // oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
  const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
  try {
    const home = await browser.$('[data-home]');
    await home.waitForDisplayed({ timeout: 20_000, timeoutMsg: 'App öffnet nicht mit der Startseite' });
    const ai = await browser.$('[data-home-ai="ready"]');
    await ai.waitForDisplayed({ timeout: 5000 });
    assert.match(await ai.getText(), /mock \(Cloud\)/);
    await browser.pause(300);
    await browser.saveScreenshot(path.join(screenshotDir, '86-startseite.png'));

    await jsClick(browser, await browser.$('[data-home-card="stage"]'));
    await browser.$('[data-story-gallery]').waitForDisplayed({ timeout: 15_000, timeoutMsg: 'Geschichten-Karte führt nicht zur Galerie' });
    await jsClick(browser, await browser.$('button=Start'));
    await home.waitForDisplayed({ timeout: 5000 });

    // Returning users can go straight to the chat.
    await jsClick(browser, await browser.$('[data-home]').$('label*=letzten Chat'));
    await browser.waitUntil(async () => (await invoke('load_settings')).start_tab === 'chat', { timeout: 5000, timeoutMsg: 'Startseite lässt sich nicht abschalten' });
  } finally {
    await close();
  }
}

console.log('Startseite: KI-Status, Weg zu Geschichten und Abschalten bestanden (fehlende KI: Unit-Test homeView).');
