// Closing the window like the window manager's close button: the first time a hint explains
// the tray and the window hides only after confirming; later it hides at once; with the setting
// off the app quits. Needs X11 (the harness runs WebKitGTK with GDK_BACKEND=x11).
import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, screenshotDir } from './harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const wmclose = path.join(here, 'tools', 'wmclose.py');
const binary = path.join(here, '..', 'target', 'e2e', 'debug', 'otakusoul');
// The close request goes through X11; a Wayland session (GDK_BACKEND=wayland) would open the
// window natively where it can't be reached.
process.env.GDK_BACKEND = 'x11';
const { browser, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const appPids = () => {
  try {
    return execSync(`pgrep -f "^${binary}"`).toString().trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
};
const clickClose = (pid) => {
  try {
    return execFileSync('python3', [wmclose, pid], { stdio: 'pipe' }).toString().trim();
  } catch (e) {
    throw new Error(`wmclose: ${e.stderr}`);
  }
};

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const [pid] = appPids();
  assert.ok(pid, 'App-Prozess nicht gefunden');

  // First close: hint, window stays until confirmed.
  assert.match(clickClose(pid), /^sent [1-9]/, 'kein Fenster der App gefunden');
  const hint = await browser.$('h2=OtakuSoul läuft im Tray weiter');
  await hint.waitForDisplayed({ timeout: 5000 });
  await browser.saveScreenshot(path.join(screenshotDir, '31-tray-hinweis.png'));
  await browser.$('button=Im Tray weiterlaufen').click();
  await browser.waitUntil(async () => (await invoke('load_settings')).tray_hint_shown === true, { timeout: 5000, timeoutMsg: 'Hinweis nicht gespeichert' });
  assert.deepEqual(appPids(), [pid], 'App hat sich beendet statt ins Tray zu gehen');

  // Second close: hides at once, still running.
  clickClose(pid);
  await sleep(1500);
  assert.ok(!(await browser.$('h2=OtakuSoul läuft im Tray weiter').isExisting()), 'Hinweis erscheint erneut');
  assert.deepEqual(appPids(), [pid]);

  // Setting off: the close button quits the app.
  const settings = await invoke('load_settings');
  await invoke('save_settings', { settings: { ...settings, close_to_tray: false } });
  clickClose(pid);
  const quit = Date.now();
  while (appPids().includes(pid) && Date.now() - quit < 15_000) await sleep(250);
  assert.ok(!appPids().includes(pid), 'App läuft nach dem Schließen weiter');
  console.log('Schließen: Hinweis beim ersten Mal, danach Tray, ausgeschaltet beendet bestanden.');
} finally {
  await close().catch(() => {});
}
