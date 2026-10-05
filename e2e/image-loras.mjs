// Local image LoRAs: the catalog for the chosen model family, own files, choosing a LoRA with
// its weight and saving it into the image settings. Model and LoRA files are sparse files of
// the catalog size, so nothing is downloaded and nothing is generated.
import assert from 'node:assert/strict';
import { mkdirSync, truncateSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, home, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));
const sparse = (dir, name, size) => {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  writeFileSync(file, '');
  truncateSync(file, size);
};

try {
  await browser.$('button=Integrationen').waitForExist({ timeout: 20_000 });
  const data = path.join(home, 'data');
  sparse(path.join(data, 'image-models'), 'animagine-xl-4.0-opt.safetensors', 6_938_350_040);
  sparse(path.join(data, 'loras'), 'pastel-anime-xl-latest.safetensors', 197_245_728);
  writeFileSync(path.join(data, 'loras', 'mein-stil.safetensors'), 'x');
  const config = await invoke('get_image_gen_config');
  await invoke('save_image_gen_config', { config: { ...config, provider: 'local', local_model_id: 'animagine-xl-4' } });

  // Image models and LoRAs are configured in the settings.
  await browser.$('button=Einstellungen').click();
  await browser.$('#settings-tab-image').click();
  const list = await browser.$('ul[aria-label="LoRAs (Stil-Erweiterungen)"]');
  await list.waitForDisplayed({ timeout: 15_000 });
  const text = await list.getText();
  assert.ok(text.includes('Pastel Anime XL') && text.includes('Anime Detailer XL'), 'SDXL-Katalog fehlt');
  assert.ok(text.includes('mein-stil'), 'eigene Datei fehlt');
  assert.ok(!text.includes('GHIBSKY'), 'FLUX-LoRA bei einem SDXL-Modell angezeigt');

  // Choose the installed LoRA, lower its weight and save the settings.
  await list.$('label*=Pastel Anime XL').$('input[type="checkbox"]').click();
  const slider = await list.$('input[type="range"]');
  await slider.waitForDisplayed();
  await browser.execute((el) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '0.6');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, slider);
  await list.scrollIntoView();
  await shot('28-bild-loras');
  await browser.$('button=Speichern').click();
  await browser.waitUntil(async () => (await invoke('get_image_gen_config')).local_loras?.length === 1, {
    timeout: 5000,
    timeoutMsg: 'LoRA-Auswahl wird nicht gespeichert',
  });
  const saved = await invoke('get_image_gen_config');
  assert.deepEqual(saved.local_loras, [{ file: 'pastel-anime-xl-latest.safetensors', weight: 0.6 }]);
  console.log('Bild-LoRAs: Katalog je Modellfamilie, eigene Dateien, Auswahl mit Stärke und Speichern bestanden.');
} finally {
  await close();
}
