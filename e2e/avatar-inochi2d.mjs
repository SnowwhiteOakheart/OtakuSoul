// Inochi2D puppets: import an .inp, show it in the chat (own WebGL renderer), the setting is kept,
// the avatar library lists it with a preview picture, it can be given to a character, renamed and
// removed into the trash. The catalog lists the official example models (not downloaded here).
import assert from 'node:assert/strict';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';
import { makeInp } from './tools/make-inp.mjs';

const { browser, home, close } = await launch({ avatar_mode: '2d' });
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);

/** Share of drawn (not transparent) pixels in the viewer's canvas, read in the same frame. */
const coverage = (selector) =>
  browser.execute((sel) => {
    const canvas = document.querySelector(sel);
    if (!canvas) return -1;
    let share = -1;
    const done = (source) => {
      const probe = document.createElement('canvas');
      probe.width = 128;
      probe.height = 128;
      const ctx = probe.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(source, 0, 0, 128, 128);
      const data = ctx.getImageData(0, 0, 128, 128).data;
      let visible = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 16) visible += 1;
      share = visible / (128 * 128);
    };
    canvas.dispatchEvent(new CustomEvent('otakusoul-avatar-snapshot', { detail: { done } }));
    return share;
  }, selector);

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.setWindowSize(1400, 900);

  const file = path.join(home, 'Testpuppe.inp');
  writeFileSync(file, makeInp());
  const model = await invoke('import_inochi2d_model', { sourcePath: file });
  assert.equal(model.name, 'Testpuppe', 'Name aus dem Puppen-Kopf');
  assert.ok(model.removable && model.model_path.includes(`${path.sep}inochi2d${path.sep}`));
  const refused = await browser.execute(
    // oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
    (src) => window.__TAURI_INTERNALS__.invoke('import_inochi2d_model', { sourcePath: src }).then(() => null, (e) => String(e)),
    path.join(home, 'config', 'settings.json'),
  );
  assert.ok(refused?.includes('backend.inochi2d.unsupportedFormat'), `Andere Dateien nicht abgelehnt: ${refused}`);
  const catalog = await invoke('get_inochi2d_catalog');
  assert.deepEqual(catalog.map((c) => c.name), ['Aka', 'Midori']);
  assert.ok(catalog.every((c) => !c.is_installed && c.sha256.length === 64));

  // Chat: switch the avatar to Inochi2D (the list is read again at the switch's first use).
  await browser.execute(() => window.location.reload());
  await browser.pause(1000);
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.$('button[aria-label="Inochi2D"]').waitForClickable({ timeout: 10_000 });
  await browser.$('button[aria-label="Inochi2D"]').click();
  const viewer = await browser.$('[data-inochi2d-viewer]');
  await browser.waitUntil(async () => (await viewer.getAttribute('data-inochi2d-viewer')) !== 'loading', { timeout: 30_000, timeoutMsg: 'Puppe lädt nicht' });
  assert.equal(await viewer.getAttribute('data-inochi2d-viewer'), 'ready', await browser.$('[data-inochi2d-viewer] .text-rose-300').getText().catch(() => 'Fehler'));
  const drawn = await coverage('[data-inochi2d-viewer] canvas');
  assert.ok(drawn > 0.02, `Puppe nicht gezeichnet (${drawn})`);
  await browser.pause(500);
  await browser.saveScreenshot(path.join(screenshotDir, '110-inochi2d-chat.png'));
  const settings = await invoke('load_settings');
  assert.equal(settings.avatar_mode, 'inochi2d');
  // Without an own choice the first puppet is the default (kept as a choice once picked).
  assert.ok([null, model.model_path].includes(settings.active_inochi2d_path ?? null));

  // Avatar library: filter, preview picture, give to a character.
  await browser.$('button=Einstellungen').click();
  await browser.$('[data-open-avatar-manager]').waitForDisplayed({ timeout: 10_000 });
  await browser.$('[data-open-avatar-manager]').click();
  await browser.$('[data-avatar-manager]').waitForDisplayed({ timeout: 10_000 });
  await browser.$('[data-inochi2d-catalog]').waitForDisplayed({ timeout: 5000, timeoutMsg: 'Beispielmodelle fehlen' });
  await browser.$('[role="radio"][data-radio-value="inochi2d"]').click();
  await browser.waitUntil(async () => (await browser.$$('[data-avatar-card]')).length === 1, { timeout: 3000, timeoutMsg: 'Filter Inochi2D' });
  const card = await browser.$('[data-avatar-card="inochi2d"][data-avatar-name="Testpuppe"]');
  await card.click();
  await browser.$('[data-avatar-preview="inochi2d"] canvas').waitForExist({ timeout: 20_000, timeoutMsg: 'Keine Vorschau' });
  await card.$('[data-avatar-thumbnail]').waitForExist({ timeout: 30_000, timeoutMsg: 'Kein Vorschaubild' });
  const thumbs = path.join(home, 'data', 'avatar_thumbs');
  assert.ok(existsSync(thumbs) && readdirSync(thumbs).some((f) => f.startsWith('inochi2d-')), 'Vorschaubild nicht gespeichert');

  const row = await browser.$('[data-avatar-character]');
  const name = (await browser.execute((el) => el.querySelector('span.truncate').textContent, row)).trim();
  await row.$('input[type="checkbox"]').click();
  const usesModel = async () => (await invoke('scan_characters')).find((c) => c.card.data.name === name)?.card.data.extensions?.custom_inochi2d;
  await browser.waitUntil(async () => (await usesModel()) === model.id, { timeout: 10_000, timeoutMsg: 'Zuweisung nicht in der Karte' });
  await browser.saveScreenshot(path.join(screenshotDir, '111-inochi2d-manager.png'));
  await row.$('input[type="checkbox"]').click();
  await browser.waitUntil(async () => !(await usesModel()), { timeout: 10_000, timeoutMsg: 'Zuweisung nicht entfernt' });

  // Own name and removal into the trash.
  await invoke('rename_avatar', { kind: 'inochi2d', path: model.model_path, name: 'Puppe Eins' });
  assert.equal((await invoke('scan_inochi2d_models'))[0].name, 'Puppe Eins');
  await invoke('delete_avatar', { kind: 'inochi2d', path: model.model_path });
  assert.equal((await invoke('scan_inochi2d_models')).length, 0);
  assert.ok(readdirSync(path.join(home, 'data', '.trash', 'avatars')).some((f) => f.endsWith('Testpuppe.inp')), 'nicht im Papierkorb');

  console.log(`Inochi2D: Import, Anzeige im Chat (${Math.round(drawn * 100)} % gezeichnet), Einstellung, Bibliothek, Vorschaubild, Zuweisung, Umbenennen und Entfernen bestanden.`);
} finally {
  await close();
}
