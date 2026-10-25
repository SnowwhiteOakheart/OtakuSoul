// LoRA adapters for the local chat model: the catalog offers adapters for the chosen Gemma 4 model,
// uncensor adapters only with 18+ on (list, download and choice), choosing one stores it with the
// model, expert mode shows the strength. Model and adapter are sparse files of the catalog size in
// the test profile, so nothing is downloaded and no server starts.
import assert from 'node:assert/strict';
import { mkdirSync, truncateSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, saveSettingsAndReload, screenshotDir } from './harness.mjs';

const sparse = (file, size) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, '');
  truncateSync(file, size);
};

const { browser, home, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const call = async (command, args = {}) => {
  try {
    return await browser.executeAsync((cmd, payload, done) => window.__TAURI_INTERNALS__.invoke(cmd, payload)
      .then((value) => done({ ok: true, value }), (error) => done({ ok: false, error: String(error) })), command, args);
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
};
const value = async (command, args) => {
  const result = await call(command, args);
  assert.ok(result.ok, `${command}: ${result.error}`);
  return result.value;
};
const openServerTab = async () => {
  await browser.$('button=Einstellungen').click();
  const tab = await browser.$('#settings-tab-server');
  await tab.waitForDisplayed({ timeout: 10_000 });
  await tab.click();
  await browser.$('#settings-mmproj').waitForDisplayed({ timeout: 10_000 });
};

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const model = path.join(home, 'data', 'models', 'gemma-4-E4B-it-Q4_K_M.gguf');
  sparse(model, 1024);
  const adapter = path.join(home, 'data', 'chat-loras', 'gemma-4-e4b-heretic.gguf');
  sparse(adapter, 213_248);
  const settings = await value('load_settings');
  await saveSettingsAndReload(browser, { server_config: { ...settings.server_config, model_path: model, lora_path: null, lora_scale: 1 } });
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });

  // 18+ off: no uncensor adapter in the list, none can be downloaded, the E4B has none to offer.
  const safe = await value('list_chat_loras');
  assert.ok(safe.length > 0 && safe.every((l) => !l.nsfw), `Adapter für Erwachsene sichtbar: ${JSON.stringify(safe.map((l) => l.id))}`);
  const refused = await call('download_chat_lora', { id: 'gemma-4-e4b-heretic' });
  assert.ok(!refused.ok && refused.error.includes('backend.nsfw.disabled'), `Download ohne 18+: ${JSON.stringify(refused)}`);
  await openServerTab();
  assert.ok(!(await browser.$('#settings-chat-lora').isExisting()), 'Adapter-Auswahl ohne passende Adapter sichtbar');

  // 18+ on: the adapter for this model is offered and already on disk.
  await saveSettingsAndReload(browser, { nsfw_enabled: true, adult_confirmed: true, expert_mode: true });
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const all = await value('list_chat_loras');
  const heretic = all.find((l) => l.id === 'gemma-4-e4b-heretic');
  assert.ok(heretic?.installed && heretic.nsfw, `E4B-Adapter fehlt oder nicht erkannt: ${JSON.stringify(heretic)}`);
  assert.ok(all.some((l) => l.id === 'gemma-4-26b-a4b-abliterated') && all.some((l) => l.kind === 'style'), 'Katalog unvollständig');
  await openServerTab();
  const select = await browser.$('#settings-chat-lora');
  await select.waitForDisplayed({ timeout: 10_000 });
  const options = await browser.execute((el) => [...el.options].map((o) => o.textContent), select);
  assert.equal(options.length, 2, `Nur „Keiner“ und der E4B-Adapter erwartet: ${options}`);
  assert.ok(options[1].includes('Heretic') && options[1].includes('18+') && !options[1].includes('laden'), options[1]);
  await select.selectByAttribute('value', 'gemma-4-e4b-heretic');
  await browser.waitUntil(async () => (await value('load_settings')).server_config.lora_path === adapter, {
    timeout: 10_000,
    timeoutMsg: 'Adapter wird nicht gespeichert',
  });

  // Description, licence mark and strength (expert mode).
  await browser.$('[data-chat-lora-license="restricted"]').waitForDisplayed({ timeout: 5000 });
  const hint = await browser.$('#settings-chat-lora-hint').getText();
  assert.ok(hint.includes('Ablehnungen'), `Beschreibung fehlt: ${hint}`);
  const slider = await browser.$('#settings-chat-lora-scale');
  await slider.waitForDisplayed();
  await browser.execute((el) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '0.75');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  }, slider);
  await browser.waitUntil(async () => (await value('load_settings')).server_config.lora_scale === 0.75, {
    timeout: 10_000,
    timeoutMsg: 'Stärke wird nicht gespeichert',
  });
  await browser.execute(() => document.querySelector('[data-chat-lora]')?.scrollIntoView({ block: 'center' }));
  await browser.pause(400);
  await browser.saveScreenshot(path.join(screenshotDir, '110-chat-lora.png'));

  // Back to none.
  await select.selectByAttribute('value', '');
  await browser.waitUntil(async () => (await value('load_settings')).server_config.lora_path === null, {
    timeout: 10_000,
    timeoutMsg: 'Adapter lässt sich nicht abwählen',
  });
  console.log('Chat-LoRAs: Katalog je Modell, 18+-Sperre für Liste und Download, Auswahl mit Stärke und Abwahl bestanden.');
} finally {
  await close();
}
