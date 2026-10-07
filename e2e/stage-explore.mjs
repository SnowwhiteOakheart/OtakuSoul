// 5e exploration (Roadmap_DND.md, step 4): the board opens with fog of war, the party opens a
// door with a click, a locked door needs a skill check, entering the burial hall starts its
// prepared fight, and one "Undo" brings back map and party from before that step.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));
const jsClick = (selector) => browser.execute((s) => {
  const el = document.querySelector(s);
  if (!el) return false;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return true;
}, selector);
const exists = (selector) => browser.execute((s) => !!document.querySelector(s), selector);
const waitIdle = async () => {
  await browser.pause(150);
  await browser.waitUntil(() => browser.execute(() => !document.querySelector('[data-busy="true"]')), {
    timeout: 30_000,
    timeoutMsg: 'Erkundungsschritt endet nicht',
  });
};
const cell = (scene, x, y) => scene.map.cells[y * scene.map.width + x];
const partySquares = (scene) => scene.combat.combatants
  .filter((c) => c.role === 'player' || c.role === 'companion')
  .map((c) => `${c.position.x}:${c.position.y}`)
  .sort();

try {
  await browser.$('button=Stage').waitForExist({ timeout: 20_000 });
  await browser.setWindowSize(1400, 900);
  const scene = await invoke('get_stage_state');
  await invoke('save_stage_scene', {
    sceneState: {
      ...scene,
      definition: {
        ...scene.definition,
        rules: { ruleset: '5e', hero_classes: { player: 'fighter', 'Ayu Ikue': 'rogue' }, control_companions: false, map_id: 'crypt_hall' },
      },
      combat: { ...scene.combat, is_active: false, combatants: [], events: [] },
      map: null,
      exploration: [],
    },
  });
  await browser.$('button=Stage').click();
  const boardTab = await browser.$('button[role="tab"]=Spielbrett');
  await boardTab.waitForExist({ timeout: 15_000, timeoutMsg: 'kein Spielbrett-Reiter vor dem ersten Kampf' });
  await boardTab.click();

  // 1) Fog of war: only the antechamber is seen.
  await browser.$('[data-testid="explore-layer"]').waitForExist({ timeout: 20_000, timeoutMsg: 'Erkundung startet nicht' });
  await waitIdle();
  assert.match(await browser.$('[data-testid="explore-room"]').getText(), /Vorkammer/);
  assert.ok(await exists('rect[data-fog]'), 'kein Nebel');
  assert.ok(!(await exists('[data-explore="12:2"]')), 'die Grabhalle ist schon zu sehen');
  await shot('72-erkundung-start');

  // 2) A click on the closed door walks there and opens it; the hall comes into view.
  assert.ok(await jsClick('[data-use="8:2"]'), 'Tür nicht anklickbar');
  await waitIdle();
  let now = await invoke('get_stage_state');
  assert.equal(cell(now, 8, 2).object, 'door_open');
  assert.ok(await exists('[data-explore="12:2"]'), 'Halle bleibt im Nebel');
  assert.equal(now.combat.is_active, false);

  // 3) The south door is locked: the rogue picks it (or someone forces it).
  assert.ok(await jsClick('[data-use="4:5"]'));
  await waitIdle();
  await browser.$('[data-testid="explore-locks"]').waitForDisplayed({ timeout: 10_000, timeoutMsg: 'Schloss wird nicht angezeigt' });
  for (let tries = 0; tries < 20 && (await exists('[data-lock-action="pick:4:5"]')); tries += 1) {
    await jsClick(tries % 2 ? '[data-lock-action="force:4:5"]' : '[data-lock-action="pick:4:5"]');
    await waitIdle();
  }
  now = await invoke('get_stage_state');
  assert.equal(cell(now, 4, 5).object, 'door_open', 'Schloss geht nicht auf');
  assert.ok(now.exploration.some((e) => e.type === 'check'), 'keine Probe');
  await shot('73-erkundung-tuer');

  // 4) Into the burial hall: its prepared fight starts where everyone stands.
  const before = await invoke('get_stage_state');
  const reportsBefore = mock.stats.exploreReports ?? 0;
  assert.ok(await jsClick('[data-explore="10:2"]'));
  await browser.$('[data-testid="combat-5e"]').waitForDisplayed({ timeout: 30_000, timeoutMsg: 'Begegnung startet nicht' });
  await waitIdle();
  const fight = await invoke('get_stage_state');
  assert.equal(fight.combat.is_active, true);
  assert.ok(fight.map.triggered.includes('hall_goblins'));
  assert.equal(fight.combat.combatants.filter((c) => c.role === 'enemy').length, 2);
  assert.ok((mock.stats.exploreReports ?? 0) > reportsBefore, 'Spielleiter erzählt nicht');
  assert.match(mock.stats.lastExploreReport, /Burial hall/);
  await shot('74-erkundung-kampf');

  // 5) Undo: no fight, the party back in front of the hall, the door still open.
  await browser.$('button[role="tab"]=Abenteuer').click();
  await browser.$('button[aria-label="Letzten Zug zurücknehmen"]').click();
  await browser.waitUntil(async () => !(await invoke('get_stage_state')).combat.is_active, { timeout: 10_000, timeoutMsg: 'Rückgängig nimmt den Kampf nicht zurück' });
  const undone = await invoke('get_stage_state');
  assert.deepEqual(partySquares(undone), partySquares(before));
  assert.ok(!undone.map.triggered.includes('hall_goblins'));
  assert.equal(cell(undone, 8, 2).object, 'door_open');
  assert.equal(undone.combat.combatants.filter((c) => c.role === 'enemy').length, 0);
  await browser.$('button[role="tab"]=Spielbrett').click();
  await browser.$('[data-testid="explore-5e"]').waitForDisplayed({ timeout: 10_000, timeoutMsg: 'Erkundung nach Rückgängig fehlt' });
  assert.ok(await exists('[data-explore="10:2"]'));
  console.log(`Erkundung: Tür, Schloss (${undone.exploration.filter((e) => e.type === 'check').length} Proben), Begegnung und Rückgängig geprüft.`);
} finally {
  await close();
}
