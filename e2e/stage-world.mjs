// Soul Stage world state: the editor, deleting chronicle entries, translating messages.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';
import { TRANSLATION } from './mock-llm.mjs';

const { browser, mock, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));
const jsClick = (element) => browser.execute((el) => el.click(), element);

try {
  await browser.$('button=Stage').waitForExist({ timeout: 20_000 });
  const scene = await invoke('get_stage_state');
  await invoke('save_stage_scene', {
    sceneState: {
      ...scene,
      world: { ...scene.world, key_facts: { tor_status: 'verschlossen' } },
      arcs: [
        { id: 'arc-open', title: 'Das Tor', description: 'Wer hat es versiegelt?', stage: 1, max_stage: 3, is_revealed: true, is_resolved: false },
        { id: 'arc-hidden', title: 'HIDDEN_TRAITOR', description: 'Ein Verräter in der Gruppe.', stage: 0, max_stage: 2, is_revealed: false, is_resolved: false },
      ],
      inventory: [{ id: 'item-1', name: 'Fackel', description: 'Brennt eine Stunde.', quantity: 1, item_type: 'consumable', hp_restore: 0, stress_restore: 0, clears_condition: null }],
      consequence_ledger: [
        { id: 'c-keep', text: 'KEEP_CONSEQUENCE', created_at: 'now' },
        { id: 'c-drop', text: 'DROP_CONSEQUENCE', created_at: 'now' },
      ],
    },
  });

  await browser.$('button=Stage').click();
  await browser.$('form textarea').waitForDisplayed({ timeout: 15_000 });
  await browser.$('button*=Kampagne').click();

  // Chronicle entries can be deleted after confirming.
  const dropEntry = await browser.$('div*=DROP_CONSEQUENCE');
  await jsClick(await dropEntry.$('button[aria-label="Eintrag löschen"]'));
  await browser.$('button=Löschen').click();
  await browser.waitUntil(async () => !(await invoke('get_stage_state')).consequence_ledger.some((e) => e.id === 'c-drop'), {
    timeout: 5000,
    timeoutMsg: 'Chronik-Eintrag wird nicht gelöscht',
  });

  // The editor: facts, arcs (hidden only on request), inventory.
  await browser.$('button=Weltzustand bearbeiten').click();
  await browser.$('#stage-world-title').waitForDisplayed();
  const dialog = await browser.$('[role="dialog"]');
  assert.ok(!(await dialog.getText()).includes('HIDDEN_TRAITOR'), 'verborgener Arc ohne Spoiler-Schalter sichtbar');
  await dialog.$('input[aria-label="Wert"]').setValue('aufgebrochen');
  await dialog.$('button*=Hinzufügen').click();
  const keys = await dialog.$$('input[aria-label="Stichwort"]');
  await keys.at(-1).setValue('wache');
  const values = await dialog.$$('input[aria-label="Wert"]');
  await values.at(-1).setValue('schläft');
  await dialog.$('label*=Verborgene Arcs').click();
  assert.ok((await dialog.getText()).includes('Verborgene') && (await dialog.$$('input[aria-label="Titel"]')).length === 2, 'verborgener Arc fehlt mit Spoiler-Schalter');
  await dialog.$('input[aria-label="Anzahl"]').setValue('3');
  await shot('24-weltzustand-editor');
  await dialog.$('button=Speichern').click();
  await browser.$('#stage-world-title').waitForExist({ reverse: true });

  const edited = await invoke('get_stage_state');
  assert.deepEqual(edited.world.key_facts, { tor_status: 'aufgebrochen', wache: 'schläft' });
  assert.equal(edited.inventory[0].quantity, 3);
  assert.equal(edited.arcs.length, 2, 'Arcs verloren');

  // The next turn sees the edits.
  await browser.$('button*=Abenteuer').click();
  const before = mock.stats.stagePlanner;
  await browser.$('form textarea').setValue('Wir schleichen an der Wache vorbei.');
  await browser.keys('Enter');
  await browser.waitUntil(() => mock.stats.stagePlanner > before, { timeout: 20_000 });
  await browser.$('button=Stopp').waitForExist({ reverse: true, timeout: 40_000 });
  const plannerPrompt = JSON.stringify(mock.stats.lastPlannerMessages);
  assert.ok(plannerPrompt.includes('aufgebrochen') && plannerPrompt.includes('schläft'), 'Planer sieht die bearbeiteten Fakten nicht');
  assert.ok(plannerPrompt.includes('KEEP_CONSEQUENCE') && !plannerPrompt.includes('DROP_CONSEQUENCE'), 'gelöschter Chronik-Eintrag wirkt weiter');

  // Translating a game master message shows the translation below it.
  const translateButtons = await browser.$$('button[aria-label="Übersetzen"]');
  await jsClick(translateButtons.at(-1));
  await browser.waitUntil(async () => (await browser.$('body').getText()).includes('Testübersetzung'), {
    timeout: 10_000,
    timeoutMsg: 'Übersetzung erscheint nicht',
  });
  assert.ok(TRANSLATION.includes('Testübersetzung'));
  await shot('25-stage-uebersetzung');
  console.log('Weltzustand: Editor, Chronik löschen und Übersetzung bestanden.');
} finally {
  await close();
}
