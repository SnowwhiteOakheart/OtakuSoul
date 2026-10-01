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
const binary = path.join(root, 'target', 'debug', process.platform === 'win32' ? 'otakusoul.exe' : 'otakusoul');
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
    const close = async () => {
      await browser.deleteSession().catch(() => {});
      driver.kill();
      await mock.close();
      rmSync(home, { recursive: true, force: true });
    };
    return { browser, mock, home, close };
  } catch (e) {
    driver.kill();
    await mock.close();
    rmSync(home, { recursive: true, force: true });
    throw e;
  }
}
