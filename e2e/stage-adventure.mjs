// The 5e starter adventure (Roadmap_DND.md, step 5): act 1 from the lobby with the four classic
// heroes – party choice, the ambush on the forest road, the fight, the road west to the crypt,
// "act complete" and on into act 2 with the same party.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, close } = await launch();
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
    timeout: 60_000,
    timeoutMsg: 'Schritt endet nicht',
  });
};
const HEROES = ['Thorin Eisenbart', 'Lyra Sternenhain', 'Finn Flinkfuß', 'Althea Sonnwind'];

/** Plays the running fight to its end like a player: attack what is in reach, else close in. */
const fight = async () => {
  for (let rounds = 0; rounds < 60; rounds += 1) {
    await waitIdle();
    const now = await invoke('get_stage_state');
    if (!now.combat.is_active) return now;
    const actor = now.combat.combatants[now.combat.current_turn_index];
    if (actor.role !== 'player') {
      await jsClick('[data-testid="combat-5e"] button:not([disabled])');
      continue;
    }
    if (await exists('g[data-token][role="button"]')) {
      await jsClick('g[data-token][role="button"]');
      await waitIdle();
    } else {
      const foes = now.combat.combatants.filter((c) => c.role === 'enemy' && c.hp > 0 && c.position).map((c) => c.position);
      const target = await browser.execute((enemies) => {
        const squares = [...document.querySelectorAll('rect[data-move]')].map((r) => r.getAttribute('data-move').split(':').map(Number));
        const distance = ([x, y]) => Math.min(...enemies.map((f) => Math.max(Math.abs(f.x - x), Math.abs(f.y - y))));
        squares.sort((a, b) => distance(a) - distance(b));
        return squares[0] ? squares[0].join(':') : null;
      }, foes);
      if (target) {
        await jsClick(`rect[data-move="${target}"]`);
        await waitIdle();
        if (await exists('g[data-token][role="button"]')) {
          await jsClick('g[data-token][role="button"]');
          await waitIdle();
        }
      }
    }
    const after = await invoke('get_stage_state');
    if (after.combat.is_active && after.combat.combatants[after.combat.current_turn_index]?.role === 'player') {
      await browser.$('button=Zug beenden').click();
    }
  }
  throw new Error('Kampf endet nicht');
};

try {
  await browser.$('button=Stage').waitForExist({ timeout: 20_000 });
  await browser.setWindowSize(1400, 900);
  await browser.$('button=Stage').click();

  // 1) The "5e adventures" button opens the lobby on 5e scenes only, with the starter adventure on top.
  await browser.$('[data-testid="open-5e-adventures"]').click();
  await browser.$('[data-testid="adventure-banner"]').waitForDisplayed({ timeout: 15_000, timeoutMsg: 'kein Abenteuer-Banner' });
  await browser.$('[data-scene-id="akt1_waldstrasse"]').waitForExist({ timeout: 15_000, timeoutMsg: 'Akt 1 fehlt' });
  const listed = await browser.execute(() => [...document.querySelectorAll('[data-scene-id]')].map((el) => el.getAttribute('data-scene-id')));
  assert.deepEqual([...listed].sort(), ['akt1_waldstrasse', 'akt2_gruft', 'akt3_heiligtum'], `nur 5e-Abenteuer: ${listed}`);
  assert.match(await browser.$('[data-scene-id="akt1_waldstrasse"]').getText(), /5e-Abenteuer/);
  await shot('79-abenteuer-lobby');
  // Story scenes hide the adventure; back to it and begin.
  await jsClick('[data-rules="narrative"]');
  await browser.waitUntil(() => browser.execute(() => !document.querySelector('[data-scene-id="akt1_waldstrasse"]')), { timeout: 5_000, timeoutMsg: 'Erzählfilter zeigt 5e-Akte' });
  assert.ok(!(await exists('[data-testid="adventure-banner"]')));
  await jsClick('[data-rules="5e"]');
  await browser.$('[data-testid="adventure-begin"]').waitForDisplayed({ timeout: 5_000 });
  await jsClick('[data-testid="adventure-begin"]');
  await browser.$('[data-testid="adventure-party"]').waitForDisplayed({ timeout: 10_000, timeoutMsg: 'keine Gruppenwahl' });
  for (const hero of HEROES) {
    assert.ok(await browser.$(`input[data-member="${hero}"]`).isSelected(), `${hero} nicht vorausgewählt`);
  }
  await shot('75-abenteuer-gruppe');
  await jsClick('[data-testid="adventure-start"]');
  await browser.$('button[role="tab"]=Spielbrett').waitForExist({ timeout: 15_000 });
  await browser.$('button[role="tab"]=Spielbrett').click();
  await browser.$('[data-testid="explore-layer"]').waitForExist({ timeout: 20_000, timeoutMsg: 'Erkundung startet nicht' });
  await waitIdle();
  const start = await invoke('get_stage_state');
  assert.equal(start.definition.id, 'akt1_waldstrasse');
  const classes = Object.fromEntries(start.combat.combatants.filter((c) => c.role === 'companion').map((c) => [c.name, c.stats5e.class_id]));
  assert.deepEqual(classes, { 'Thorin Eisenbart': 'fighter', 'Lyra Sternenhain': 'wizard', 'Finn Flinkfuß': 'rogue', 'Althea Sonnwind': 'cleric' });
  assert.ok(await exists('[data-goal="hinterhalt"][data-reached="false"]'));
  await shot('76-abenteuer-akt1');

  // 2) The first steps west: ambush, fight to the end.
  const west = await browser.execute(() => {
    const squares = [...document.querySelectorAll('rect[data-explore]')].map((r) => r.getAttribute('data-explore').split(':').map(Number));
    const road = squares.filter(([x, y]) => y >= 3 && y <= 5 && x < 12).sort((a, b) => b[0] - a[0]);
    return road[0] ? road[0].join(':') : null;
  });
  assert.ok(west && (await jsClick(`[data-explore="${west}"]`)), 'kein Feld nach Westen');
  // The ambush has begun once the engine logged the encounter (the panel may be short-lived).
  await browser.waitUntil(async () => (await invoke('get_stage_state')).exploration.some((e) => e.type === 'encounter'), {
    timeout: 30_000,
    timeoutMsg: 'kein Überfall',
  });
  const ended = await fight();
  assert.ok(ended.combat.events.some((e) => e.type === 'combat_end' && e.outcome === 'victory'), 'Hinterhalt nicht überstanden');
  await browser.$('[data-goal="hinterhalt"][data-reached="true"]').waitForExist({ timeout: 10_000, timeoutMsg: 'Ziel nicht abgehakt' });

  // The bandits' spoils land in the inventory; Finn takes up their light crossbow.
  const looted = await invoke('get_stage_state');
  assert.ok(looted.inventory.some((i) => i.srd_id === 'light_crossbow'), 'keine Beute');
  assert.ok(looted.exploration.some((e) => e.type === 'loot'));
  await browser.$('button[aria-label="Charakterbogen von Finn Flinkfuß öffnen"]').click();
  await browser.$('[data-testid="sheet-gear"]').waitForDisplayed({ timeout: 10_000 });
  await browser.$('[data-equip="light_crossbow"]').click();
  await browser.waitUntil(async () => {
    const s = await invoke('get_stage_state');
    return s.combat.combatants.find((c) => c.name === 'Finn Flinkfuß').stats5e.equipped.includes('light_crossbow');
  }, { timeout: 10_000, timeoutMsg: 'Armbrust nicht angelegt' });
  await browser.$('[data-equipped="light_crossbow"]').waitForExist({ timeout: 5_000 });
  await shot('78-abenteuer-ausruestung');
  await browser.keys('Escape');

  // 3) Along the road to the west edge: the act is complete.
  for (let step = 0; step < 6 && !(await exists('[data-testid="act-done"]')); step += 1) {
    const target = await browser.execute(() => {
      const squares = [...document.querySelectorAll('rect[data-explore]')].map((r) => r.getAttribute('data-explore').split(':').map(Number));
      const road = squares.filter(([, y]) => y >= 3 && y <= 5);
      road.sort((a, b) => a[0] - b[0]);
      return road[0] ? road[0].join(':') : null;
    });
    assert.ok(target, 'kein Weg nach Westen');
    await jsClick(`[data-explore="${target}"]`);
    await waitIdle();
  }
  await browser.$('[data-testid="act-done"]').waitForDisplayed({ timeout: 10_000, timeoutMsg: 'Akt 1 wird nicht abgeschlossen' });
  const done = await invoke('get_stage_state');
  assert.equal(done.map.id, 'crypt_hall');
  assert.ok(done.objectives.every((o) => o.status === 'completed'));
  await shot('77-abenteuer-akt1-geschafft');

  // 4) On into act 2 with the same party.
  await browser.$('button=Weiter mit dem nächsten Akt').click();
  await browser.waitUntil(async () => (await invoke('get_stage_state')).definition.id === 'akt2_gruft', { timeout: 15_000, timeoutMsg: 'Akt 2 startet nicht' });
  await browser.$('[data-testid="explore-room"]').waitForDisplayed({ timeout: 20_000 });
  await waitIdle();
  const act2 = await invoke('get_stage_state');
  assert.deepEqual(act2.definition.party, HEROES);
  assert.ok(act2.combat.combatants.filter((c) => c.role !== 'enemy').every((c) => c.hp === c.max_hp), 'keine Rast zwischen den Akten');
  assert.ok(await exists('[data-goal="goblins"][data-reached="false"]'));
  // Milestone: the finished act lifts everyone to level 2 (more hit points, Action Surge …).
  assert.ok(act2.combat.combatants.filter((c) => c.role !== 'enemy').every((c) => c.stats5e.level === 2), 'kein Stufenaufstieg');
  assert.ok(act2.exploration.some((e) => e.type === 'level_up' && e.level === 2));
  const thorin = act2.combat.combatants.find((c) => c.name === 'Thorin Eisenbart');
  assert.equal(thorin.max_hp, 20);
  assert.match(await browser.$('[data-testid="explore-5e"]').getText(), /Stufe 2/);
  console.log(`Abenteuer: Akt 1 mit ${ended.combat.events.filter((e) => e.type === 'attack').length} Angriffen geschafft, Akt 2 begonnen.`);
} finally {
  await close();
}
