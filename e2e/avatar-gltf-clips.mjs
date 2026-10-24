// glTF avatars with their own animations: a GLB with two idle loops, a wave and a dance clip is
// imported. The viewer plays them from the model (no imported motions): *winkt* starts the wave,
// a happy mood switches to the happy idle loop, the dance (no use) is started from the gestures
// menu, and a use or mood changed in the settings takes effect and is kept.
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
  writeFileSync(glb, await makeGlb({ clips: true, faceBones: true }));
  const model = await invoke('import_vrm_model', { sourcePath: glb });
  assert.equal(model.format, 'gltf');
  const clips = await invoke('list_model_clips', { modelPath: model.path });
  assert.deepEqual(clips.map((c) => [c.name, c.role, c.mood]), [
    ['A_Idle_Breath', 'idle', ''],
    ['Emote_Wave', 'greeting', ''],
    ['Idle_Happy', 'idle', 'happy'],
    ['Dance_Spin', '', ''],
  ]);

  await browser.$('button=Einstellungen').click();
  const select = await browser.$('select[aria-label="3D-Avatar (VRM, glTF oder MMD)"]');
  await select.waitForDisplayed({ timeout: 10_000 });
  await browser.$('button*=Aktualisieren').click().catch(() => {});
  await browser.waitUntil(async () => (await select.getHTML()).includes('Spielfigur'), { timeout: 10_000, timeoutMsg: 'GLB fehlt in der Liste' });
  await select.selectByAttribute('value', model.path);

  await browser.$('button=Chat').click();
  const viewer = '[data-avatar-format="gltf"]';
  await browser.$(`${viewer}[data-motions="4"]`).waitForExist({ timeout: 30_000, timeoutMsg: 'eingebettete Clips werden nicht geladen' });
  await browser.$('button[aria-label="Neutral"]').click();
  await browser.$(`${viewer}[data-motions="4"][data-idle-clip="A_Idle_Breath"]`).waitForExist({ timeout: 10_000, timeoutMsg: 'eingebettete Ruhe-Schleife wird nicht geladen' });
  // No blendshapes, but eyelid and lip bones: the face is driven by bones.
  assert.equal(await browser.$(viewer).getAttribute('data-face'), 'bones', 'Gesicht über Knochen nicht erkannt');
  await reply('*winkt* "Hallo!"');
  await browser.$(`${viewer}[data-gesture="greeting"][data-gesture-clip="Emote_Wave"]`).waitForExist({ timeout: 20_000, timeoutMsg: 'eingebettete Geste startet nicht' });
  await browser.pause(400);
  await shot('65-gltf-eigene-geste');
  await browser.$(`${viewer}[data-gesture=""]`).waitForExist({ timeout: 10_000 });

  // A happy mood switches to the idle loop made for it.
  await browser.$('button[aria-label="Fröhlich"]').click();
  await browser.$(`${viewer}[data-idle-clip="Idle_Happy"]`).waitForExist({ timeout: 10_000, timeoutMsg: 'Ruhe-Schleife folgt der Stimmung nicht' });

  // The dance has no use: it is only offered in the gestures menu.
  await browser.$('button[aria-label="Gesten aus dem Modell"]').click();
  await browser.$('button[title="Dance_Spin abspielen"]').click();
  await browser.$(`${viewer}[data-gesture="Dance_Spin"]`).waitForExist({ timeout: 10_000, timeoutMsg: 'Geste aus dem Menü startet nicht' });
  await browser.$(`${viewer}[data-gesture=""]`).waitForExist({ timeout: 10_000 });

  // The settings list the clips; giving the wave the use "nod" makes *nickt* play it.
  await browser.$('button=Einstellungen').click();
  const section = await browser.$('#setting-model-clips');
  await section.scrollIntoView();
  await browser.$('#setting-model-clips [data-model-clips="4"]').waitForExist({ timeout: 10_000, timeoutMsg: 'Clips fehlen in den Einstellungen' });
  await browser.$('select[aria-label="Verwendung von Emote_Wave"]').selectByAttribute('value', 'nod');
  await browser.$('select[aria-label="Stimmung von Emote_Wave"]').selectByAttribute('value', 'happy');
  await browser.waitUntil(async () => {
    const wave = (await invoke('list_model_clips', { modelPath: model.path }))[1];
    return wave.role === 'nod' && wave.mood === 'happy';
  }, { timeout: 10_000, timeoutMsg: 'Verwendung oder Stimmung wurde nicht gespeichert' });
  await shot('66-gltf-clips-einstellungen');
  await browser.$('button=Chat').click();
  await browser.$(`${viewer}[data-motions="4"]`).waitForExist({ timeout: 30_000 });
  await reply('*nickt* "Gern."');
  await browser.$(`${viewer}[data-gesture="nod"][data-gesture-clip="Emote_Wave"]`).waitForExist({ timeout: 20_000, timeoutMsg: 'geänderte Verwendung greift nicht' });
  console.log('glTF-Clips: Ruhe-Schleife nach Stimmung, Geste aus dem Modell, Gesten-Menü und geänderte Verwendung bestanden.');
} finally {
  await close();
}
