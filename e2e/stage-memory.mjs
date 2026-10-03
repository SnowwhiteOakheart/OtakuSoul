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

  // 3. Overlays and lore cards: the companion gets their overlay and party lore, never GM lore.
  const companion = (await invoke('get_stage_state')).definition.party[0];
  mock.stats.overlayUpdates = [{ name: companion, current_role: 'OVERLAY_ROLE: Hüterin des Siegels' }];
  mock.stats.loreUpdates = [
    { title: 'Das Siegel', content: 'PARTY_LORE: Nur Blut öffnet es.', keywords: ['Siegel'], audience: 'party' },
    { title: 'Der Verräter', content: 'GM_SECRET: Der Wirt arbeitet für den Feind.', keywords: [], audience: 'gm' },
  ];
  await turn('Wir sehen uns um.');
  mock.stats.overlayUpdates = [];
  mock.stats.loreUpdates = [];
  state = await invoke('get_stage_state');
  assert.equal(state.lore_cards.length, 2);
  assert.ok(state.overlays.some((o) => o.name === companion && o.current_role.includes('OVERLAY_ROLE')));
  await turn(`${companion}, was weißt du über das Siegel?`);
  const companionPrompt = JSON.stringify(mock.stats.companionMessagesByName?.[companion] ?? mock.stats.lastCompanionMessages);
  assert.ok(companionPrompt.includes('OVERLAY_ROLE'), 'Overlay fehlt im Prompt der Figur');
  assert.ok(companionPrompt.includes('PARTY_LORE'), 'Gruppen-Lore fehlt bei passendem Stichwort');
  assert.ok(!companionPrompt.includes('GM_SECRET'), 'Spielleiter-Lore erreicht die Figur');
  assert.ok(JSON.stringify(mock.stats.lastPlannerMessages).includes('GM_SECRET'), 'Spielleiter-Lore fehlt beim Planer');

  // 4. Soul Memory: after enough witnessed lines, the companion's own view goes to the pipeline.
  state = await invoke('get_stage_state');
  const line = (content, extra = {}) => ({ ...state.chat_log[0], id: `sync-${content}`, sender_name: 'Hiroki', sender_role: 'player', content, turn_mode: 'say', whisper_target: null, ...extra });
  await invoke('save_stage_scene', {
    sceneState: {
      ...state,
      chat_log: [...state.chat_log, line('PUBLIC_EVENT: Das Tor stürzt ein.'), line('SECRET_FOR_OTHER: Ich traue ihr nicht.', { turn_mode: 'whisper', whisper_target: 'Liora' })],
      memory_sync: { [companion]: state.chat_log.length - 8 },
    },
  });
  await turn('Wir laufen weiter.');
  // Earlier syncs run in the background too; wait for the one carrying the new lines.
  const synced = () => (mock.stats.memoryRequests ?? []).find((r) => r.includes('PUBLIC_EVENT'));
  await browser.waitUntil(() => Boolean(synced()), { timeout: 20_000, timeoutMsg: 'Szenenerlebnis erreicht das Soul Memory nicht' });
  const memoryRequest = synced();
  assert.ok(!memoryRequest.includes('SECRET_FOR_OTHER'), 'Geflüstertes an andere landet im Gedächtnis');
  assert.ok(memoryRequest.includes('whispers something'), 'Flüstern fehlt als Ereignis');

  await browser.$('button*=Kampagne').click();
  await browser.$('p*=ARC_SUMMARY').waitForDisplayed({ timeout: 5000 });
  await shot('26-arc-archiv');
  await browser.$('button=Weltzustand bearbeiten').click();
  await browser.$('#stage-world-title').waitForDisplayed();
  const loreTitle = await browser.$('input[aria-label="Titel"][value="Der Verräter"]');
  await loreTitle.scrollIntoView();
  await shot('27-overlays-lorekarten');
  console.log('Gedächtnis: Arc-Archiv, Konsistenzprüfung, Overlays, Lorekarten und Soul-Memory-Übernahme bestanden.');
} finally {
  await close();
}
