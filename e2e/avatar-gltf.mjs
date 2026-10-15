// glTF avatars: a GLB with a Mixamo-style rig and ARKit blendshapes is imported, chosen as 3D
// avatar, rendered by the glTF viewer, and a Mixamo FBX motion plays on it on *nickt*.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';
import { makeGlb, makeStatueGlb } from './tools/make-glb.mjs';
import { makeMixamoFbx } from './tools/make-fbx.mjs';

const { browser, mock, home, close } = await launch({ avatar_mode: '3d' });
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.setWindowSize(1280, 840);
  const glb = path.join(home, 'Testrig.glb');
  writeFileSync(glb, await makeGlb());
  const model = await invoke('import_vrm_model', { sourcePath: glb });
  assert.equal(model.format, 'gltf');
  const fbx = path.join(home, 'Mixamo Nod.fbx');
  writeFileSync(fbx, makeMixamoFbx());
  await invoke('import_avatar_motion', { sourcePath: fbx });

  await browser.$('button=Einstellungen').click();
  const select = await browser.$('select[aria-label="3D-Avatar (VRM, glTF oder MMD)"]');
  await select.waitForDisplayed({ timeout: 10_000 });
  await browser.$('button*=Aktualisieren').click().catch(() => {});
  await browser.waitUntil(async () => (await select.getHTML()).includes('Testrig'), { timeout: 10_000, timeoutMsg: 'GLB fehlt in der Liste' });
  await select.selectByAttribute('value', model.path);

  await browser.$('button=Chat').click();
  await browser.$('[data-avatar-format="gltf"][data-motions="1"]').waitForExist({ timeout: 30_000, timeoutMsg: 'glTF-Viewer oder Mixamo-Bewegung fehlt' });
  assert.ok(!(await browser.$('body').getText()).includes('konnte nicht geladen werden'), 'Fehlermeldung im Viewer');
  await browser.pause(800);
  await shot('63-gltf-avatar');

  mock.stats.chatReply = '*nickt lächelnd* "Klar!"';
  await browser.$('textarea[aria-label="Nachricht"]').setValue('Machst du mit?');
  await clickSend(browser);
  await browser.$('[data-avatar-format="gltf"][data-gesture="nod"]').waitForExist({ timeout: 20_000, timeoutMsg: 'Mixamo-Geste startet nicht' });
  await browser.pause(500);
  await shot('64-gltf-mixamo');
  await browser.$('[data-avatar-format="gltf"][data-gesture=""]').waitForExist({ timeout: 10_000 });

  // A model without skeleton is refused on import; one copied into the folder by hand is not shown.
  const statue = path.join(home, 'Statue.glb');
  writeFileSync(statue, await makeStatueGlb());
  const refused = await browser.execute((sourcePath) => window.__TAURI_INTERNALS__.invoke('import_vrm_model', { sourcePath })
    .then(() => 'importiert', (cause) => String(cause)), statue);
  assert.ok(refused.includes('backend.vrm.noSkeleton'), `Statue wurde nicht abgelehnt: ${refused}`);
  const handCopy = path.join(home, 'data', 'avatars', 'Handkopie.glb');
  writeFileSync(handCopy, await makeStatueGlb());
  await browser.$('button=Einstellungen').click();
  await browser.$('button*=Aktualisieren').click().catch(() => {});
  await browser.waitUntil(async () => (await select.getHTML()).includes('Handkopie'), { timeout: 10_000, timeoutMsg: 'Handkopie fehlt in der Liste' });
  const listed = (await invoke('scan_vrm_models')).find((m) => m.name === 'Handkopie');
  assert.ok(listed, 'Handkopie fehlt im Scan');
  await select.selectByAttribute('value', listed.path);
  await browser.$('button=Chat').click();
  await browser.$('div*=hat kein Skelett und wird nicht angezeigt').waitForExist({ timeout: 20_000, timeoutMsg: 'Viewer zeigt die Statue ohne Hinweis' });
  await shot('64b-gltf-ohne-skelett');
  console.log('glTF: Import, Anzeige, Mixamo-Geste und Ablehnung von Modellen ohne Skelett bestanden.');
} finally {
  await close();
}
