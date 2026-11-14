// Desktop pet shows only real 3D figures: the pet interface (loaded in the test window with
// `?pet=true`) gets its state and pointer as events. An Inochi2D puppet is refused (a note
// instead of the figure); a GLB model shows, and clicks go through outside the figure only (hit
// test on the drawn pixels).
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';
import { makeInp } from './tools/make-inp.mjs';
import { makeGlb } from './tools/make-glb.mjs';

const { browser, home, close } = await launch({ avatar_mode: 'inochi2d' });
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const emit = (event, payload) => invoke('plugin:event|emit', { event, payload });
const clickThrough = () => browser.execute(() => document.documentElement.dataset.petClickThrough);

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const puppetFile = path.join(home, 'Testpuppe.inp');
  writeFileSync(puppetFile, makeInp());
  const puppet = await invoke('import_inochi2d_model', { sourcePath: puppetFile });
  const glbFile = path.join(home, 'Testrig.glb');
  writeFileSync(glbFile, await makeGlb());
  const glb = await invoke('import_vrm_model', { sourcePath: glbFile });

  // The pet interface in this window; the main window would send the same events.
  await browser.setWindowSize(300, 440);
  await browser.execute(() => window.location.assign(`${window.location.pathname}?pet=true`));
  await browser.$('[data-desktop-pet]').waitForExist({ timeout: 30_000, timeoutMsg: 'Pet-Oberfläche fehlt' });
  const state = (modelPath) => ({
    characterName: 'Testfigur', modelPath, emotion: 'joy', expression: 'happy', motions: [], gesture: null,
    appLanguage: 'de', theme: 'obsidian', colorMode: 'dark', thinking: false,
  });

  // A 2D puppet is no pet: the note shows, no puppet is loaded.
  await browser.waitUntil(async () => {
    await emit('pet:state', state(puppet.model_path));
    return browser.$('[data-pet-solid]').isExisting();
  }, { timeout: 30_000, interval: 1000, timeoutMsg: 'Pet zeigt keinen Hinweis für die 2D-Puppe' });
  assert.equal(await browser.$('[data-inochi2d-viewer]').isExisting(), false, 'Inochi2D-Puppe im Pet geladen');

  // A real 3D model shows as the figure.
  await browser.waitUntil(async () => {
    await emit('pet:state', state(glb.path));
    return browser.$('[data-avatar-format="gltf"]').isExisting();
  }, { timeout: 60_000, interval: 1000, timeoutMsg: 'GLB im Pet lädt nicht' });
  assert.equal(await browser.$('[data-pet-solid]').isExisting(), false, 'Hinweis bleibt trotz 3D-Modell');

  const size = await browser.execute(() => [window.innerWidth, window.innerHeight]);
  const cursor = (x, y) => emit('pet:cursor', { x, y, inside: true, button: null, through: true, gx: x, gy: y, t: Date.now() });
  // On the figure (middle, lower half) the pet takes the click …
  await browser.waitUntil(async () => {
    await cursor(size[0] / 2, size[1] * 0.6);
    return (await clickThrough()) === 'false';
  }, { timeout: 15_000, interval: 300, timeoutMsg: 'Figur fängt den Klick nicht' });
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
  await browser.saveScreenshot(path.join(screenshotDir, '113-pet-only-3d.png'));
  console.log('Pet nur mit 3D: 2D-Puppe abgelehnt, GLB angezeigt, Treffertest und Klick-Durchlass bestanden.');
} finally {
  await close();
}
