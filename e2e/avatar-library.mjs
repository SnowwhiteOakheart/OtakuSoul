// Avatar library in the settings: an imported glTF gets its name field opened, is renamed, removed
// with undo, removed for good (into the app's trash); bundled 3D and Live2D avatars can be renamed
// but not removed.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';
import { makeGlb } from './tools/make-glb.mjs';

const { browser, home, close } = await launch({ avatar_mode: '3d' });
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const vrmSelect = 'select[aria-label="3D-Avatar (VRM, glTF oder MMD)"]';
const optionText = (selector) => browser.$(selector).getHTML();

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.setWindowSize(1280, 900);
  const glb = path.join(home, 'Testrig.glb');
  writeFileSync(glb, await makeGlb());
  const model = await invoke('import_vrm_model', { sourcePath: glb });

  await browser.$('button=Einstellungen').click();
  const select = await browser.$(vrmSelect);
  await select.waitForDisplayed({ timeout: 10_000 });
  await browser.$('button*=Aktualisieren').click().catch(() => {});
  await browser.waitUntil(async () => (await optionText(vrmSelect)).includes('Testrig'), { timeout: 10_000, timeoutMsg: 'GLB fehlt in der Liste' });
  await select.selectByAttribute('value', model.path);

  // Rename: the list shows the new name, the file keeps its own.
  await browser.$('[data-avatar-action="rename"]').click();
  const field = await browser.$('[data-avatar-rename="vrm"]');
  await field.waitForDisplayed();
  assert.equal(await field.getValue(), 'Testrig');
  await field.setValue('Mika im Kimono');
  await browser.keys('Enter');
  await browser.waitUntil(async () => (await optionText(vrmSelect)).includes('Mika im Kimono'), { timeout: 10_000, timeoutMsg: 'Neuer Name fehlt' });
  assert.ok(existsSync(model.path), 'Datei wurde umbenannt oder verschoben');
  await shot('99-avatar-umbenannt');

  // Remove with undo: back in the list, nothing deleted.
  await browser.$('[data-avatar-action="delete"]').click();
  await browser.waitUntil(async () => !(await optionText(vrmSelect)).includes('Mika im Kimono'), { timeout: 5000, timeoutMsg: 'Avatar bleibt in der Liste' });
  await browser.$('button=Rückgängig').click();
  await browser.waitUntil(async () => (await optionText(vrmSelect)).includes('Mika im Kimono'), { timeout: 5000, timeoutMsg: 'Rückgängig bringt den Avatar nicht zurück' });
  await browser.pause(9000);
  assert.ok(existsSync(model.path), 'Trotz Rückgängig gelöscht');

  // Remove for good: after the undo time it is in the trash, not gone.
  assert.equal(await select.getValue(), model.path);
  await browser.$('[data-avatar-action="delete"]').click();
  await browser.waitUntil(() => !existsSync(model.path), { timeout: 15_000, timeoutMsg: 'Avatar wird nicht entfernt' });
  const trash = path.join(home, 'data', '.trash', 'avatars');
  assert.ok(readdirSync(trash).some((f) => f.endsWith('Testrig.glb')), 'Avatar liegt nicht im Papierkorb');
  assert.ok(!(await invoke('scan_vrm_models')).some((v) => v.path === model.path));

  // Bundled models: rename yes, remove no.
  const bundled = (await invoke('scan_vrm_models')).find((v) => !v.removable);
  assert.ok(bundled, 'Kein mitgelieferter 3D-Avatar');
  await select.selectByAttribute('value', bundled.path);
  assert.equal(await browser.$('[data-avatar-action="delete"]').isEnabled(), false, 'Mitgelieferter Avatar lässt sich entfernen');
  const live2d = (await invoke('scan_live2d_models'))[0];
  await invoke('rename_avatar', { kind: 'live2d', path: live2d.model_path, name: 'Meine Haru' });
  const renamed = (await invoke('scan_live2d_models')).find((m) => m.id === live2d.id);
  assert.equal(renamed.name, 'Meine Haru');
  assert.equal(renamed.removable, false);
  await invoke('rename_avatar', { kind: 'live2d', path: live2d.model_path, name: '' });
  assert.equal((await invoke('scan_live2d_models')).find((m) => m.id === live2d.id).name, live2d.name, 'Leerer Name stellt nicht zurück');
  console.log('Avatar-Bibliothek: Umbenennen, Entfernen mit Rückgängig, Papierkorb und Schutz mitgelieferter Avatare bestanden.');
} finally {
  await close();
}
