// Stage zwischen den Sitzungen: Wird eine Geschichte nach einer langen Pause geöffnet, erzählt ein Gefährte, was er
// inzwischen mit einem anderen Gefährten erlebt hat – einmal, mit Karte im Verlauf und als Erinnerung für beide.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));
const STORY = 'Wir haben am Fluss Kräuter gesammelt, und Faelion ist dabei ins Wasser gefallen.';

try {
  await browser.$('button=Stage').waitForExist({ timeout: 20_000 });
  const scene = await invoke('get_stage_state');
  // The last session was ten hours ago: the player had acted, two companions were along.
  const longAgo = Math.floor(Date.now() / 1000) - 10 * 3600;
  const line = (sender_role, sender_name, content) => ({
    ...scene.chat_log[0], id: `old-${sender_role}`, sender_id: sender_name, sender_name, sender_role, content,
    turn_mode: 'say', whisper_target: null, event_card: null, timestamp: longAgo,
  });
  await invoke('save_stage_scene', {
    sceneState: {
      ...scene,
      definition: { ...scene.definition, party: ['Lirwen', 'Faelion'], disable_offscreen: false },
      combat: { ...scene.combat, is_active: false },
      chat_log: [
        line('gm', 'GM', 'Die Gruppe schlägt ihr Lager am Fluss auf.'),
        line('player', 'Hiroki', 'LAST_SESSION_LINE: Ich lege mich schlafen, morgen geht es weiter.'),
      ],
    },
  });

  // 1. Opening the story: one companion tells what the two did meanwhile.
  await browser.$('button=Stage').click();
  await browser.waitUntil(() => (mock.stats.offscreen ?? 0) === 1, { timeout: 30_000, timeoutMsg: 'keine Erzählung zwischen den Sitzungen' });
  const withText = (text) => browser.$(`//*[contains(text(), "${text}")]`);
  await withText(STORY.slice(0, 30)).waitForDisplayed({ timeout: 20_000 });
  await withText('Zwischen den Sitzungen').waitForDisplayed({ timeout: 10_000 });
  await shot('stage-offscreen');

  const prompt = mock.stats.lastOffscreenPrompt;
  assert.ok(prompt.includes('Lirwen') && prompt.includes('Faelion'), 'Prompt nennt nicht beide Gefährten');
  assert.ok(prompt.includes('spent some time together'), 'Gefährten erleben nichts gemeinsam');
  assert.ok(prompt.includes('LAST_SESSION_LINE'), 'Prompt kennt die letzte Sitzung nicht');
  assert.ok(/1\d hours/.test(prompt), 'Pause fehlt im Prompt');

  const state = await invoke('get_stage_state');
  const told = state.chat_log.at(-1);
  assert.equal(told.content, STORY);
  assert.equal(told.sender_role, 'companion');
  assert.ok(['Lirwen', 'Faelion'].includes(told.sender_name), `unbekannter Erzähler ${told.sender_name}`);
  assert.equal(told.event_card?.type, 'offscreen');
  assert.deepEqual([...told.event_card.companions].sort(), ['Faelion', 'Lirwen']);
  assert.equal(told.event_card.companions[0], told.sender_name, 'Erzähler steht nicht vorn');
  // Saved with the scene, not only shown.
  const saved = await invoke('load_stage_scene', { sceneId: state.definition.id });
  assert.equal(saved.chat_log.at(-1).content, STORY, 'Erzählung nicht gespeichert');

  // 2. Back to the story: the pause is over, nothing is told twice.
  await browser.$('button=Chat').click();
  await browser.$('button=Stage').click();
  await browser.$('form textarea').waitForDisplayed({ timeout: 15_000 });
  await browser.pause(1500);
  assert.equal(mock.stats.offscreen, 1, 'Erzählung doppelt');

  // 3. Switched off for the scene: no story after a long pause.
  await invoke('save_stage_scene', {
    sceneState: {
      ...state,
      definition: { ...state.definition, disable_offscreen: true },
      chat_log: state.chat_log.map((m) => ({ ...m, timestamp: longAgo })),
    },
  });
  await browser.execute(() => window.location.reload());
  await browser.$('button=Stage').waitForExist({ timeout: 20_000 });
  await browser.$('button=Stage').click();
  await browser.$('form textarea').waitForDisplayed({ timeout: 15_000 });
  await browser.pause(1500);
  assert.equal(mock.stats.offscreen, 1, 'Erzählung trotz abgeschalteter Option');
  console.log('stage offscreen e2e passed');
} finally {
  await close();
}
