// glTF avatars with their own animations: a GLB with an idle loop and a wave clip is imported,
// the viewer plays both from the model (no imported motions), *winkt* starts the wave, and a
// use changed in the settings takes effect on the open avatar.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';
import { makeGlb } from './tools/make-glb.mjs';

const { browser, mock, home, close } = await launch({ avatar_mode: '3d' });
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const reply = async (text) => {
  mock.stats.chatReply = text;
  await browser.$('textarea[aria-label="Nachricht"]').setValue('Und jetzt?');
  await clickSend(browser);
};

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.setWindowSize(1280, 840);
  const glb = path.join(home, 'Spielfigur.glb');
  writeFileSync(glb, await makeGlb({ clips: true }));
  const model = await invoke('import_vrm_model', { sourcePath: glb });
  assert.equal(model.format, 'gltf');
  const clips = await invoke('list_model_clips', { modelPath: model.path });
  assert.deepEqual(clips.map((c) => [c.name, c.role]), [['A_Idle_Breath', 'idle'], ['Emote_Wave', 'greeting']]);

  await browser.$('button=Einstellungen').click();
  const select = await browser.$('select[aria-label="3D-Avatar (VRM, glTF oder MMD)"]');
  await select.waitForDisplayed({ timeout: 10_000 });
  await browser.$('button*=Aktualisieren').click().catch(() => {});
  await browser.waitUntil(async () => (await select.getHTML()).includes('Spielfigur'), { timeout: 10_000, timeoutMsg: 'GLB fehlt in der Liste' });
  await select.selectByAttribute('value', model.path);

  await browser.$('button=Chat').click();
  await browser.$('[data-avatar-format="gltf"][data-motions="2"]').waitForExist({ timeout: 30_000, timeoutMsg: 'eingebettete Clips werden nicht geladen' });
  await reply('*winkt fröhlich* "Hallo!"');
  await browser.$('[data-avatar-format="gltf"][data-gesture="greeting"]').waitForExist({ timeout: 20_000, timeoutMsg: 'eingebettete Geste startet nicht' });
  await browser.pause(400);
  await shot('65-gltf-eigene-geste');
  await browser.$('[data-avatar-format="gltf"][data-gesture=""]').waitForExist({ timeout: 10_000 });

  // The settings list the clips; giving the wave the use "nod" makes *nickt* play it.
  await browser.$('button=Einstellungen').click();
  const section = await browser.$('#setting-model-clips');
  await section.scrollIntoView();
  await browser.$('#setting-model-clips [data-model-clips="2"]').waitForExist({ timeout: 10_000, timeoutMsg: 'Clips fehlen in den Einstellungen' });
  await browser.$('select[aria-label="Verwendung von Emote_Wave"]').selectByAttribute('value', 'nod');
  await browser.waitUntil(async () => (await invoke('list_model_clips', { modelPath: model.path }))[1].role === 'nod', {
    timeout: 10_000,
    timeoutMsg: 'Verwendung wurde nicht gespeichert',
  });
  await shot('66-gltf-clips-einstellungen');
  await browser.$('button=Chat').click();
  await browser.$('[data-avatar-format="gltf"][data-motions="2"]').waitForExist({ timeout: 30_000 });
  await reply('*nickt* "Gern."');
  await browser.$('[data-avatar-format="gltf"][data-gesture="nod"]').waitForExist({ timeout: 20_000, timeoutMsg: 'geänderte Verwendung greift nicht' });
  console.log('glTF-Clips: eigene Ruhe-Schleife, Geste aus dem Modell und geänderte Verwendung bestanden.');
} finally {
  await close();
}
