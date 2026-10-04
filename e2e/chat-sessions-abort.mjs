// History read failures, an HTTP endpoint that never responds, and navigation during generation.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';
const { browser, home, mock, close } = await launch();
const sql = (statement) => execFileSync('sqlite3', [path.join(home, 'data', 'otakusoul.db'), statement], { encoding: 'utf8' }).trim();
const openSessions = () => browser.$('button[title="Gespräche, Author\'s Note & HUD-Presets öffnen"]').click();
try {
  await browser.$('[class~="group/bubble"]').waitForDisplayed({ timeout: 20_000 });
  const oldChat = sql('SELECT id FROM chat_sessions LIMIT 1;');
  const input = browser.$('textarea[aria-label="Nachricht"]');
  await input.addValue('Mein Entwurf bleibt erhalten.');
  await openSessions();
  sql('ALTER TABLE chat_messages RENAME TO chat_messages_hidden;');
  await browser.$('button[aria-current="true"]').click();
  await browser.$('[role="alert"]*=Chatverlauf konnte nicht geladen werden').waitForDisplayed();
  await browser.$('button[title="Schließen"]').click();
  assert.equal(await input.getValue(), 'Mein Entwurf bleibt erhalten.');
  assert.equal(await browser.$('button[aria-label="Nachricht senden"]').isEnabled(), false);
  assert.equal((await browser.$$('[class~="group/bubble"]')).length, 0);
  await browser.saveScreenshot(path.join(screenshotDir, '42-chat-verlauf-ladefehler.png'));
  sql('ALTER TABLE chat_messages_hidden RENAME TO chat_messages;');
  await browser.$('button=Erneut versuchen').click();
  await browser.$('[class~="group/bubble"]').waitForDisplayed();
  assert.equal(await input.getValue(), 'Mein Entwurf bleibt erhalten.');

  mock.stats.stallChat = true;
  await browser.$('button[aria-label="Nachricht senden"]').click();
  await browser.waitUntil(() => mock.stats.chat >= 1);
  // Delayed native events from a previous request must not enter this live reply.
  await browser.execute(async () => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    for (const [event, payload] of [
      ['llm-token', { generation_id: 'previous-generation', text: 'Fremdes Stream-Token' }],
      ['llm-thought', { generation_id: 'previous-generation', text: 'Fremder Stream-Gedanke' }],
      ['llm-done', { generation_id: 'previous-generation', full_text: 'Fremder Abschluss', full_thought: '' }],
    ]) await invoke('plugin:event|emit', { event, payload });
  });
  await browser.pause(200);
  assert.equal(await browser.$('body').getText().then((text) => /Fremdes Stream-Token|Fremder Stream-Gedanke/.test(text)), false);
  await browser.saveScreenshot(path.join(screenshotDir, '43-chat-stream-identitaet.png'));
  // Stage cancellation must not terminate a pending Chat request.
  await browser.execute(() => window.__TAURI_INTERNALS__.invoke('abort_stage_turn'));
  await browser.pause(200);
  assert.equal(mock.stats.cancelledChat ?? 0, 0);
  assert.equal(await browser.$('button[aria-label="Generierung abbrechen"]').isDisplayed(), true);
  await browser.$('button[aria-label="Generierung abbrechen"]').click();
  await browser.$('button[aria-label="Nachricht senden"]').waitForDisplayed({ timeout: 5_000 });
  await browser.waitUntil(() => mock.stats.cancelledChat >= 1);
  assert.equal(sql(`SELECT count(*) FROM chat_messages WHERE chat_id = '${oldChat}' AND role = 'assistant';`), '1');

  await input.addValue('Diese Anfrage wird durch den Chatwechsel beendet.');
  await browser.$('button[aria-label="Nachricht senden"]').click();
  await browser.waitUntil(() => mock.stats.chat >= 2);
  await openSessions();
  await browser.$('button=Neuer Chat').click();
  await browser.waitUntil(() => sql('SELECT count(*) FROM chat_sessions;') === '2');
  await browser.waitUntil(() => mock.stats.cancelledChat >= 2);
  await browser.$('button[title="Schließen"]').click();
  await browser.$('button[aria-label="Nachricht senden"]').waitForDisplayed();
  const newChat = sql(`SELECT id FROM chat_sessions WHERE id != '${oldChat}' LIMIT 1;`);
  mock.stats.stallChat = false;
  await input.addValue('Ein neues Gespräch.');
  await browser.waitUntil(async () => await browser.$('button[aria-label="Nachricht senden"]').isEnabled());
  await browser.$('button[aria-label="Nachricht senden"]').click();
  await browser.waitUntil(() => sql(`SELECT count(*) FROM chat_messages WHERE chat_id = '${newChat}' AND role = 'assistant';`) === '2', { timeout: 20_000 });
  assert.equal(sql(`SELECT count(*) FROM chat_messages WHERE chat_id = '${oldChat}' AND role = 'assistant';`), '1');
  assert.equal(sql(`SELECT count(*) FROM chat_messages WHERE chat_id = '${newChat}' AND role = 'user';`), '1');
  // The inverse: Chat cancellation must not terminate a pending Stage narrator.
  mock.stats.stallStage = true;
  await browser.$('button=Stage').click();
  const stageInput = browser.$('form textarea');
  await stageInput.waitForDisplayed({ timeout: 15_000 });
  await stageInput.setValue('Ich sehe mich um.');
  await browser.keys('Enter');
  await browser.waitUntil(() => mock.stats.stageNarrator >= 1, { timeout: 20_000 });
  await browser.execute(() => window.__TAURI_INTERNALS__.invoke('abort_chat_generation'));
  await browser.pause(200);
  assert.equal(mock.stats.cancelledStage ?? 0, 0);
  assert.equal(await browser.$('button=Stopp').isDisplayed(), true);
  await browser.saveScreenshot(path.join(screenshotDir, '44-stage-getrennter-abbruch.png'));
  await browser.$('button=Stopp').click();
  await browser.waitUntil(() => mock.stats.cancelledStage >= 1, { timeout: 5_000 });
  await browser.$('button=Stopp').waitForExist({ reverse: true, timeout: 5_000 });
  // Stop before a planner has answered: keep the player line, but no fallback narration.
  const beforePlan = await browser.execute(() => window.__TAURI_INTERNALS__.invoke('get_stage_state'));
  const plannerBefore = mock.stats.stagePlanner;
  const narratorBefore = mock.stats.stageNarrator;
  mock.stats.stallPlanner = true;
  mock.stats.stallStage = false;
  await stageInput.setValue('Diese Planung breche ich ab.');
  await browser.keys('Enter');
  await browser.waitUntil(() => mock.stats.stagePlanner > plannerBefore, { timeout: 20_000 });
  await browser.saveScreenshot(path.join(screenshotDir, '45-stage-planungsabbruch.png'));
  await browser.$('button=Stopp').click();
  await browser.waitUntil(() => mock.stats.cancelledPlanner >= 1, { timeout: 5_000 });
  await browser.$('button=Stopp').waitForExist({ reverse: true, timeout: 5_000 });
  const stoppedPlan = await browser.execute(() => window.__TAURI_INTERNALS__.invoke('get_stage_state'));
  assert.deepEqual(stoppedPlan.world, beforePlan.world);
  assert.equal(stoppedPlan.chat_log.length, beforePlan.chat_log.length + 1);
  assert.equal(stoppedPlan.chat_log.at(-1).content, 'Diese Planung breche ich ab.');
  assert.equal(stoppedPlan.chat_log.at(-1).sender_role, 'player');
  assert.equal(stoppedPlan.current_turn_actor, 'PLAYER');
  assert.equal(mock.stats.stageNarrator, narratorBefore);
  const reloaded = await browser.execute((sceneId) => window.__TAURI_INTERNALS__.invoke('load_stage_scene', { sceneId }), stoppedPlan.definition.id);
  assert.deepEqual(reloaded.chat_log, stoppedPlan.chat_log);
  mock.stats.stallPlanner = false;
  await stageInput.setValue('Jetzt spielen wir weiter.');
  await browser.keys('Enter');
  await browser.waitUntil(() => mock.stats.stageNarrator > narratorBefore, { timeout: 20_000 });
  await browser.$('button=Stopp').waitForExist({ reverse: true, timeout: 20_000 });
  console.log('Stage-Planungsabbruch: antwortlose HTTP-Anfrage beendet; Spielerzeile bleibt gespeichert, kein Ersatzplan/Erzählertext; nächste Runde funktioniert.');
  console.log('Getrennte Abbruchkanäle: Stage-Stopp erhält Chat-Anfragen, Chat-Stopp erhält Stage-Anfragen; der passende Stopp schließt die Verbindung.');
  console.log('Sitzungen: Lesefehler erhalten Entwürfe; Abbruch und Chatwechsel schließen antwortlose HTTP-Anfragen; neue Antworten gehören zum neuen Chat.');
} catch (failure) {
  await browser.saveScreenshot(path.join(screenshotDir, 'chat-sessions-abort-fehler.png'));
  throw failure;
} finally {
  await close();
}
