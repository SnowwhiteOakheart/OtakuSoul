// Reset per settings area: a changed reply style shows how many values differ, goes back to the
// defaults with one click and comes back with undo; the appearance area does the same for the theme.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, close } = await launch({ expert_mode: true });
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const changed = async (area) => Number(await browser.$(`[data-reset-area="${area}"]`).getAttribute('data-changed'));

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.setWindowSize(1400, 900);
  await browser.$('button=Einstellungen').click();
  await browser.$('button[role="tab"]*=Antwortstil').click();
  const area = await browser.$('[data-reset-area="Antwortstil"]');
  await area.waitForExist({ timeout: 10_000 });
  assert.equal(await changed('Antwortstil'), 0, 'frisches Profil weicht ab');

  // Temperature to 1.2 through the slider (React listens to the native input event).
  await browser.execute(() => {
    const slider = document.querySelector('input[type="range"][max="1.5"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(slider, '1.2');
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await browser.waitUntil(async () => (await changed('Antwortstil')) === 1, { timeout: 5000, timeoutMsg: 'Abweichung nicht erkannt' });
  await browser.saveScreenshot(path.join(screenshotDir, '98-zuruecksetzen.png'));
  await area.$('button*=Auf Standard zurücksetzen').click();
  await browser.waitUntil(async () => (await changed('Antwortstil')) === 0, { timeout: 5000, timeoutMsg: 'Zurücksetzen wirkt nicht' });
  await browser.waitUntil(async () => (await invoke('load_settings')).sampling.temperature === 0.7, { timeout: 5000, timeoutMsg: 'Standard nicht gespeichert' });
  await browser.$('button=Rückgängig').click();
  await browser.waitUntil(async () => (await changed('Antwortstil')) === 1, { timeout: 5000, timeoutMsg: 'Rückgängig bringt den Wert nicht zurück' });
  assert.equal((await invoke('load_settings')).sampling.temperature, 1.2);

  // Appearance: another theme counts as a change and goes back to Obsidian.
  await browser.$('button[role="tab"]*=Erscheinungsbild').click();
  await browser.$('button*=Cyberpunk').click();
  await browser.waitUntil(async () => (await changed('Farb-Theme')) === 1, { timeout: 5000, timeoutMsg: 'Theme-Wechsel nicht erkannt' });
  await browser.$('[data-reset-area="Farb-Theme"]').$('button*=Auf Standard zurücksetzen').click();
  await browser.waitUntil(async () => (await browser.execute(() => document.documentElement.dataset.theme)) === 'obsidian', { timeout: 5000, timeoutMsg: 'Theme nicht zurückgesetzt' });
  console.log('Zurücksetzen pro Bereich: Abweichung, Standard, Rückgängig und Theme bestanden.');
} finally {
  await close();
}
