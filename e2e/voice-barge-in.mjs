// Voice call barge-in: while the character speaks, the user talks over her (simulated microphone).
// Her voice stops at once, the stored reply is cut after what was heard and ends with "—", and what
// the user said becomes the next turn – the model sees the cut reply.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, home, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const sql = (statement) => execFileSync('sqlite3', [path.join(home, 'data', 'otakusoul.db'), statement], { encoding: 'utf8' }).trim();
const callState = () => browser.$('[data-call-state]').getAttribute('data-call-state');

/** Every microphone the app opens is a tone whose loudness `speak(seconds)` raises for a moment. */
const fakeMicrophone = () => browser.execute(() => {
  const gains = [];
  // oxlint-disable-next-line no-underscore-dangle -- test hook
  window.__speak = (seconds) => {
    for (const gain of gains) {
      const now = gain.context.currentTime;
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.setValueAtTime(0, now + seconds);
    }
  };
  // On the prototype: WebKit may hand out a new mediaDevices object later.
  MediaDevices.prototype.getUserMedia = async () => {
    const context = new AudioContext();
    await context.resume();
    const tone = context.createOscillator();
    tone.frequency.value = 180;
    const gain = context.createGain();
    gain.gain.value = 0;
    const output = context.createMediaStreamDestination();
    tone.connect(gain).connect(output);
    tone.start();
    gains.push(gain);
    return output.stream;
  };
});
// oxlint-disable-next-line no-underscore-dangle -- test hook
const speak = (seconds) => browser.execute((s) => window.__speak(s), seconds);

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const { active_character_id: charId } = await invoke('load_settings');
  const config = await invoke('get_character_voice_config', { charId });
  const base = mock.url.replace('/chat/completions', '');
  await invoke('save_character_voice_config', {
    charId,
    config: {
      ...config,
      engine: 'openai',
      openai_endpoint: `${base}/audio/speech`,
      openai_model: 'figur',
      stt: { ...config.stt, engine: 'openai', endpoint: `${base}/audio/transcriptions`, vad_threshold: 0.02, vad_silence_ms: 600, barge_in: true },
    },
  });
  // The chat loads the character's voice on start.
  await browser.refresh();
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.$('button[aria-label="Vorlesen"]').waitForExist({ timeout: 15_000 });
  await fakeMicrophone();
  // Each sentence plays for 1.5 s, so the reply takes long enough to cut in.
  mock.stats.ttsToneSeconds = 1.5;
  mock.stats.sttText = 'Erzähl mir von Kyoto.';

  // 1. The call starts; the user asks something.
  await browser.$('button[aria-label="Sprachanruf starten"]').click();
  await browser.waitUntil(async () => (await callState()) === 'listening', { timeout: 10_000, timeoutMsg: 'Anruf hört nicht zu' });
  await speak(1.2);
  await browser.waitUntil(async () => (await callState()) === 'speaking', { timeout: 20_000, timeoutMsg: 'Figur spricht nicht' }).catch(async (error) => {
    console.log('Zustand:', await callState(), 'Chats:', mock.stats.chat, 'STT:', mock.stats.stt, 'TTS:', mock.stats.tts);
    throw error;
  });
  await browser.waitUntil(() => (mock.stats.tts ?? 0) >= 3, { timeout: 15_000, timeoutMsg: 'Zu wenig Sätze vorgelesen' });
  const askedBefore = mock.stats.chat;

  // 2. About two sentences in, the user talks over her.
  await browser.pause(2_500);
  mock.stats.sttText = 'Warte mal, ich habe eine Frage.';
  await speak(1.2);
  await browser.waitUntil(async () => (await browser.$('[data-call-state]').getAttribute('data-interrupted')) === 'true',
    { timeout: 3_000, timeoutMsg: 'Unterbrechen nicht erkannt' }).catch(async (error) => {
    console.log('Zustand:', await callState(), 'Chats:', mock.stats.chat, 'STT:', mock.stats.stt, 'TTS:', mock.stats.tts);
    throw error;
  });
  assert.equal(await callState(), 'listening');
  // Her voice stays silent: the call does not go back to "speaking" while the user talks.
  for (let i = 0; i < 6; i += 1) {
    assert.notEqual(await callState(), 'speaking', 'Figur spricht nach dem Unterbrechen weiter');
    await browser.pause(150);
  }
  await browser.saveScreenshot(path.join(screenshotDir, '83-anruf-unterbrochen.png'));

  // 3. Her reply is cut after what was heard and marked; the user's words are the next turn.
  await browser.waitUntil(() => mock.stats.chat > askedBefore, { timeout: 20_000, timeoutMsg: 'Nächster Zug nicht gesendet' });
  const replies = sql("SELECT content FROM chat_messages WHERE role = 'assistant' ORDER BY order_index;").split('\n');
  const cut = replies.at(-1) === '' ? replies.at(-2) : replies.find((r) => r.endsWith('—'));
  assert.ok(cut?.endsWith(' —'), `Antwort nicht als unterbrochen markiert: ${JSON.stringify(replies)}`);
  assert.ok(cut.startsWith('*lächelt und rückt näher*'), `Anfang fehlt: ${cut}`);
  assert.ok(cut.length < 200, `Antwort kaum gekürzt (${cut.length} Zeichen): ${cut}`);
  assert.ok(!cut.includes('Kamera'), 'Ungehörtes Ende ist noch gespeichert');
  const users = sql("SELECT content FROM chat_messages WHERE role = 'user' ORDER BY order_index;").split('\n');
  assert.equal(users.at(-1), 'Warte mal, ich habe eine Frage.');
  const sent = JSON.stringify(mock.stats.lastChatMessages);
  assert.ok(sent.includes('—') && !sent.includes('vergiss deine Kamera nicht'), 'Modell sieht nicht die gekürzte Antwort');

  await browser.$('button[aria-label="Sprachanruf beenden"]').click();
  console.log(`Ins Wort fallen: abgebrochen nach ${cut.length} von ${replies.join('').length} Zeichen, markiert und als nächster Zug gesendet.`);
} finally {
  await close();
}
