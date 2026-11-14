// Local check of the desktop pet's 3D poses with a real model and the motion pack from the
// user's profile (`<Daten>/animations`, e.g. Quaternius): the pet interface is shown in the test
// window (`?pet=true`) and screenshotted standing (idle motion), standing without motions and
// sitting on the ground, for one VRM 0.x and one VRM 1.0 model of `assets/vrm`.
// Not part of `npm run e2e`; run with `xvfb-run -a node e2e/local-pet-pose.mjs`
// (`OTAKUSOUL_AVATAR=part-of-name` for a single model, `OTAKUSOUL_SHOTS=<folder>` for the output).
// Standing it is also lifted by shoulders, hips and feet and let go (`OTAKUSOUL_HANG=0` skips that).
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { launch } from './harness.mjs';

const motionsSource = path.join(process.env.XDG_DATA_HOME ?? path.join(homedir(), '.local', 'share'), 'otakusoul', 'animations');
const out = path.resolve(process.env.OTAKUSOUL_SHOTS ?? 'e2e/screenshots');
mkdirSync(out, { recursive: true });
const models = (process.env.OTAKUSOUL_AVATAR ?? 'Hoshika,Seed-san').split(',').map((name) => path.resolve('assets/vrm', `${name}.vrm`));

/** The pack's files (VRMA and `roles.json`), placed in the profile before the start. */
const packFiles = () => {
  if (!existsSync(motionsSource)) return {};
  return Object.fromEntries(
    readdirSync(motionsSource)
      .filter((file) => /\.(vrma|json)$/i.test(file) && file !== 'model_faces.json')
      .map((file) => [path.join('data', 'animations', file), readFileSync(path.join(motionsSource, file))]),
  );
};

const state = (model, motions) => ({
  characterName: 'Test', modelPath: model.path, vrmPath: model.path, inochi2dPath: '', live2dPath: '', portraitPath: '',
  emotion: 'neutral', expression: 'neutral', motions, gesture: null, appLanguage: 'de', theme: 'obsidian',
  colorMode: 'dark', thinking: false,
});

for (const withPack of [true, false]) {
  const { browser, close } = await launch({ avatar_mode: '3d' }, { homeFiles: withPack ? packFiles() : {} });
  // oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
  const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
  const emit = (event, payload) => invoke('plugin:event|emit', { event, payload });
  try {
    await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
    for (const file of models) {
      const name = path.basename(file).replace(/\.[^.]+$/, '');
      const model = await invoke('import_vrm_model', { sourcePath: file });
      const motions = await invoke('scan_avatar_motions');
      for (const pose of ['stand', 'sit']) {
        // No gravity, no random actions: the posture is what the menu says.
        await browser.execute((p) => {
          localStorage.setItem('otakusoul.desktopPetPrefs', JSON.stringify({ physics: false, idleActions: false, pose: p, frameRate: 30 }));
        }, pose);
        await browser.setWindowSize(300, 440);
        await browser.execute(() => window.location.assign(`${window.location.pathname}?pet=true`));
        await browser.$('[data-desktop-pet]').waitForExist({ timeout: 30_000, timeoutMsg: 'Pet-Oberfläche fehlt' });
        await browser.waitUntil(async () => {
          await emit('pet:state', state(model, motions));
          return browser.$('[data-motions]').isExisting();
        }, { timeout: 60_000, interval: 1000, timeoutMsg: `${name}: lädt nicht` });
        await browser.pause(4000);
        const tag = `${name}-${withPack ? 'mit-paket' : 'ohne-paket'}-${pose}`;
        await browser.saveScreenshot(path.join(out, `${tag}.png`));
        console.log(`${tag}: ${motions.length} Bewegungen`);
        if (pose !== 'stand' || process.env.OTAKUSOUL_HANG === '0') continue;
        // Lifted by shoulders, hips and feet (`pet:test-hang`, no real drag), then let go: the
        // landing (head, backside) with sitting, rubbing and standing up again.
        // Sideways from the middle in window heights, height as share (`HangPoint`).
        const grips = { shoulder: { x: -0.03, y: 0.32 }, hip: { x: -0.03, y: 0.6 }, feet: { x: -0.03, y: 0.93 } };
        for (const [grip, at] of Object.entries(grips)) {
          await emit('pet:test-hang', { grip, at });
          await browser.pause(1800);
          await browser.saveScreenshot(path.join(out, `${tag}-haengt-${grip}.png`));
          // Carried to the right (after it swung out): the body must trail behind on the left.
          await browser.pause(4000);
          await emit('pet:test-hang', { move: 1.5, ms: 3000 });
          for (const at of [1200, 2400]) {
            await browser.pause(1200);
            await browser.saveScreenshot(path.join(out, `${tag}-haengt-${grip}-nach-rechts-${at}.png`));
          }
          await browser.pause(3000);
          await emit('pet:test-hang', { at });
          for (const [label, wait] of [['aufprall', 350], ['sitzt', 1400], ['steht', 3500]]) {
            await browser.pause(wait);
            await browser.saveScreenshot(path.join(out, `${tag}-${grip}-${label}.png`));
          }
        }
      }
    }
  } finally {
    await close();
  }
}
process.exit(0);
