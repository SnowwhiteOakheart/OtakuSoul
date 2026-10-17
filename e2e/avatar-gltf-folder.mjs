// glTF avatars as a folder: a .gltf with its Body.bin and a texture whose name differs in case is
// imported with its folder, listed, and shown by the glTF viewer with the face found.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';
import { writeGltfFolder } from './tools/make-glb.mjs';

const { browser, home, close } = await launch({ avatar_mode: '3d' });
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.setWindowSize(1280, 840);
  const folder = path.join(home, 'Download', 'Ordnerfigur');
  mkdirSync(folder, { recursive: true });
  const file = await writeGltfFolder(folder, 'Ordnerfigur');
  const model = await invoke('import_vrm_model', { sourcePath: file });
  assert.equal(model.format, 'gltf');
  assert.ok(model.path.endsWith(path.join('Ordnerfigur', 'Ordnerfigur.gltf')), model.path);
  for (const part of ['Body.bin', path.join('tex', 'skin.png')]) {
    assert.ok(existsSync(path.join(path.dirname(model.path), part)), `${part} nicht mitkopiert`);
  }
  assert.ok((await invoke('scan_vrm_models')).some((m) => m.path === model.path && m.format === 'gltf'), 'Ordnermodell fehlt in der Liste');

  await invoke('save_settings', { settings: { ...(await invoke('load_settings')), active_vrm_path: model.path } });
  await browser.execute(() => location.reload());
  // Asking the page right away can leave WebKit's driver on the old document.
  await browser.pause(1000);
  await browser.$('[data-avatar-format="gltf"][data-face="morphs"]').waitForExist({ timeout: 30_000, timeoutMsg: 'glTF-Ordnermodell wird nicht angezeigt' });
  assert.ok(!(await browser.$('body').getText()).includes('konnte nicht geladen werden'), 'Fehlermeldung im Viewer');
  await browser.pause(500);
  await browser.saveScreenshot(path.join(screenshotDir, '67-gltf-ordner.png'));
  console.log('glTF-Ordner: Import mit .bin und Textur, Liste und Anzeige bestanden.');
} finally {
  await close();
}
