// OBS overlay with the 3D figure (B6): the main window names the active figure's VRM, the web
// server serves only that file and only with the overlay token, plus the 3D script; the overlay
// page then shows the figure instead of the portrait. The page is opened in the test window
// itself (the main window's last state stays in the backend).
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, close } = await launch({ avatar_mode: '3d' });
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const vrm = path.resolve('assets/vrm/Seed-san.vrm');
  const model = await invoke('import_vrm_model', { sourcePath: vrm });
  const settings = await invoke('load_settings');
  const characters = await invoke('scan_characters');
  const profile = characters.find((c) => c.id === settings.active_character_id) ?? characters[0];
  profile.card.data.extensions = { ...profile.card.data.extensions, custom_vrm: model.path };
  await invoke('save_character_card', { profile });

  const port = 18_000 + Math.floor(Math.random() * 1000);
  const config = await invoke('get_web_server_config');
  await invoke('save_web_server_config', { config: { ...config, host: '127.0.0.1', port } });
  await invoke('start_web_server');
  const { overlay_token: token, auth_token: phoneToken } = await invoke('get_web_server_status');
  const base = `http://127.0.0.1:${port}`;
  // The main window reads the saved card anew and tells the backend the figure's model.
  await browser.refresh();
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });

  // The 3D script is code (no token); the model needs the overlay token, not the phone's.
  const script = await fetch(`${base}/overlay/3d.js`);
  assert.equal(script.status, 200, 'Overlay-Skript fehlt (npm run build?)');
  assert.match(script.headers.get('content-type') ?? '', /javascript/);
  assert.equal((await fetch(`${base}/overlay/model`)).status, 401, 'Modell ohne Token ausgeliefert');
  assert.equal((await fetch(`${base}/overlay/model?token=${phoneToken}`)).status, 401, 'Handy-Token öffnet das Modell');
  let bytes = 0;
  await browser.waitUntil(async () => {
    const response = await fetch(`${base}/overlay/model?token=${token}`);
    bytes = response.ok ? (await response.arrayBuffer()).byteLength : 0;
    return bytes > 0;
  }, { timeout: 20_000, timeoutMsg: 'Hauptfenster meldet kein Modell' });
  assert.equal(bytes, statSync(vrm).size, 'ausgeliefertes Modell ist nicht die VRM-Datei');

  // The page OBS loads: the 3D figure instead of the portrait.
  await browser.url(`${base}/overlay?token=${token}&bg=%23203040`);
  await browser.waitUntil(async () => (await browser.execute(() => document.documentElement.dataset.overlayModel)) === 'vrm', {
    timeout: 60_000,
    timeoutMsg: 'Overlay zeigt keine 3D-Figur',
  });
  const shown = await browser.execute(() => ({
    canvas: getComputedStyle(document.getElementById('model3d')).display,
    portrait: getComputedStyle(document.getElementById('portrait')).display,
  }));
  assert.deepEqual(shown, { canvas: 'block', portrait: 'none' });
  await browser.pause(1500);
  await browser.saveScreenshot(path.join(screenshotDir, '122-overlay-3d.png'));

  // `model3d=0` keeps the portrait.
  await browser.url(`${base}/overlay?token=${token}&model3d=0`);
  await browser.pause(3000);
  assert.equal(await browser.execute(() => document.documentElement.dataset.overlayModel ?? ''), '', '3D trotz model3d=0');
  console.log('OBS-Overlay mit 3D-Figur: Skript, Modell nur mit Overlay-Token, Figur statt Porträt bestanden.');
} finally {
  await close();
}
