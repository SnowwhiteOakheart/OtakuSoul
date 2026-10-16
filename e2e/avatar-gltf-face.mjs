// Face editor: a glTF avatar whose blendshapes have unknown names shows no face at first; giving
// "happy" a face shape in the editor saves it per model and the viewer then drives the morphs.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';
import { makeGlb } from './tools/make-glb.mjs';

const { browser, home, close } = await launch({ avatar_mode: '3d' });
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const viewer = '[data-avatar-format="gltf"]';

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.setWindowSize(1280, 840);
  const glb = path.join(home, 'Fremdgesicht.glb');
  writeFileSync(glb, await makeGlb({ customMorphs: true }));
  const model = await invoke('import_vrm_model', { sourcePath: glb });
  assert.deepEqual((await invoke('get_model_face', { modelPath: model.path })).available, ['Mouth_A', 'Eye_Close_L', 'Eye_Close_R', 'Face_Smile_L', 'Face_Smile_R']);

  await invoke('save_settings', { settings: { ...(await invoke('load_settings')), active_vrm_path: model.path } });
  await browser.execute(() => location.reload());
  await browser.$(`${viewer}[data-face="none"]`).waitForExist({ timeout: 30_000, timeoutMsg: 'unbekannte Gesichtsformen wurden fälschlich erkannt' });

  await browser.$('button=Einstellungen').click();
  const editor = await browser.$('#setting-model-face [data-face-editor="5"]');
  await editor.waitForExist({ timeout: 10_000, timeoutMsg: 'Gesichts-Editor fehlt' });
  await editor.scrollIntoView();
  const chooseMorph = (key) => browser.$(`#setting-model-face [data-face-key="${key}"]`).$('button*=Gesichtsform wählen').click();
  await chooseMorph('happy');
  await browser.$('select[aria-label="Gesichtsform für Fröhlich"]').selectByVisibleText('Face_Smile_L');
  await chooseMorph('blink');
  await browser.$('select[aria-label="Gesichtsform für Blinzeln"]').selectByVisibleText('Eye_Close_L');
  await browser.waitUntil(async () => {
    const { face } = await invoke('get_model_face', { modelPath: model.path });
    return face.morphs.happy?.[0]?.morph === 'Face_Smile_L' && face.morphs.blink?.[0]?.morph === 'Eye_Close_L';
  }, { timeout: 10_000, timeoutMsg: 'Gesicht wurde nicht gespeichert' });
  await browser.saveScreenshot(path.join(screenshotDir, '68-gesichts-editor.png'));

  // The live preview shows the model right in the settings, with the face just set up.
  await browser.$('#setting-model-face').$('button*=Live-Vorschau').click();
  await browser.$(`[data-face-live] ${viewer}[data-face="morphs"]`).waitForExist({ timeout: 30_000, timeoutMsg: 'Live-Vorschau zeigt das Modell nicht' });
  await browser.$('button[aria-label="Fröhlich zeigen"]').click();
  await browser.pause(400);
  await browser.saveScreenshot(path.join(screenshotDir, '69-gesichts-vorschau.png'));

  await browser.$('button=Chat').click();
  await browser.$(`${viewer}[data-face="morphs"]`).waitForExist({ timeout: 30_000, timeoutMsg: 'eigene Gesichtsformen werden nicht genutzt' });
  const keys = await browser.$(viewer).getAttribute('data-face-keys');
  assert.equal(keys, 'blink happy', `zugeordnete Ausdrücke: ${keys}`);
  console.log('Gesichts-Editor: unbekannte Gesichtsformen zugeordnet, gespeichert und im Viewer genutzt.');
} finally {
  await close();
}
