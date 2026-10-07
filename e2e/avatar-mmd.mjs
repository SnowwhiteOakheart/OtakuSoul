// MMD avatars: a PMX model imported with its folder (texture named in another case), chosen as
// 3D avatar, rendered by the MMD viewer, and a VMD motion plays on *winkt*.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';
import { makePmx, makeVmd, PNG } from './tools/make-mmd.mjs';

const { browser, mock, home, close } = await launch({ avatar_mode: '3d' });
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.setWindowSize(1280, 840);

  // A model folder as MMD packs come: the PMX names "tex\Skin.PNG", the file is tex/skin.png.
  const folder = path.join(home, 'Testfigur');
  mkdirSync(path.join(folder, 'tex'), { recursive: true });
  writeFileSync(path.join(folder, 'Testfigur.pmx'), makePmx());
  writeFileSync(path.join(folder, 'tex', 'skin.png'), PNG);
  const model = await invoke('import_vrm_model', { sourcePath: path.join(folder, 'Testfigur.pmx') });
  assert.equal(model.format, 'mmd');
  const vmd = path.join(home, 'Wave Arm.vmd');
  writeFileSync(vmd, makeVmd());
  assert.equal((await invoke('import_avatar_motion', { sourcePath: vmd })).kind, 'vmd');

  // Choose it as the default 3D avatar (the test character has none of its own).
  await browser.$('button=Einstellungen').click();
  const select = await browser.$('select[aria-label="3D-Avatar (VRM, glTF oder MMD)"]');
  await select.waitForDisplayed({ timeout: 10_000 });
  await browser.$('button*=Aktualisieren').click().catch(() => {});
  await browser.waitUntil(async () => (await select.getHTML()).includes('Testfigur'), { timeout: 10_000, timeoutMsg: 'MMD-Modell fehlt in der Liste' });
  await select.selectByAttribute('value', model.path);

  await browser.$('button=Chat').click();
  const viewer = await browser.$('[data-avatar-format="mmd"]');
  await viewer.waitForExist({ timeout: 30_000, timeoutMsg: 'MMD-Viewer erscheint nicht' });
  await browser.$('[data-avatar-format="mmd"][data-motions="1"]').waitForExist({ timeout: 30_000, timeoutMsg: 'VMD-Bewegung wird nicht geladen' });
  const body = await browser.$('body').getText();
  assert.ok(!body.includes('konnte nicht geladen werden'), 'Fehlermeldung im Viewer');
  await browser.pause(800);
  await shot('61-mmd-avatar');

  mock.stats.chatReply = '*winkt fröhlich* "Hallo aus MMD!"';
  await browser.$('textarea[aria-label="Nachricht"]').setValue('Hallo!');
  await clickSend(browser);
  await browser.$('[data-avatar-format="mmd"][data-gesture="greeting"]').waitForExist({ timeout: 20_000, timeoutMsg: 'VMD-Geste startet nicht' });
  await browser.pause(500);
  await shot('62-mmd-winkt');
  await browser.$('[data-avatar-format="mmd"][data-gesture=""]').waitForExist({ timeout: 10_000 });
  console.log('MMD: Import mit Ordner, Anzeige, Textur und VMD-Geste bestanden.');
} finally {
  await close();
}
