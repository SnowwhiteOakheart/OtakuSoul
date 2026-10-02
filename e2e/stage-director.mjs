// Who speaks next: direct address, routing after each beat, "Continue" and Auto-Play.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));
// Characters who replied (companions and NPCs), in order.
const speakers = async (from) => (await invoke('get_stage_state')).chat_log.slice(from)
  .filter((m) => m.sender_role === 'companion' || m.sender_role === 'npc').map((m) => m.sender_name);
try {
  await browser.$('button=Soul Stage').waitForExist({ timeout: 20_000 });
  await browser.$('button=Soul Stage').click();
  const stageInput = await browser.$('form textarea');
  await stageInput.waitForDisplayed({ timeout: 15_000 });
  const waitTurn = async (plannerBefore) => {
    await browser.waitUntil(() => mock.stats.stagePlanner > plannerBefore, { timeout: 20_000 });
    await browser.$('button=Stopp').waitForExist({ reverse: true, timeout: 40_000 });
  };

  // 1. Addressing a companion by name makes them answer first; an NPC joins via routing.
  const party = (await invoke('get_stage_state')).definition.party;
  assert.ok(party.length > 0, 'test scene without party');
  const companion = party[0];
  mock.stats.spawnNpc = { name: 'Liora', archetype: 'merchant', personality: 'Eine wachsame Händlerin.' };
  mock.stats.routeTo = 'Liora';
  let logStart = (await invoke('get_stage_state')).chat_log.length;
  let planner = mock.stats.stagePlanner;
  await stageInput.setValue(`${companion}, was siehst du dort hinten?`);
  await browser.keys('Enter');
  await waitTurn(planner);
  let order = await speakers(logStart);
  assert.equal(order[0], companion, `angesprochene Figur antwortet nicht zuerst: ${order.join(' → ')}`);
  assert.ok(mock.stats.routing >= 1, 'kein Routing nach dem Beitrag');
  assert.ok(mock.stats.lastRoutingPrompt.includes('Liora'), 'NPC fehlt unter den Routing-Kandidaten');
  assert.ok(order.indexOf('Liora') > order.indexOf(companion), `Routing ignoriert: ${order.join(' → ')}`);
  await shot('21-regie-ansprache');

  // 2. "Continue" runs a turn without a player line.
  mock.stats.spawnNpc = undefined;
  mock.stats.routeTo = 'PLAYER';
  logStart = (await invoke('get_stage_state')).chat_log.length;
  planner = mock.stats.stagePlanner;
  await browser.$('button[aria-label="Weiter"]').click();
  await waitTurn(planner);
  assert.ok(JSON.stringify(mock.stats.lastPlannerMessages).includes('lets the story unfold'), 'Planer bekommt keinen Fortsetzen-Auftrag');
  assert.ok(!(await invoke('get_stage_state')).chat_log.slice(logStart).some((m) => m.sender_role === 'player'), 'Weiter erzeugt eine Spielernachricht');

  // 3. Auto-Play chains turns until switched off.
  planner = mock.stats.stagePlanner;
  await browser.$('button[aria-label="Auto-Play"]').click();
  await browser.waitUntil(() => mock.stats.stagePlanner >= planner + 2, { timeout: 60_000, timeoutMsg: 'Auto-Play spielt nicht mehrere Runden' });
  await shot('22-regie-autoplay');
  await browser.$('button[aria-label="Auto-Play"]').click();
  await browser.$('button=Stopp').waitForExist({ reverse: true, timeout: 40_000 });
  const settled = mock.stats.stagePlanner;
  await browser.pause(4000);
  assert.equal(mock.stats.stagePlanner, settled, 'Auto-Play läuft nach dem Ausschalten weiter');
  assert.equal(await browser.$('button[aria-label="Auto-Play"]').getAttribute('aria-pressed'), 'false');
  console.log(`Regie: Ansprache, Routing (${mock.stats.routing}×), Weiter und Auto-Play bestanden.`);
} finally {
  await close();
}
