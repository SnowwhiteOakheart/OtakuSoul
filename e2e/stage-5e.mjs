// 5e fights (step 1 of the 5e plan): the game master starts an encounter with SRD monster
// ids, the rules engine decides every number, the player attacks from the combat panel,
// companions pick listed actions, the narrator retells the engine's report. Hit points may only
// change through engine damage – the mock planner's `hp_delta: -5` must be ignored.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, openSceneLobby, screenshotDir } from './harness.mjs';
import { COMBAT_NARRATION } from './mock-llm.mjs';

const { browser, mock, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));

/**
 * Every lost hit point is explained by the engine's damage and heal events (companions heal
 * themselves with Second Wind, which a fight can trigger at random).
 */
const assertEngineHitPoints = (scene) => {
  const damage = {};
  for (const event of scene.combat.events ?? []) {
    if (event.type === 'damage') damage[event.target_id] = (damage[event.target_id] ?? 0) + event.amount;
    if (event.type === 'heal') damage[event.target_id] = (damage[event.target_id] ?? 0) - event.amount;
  }
  for (const c of scene.combat.combatants) {
    const lost = c.max_hp - c.hp;
    // Damage stops at 0 HP and healing at the maximum, so check the last known state instead of the sum.
    const last = [...(scene.combat.events ?? [])].reverse().find((e) => (e.type === 'damage' || e.type === 'heal') && e.target_id === c.id);
    const expected = last ? c.max_hp - last.hp_after : Math.min(c.max_hp, damage[c.id] ?? 0);
    assert.equal(lost, expected, `${c.name}: ${lost} LP verloren, Engine-Schaden ${expected}`);
  }
};

try {
  await browser.$('button=Stage').waitForExist({ timeout: 20_000 });
  await browser.setWindowSize(1280, 900);
  const scene = await invoke('get_stage_state');
  await invoke('save_stage_scene', {
    sceneState: {
      ...scene,
      definition: {
        ...scene.definition,
        rules: { ruleset: '5e', hero_classes: { player: 'fighter', 'Lirwen': 'fighter' }, control_companions: false },
      },
      combat: { ...scene.combat, is_active: false, combatants: [], events: [] },
    },
  });
  await browser.$('button=Stage').click();
  const input = await browser.$('form textarea');
  await input.waitForDisplayed({ timeout: 15_000 });

  // The game master starts a fight with two goblins (ids only; the engine sets the numbers).
  mock.stats.stageEncounter = { action: 'start', enemies: [{ monster: 'goblin', count: 2, hp: 999 }] };
  await input.setValue('Ich ziehe mein Schwert.');
  await browser.keys('Enter');
  const panel = await browser.$('[data-testid="combat-5e"]');
  await panel.waitForDisplayed({ timeout: 30_000, timeoutMsg: 'Kampfpanel erscheint nicht' });
  mock.stats.stageEncounter = null;

  let started = await invoke('get_stage_state');
  const goblins = started.combat.combatants.filter((c) => c.role === 'enemy');
  assert.equal(goblins.length, 2);
  assert.ok(goblins.every((g) => g.max_hp === 7 && g.stats5e?.armor_class === 15), 'SRD-Werte statt LLM-Werten');
  const player = started.combat.combatants.find((c) => c.role === 'player');
  assert.equal(player.stats5e.class_id, 'fighter');
  assertEngineHitPoints(started);

  // Fight from the panel until the engine declares the end.
  let rounds = 0;
  while ((await invoke('get_stage_state')).combat.is_active && rounds < 25) {
    const attack = await panel.$('button[aria-label*="gegen"]');
    await attack.waitForClickable({ timeout: 30_000, timeoutMsg: 'Kein Angriff wählbar' });
    await attack.click();
    await browser.waitUntil(
      async () => {
        const now = await invoke('get_stage_state');
        return !now.combat.is_active || (await panel.$('button[aria-label*="gegen"]').isClickable().catch(() => false));
      },
      { timeout: 30_000, timeoutMsg: 'Kampfzug endet nicht' },
    );
    const now = await invoke('get_stage_state');
    if (now.combat.is_active) assertEngineHitPoints(now);
    if (rounds === 0) await shot('65-5e-kampf');
    rounds += 1;
  }
  const ended = await invoke('get_stage_state');
  assert.equal(ended.combat.is_active, false, 'Kampf endet nicht');
  const end = ended.combat.events.find((event) => event.type === 'combat_end');
  assert.ok(end, 'kein Kampfende in den Ereignissen');
  assert.ok(mock.stats.combatReports > 0, 'Kampfbericht wurde nicht erzählt');
  assert.ok(ended.chat_log.some((m) => m.content === COMBAT_NARRATION), 'Erzählung fehlt im Verlauf');
  assert.ok(mock.stats.lastCombatReport.includes('attacks'), 'Bericht enthält keine Angriffe');
  // Every companion turn went through the model's choice of a listed action.
  const companionTurns = ended.combat.events.filter((e) => e.type === 'turn_start' && ended.definition.party.includes(e.actor_name)).length;
  assert.equal(mock.stats.combatActions ?? 0, companionTurns, 'nicht jeder Gefährtenzug fragte das Modell');

  // The compact sheet of the player.
  await browser.$('button[aria-label^="Charakterbogen von"]').click();
  const sheet = await browser.$('[role="dialog"]');
  await sheet.waitForDisplayed();
  const sheetText = await sheet.getText();
  assert.ok(sheetText.includes('Rüstungsklasse') && sheetText.includes('Langschwert'), sheetText);
  await shot('66-5e-bogen');
  await browser.keys('Escape');

  // The scene editor shows the rules with a class per party member.
  await openSceneLobby(browser);
  await browser.$(`button[aria-label='Weitere Aktionen für „${ended.definition.title}“']`).click();
  await browser.$('button=Szene bearbeiten').click();
  const ruleset = await browser.$('#scene-ruleset');
  await ruleset.waitForDisplayed();
  assert.equal(await ruleset.getValue(), '5e');
  assert.equal(await browser.$('#scene-class-player').getValue(), 'fighter');
  await browser.$('#scene-class-player').scrollIntoView({ block: 'center' });
  await shot('67-5e-szenenregeln');
  await browser.$('button=Abbrechen').click();
  console.log(`5e-Kampf: ${rounds} Spielerzüge, Ausgang ${end.outcome}, LP nur aus Engine-Schaden.`);
} finally {
  await close();
}
