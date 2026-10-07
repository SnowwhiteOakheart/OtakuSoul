// Local check with real third-party avatars from assets/test-avatars/ (gitignored, never
// committed): each .vrm, .glb and .pmx is imported into a throwaway profile, shown as the
// 3D avatar, and screenshotted neutral and happy into assets/test-avatars/screenshots/.
// Not part of `npm run e2e`; run with `xvfb-run -a node e2e/local-avatars.mjs`.
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { launch } from './harness.mjs';

const root = path.resolve('assets/test-avatars');
if (!existsSync(root)) {
  console.log('Kein Ordner assets/test-avatars – nichts zu prüfen.');
  process.exit(0);
}
const out = path.join(root, 'screenshots');
mkdirSync(out, { recursive: true });
const models = readdirSync(root, { recursive: true })
  .map((file) => path.join(root, String(file)))
  .filter((file) => /\.(vrm|glb|pmx|pmd)$/i.test(file) && !file.includes(`${path.sep}screenshots${path.sep}`));

const { browser, close } = await launch({ avatar_mode: '3d' });
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
let failed = 0;
try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.setWindowSize(1280, 840);
  for (const file of models) {
    const name = path.basename(file).replace(/\.[^.]+$/, '');
    const started = Date.now();
    const model = await invoke('import_vrm_model', { sourcePath: file });
    await invoke('save_settings', { settings: { ...(await invoke('load_settings')), active_vrm_path: model.path } });
    await browser.execute(() => location.reload());
    await browser.pause(1000);
    await browser.execute(() => {
      window.__messages = [];
      window.addEventListener('error', (e) => window.__messages.push(`error ${e.message}`));
      for (const level of ['error', 'warn']) {
        const original = console[level];
        console[level] = (...args) => {
          window.__messages.push(`${level} ${args.map(String).join(' ').slice(0, 300)}`);
          original(...args);
        };
      }
    });
    await browser.waitUntil(
      () => browser.execute(() => !!document.querySelector('canvas[data-engine]') && !document.body.innerText.includes('3D-Avatar wird geladen')),
      { timeout: 90_000, timeoutMsg: `${name}: lädt nicht` },
    );
    await browser.pause(2500);
    await browser.saveScreenshot(path.join(out, `${name}-neutral.png`));
    await browser.$('button[aria-label="Fröhlich"]').click().catch(() => {});
    await browser.pause(1500);
    await browser.saveScreenshot(path.join(out, `${name}-froehlich.png`));
    const messages = (await browser.execute(() => window.__messages)).filter((m) => !m.includes("Couldn't find callback id"));
    const format = await browser.execute(() => document.querySelector('[data-avatar-format]')?.getAttribute('data-avatar-format') ?? 'vrm');
    const error = await browser.execute(() => document.body.innerText.includes('konnte nicht geladen werden'));
    if (error) failed += 1;
    console.log(`${error ? '✘' : '✔'} ${name} (${format}, ${Math.round((Date.now() - started) / 1000)} s)${messages.length ? `\n    ${messages.join('\n    ')}` : ''}`);
  }
} finally {
  await close();
}
process.exit(failed ? 1 : 0);
