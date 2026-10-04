// Real HTTP waits during routing, arc archiving and fact auditing must end on Stage Stop.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';
const { browser, mock, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
try {
  await browser.$('button=Stage').waitForExist({ timeout: 20_000 });
  await browser.$('button=Stage').click();
  const input = browser.$('form textarea');
  await input.waitForDisplayed({ timeout: 15_000 });
  const runUntil = async (text, stat) => {
    const before = mock.stats[stat] ?? 0;
    await input.setValue(text);
    await browser.keys('Enter');
    await browser.waitUntil(() => (mock.stats[stat] ?? 0) > before, { timeout: 20_000 });
  };
  const stop = async (cancelled) => {
    await browser.$('button=Stopp').click();
    await browser.waitUntil(() => mock.stats[cancelled] >= 1, { timeout: 5_000 });
    await browser.$('button=Stopp').waitForExist({ reverse: true, timeout: 5_000 });
  };
  let state = await invoke('get_stage_state');
  const companion = state.definition.party[0];
  mock.stats.spawnNpc = { name: 'Liora', archetype: 'merchant', personality: 'Eine wachsame Händlerin.' };
  mock.stats.stallRouting = true;
  await runUntil(`${companion}, was siehst du?`, 'routing');
  const completedSpeakers = mock.stats.stageCompanion;
  await stop('cancelledRouting');
  state = await invoke('get_stage_state');
  assert.equal(state.current_turn_actor, 'PLAYER');
  assert.equal(mock.stats.stageCompanion, completedSpeakers, 'Abbruch startet keine weiteren Sprecher');
  assert.ok(state.chat_log.some((line) => line.sender_role === 'companion'), 'fertiger Beitrag fehlt');
  mock.stats.stallRouting = false;
  mock.stats.spawnNpc = undefined;
  mock.stats.routeTo = 'PLAYER';

  // An interrupted archive remains pending and is retried exactly once next turn.
  const arc = { id: 'abort-arc', title: 'Das Tor', description: 'Tor geöffnet', stage: 1, max_stage: 1, is_revealed: true, is_resolved: true };
  await invoke('save_stage_scene', { sceneState: { ...state, arcs: [arc], arc_archive: [], turns_since_audit: 0 } });
  mock.stats.stallArcArchive = true;
  await runUntil('Wir gehen zum Tor.', 'arcArchive');
  await stop('cancelledArcArchive');
  state = await invoke('get_stage_state');
  assert.equal(state.arc_archive.length, 0, 'Abbruch darf kein Ersatzarchiv anlegen');
  assert.equal(state.arcs[0].is_resolved, true);
  mock.stats.stallArcArchive = false;
  await runUntil('Wir gehen weiter.', 'arcArchive');
  await browser.$('button=Stopp').waitForExist({ reverse: true, timeout: 20_000 });
  state = await invoke('get_stage_state');
  assert.equal(state.arc_archive.length, 1);
  assert.ok(state.arc_archive[0].summary.includes('ARC_SUMMARY'));

  // An interrupted audit leaves facts and the due counter intact for the next turn.
  const facts = { tor: 'geschlossen', fackel: 'brennt' };
  await invoke('save_stage_scene', { sceneState: { ...state, world: { ...state.world, key_facts: facts }, turns_since_audit: 7 } });
  mock.stats.stallAudit = true;
  await runUntil('Wir prüfen die Umgebung.', 'audit');
  await browser.saveScreenshot(path.join(screenshotDir, '46-stage-rundenende-abbruch.png'));
  await stop('cancelledAudit');
  state = await invoke('get_stage_state');
  assert.deepEqual(state.world.key_facts, facts);
  assert.equal(state.turns_since_audit, 8);
  const reloaded = await invoke('load_stage_scene', { sceneId: state.definition.id });
  assert.deepEqual(reloaded.world.key_facts, facts);
  assert.equal(reloaded.turns_since_audit, 8);
  mock.stats.stallAudit = false;
  mock.stats.auditResult = { prune_keys: ['fackel'], updated_facts: { tor: 'offen' } };
  await runUntil('Jetzt prüfen wir erneut.', 'audit');
  await browser.$('button=Stopp').waitForExist({ reverse: true, timeout: 20_000 });
  state = await invoke('get_stage_state');
  assert.deepEqual(state.world.key_facts, { tor: 'offen' });
  assert.equal(state.turns_since_audit, 0);
  assert.equal(state.arc_archive.length, 1, 'Archiv darf nicht doppelt entstehen');
  console.log('Stage-Abbruch: Routing stoppt weitere Sprecher; Archivierung und Faktenprüfung bleiben nach Stopp offen und funktionieren in der nächsten Runde.');
} catch (failure) {
  await browser.saveScreenshot(path.join(screenshotDir, 'stage-upkeep-abort-fehler.png'));
  throw failure;
} finally {
  await close();
}
