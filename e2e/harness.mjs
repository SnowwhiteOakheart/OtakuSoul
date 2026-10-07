// Starts the debug build of the app under tauri-driver with a throwaway profile
// (OTAKUSOUL_HOME) and the mock LLM, so a test never touches the real data.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { remote } from 'webdriverio';
import { startMockLlm } from './mock-llm.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Own target dir: `cargo test`/`clippy` rebuild target/debug/otakusoul without the bundled
// frontend (it would try to load the Vite dev server). With OTAKUSOUL_E2E_DEV=1 the test runs
// exactly that dev binary instead – like `npm run tauri dev`, so the Vite server must be running.
const exe = process.platform === 'win32' ? 'otakusoul.exe' : 'otakusoul';
const binary = process.env.OTAKUSOUL_E2E_DEV === '1'
  ? path.join(root, 'target', 'debug', exe)
  : path.join(root, 'target', 'e2e', 'debug', exe);
export const screenshotDir = path.join(root, 'e2e', 'screenshots');

const waitForPort = async (port, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const open = await new Promise((resolve) => {
      const socket = net.connect(port, '127.0.0.1');
      socket.once('connect', () => (socket.end(), resolve(true)));
      socket.once('error', () => resolve(false));
    });
    if (open) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`tauri-driver did not open port ${port}`);
};

/** Settings for the fresh profile: wizard done, cloud backend pointing at the mock. */
/** The app may still write its profile while shutting down; retry instead of failing (ENOTEMPTY). */
const removeHome = (home) => rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });

export async function launch(settings = {}) {
  const mock = await startMockLlm();
  const home = mkdtempSync(path.join(tmpdir(), 'otakusoul-e2e-'));
  mkdirSync(path.join(home, 'config'), { recursive: true });
  writeFileSync(
    path.join(home, 'config', 'settings.json'),
    JSON.stringify({
      onboarding_completed: true,
      app_language: 'de',
      reply_language: 'Deutsch',
      selected_backend: 'cloud',
      cloud_provider: 'custom',
      cloud_endpoint: mock.url,
      cloud_model: 'mock',
      ...settings,
    }),
  );
  mkdirSync(screenshotDir, { recursive: true });

  const driver = spawn('tauri-driver', [], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      OTAKUSOUL_HOME: home,
      GDK_BACKEND: process.env.GDK_BACKEND ?? 'x11',
      WEBKIT_DISABLE_DMABUF_RENDERER: '1',
    },
  });
  try {
    await waitForPort(4444);
    const browser = await remote({
      hostname: '127.0.0.1',
      port: 4444,
      logLevel: 'error',
      capabilities: { 'tauri:options': { application: binary } },
    });
    // Each run gets its own webview storage (<home>/webview): a marker from an earlier run
    // would mean localStorage is shared with other runs or the real installation.
    await browser.waitUntil(() => browser.execute(() => document.readyState === 'complete'), { timeout: 30_000 });
    if (await browser.execute(() => localStorage.getItem('otakusoul.e2eRun'))) {
      await browser.deleteSession().catch(() => {});
      throw new Error('Webview-Speicher ist nicht isoliert (Marker eines früheren Laufs gefunden)');
    }
    await browser.execute(() => localStorage.setItem('otakusoul.e2eRun', '1'));
    const close = async () => {
      await browser.deleteSession().catch(() => {});
      driver.kill();
      await mock.close();
      removeHome(home);
    };
    return { browser, mock, home, close };
  } catch (e) {
    driver.kill();
    await mock.close();
    removeHome(home);
    throw e;
  }
}

/** Clicks „Senden“ once it is enabled: it stays locked until the chat of the character is open. */
export async function clickSend(browser) {
  const button = await browser.$('button[aria-label="Nachricht senden"]');
  await button.waitForEnabled({ timeout: 20_000 });
  await button.click();
}
