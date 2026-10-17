// Avatar manager (Library → Avatars): all models in one grid with filter and search, a live preview,
// default avatar, and characters given a model with a tick (saved in the card) and taken back.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
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
  await browser.waitUntil(async () => (await card.$$('img, span[title]')).length > 0, { timeout: 5000, timeoutMsg: 'Charakter fehlt auf der Modellkarte' });
  await browser.$('input[aria-label="Modelle suchen"]').click();
  await browser.keys(['Control', 'a']);
  await browser.keys('Backspace');
  await browser.waitUntil(async () => (await cards()).length === all, { timeout: 3000, timeoutMsg: 'Leere Suche zeigt nicht alle Modelle' });
  await browser.pause(300);
  await browser.saveScreenshot(path.join(screenshotDir, '100-avatar-manager.png'));
  await assignedRow.click();
  await browser.waitUntil(async () => !(await usesModel()), { timeout: 10_000, timeoutMsg: 'Zuweisung nicht entfernt' });

  console.log(`Avatar-Manager: ${all} Modelle (${vrm} 3D, ${live2d} Live2D), Filter, Suche, Vorschau, Standard und Zuweisung an ${name} bestanden.`);
} finally {
  await close();
}
