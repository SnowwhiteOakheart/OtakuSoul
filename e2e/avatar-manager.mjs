// Avatar manager (Library → Avatars): all models in one grid with filter and search, a live preview,
// default avatar, characters given a model with a tick (saved in the card) and taken back, and preview
// pictures: taken by themselves on the first look, kept as files, taken again from the current view.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';
import { makeGlb } from './tools/make-glb.mjs';

const { browser, home, close } = await launch({ avatar_mode: '2d' });
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const cards = (kind) => browser.$$(kind ? `[data-avatar-card="${kind}"]` : '[data-avatar-card]');

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.setWindowSize(1400, 900);
  const glb = path.join(home, 'Testrig.glb');
  writeFileSync(glb, await makeGlb());
  const model = await invoke('import_vrm_model', { sourcePath: glb });

  // The way from the settings leads here too.
  await browser.$('button=Einstellungen').click();
  await browser.$('[data-open-avatar-manager]').waitForDisplayed({ timeout: 10_000 });
  await browser.$('[data-open-avatar-manager]').click();
  await browser.$('[data-avatar-manager]').waitForDisplayed({ timeout: 10_000 });
  const card = await browser.$('[data-avatar-name="Testrig"]');
  await card.waitForDisplayed({ timeout: 10_000, timeoutMsg: 'Importiertes Modell fehlt im Manager' });

  // Filter and search.
  const all = (await cards()).length;
  const live2d = (await cards('live2d')).length;
  const vrm = (await cards('vrm')).length;
  assert.equal(all, live2d + vrm);
  assert.ok(live2d > 0 && vrm > 1, 'mitgelieferte Modelle fehlen');
  await browser.$('[role="radio"][data-radio-value="live2d"]').click();
  await browser.waitUntil(async () => (await cards('vrm')).length === 0, { timeout: 3000, timeoutMsg: 'Filter Live2D zeigt 3D-Modelle' });
  await browser.$('[role="radio"][data-radio-value="all"]').click();
  await browser.$('input[aria-label="Modelle suchen"]').setValue('testr');
  await browser.waitUntil(async () => (await cards()).length === 1, { timeout: 3000, timeoutMsg: 'Suche filtert nicht' });

  // Live preview of the chosen model.
  await card.click();
  await browser.$('[data-avatar-detail="vrm"] [data-avatar-preview="vrm"] canvas').waitForExist({ timeout: 20_000, timeoutMsg: 'Keine Vorschau' });
  // The first look takes a preview picture for the overview.
  const thumbs = path.join(home, 'data', 'avatar_thumbs');
  await card.$('[data-avatar-thumbnail]').waitForExist({ timeout: 30_000, timeoutMsg: 'Kein Vorschaubild für das 3D-Modell' });
  assert.ok(existsSync(thumbs) && readdirSync(thumbs).some((f) => f.startsWith('vrm-')), 'Vorschaubild nicht gespeichert');
  await browser.$('[data-avatar-retake]').click();
  await browser.$('div*=Vorschaubild gespeichert').waitForExist({ timeout: 5000, timeoutMsg: 'Aktuelle Ansicht nicht übernommen' });

  // A Live2D model without its own picture gets one the same way.
  await browser.$('input[aria-label="Modelle suchen"]').click();
  await browser.keys(['Control', 'a']);
  await browser.keys('Backspace');
  const live2dCard = await browser.$('[data-avatar-card="live2d"][data-avatar-name="Hiyori"]');
  await live2dCard.waitForDisplayed({ timeout: 5000 });
  await live2dCard.click();
  await browser.$('[data-avatar-detail="live2d"] canvas').waitForExist({ timeout: 20_000, timeoutMsg: 'Keine Live2D-Vorschau' });
  await live2dCard.$('[data-avatar-thumbnail]').waitForExist({ timeout: 30_000, timeoutMsg: 'Kein Vorschaubild für das Live2D-Modell' });
  // Saved pictures come back from their files after leaving the view.
  await browser.$('button=Charaktere').click();
  await browser.$('button=Avatare').click();
  await browser.$('[data-avatar-name="Hiyori"] [data-avatar-thumbnail]').waitForExist({ timeout: 10_000, timeoutMsg: 'Gespeichertes Vorschaubild fehlt nach dem Neuladen' });
  await browser.$('[data-avatar-name="Testrig"]').click();
  await browser.$('[data-avatar-detail="vrm"]').waitForDisplayed({ timeout: 5000 });

  // The chat shows pictures right now: the manager offers to switch to 3D.
  await browser.$('button=Auf 3D umschalten').click();
  await browser.$('button=Auf 3D umschalten').waitForExist({ reverse: true, timeout: 3000 });

  // Default avatar.
  await browser.$('[data-avatar-make-default]').click();
  await browser.$('[data-avatar-is-default]').waitForDisplayed({ timeout: 3000 });

  // Give it to a character: saved in its card, its face shows on the card; untick → default again.
  const row = await browser.$('[data-avatar-character]');
  const name = (await browser.execute((el) => el.querySelector('span.truncate').textContent, row)).trim();
  await row.$('input[type="checkbox"]').click();
  const usesModel = async () => (await invoke('scan_characters')).find((c) => c.card.data.name === name)?.card.data.extensions?.custom_vrm;
  await browser.waitUntil(async () => (await usesModel()) === model.path, { timeout: 10_000, timeoutMsg: 'Zuweisung nicht in der Karte gespeichert' });
  const assignedRow = await browser.$(`[data-avatar-character] input:checked`);
  await assignedRow.waitForExist({ timeout: 5000 });
  await browser.waitUntil(async () => (await browser.$('[data-avatar-name="Testrig"]').$$('img[title], span[title]')).length > 0, { timeout: 5000, timeoutMsg: 'Charakter fehlt auf der Modellkarte' });
  await browser.$('input[aria-label="Modelle suchen"]').click();
  await browser.keys(['Control', 'a']);
  await browser.keys('Backspace');
  await browser.waitUntil(async () => (await cards()).length === all, { timeout: 3000, timeoutMsg: 'Leere Suche zeigt nicht alle Modelle' });
  await browser.pause(300);
  await browser.saveScreenshot(path.join(screenshotDir, '100-avatar-manager.png'));
  await assignedRow.click();
  await browser.waitUntil(async () => !(await usesModel()), { timeout: 10_000, timeoutMsg: 'Zuweisung nicht entfernt' });

  // Back in the chat the model just shown comes from the cache instead of being read and parsed again.
  await browser.$('button=Chat').click();
  const phases = () => browser.execute((p) => performance.getEntriesByType('measure')
    .filter((m) => m.name.startsWith('avatar:') && m.detail === p).map((m) => m.name), model.path);
  await browser.waitUntil(async () => (await phases()).includes('avatar:cache'), { timeout: 15_000, timeoutMsg: 'Chat lädt das Modell neu statt aus dem Zwischenspeicher' });
  await browser.$('[data-avatar-format="gltf"] canvas').waitForExist({ timeout: 10_000, timeoutMsg: 'Kein Avatar im Chat' });

  console.log(`Avatar-Manager: ${all} Modelle (${vrm} 3D, ${live2d} Live2D), Filter, Suche, Vorschau, Vorschaubilder, Standard, Zuweisung und Zwischenspeicher an ${name} bestanden.`);
} finally {
  await close();
}
