// LoRAs in the Image Studio: an own LoRA file is imported with its model family, shows up for
// matching image models and can be chosen for the studio alone; LoRAs marked 18+ can only be
// added with adult content on and are hidden (and untouchable) again once it is off.
import assert from 'node:assert/strict';
import { mkdirSync, truncateSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, saveSettingsAndReload, screenshotDir } from './harness.mjs';

const { browser, home, close } = await launch();
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
// A refused command as `{ ok: false, error }`; some WebDrivers report the rejection themselves.
const attempt = async (command, args = {}) => {
  try {
    return await browser.execute(async (cmd, payload) => {
      try {
        return { ok: true, value: await window.__TAURI_INTERNALS__.invoke(cmd, payload) };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    }, command, args);
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
};
const jsClick = (element) => browser.execute((el) => el.click(), element);
const loraText = () => browser.execute(() => document.querySelector('[data-testid="lora-settings"]')?.textContent ?? '');
const sparse = (dir, name, size) => {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  writeFileSync(file, '');
  truncateSync(file, size);
};
const openStudio = async () => {
  await jsClick(await browser.$('button=Song-Studio'));
  await browser.$('[data-testid="song-studio"]').waitForDisplayed({ timeout: 15_000 });
  await jsClick(await browser.$('button=Bild-Studio'));
  await browser.$('[data-testid="lora-settings"]').waitForDisplayed({ timeout: 15_000 });
};
const meta = (over) => ({ name: '', family: 'sdxl', trigger: '', weight: 1, nsfw: false, ...over });

try {
  await browser.$('button=Bild-Studio').waitForExist({ timeout: 20_000 });
  sparse(path.join(home, 'data', 'image-models'), 'animagine-xl-4.0-opt.safetensors', 6_938_350_040);
  const downloads = path.join(home, 'downloads');
  mkdirSync(downloads, { recursive: true });
  const own = path.join(downloads, 'mein-stil.safetensors');
  const adult = path.join(downloads, 'Uncensored XL.safetensors');
  writeFileSync(own, Buffer.alloc(4096));
  writeFileSync(adult, Buffer.alloc(4096));

  // Adult content off: no LoRA can be marked 18+.
  const refused = await attempt('import_image_lora', { sourcePath: adult, meta: meta({ nsfw: true }) });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /backend\.nsfw\.disabled/);

  // An own LoRA for SDXL: shown for Animagine XL (SDXL) and chosen for the studio alone.
  const file = await invoke('import_image_lora', { sourcePath: own, meta: meta({ name: 'Mein Stil', trigger: 'meinstil' }) });
  assert.equal(file, 'Mein Stil.safetensors');
  await openStudio();
  await browser.waitUntil(async () => (await loraText()).includes('Mein Stil'), { timeout: 5000, timeoutMsg: 'Eigene LoRA fehlt im Studio' });
  assert.ok((await loraText()).includes('meinstil'));
  assert.ok((await browser.$('p*=Vorbelegt aus den Bild-Einstellungen').isExisting()));
  await jsClick(await browser.$('[data-testid="lora-settings"] input[type="checkbox"]:not([disabled])').parentElement());
  await browser.waitUntil(
    async () => (await browser.execute(() => JSON.parse(localStorage.getItem('otakusoul.imageStudio.draft') ?? '{}').loras ?? null))?.[0]?.file === file,
    { timeout: 5000, timeoutMsg: 'LoRA nicht fürs Studio gewählt' },
  );
  assert.ok(await browser.$('p*=Eigene Auswahl fürs Studio').isExisting());
  // The image settings keep their own choice.
  assert.deepEqual((await invoke('get_image_gen_config')).local_loras, []);

  // Adult content on: an 18+ LoRA can be added and is marked.
  await saveSettingsAndReload(browser, { nsfw_enabled: true, adult_confirmed: true });
  await browser.$('button=Bild-Studio').waitForExist({ timeout: 20_000 });
  const adultFile = await invoke('import_image_lora', { sourcePath: adult, meta: meta({ nsfw: true }) });
  await openStudio();
  await browser.waitUntil(async () => (await loraText()).includes('Uncensored XL') && (await loraText()).includes('18+'), {
    timeout: 5000,
    timeoutMsg: '18+-LoRA wird nicht angezeigt',
  });
  await browser.saveScreenshot(path.join(screenshotDir, 'studio-loras.png'));

  // Adult content off again: hidden, and it can neither be changed nor deleted.
  await saveSettingsAndReload(browser, { nsfw_enabled: false });
  await browser.$('button=Bild-Studio').waitForExist({ timeout: 20_000 });
  const listed = await invoke('list_image_loras');
  assert.ok(listed.some((l) => l.file === file));
  assert.ok(!listed.some((l) => l.file === adultFile), '18+-LoRA bleibt sichtbar');
  await openStudio();
  await browser.waitUntil(async () => (await loraText()).includes('Mein Stil'), { timeout: 5000 });
  assert.ok(!(await loraText()).includes('Uncensored XL'));
  assert.equal((await attempt('delete_image_lora', { file: adultFile })).ok, false);
  assert.equal((await attempt('update_image_lora', { file: adultFile, meta: meta({}) })).ok, false);
  console.log('Studio-LoRAs: Import mit Familie, eigene Studio-Auswahl, 18+ nur mit NSFW bestanden.');
} finally {
  await close();
}
