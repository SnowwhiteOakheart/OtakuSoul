// Long-stage regression: context fitting, incremental summaries, privacy and persistence.
import assert from 'node:assert/strict';
import { launch } from './harness.mjs';

const { browser, mock, close } = await launch({ cloud_context_tokens: 4096 });
// oxlint-disable-next-line no-underscore-dangle -- Tauri-IPC im Wegwerfprofil
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
try {
  await browser.$('button=Stage').waitForExist({ timeout: 15_000 });
  await browser.$('button=Stage').click();
  await browser.$('textarea').waitForDisplayed({ timeout: 15_000 });
  const initial = await invoke('get_stage_state');
  initial.definition.party = ['Ayu', 'Sora'];
  initial.definition.max_actor_depth = 1;
  initial.chat_log = Array.from({ length: 45 }, (_, i) => ({
    ...initial.chat_log[0], id: `long-${i}`, sender_name: 'Kai', sender_role: 'player',
    turn_mode: i === 0 ? 'whisper' : i === 1 ? 'think' : 'say',
    whisper_target: i === 0 ? 'Ayu' : null,
    content: i === 0 ? 'SECRET_PASSWORD' : i === 1 ? 'SECRET_THOUGHT' : `Beitrag ${i}: ${'Wir erkunden das Tor und suchen nach alten Runen. '.repeat(12)}`,
  }));
  initial.history_summaries = {};
  initial.private_knowledge = {};
  await invoke('save_stage_scene', { sceneState: initial });
  const turn = (actor) => invoke('run_stage_turn', { request: {
    scene_id: initial.definition.id, user_input: 'Ich öffne das Tor.', turn_mode: 'say', force_next_actor: actor,
  } });
  const first = await turn('Ayu');
  for (const key of ['planner', 'narrator', 'character:ayu']) {
    assert.ok(first.history_summaries[key]?.until > 6, `Zusammenfassung fehlt: ${key}`);
  }
  assert.ok(first.history_summaries.planner.text.includes('SECRET_THOUGHT'));
  assert.ok(first.history_summaries['character:ayu'].text.includes('SECRET_PASSWORD'));
  assert.ok(!first.history_summaries['character:ayu'].text.includes('SECRET_THOUGHT'));
  assert.ok(!JSON.stringify(mock.stats.lastNarratorMessages).includes('SECRET_'));
  assert.ok(first.chat_log.length > initial.chat_log.length, 'Originalverlauf wurde gekürzt');
  assert.ok(mock.stats.lastPlannerMessages.some((m) => m.content.includes('STORY SO FAR')));
  for (const [messages, reserve] of [[mock.stats.lastPlannerMessages, 1000], [mock.stats.lastNarratorMessages, 1500], [mock.stats.lastCompanionMessages, 800]]) {
    const tokens = messages.reduce((n, m) => n + Math.ceil(Buffer.byteLength(m.content) / 3) + 6, 0);
    assert.ok(tokens + reserve <= 4096, `Kontext überschritten: ${tokens} + ${reserve}`);
  }
  const reloaded = await invoke('load_stage_scene', { sceneId: initial.definition.id });
  assert.deepEqual(reloaded.history_summaries, first.history_summaries);
  reloaded.chat_log.push(...initial.chat_log.slice(2, 17).map((m, i) => ({ ...m, id: `extra-${i}` })));
  await invoke('save_stage_scene', { sceneState: reloaded });
  const second = await turn('Sora');
  assert.ok(!JSON.stringify(mock.stats.lastCompanionMessages).includes('SECRET_'), 'Sora kennt fremde Geheimnisse');
  assert.ok(second.history_summaries['character:sora'].until > 6);
  assert.ok(second.history_summaries.planner.until > first.history_summaries.planner.until);
  const undone = await invoke('undo_stage_turn', { sceneId: initial.definition.id });
  assert.deepEqual(undone.history_summaries, first.history_summaries);
  const edited = await invoke('stage_edit_message', { sceneId: initial.definition.id, messageId: 'long-0', newContent: 'Korrigiert' });
  assert.deepEqual(edited.history_summaries, {});
  mock.stats.failStageSummary = true;
  const failed = await turn('PLAYER');
  assert.deepEqual(failed.history_summaries, {}, 'Fehlgeschlagene Zusammenfassung zählt als verarbeitet');
  mock.stats.failStageSummary = false;
  const retried = await turn('PLAYER');
  assert.ok(retried.history_summaries.planner.until > 6, 'Zusammenfassung wird nicht erneut versucht');
  const deleted = await invoke('stage_delete_message', { sceneId: initial.definition.id, messageId: 'long-1' });
  assert.deepEqual(deleted.history_summaries, {});
  console.log(`✔ Stage-Kontext bestanden (${mock.stats.stageSummary} Zusammenfassungsanfragen)`);
} finally {
  await close();
}
