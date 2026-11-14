// Mesh avatars (Mesh Avatar Studio): import a .mavatar and a project folder (packed into a
// .mavatar without its work files), show it in the chat with the `mesh-avatar` runtime (the figure
// is drawn), the mode is kept, the avatar library lists it with a preview picture and it can be
// given to a character. The desktop pet does not take it (only real 3D figures).
import assert from 'node:assert/strict';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';
import { makeMavatar, writeMavatarFolder } from './tools/make-mavatar.mjs';

const { browser, home, close } = await launch({ avatar_mode: '2d' });
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const failure = (command, args) =>
  browser.execute(
    // oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
    (cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload).then(() => null, (e) => String(e)),
    command,
    args,
  );

/** Share of drawn (not transparent) pixels in the viewer's canvas. */
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

  const file = path.join(home, 'Testfigur.mavatar');
  writeFileSync(file, makeMavatar('Testfigur'));
  const model = await invoke('import_mesh_avatar', { sourcePath: file });
  assert.equal(model.name, 'Testfigur', 'Name aus avatar.json');
  assert.ok(model.removable && model.model_path.includes(`${path.sep}mesh_avatars${path.sep}`));

  // A Studio project folder becomes a .mavatar of its own.
  const folder = path.join(home, 'projects', 'ordnerfigur');
  writeMavatarFolder(folder, 'Ordnerfigur');
  const packed = await invoke('import_mesh_avatar', { sourcePath: folder });
  assert.equal(packed.name, 'Ordnerfigur');
  assert.equal(packed.id, 'Ordnerfigur.mavatar');

  const refused = await failure('import_mesh_avatar', { sourcePath: path.join(home, 'config', 'settings.json') });
  assert.ok(refused?.includes('backend.meshAvatar.unsupportedFormat'), `Andere Dateien nicht abgelehnt: ${refused}`);
  const listed = await invoke('scan_mesh_avatars');
  assert.deepEqual(listed.map((m) => m.name), ['Ordnerfigur', 'Testfigur']);

  const initialSettings = await invoke('load_settings');
  await invoke('save_settings', { settings: { ...initialSettings, active_mesh_avatar_path: model.model_path } });

  // Chat: switch the avatar to the mesh view; the figure is drawn.
  await browser.refresh();
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.$('button[aria-label="Mesh"]').waitForClickable({ timeout: 10_000 });
  await browser.$('button[aria-label="Mesh"]').click();
  await browser.$('[data-mesh-viewer="ready"]').waitForExist({ timeout: 30_000, timeoutMsg: 'Mesh-Avatar lädt nicht' });
  let drawn = 0;
  await browser.waitUntil(async () => {
    drawn = await coverage('[data-mesh-viewer] canvas');
    return drawn > 0.05;
  }, { timeout: 15_000, interval: 500, timeoutMsg: `Mesh-Avatar nicht gezeichnet (${drawn})` });
  await browser.pause(800);
  await browser.saveScreenshot(path.join(screenshotDir, '114-mesh-chat.png'));
  await browser.waitUntil(async () => (await invoke('load_settings')).avatar_mode === 'mesh', {
    timeout: 5000,
    timeoutMsg: 'Mesh-Ansicht nicht gespeichert',
  });

  // Avatar library: filter, preview picture, give to a character.
  await browser.$('button=Einstellungen').click();
  await browser.$('[data-open-avatar-manager]').waitForDisplayed({ timeout: 10_000 });
  await browser.$('[data-open-avatar-manager]').click();
  await browser.$('[data-avatar-manager]').waitForDisplayed({ timeout: 10_000 });
  await browser.$('[role="radio"][data-radio-value="mesh"]').click();
  await browser.waitUntil(async () => (await browser.$$('[data-avatar-card]')).length === 2, { timeout: 3000, timeoutMsg: 'Filter Mesh' });
  const card = await browser.$('[data-avatar-card="mesh"][data-avatar-name="Testfigur"]');
  await card.click();
  await browser.$('[data-avatar-preview="mesh"] [data-mesh-viewer="ready"]').waitForExist({ timeout: 20_000, timeoutMsg: 'Keine Vorschau' });
  await card.$('[data-avatar-thumbnail]').waitForExist({ timeout: 30_000, timeoutMsg: 'Kein Vorschaubild' });
  const thumbs = path.join(home, 'data', 'avatar_thumbs');
  assert.ok(existsSync(thumbs) && readdirSync(thumbs).some((f) => f.startsWith('mesh-')), 'Vorschaubild nicht gespeichert');
  // No pet framing: a mesh avatar is no desktop pet.
  assert.equal(await browser.$('[data-pet-framing]').isExisting(), false, 'Pet-Ausschnitt für Mesh-Avatar angeboten');

  const [row] = await browser.$$('[data-avatar-character]');
  const name = (await browser.execute((el) => el.querySelector('span.truncate').textContent, row)).trim();
  await row.$('input[type="checkbox"]').click();
  const usesModel = async () => (await invoke('scan_characters')).find((c) => c.card.data.name === name)?.card.data.extensions?.custom_mesh_avatar;
  await browser.waitUntil(async () => (await usesModel()) === model.id, { timeout: 10_000, timeoutMsg: 'Zuweisung nicht in der Karte' });
  await browser.saveScreenshot(path.join(screenshotDir, '115-mesh-manager.png'));
  await row.$('input[type="checkbox"]').click();
  await browser.waitUntil(async () => !(await usesModel()), { timeout: 10_000, timeoutMsg: 'Zuweisung nicht entfernt' });

  console.log(`Mesh-Avatar: Import (Datei und Projektordner), Chat (${Math.round(drawn * 100)} % gezeichnet), Bibliothek, Vorschaubild und Zuweisung bestanden.`);
} finally {
  await close();
}
