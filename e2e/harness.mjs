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

/** `hubFiles`: files the mock serves as the data repository from the start (e.g. catalogs fetched at launch). */
export async function launch(settings = {}, { hubFiles } = {}) {
  const mock = await startMockLlm();
  if (hubFiles) mock.stats.hubFiles = hubFiles;
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
      // Stage opens the demo scene instead of the story gallery (tests of the gallery override this).
      stage_last_scene: 'default_scene',
      // Tests start in the chat; the start page has its own test.
      start_tab: 'chat',
      // The mock answers every chat with the same text: no automatic rewrite (own test: chat-repeats).
      reroll_repeats: false,
      ...settings,
    }),
  );
  mkdirSync(screenshotDir, { recursive: true });

  const driver = spawn('tauri-driver', [], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      OTAKUSOUL_HOME: home,
      OTAKUSOUL_HUB_BASE: mock.url.replace('/v1/chat/completions', '/hub'),
      OTAKUSOUL_NSFW_HUB_BASE: mock.url.replace('/v1/chat/completions', '/hub-nsfw'),
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
  // A toast in the corner (e.g. "System-Prompt gespeichert") can cover the button for a moment.
  await button.waitForClickable({ timeout: 20_000 });
  await button.click();
}

/** Opens the scene management of Stage: story gallery → "Szenen verwalten". */
export async function openSceneLobby(browser) {
  if (!(await browser.$('[data-story-gallery]').isExisting())) await browser.$('button=Geschichten').click();
  await browser.$('button=Szenen verwalten').click();
  await browser.$('#scene-lobby-title').waitForDisplayed({ timeout: 10_000 });
}

/**
 * Writes settings straight to the settings file and reloads the page. The app saves its own state
 * while starting (e.g. once it opened the first character), which would overwrite a write made
 * too early: wait for that, write, and write again if the app still got in between.
 */
export async function saveSettingsAndReload(browser, patch) {
  // oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
  const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
  await browser.waitUntil(async () => !!(await invoke('load_settings')).active_character_id, {
    timeout: 30_000,
    timeoutMsg: 'App hat ihren Startzustand nicht gespeichert',
  });
  const applied = (settings) => Object.entries(patch).every(([key, value]) => JSON.stringify(settings[key]) === JSON.stringify(value));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await invoke('save_settings', { settings: { ...(await invoke('load_settings')), ...patch } });
    await browser.pause(1500);
    if (applied(await invoke('load_settings'))) break;
  }
  await browser.execute(() => location.reload());
  // Asking the page right away can leave WebKit's driver on the old document.
  await browser.pause(1000);
}
