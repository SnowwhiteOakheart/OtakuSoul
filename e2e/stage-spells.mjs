// 5e magic (Roadmap_DND.md, step 3): the cleric companion brings an unconscious hero back on
// her own, and the wizard aims Burning Hands on the board – the preview lights the cone, both
// zombies in it roll their own Dexterity saves against the wizard's DC.
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
const waitIdle = async () => {
  await browser.pause(150);
  await browser.waitUntil(
    () => browser.execute(() => !document.querySelector('[data-testid="combat-5e"][data-busy="true"]')),
    { timeout: 30_000, timeoutMsg: 'Kampfzug endet nicht' },
  );
};
/** Waits until the engine has played everyone else and the player is to move (or the fight is over). */
const waitPlayerTurn = async () => {
  await browser.waitUntil(async () => {
    await waitIdle();
    const s = await invoke('get_stage_state');
    if (!s.combat.is_active) return true;
    if (s.combat.combatants[s.combat.current_turn_index]?.role === 'player') {
      await browser.pause(300);
      const again = await invoke('get_stage_state');
      return again.combat.current_turn_index === s.combat.current_turn_index && again.combat.events.length === s.combat.events.length;
    }
    // A companion or monster is to move: let the engine go on.
    await jsClick('[data-testid="combat-5e"] button:not([disabled])');
    return false;
  }, { timeout: 60_000, interval: 300, timeoutMsg: 'Spieler kommt nicht an die Reihe' });
};
const freshTurn = { movement_left_ft: 30, action_used: false, bonus_action_used: false, disengaged: false };

/** Rearranges the running fight and lets the Stage view load it again. */
const arrange = async (change) => {
  const scene = await invoke('get_stage_state');
  change(scene);
  await invoke('save_stage_scene', { sceneState: scene });
  await browser.$('button=Chat').click();
  await browser.$('button=Stage').click();
  const tab = await browser.$('button[role="tab"]=Spielbrett');
  await tab.waitForExist({ timeout: 15_000 });
  await tab.click();
  await browser.$('[data-testid="battle-map"]').waitForDisplayed({ timeout: 15_000 });
  await waitIdle();
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
        rules: { ruleset: '5e', hero_classes: { player: 'wizard', 'Ayu Ikue': 'cleric' }, control_companions: false, map_id: 'crypt_hall' },
      },
      combat: { ...scene.combat, is_active: false, combatants: [], events: [] },
    },
  });
  await browser.$('button=Stage').click();
  const input = await browser.$('form textarea');
  await input.waitForDisplayed({ timeout: 15_000 });
  mock.stats.stageEncounter = { action: 'start', enemies: [{ monster: 'zombie', count: 2 }] };
  await input.setValue('Wir steigen in die Gruft hinab.');
  await browser.keys('Enter');
  await browser.$('[data-testid="battle-map"]').waitForDisplayed({ timeout: 30_000, timeoutMsg: 'Spielbrett erscheint nicht' });
  mock.stats.stageEncounter = null;
  await waitPlayerTurn();

  // 1) The hero lies dying; it is the cleric's turn. She heals without being asked.
  const mark = (await invoke('get_stage_state')).combat.events.length;
  await arrange((s) => {
    const player = s.combat.combatants.find((c) => c.role === 'player');
    player.hp = 0;
    player.conditions = [{ name: 'unconscious', rounds_remaining: 0 }];
    s.combat.current_turn_index = s.combat.combatants.findIndex((c) => c.name === 'Ayu Ikue');
    s.combat.turn = freshTurn;
  });
  // The Stage view may already let the engine continue on its own; otherwise "Weiter" starts it.
  await waitPlayerTurn();
  const healed = await invoke('get_stage_state');
  const newEvents = healed.combat.events.slice(mark);
  const cast = newEvents.find((e) => e.type === 'spell_cast' && e.caster_name === 'Ayu Ikue');
  assert.ok(cast && ['healing_word', 'cure_wounds'].includes(cast.spell_id), `Klerikerin heilt nicht: ${JSON.stringify(newEvents.map((e) => e.type))}`);
  assert.ok(newEvents.some((e) => e.type === 'heal' && e.target_id === 'player'), 'keine Heilung für den Helden');

  // 2) The wizard's turn with both zombies in a row in front of her.
  await arrange((s) => {
    s.combat.is_active = true;
    const player = s.combat.combatants.find((c) => c.role === 'player');
    player.hp = player.max_hp;
    player.conditions = [];
    player.position = { x: 1, y: 4 };
    const foes = s.combat.combatants.filter((c) => c.role === 'enemy');
    foes.forEach((g, i) => {
      g.hp = g.max_hp;
      g.conditions = [];
      g.position = { x: 2 + i, y: 4 };
    });
    const ayu = s.combat.combatants.find((c) => c.name === 'Ayu Ikue');
    ayu.hp = Math.max(ayu.hp, 1);
    ayu.conditions = [];
    ayu.position = { x: 1, y: 1 };
    s.combat.current_turn_index = s.combat.combatants.indexOf(player);
    s.combat.turn = freshTurn;
  });
  await browser.$('[data-testid="spellbook"]').waitForDisplayed({ timeout: 10_000, timeoutMsg: 'kein Zauberbuch' });
  assert.ok(await jsClick('[data-spell="burning_hands"] button[aria-pressed]'), 'Brennende Hände fehlt');
  await browser.$('[data-testid="spell-aim"]').waitForExist({ timeout: 5_000 });
  await browser.$('rect[data-cast-at="3:4"]').moveTo();
  const lit = await browser.execute(() => [...document.querySelectorAll('rect[data-area]')].map((r) => r.getAttribute('data-area')));
  assert.ok(lit.includes('2:4') && lit.includes('3:4') && !lit.includes('1:4'), `Vorschau falsch: ${lit}`);
  await shot('70-zauber-zielen');
  const beforeCast = (await invoke('get_stage_state')).combat.events.length;
  assert.ok(await jsClick('rect[data-cast-at="3:4"]'));
  await waitIdle();
  const after = await invoke('get_stage_state');
  const castEvents = after.combat.events.slice(beforeCast);
  assert.ok(castEvents.some((e) => e.type === 'spell_cast' && e.spell_id === 'burning_hands'), 'Brennende Hände nicht gewirkt');
  const saves = castEvents.filter((e) => e.type === 'save');
  assert.equal(new Set(saves.map((e) => e.target_id)).size, 2, `Rettungswürfe: ${JSON.stringify(saves)}`);
  const wizard = after.combat.combatants.find((c) => c.role === 'player').stats5e;
  const dc = 8 + 2 + Math.floor((wizard.abilities[3] - 10) / 2);
  for (const save of saves) {
    assert.equal(save.ability, 'dex');
    assert.equal(save.dc, dc, 'SG = 8 + Übung + INT-Mod der Magierin');
    assert.equal(save.total, save.roll.natural + save.bonus);
    assert.equal(save.success, save.total >= save.dc);
  }
  const log = await browser.$('[aria-label="Kampfverlauf"]').getText().catch(() => '');
  console.log(log.split('\n').slice(-4).join('\n'));
  await shot('71-zauber-gewirkt');
  console.log(`Zauber: ${cast.spell_id} von Ayu, Brennende Hände mit ${saves.length} Rettungswürfen.`);
} finally {
  await close();
}
