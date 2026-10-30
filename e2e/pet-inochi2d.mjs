// Desktop pet with an Inochi2D puppet: the pet interface (loaded in the test window with
// `?pet=true`) gets its state and pointer as events, shows the whole puppet and lets clicks
// through outside the figure only (hit test on the drawn pixels).
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';
import { makeInp } from './tools/make-inp.mjs';

const { browser, home, close } = await launch({ avatar_mode: 'inochi2d' });
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const emit = (event, payload) => invoke('plugin:event|emit', { event, payload });
const clickThrough = () => browser.execute(() => document.documentElement.dataset.petClickThrough);

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const file = path.join(home, 'Testpuppe.inp');
  writeFileSync(file, makeInp());
  const model = await invoke('import_inochi2d_model', { sourcePath: file });

  // The pet interface in this window; the main window would send the same events.
  await browser.setWindowSize(300, 440);
  await browser.execute(() => window.location.assign(`${window.location.pathname}?pet=true`));
  await browser.$('[data-desktop-pet]').waitForExist({ timeout: 30_000, timeoutMsg: 'Pet-Oberfläche fehlt' });
  const state = {
    characterName: 'Testpuppe', modelPath: model.model_path, emotion: 'joy', expression: 'happy', motions: [], gesture: null,
    appLanguage: 'de', theme: 'obsidian', colorMode: 'dark', thinking: false,
  };
  await browser.waitUntil(async () => {
    await emit('pet:state', state);
    return (await browser.$('[data-inochi2d-viewer="ready"]').isExisting());
  }, { timeout: 30_000, interval: 1000, timeoutMsg: 'Puppe im Pet lädt nicht' });

  // No bar, no badge: only the figure in the transparent window.
  assert.equal(await browser.$('[data-inochi2d-viewer] button').isExisting(), false, 'Bedienelemente im Pet');
  const size = await browser.execute(() => [window.innerWidth, window.innerHeight]);
  const cursor = (x, y) => emit('pet:cursor', { x, y, inside: true, button: null, through: true, gx: x, gy: y, t: Date.now() });
  // On the figure (middle, lower half) the pet takes the click …
  await browser.waitUntil(async () => {
    await cursor(size[0] / 2, size[1] * 0.75);
    return (await clickThrough()) === 'false';
  }, { timeout: 10_000, interval: 300, timeoutMsg: 'Figur fängt den Klick nicht' });
  // … beside it the click goes through to the desktop.
  await browser.waitUntil(async () => {
    await cursor(4, size[1] * 0.5);
    return (await clickThrough()) === 'true';
  }, { timeout: 10_000, interval: 300, timeoutMsg: 'Klick neben der Figur geht nicht durch' });
  // Wayland session (through: false): the pointer is not seen outside, so the window stays clickable.
  await browser.waitUntil(async () => {
    await emit('pet:cursor', { x: 4, y: size[1] * 0.5, inside: true, button: null, through: false, gx: 4, gy: size[1] * 0.5, t: Date.now() });
    return (await clickThrough()) === 'false';
  }, { timeout: 10_000, interval: 300, timeoutMsg: 'Pet unter Wayland nicht greifbar' });
  await browser.saveScreenshot(path.join(screenshotDir, '113-inochi2d-pet.png'));
  console.log('Pet mit Inochi2D-Puppe: Anzeige, Treffertest auf der Figur und Klick-Durchlass daneben bestanden.');
} finally {
  await close();
}
