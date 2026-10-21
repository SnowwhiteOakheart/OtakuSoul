// Traum beim Start: Nach einer langen Pause erzählt die Figur beim ersten Check von einem Traum aus älteren Erinnerungen –
// erst ab drei Erinnerungen; der Traum steht im Chat und im Tagebuch, ein Traumbild folgt als eigene Nachricht. Ein
// weiterer Check erzählt keinen zweiten.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';

// A long pause for the ordinary message on its own, so only the dream can speak.
const proactive = {
  enabled: true, idle_minutes: 4320, quiet_start_hour: 0, quiet_end_hour: 0, max_per_day: 3, notify: false, dreams: true, dream_image: true,
  muted_character_ids: [], sent: [],
};
const { browser, mock, home, close } = await launch({ proactive });
const database = path.join(home, 'data', 'otakusoul.db');
const sql = (statement) => execFileSync('sqlite3', [database, statement], { encoding: 'utf8' }).trim();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const dreamInstruction = () => mock.stats.lastChatMessages.find((m) => String(m.content).includes('about a dream'));

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  const before = mock.stats.chat;
  await input.setValue('Gute Nacht!');
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000 });
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });

  const { active_character_id: charId } = await invoke('load_settings');
  const config = await invoke('get_image_gen_config');
  await invoke('save_image_gen_config', { config: { ...config, provider: 'automatic1111', api_url: mock.url.replace('/v1/chat/completions', '') } });
  for (const memory of ['DREAM_A: Ein Ausflug ans Meer im Regen', 'DREAM_B: Ein Leuchtturm ohne Licht']) {
    await invoke('add_episodic_memory', { charId, category: 'event', content: memory, significance: 3 });
  }
  // A night has passed, but two memories are not enough for a dream.
  sql('UPDATE chat_messages SET created_at = created_at - 36000;');
  mock.stats.chatReply = '*reibt sich die Augen* Ich habe von einem Leuchtturm geträumt, der im Regen am Meer stand …';
  let startedWith = mock.stats.chat;
  await browser.execute(() => window.location.reload());
  await input.waitForDisplayed({ timeout: 30_000 });
  await browser.pause(25_000);
  assert.equal(mock.stats.chat, startedWith, 'Traum ohne genug Erinnerungen');

  await invoke('add_episodic_memory', { charId, category: 'fact', content: 'DREAM_C: Kai summt beim Lesen', significance: 2 });
  startedWith = mock.stats.chat;
  await browser.execute(() => window.location.reload());
  await input.waitForDisplayed({ timeout: 30_000 });

  await browser.waitUntil(() => mock.stats.chat > startedWith && Boolean(dreamInstruction()), { timeout: 60_000, timeoutMsg: 'Kein Traum beim Start' });
  const instruction = String(dreamInstruction().content);
  assert.ok(instruction.includes('DREAM_A') && instruction.includes('DREAM_B'), `Erinnerungen fehlen im Traum: ${instruction}`);
  await browser.waitUntil(() => browser.execute(() => document.body.innerText.includes('Leuchtturm geträumt')),
    { timeout: 20_000, timeoutMsg: 'Traum fehlt im Chat' });
  await browser.waitUntil(async () => {
    const overview = await invoke('get_cognitive_overview', { charId, userName: 'User' });
    return overview.recent_diary.some((entry) => entry.title.startsWith('Traum vom') && entry.entry_text.includes('Leuchtturm'));
  }, { timeout: 10_000, timeoutMsg: 'Traum fehlt im Tagebuch' });
  // The picture of the dream follows as its own message, drawn from what was told.
  await browser.waitUntil(async () => {
    const [session] = await invoke('list_chat_sessions', { characterId: charId });
    const messages = await invoke('get_chat_messages', { chatId: session.id });
    return messages.some((m) => m.role === 'assistant' && m.attachments.some((a) => a.name === 'Traumbild.png'));
  }, { timeout: 30_000, timeoutMsg: 'Traumbild fehlt' });
  const promptRequest = JSON.stringify(mock.stats.lastImagePromptRequest);
  assert.ok(promptRequest.includes('dream the character just told') && promptRequest.includes('Leuchtturm geträumt'), 'Traumbild nicht aus dem Traum');
  await browser.saveScreenshot(path.join(screenshotDir, '126-traum-beim-start.png'));

  // The next check tells no second dream (and the user has not answered yet).
  const afterDream = mock.stats.chat;
  await browser.pause(65_000);
  assert.equal(mock.stats.chat, afterDream, 'Zweiter Traum ohne Antwort');
  console.log('Traum beim Start: erst ab drei Erinnerungen, Erinnerungen verwoben, im Chat, im Tagebuch und als Bild, kein zweiter Traum bestanden.');
} finally {
  await close();
}
