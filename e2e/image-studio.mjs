// Image Studio: the system's pictures folder as default, model choice (none → hint, one → its
// name, several → a choice that is kept),
// the image folder can be changed, images in it show up in the gallery with their request,
// the preview loads the settings back and deletes with confirmation.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, truncateSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, screenshotDir, studioDefaultDir } from './harness.mjs';

const { browser, home, close } = await launch();
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);
const text = (element) => browser.execute((el) => el.textContent, element);
const modelText = () => browser.execute(() => document.querySelector('[data-testid="image-model"]')?.textContent ?? '');
const folderText = () => browser.execute(() => document.querySelector('[data-testid="studio-folder"]')?.textContent ?? '');
const value = (selector) => browser.execute((sel) => document.querySelector(sel)?.value, selector);
const sparse = (dir, name, size) => {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  writeFileSync(file, '');
  truncateSync(file, size);
};
// A 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const openStudio = async () => {
  await jsClick(await browser.$('button=Song-Studio'));
  await browser.$('[data-testid="song-studio"]').waitForDisplayed({ timeout: 15_000 });
  await jsClick(await browser.$('button=Bild-Studio'));
  await browser.$('[data-testid="image-studio"]').waitForDisplayed({ timeout: 15_000 });
};

try {
  await browser.$('button=Bild-Studio').waitForExist({ timeout: 20_000 });
  const models = path.join(home, 'data', 'image-models');

  // By default the images go to the system's pictures folder plus OtakuSoul. Asked from the
  // backend only and set back at once: the gallery would show the user's real pictures.
  const defaultDir = studioDefaultDir('images');
  const testDir = (await invoke('get_studio_folder', { kind: 'images' })).path;
  assert.deepEqual(await invoke('set_studio_folder', { kind: 'images', path: null }), { path: defaultDir, is_default: true });
  assert.deepEqual(await invoke('set_studio_folder', { kind: 'images', path: testDir }), { path: testDir, is_default: false });

  // No model: a hint that leads to the downloads.
  await openStudio();
  await browser.waitUntil(async () => (await modelText()).includes('Noch kein lokales Bildmodell'), { timeout: 5000, timeoutMsg: 'Hinweis ohne Modell fehlt' });
  assert.equal(await browser.$('[data-testid="image-generate"]').isEnabled(), false);

  // One model: shown by name, no choice.
  sparse(models, 'Counterfeit-V3.0_fix_fp16.safetensors', 2_132_651_162);
  await openStudio();
  await browser.waitUntil(async () => (await modelText()).includes('Counterfeit V3.0'), { timeout: 5000, timeoutMsg: 'Einzelnes Modell fehlt' });
  assert.equal(await browser.$('[data-testid="image-model"] select').isExisting(), false);

  // Two models: a choice, kept for the next visit.
  sparse(models, 'animagine-xl-4.0-opt.safetensors', 6_938_350_040);
  await openStudio();
  const select = await browser.$('[data-testid="image-model"] select');
  await select.waitForExist({ timeout: 5000 });
  assert.equal((await select.$$('option')).length, 2);
  await select.selectByAttribute('value', 'animagine-xl-4');
  await openStudio();
  await browser.waitUntil(async () => (await value('[data-testid="image-model"] select')) === 'animagine-xl-4', { timeout: 5000, timeoutMsg: 'Modellwahl nicht behalten' });

  // A folder of the test with an image of the studio and two older ones (newest first).
  const folder = path.join(home, 'meine-bilder');
  assert.equal((await invoke('set_studio_folder', { kind: 'images', path: folder })).is_default, false);
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, 'Abendrot.png'), PNG);
  const now = Date.now() / 1000;
  for (const [name, age] of [['Morgentau', 60], ['Nachthimmel', 120]]) {
    writeFileSync(path.join(folder, `${name}.png`), PNG);
    utimesSync(path.join(folder, `${name}.png`), now - age, now - age);
  }
  writeFileSync(
    path.join(folder, 'Abendrot.png.json'),
    JSON.stringify({
      title: 'Abendrot',
      seed: 99,
      width: 1344,
      height: 768,
      license: 'Fair AI Public License 1.0-SD',
      request: { title: 'Abendrot', prompt: 'sunset over the sea', negative: '', model_id: 'animagine-xl-4', aspect: '16:9', count: 3 },
    }),
  );
  await openStudio();
  await browser.waitUntil(async () => (await folderText()).includes('meine-bilder'), { timeout: 5000, timeoutMsg: 'Bildordner fehlt' });
  const gallery = await browser.$('[data-testid="image-gallery"]');
  await gallery.waitForDisplayed({ timeout: 5000 });
  // The thumbnail loads once it is in view (blob URL: the folder is outside the asset scope).
  await browser.waitUntil(async () => browser.execute((el) => !!el.querySelector('img')?.src.startsWith('blob:'), gallery), { timeout: 5000, timeoutMsg: 'Vorschaubild lädt nicht' });
  await browser.saveScreenshot(path.join(screenshotDir, 'image-studio.png'));

  // The preview shows the request and loads it into the form.
  await jsClick(await gallery.$('button[aria-label="Abendrot"]'));
  const preview = await browser.$('[data-testid="image-preview"]');
  await preview.waitForDisplayed({ timeout: 5000 });
  assert.ok((await text(preview)).includes('sunset over the sea'));
  await browser.waitUntil(async () => (await browser.execute((el) => !!el.querySelector('img')?.src.startsWith('blob:'), preview)), { timeout: 5000, timeoutMsg: 'Bild nicht geladen' });
  // Browse to the neighbours: buttons only where there is one, and the arrow keys.
  const position = () => browser.execute(() => document.querySelector('[data-testid="image-position"]')?.textContent ?? '');
  const title = () => browser.execute(() => document.querySelector('[data-testid="image-preview"] p')?.textContent ?? '');
  const showing = (name, place) =>
    browser.waitUntil(async () => (await title()) === name && (await position()) === place, { timeout: 5000, timeoutMsg: `${name} (${place}) wird nicht gezeigt` });
  await showing('Abendrot', '1 / 3');
  assert.equal(await preview.$('button[aria-label^="Vorheriges Bild"]').isExisting(), false);
  await jsClick(await preview.$('button[aria-label^="Nächstes Bild"]'));
  await showing('Morgentau', '2 / 3');
  await browser.keys('ArrowRight');
  await showing('Nachthimmel', '3 / 3');
  assert.equal(await preview.$('button[aria-label^="Nächstes Bild"]').isExisting(), false);
  await browser.keys('ArrowRight');
  await showing('Nachthimmel', '3 / 3');
  await browser.keys('ArrowLeft');
  await showing('Morgentau', '2 / 3');
  await jsClick(await preview.$('button[aria-label^="Vorheriges Bild"]'));
  await showing('Abendrot', '1 / 3');
  await jsClick(await preview.$('button=Einstellungen übernehmen'));
  await browser.waitUntil(async () => (await value('#image-prompt')) === 'sunset over the sea', { timeout: 5000, timeoutMsg: 'Einstellungen nicht übernommen' });

  // Delete from the preview with confirmation.
  await jsClick(await gallery.$('button[aria-label="Abendrot"]'));
  await preview.waitForDisplayed({ timeout: 5000 });
  await jsClick(await preview.$('button=Löschen'));
  // The confirmation opens above the preview: the newest dialog.
  await browser.waitUntil(async () => (await browser.$$('[role="dialog"]').length) >= 2, { timeout: 5000, timeoutMsg: 'Rückfrage fehlt' });
  const dialogs = await browser.$$('[role="dialog"]');
  const confirm = await dialogs[dialogs.length - 1].$('button=Löschen');
  await confirm.waitForDisplayed({ timeout: 5000 });
  await jsClick(confirm);
  // The preview stays open with the next image.
  await showing('Morgentau', '1 / 2');
  assert.equal(existsSync(path.join(folder, 'Abendrot.png')), false);
  assert.equal(existsSync(path.join(folder, 'Abendrot.png.json')), false);

  assert.deepEqual(await invoke('set_studio_folder', { kind: 'images', path: null }), { path: defaultDir, is_default: true });
  console.log('Bild-Studio: Modellwahl (keins/eins/mehrere), Ordner, Galerie, Vorschau mit Vor/Zurück, Übernehmen und Löschen bestanden.');
} finally {
  await close();
}
