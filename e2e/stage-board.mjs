// 5e fights on the battle map (Roadmap_DND.md, step 2): the board tab opens with the fight,
// the player moves by clicking a green square, attacks by clicking an enemy token in reach and
// ends the turn; enemies and companions move on their own. Nobody ever stands on a wall or on
// another fighter's square, and hit points only change through engine damage.
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

const assertBoardSane = (scene) => {
  const map = scene.map;
  const up = scene.combat.combatants.filter((c) => c.hp > 0 && c.position && !c.conditions.some((x) => x.name === 'fled'));
  const keys = up.map((c) => `${c.position.x}:${c.position.y}`);
  assert.equal(new Set(keys).size, keys.length, `zwei Figuren auf einem Feld: ${keys}`);
  for (const c of up) {
    const cell = map.cells[c.position.y * map.width + c.position.x];
    assert.ok(cell.kind !== 'wall' && cell.kind !== 'pit', `${c.name} steht auf ${cell.kind}`);
  }
};

/** The UI has finished the last combat call (and shows the state it got back). */
const waitIdle = async () => {
  await browser.pause(150);
  await browser.waitUntil(
    () => browser.execute(() => !document.querySelector('[data-testid="combat-5e"][data-busy="true"]')),
    { timeout: 30_000, timeoutMsg: 'Kampfzug endet nicht' },
  );
};

try {
  await browser.$('button=Stage').waitForExist({ timeout: 20_000 });
  await browser.setWindowSize(1400, 900);
  const scene = await invoke('get_stage_state');
  await invoke('save_stage_scene', {
    sceneState: {
      ...scene,
      definition: {
        ...scene.definition,
        rules: { ruleset: '5e', hero_classes: { player: 'fighter', 'Ayu Ikue': 'fighter' }, control_companions: false, map_id: 'crypt_hall' },
      },
      combat: { ...scene.combat, is_active: false, combatants: [], events: [] },
    },
  });
  await browser.$('button=Stage').click();
  const input = await browser.$('form textarea');
  await input.waitForDisplayed({ timeout: 15_000 });

  mock.stats.stageEncounter = { action: 'start', enemies: [{ monster: 'goblin', count: 2 }] };
  await input.setValue('Ich betrete die Gruft.');
  await browser.keys('Enter');
  const board = await browser.$('[data-testid="battle-map"]');
  await board.waitForDisplayed({ timeout: 30_000, timeoutMsg: 'Spielbrett erscheint nicht' });
  mock.stats.stageEncounter = null;
  assert.equal(await browser.$('button[role="tab"][aria-selected="true"]').getText(), 'Spielbrett');
  const started = await invoke('get_stage_state');
  assert.equal(started.map.id, 'crypt_hall');
  assertBoardSane(started);

  let playerMoves = 0;
  let rounds = 0;
  let shotTaken = false;
  while ((await invoke('get_stage_state')).combat.is_active && rounds < 40) {
    rounds += 1;
    await waitIdle();
    const now = await invoke('get_stage_state');
    if (!now.combat.is_active) break;
    assertBoardSane(now);
    const actor = now.combat.combatants[now.combat.current_turn_index];
    if (actor.role !== 'player') {
      await jsClick('[data-testid="combat-5e"] button:not([disabled])');
      continue;
    }
    if (!shotTaken) {
      await shot('68-spielbrett');
      shotTaken = true;
    }
    // Attack an enemy in reach by clicking its token; otherwise walk towards the closest one.
    if (await browser.$('g[data-token][role="button"]').isExisting()) {
      await jsClick('g[data-token][role="button"]');
      await waitIdle();
    } else {
      const enemies = now.combat.combatants.filter((c) => c.role === 'enemy' && c.hp > 0 && c.position);
      const target = await browser.execute((foes) => {
        const squares = [...document.querySelectorAll('rect[data-move]')].map((r) => r.getAttribute('data-move').split(':').map(Number));
        const distance = ([x, y]) => Math.min(...foes.map((f) => Math.max(Math.abs(f.x - x), Math.abs(f.y - y))));
        squares.sort((a, b) => distance(a) - distance(b));
        return squares[0] ? squares[0].join(':') : null;
      }, enemies.map((e) => e.position));
      if (target) {
        await jsClick(`rect[data-move="${target}"]`);
        await waitIdle();
        playerMoves += 1;
        if (await browser.$('g[data-token][role="button"]').isExisting()) {
          await jsClick('g[data-token][role="button"]');
          await waitIdle();
        }
      }
    }
    // End the turn if it is still the player's.
    const after = await invoke('get_stage_state');
    if (after.combat.is_active && after.combat.combatants[after.combat.current_turn_index]?.role === 'player') {
      await browser.$('button=Zug beenden').click();
      await waitIdle();
    }
  }
  const ended = await invoke('get_stage_state');
  assert.equal(ended.combat.is_active, false, 'Kampf endet nicht');
  const events = ended.combat.events;
  assert.ok(events.some((e) => e.type === 'combat_end'), 'kein Kampfende');
  assert.ok(events.some((e) => e.type === 'move'), 'niemand hat sich bewegt');
  assert.ok(playerMoves > 0 || events.some((e) => e.type === 'attack' && e.attacker_id === 'player'), 'Spieler hat nichts getan');
  await shot('69-spielbrett-ende');
  console.log(`Spielbrett: ${rounds} Runden, ${playerMoves} Spielerzüge mit Bewegung, ${events.filter((e) => e.type === 'move').length} Bewegungen, Ausgang ${events.find((e) => e.type === 'combat_end').outcome}.`);
} finally {
  await close();
}
