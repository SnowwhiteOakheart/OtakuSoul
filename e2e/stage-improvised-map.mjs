// Improvised battle maps (C8): a 5e story without a map of its own gets a map of the current place
// from a picture (here a fixture through `import_stage_battle_map`, the same path a Flux picture
// takes after painting). The card above the turn bar shows it with what the rules read, warns when
// one cannot fight on it, "discard" removes it, and a fight then runs on the painted board.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));
const fixture = (name) => path.resolve('src-tauri/tests/fixtures/battlemap', `${name}.png`);
const card = () => browser.$('[data-improvised-map]');

/** Leaves the Stage and comes back, so the card asks for the map of the place again. */
const reopenStage = async () => {
  await jsClick(await browser.$('button=Chat'));
  await jsClick(await browser.$('button=Stage'));
  await browser.$('form textarea').waitForDisplayed({ timeout: 15_000 });
};

try {
  await browser.$('button=Stage').waitForExist({ timeout: 20_000 });
  await browser.setWindowSize(1280, 900);
  const scene = await invoke('get_stage_state');
  const sceneId = scene.definition.id;
  await invoke('save_stage_scene', {
    sceneState: {
      ...scene,
      definition: { ...scene.definition, rules: { ruleset: '5e', hero_classes: { player: 'fighter' }, control_companions: false } },
      world: { ...scene.world, location: 'Ufer am Mühlbach' },
      combat: { ...scene.combat, is_active: false, combatants: [], events: [] },
      map: null,
    },
  });
  await jsClick(await browser.$('button=Stage'));
  await browser.$('form textarea').waitForDisplayed({ timeout: 15_000 });
  assert.equal(await invoke('stage_battle_map', { sceneId }), null, 'Karte ohne Bild');

  // A picture one cannot fight on: the card says so (a fight would run without a board).
  const cramped = await invoke('import_stage_battle_map', { sceneId, imagePath: fixture('flux2_watchtower') });
  assert.equal(cramped.check.playable, false);
  await reopenStage();
  await card().waitForDisplayed({ timeout: 10_000, timeoutMsg: 'keine Kartenvorschau' });
  assert.match(await card().getText(), /Auf dieser Karte lässt sich nicht kämpfen/);

  // A playable one replaces it: shown with what the rules read.
  const map = await invoke('import_stage_battle_map', { sceneId, imagePath: fixture('flux2_riverbank') });
  assert.ok(map.check.playable && map.map.id.startsWith('improvised_'), JSON.stringify(map.check));
  assert.equal(map.place, 'Ufer am Mühlbach');
  await reopenStage();
  await browser.waitUntil(async () => (await card().getText()).includes('Kampfkarte: Ufer am Mühlbach'), { timeout: 10_000, timeoutMsg: 'neue Karte nicht gezeigt' });
  await card().$('img').waitForDisplayed({ timeout: 10_000, timeoutMsg: 'Kartenbild fehlt' });
  await shot('125-kampfkarte-vorschau');

  // Discard: gone, and not painted again by itself.
  await (await card().$('[data-discard-map]')).click();
  await browser.waitUntil(async () => !(await card().isExisting()), { timeout: 10_000, timeoutMsg: 'Karte bleibt nach „Verwerfen“' });
  assert.equal(await invoke('stage_battle_map', { sceneId }), null);
  assert.equal(await invoke('generate_stage_battle_map', { sceneId, force: false }), null, 'verworfener Ort wird neu gemalt');

  // Chosen again, then a fight: it runs on the painted board.
  await invoke('import_stage_battle_map', { sceneId, imagePath: fixture('flux2_riverbank') });
  mock.stats.stageEncounter = { action: 'start', enemies: [{ monster: 'goblin', count: 2 }] };
  const input = await browser.$('form textarea');
  await input.setValue('Ich ziehe mein Schwert.');
  await browser.keys('Enter');
  await browser.waitUntil(async () => (await invoke('get_stage_state')).combat.is_active, { timeout: 30_000, timeoutMsg: 'kein Kampf' });
  mock.stats.stageEncounter = null;
  const fight = await invoke('get_stage_state');
  assert.ok(fight.map?.id.startsWith('improvised_'), `Kampf ohne improvisierte Karte: ${fight.map?.id}`);
  assert.ok(fight.combat.combatants.every((c) => c.position), 'Kämpfer ohne Feld');
  await browser.$('[data-painted-map]').waitForExist({ timeout: 15_000, timeoutMsg: 'Spielbrett ohne gemaltes Bild' });
  assert.ok((await browser.$$('[data-painted-map] [data-blocked]')).length > 0, 'keine Hindernisse markiert');
  await browser.pause(800);
  await shot('126-kampfkarte-kampf');
  console.log('Improvisierte Kampfkarte: Vorschau, Warnung, Verwerfen und Kampf auf dem gemalten Brett bestanden.');
} finally {
  await close();
}
