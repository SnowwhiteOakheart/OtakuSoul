// Soul Stage long-term memory: archived story arcs and the regular consistency check of facts.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));

try {
  await browser.$('button=Soul Stage').waitForExist({ timeout: 20_000 });
  const scene = await invoke('get_stage_state');
  await invoke('save_stage_scene', {
    sceneState: {
      ...scene,
      arcs: [{ id: 'arc-gate', title: 'Das versiegelte Tor', description: 'Wer hat es versiegelt?', stage: 2, max_stage: 3, is_revealed: true, is_resolved: false }],
      world: { ...scene.world, key_facts: { tor: 'verschlossen', wache: 'wach', fackel: 'brennt' } },
      // One turn before the consistency check is due.
      turns_since_audit: 6,
    },
  });
  await browser.$('button=Soul Stage').click();
  const input = await browser.$('form textarea');
  await input.waitForDisplayed({ timeout: 15_000 });
  const turn = async (text) => {
    const before = mock.stats.stagePlanner;
    await input.setValue(text);
    await browser.keys('Enter');
    await browser.waitUntil(() => mock.stats.stagePlanner > before, { timeout: 20_000 });
    await browser.$('button=Stopp').waitForExist({ reverse: true, timeout: 40_000 });
  };

  // 1. The planner resolves the arc: it is condensed into the archive and leaves the open list.
  mock.stats.arcUpdates = [{ id: 'arc-gate', stage_delta: 1, reveal: true, resolve: true }];
  await turn('Ich öffne das Tor mit dem Schlüssel.');
  let state = await invoke('get_stage_state');
  assert.equal(mock.stats.arcArchive, 1, 'Arc wird nicht zusammengefasst');
  assert.equal(state.arc_archive.length, 1);
  assert.ok(state.arc_archive[0].summary.includes('ARC_SUMMARY'), 'Zusammenfassung fehlt im Archiv');
  assert.ok(mock.stats.lastArcArchivePrompt.includes('Ich öffne das Tor'), 'Zusammenfassung kennt den Verlauf nicht');
  assert.equal(mock.stats.audit ?? 0, 0, 'Konsistenzprüfung zu früh');

  // 2. Next turn: archive in the planner prompt, the arc no longer open; the check is due now.
  mock.stats.arcUpdates = [];
  mock.stats.auditResult = { prune_keys: ['fackel'], updated_facts: { tor: 'offen', erfunden: 'darf nicht dazukommen' } };
  await turn('Wir gehen hindurch.');
  const planner = JSON.stringify(mock.stats.lastPlannerMessages);
  assert.ok(planner.includes('ARC_SUMMARY'), 'Archiv fehlt im Planer-Prompt');
  assert.ok(planner.includes('Open story arcs: none'), 'abgeschlossener Arc steht noch in der offenen Liste');
  assert.equal(mock.stats.arcArchive, 1, 'Arc doppelt archiviert');
  assert.equal(mock.stats.audit, 1, 'Konsistenzprüfung läuft nicht nach 8 Runden');
  assert.ok(mock.stats.lastAuditPrompt.includes('fackel: brennt'), 'Prüfung kennt die Fakten nicht');
  state = await invoke('get_stage_state');
  assert.deepEqual(state.world.key_facts, { tor: 'offen', wache: 'wach' }, 'Fakten nicht bereinigt');
  assert.equal(state.turns_since_audit, 0);

  await browser.$('button*=Kampagne').click();
  await browser.$('p*=ARC_SUMMARY').waitForDisplayed({ timeout: 5000 });
  await shot('26-arc-archiv');
  console.log('Gedächtnis: Arc-Archiv und Konsistenzprüfung bestanden.');
} finally {
  await close();
}
