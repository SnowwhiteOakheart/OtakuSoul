// Audio check in the voice settings: speak once (a simulated microphone) → voice detection reacts →
// speech recognition returns the sentence → the character repeats it. Then a microphone that is too
// quiet for the threshold gets a suggestion that can be applied with one click.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);

/** Replaces the microphone with a tone: `loud` for 1.2 s, then silence. */
const fakeMicrophone = (loud) => browser.execute((amplitude) => {
  navigator.mediaDevices.getUserMedia = async () => {
    const context = new AudioContext();
    await context.resume();
    const tone = context.createOscillator();
    tone.frequency.value = 220;
    const gain = context.createGain();
    gain.gain.setValueAtTime(amplitude, context.currentTime);
    gain.gain.setValueAtTime(0, context.currentTime + 1.2);
    const output = context.createMediaStreamDestination();
    tone.connect(gain).connect(output);
    tone.start();
    return output.stream;
  };
}, loud);

const stepState = (key) => browser.$(`#mic-check [data-step="${key}"]`).getAttribute('data-state');

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const characterId = (await invoke('load_settings')).active_character_id;
  const config = await invoke('get_character_voice_config', { charId: characterId });
  const base = mock.url.replace('/chat/completions', '');
  await invoke('save_character_voice_config', {
    charId: characterId,
    config: {
      ...config,
      engine: 'openai',
      openai_endpoint: `${base}/audio/speech`,
      openai_model: 'pruefstand',
      stt: { ...config.stt, engine: 'openai', endpoint: `${base}/audio/transcriptions`, vad_threshold: 0.025, vad_silence_ms: 600 },
    },
  });

  // The palette finds the check by "Mikrofon".
  await browser.keys(['Control', 'k']);
  const search = await browser.$('input[aria-label="Befehle durchsuchen"]');
  await search.waitForDisplayed();
  await search.setValue('Mikrofon');
  await browser.keys('Enter');
  await browser.$('#setting-voice-target').waitForDisplayed({ timeout: 10_000 });
  await browser.$('button=Spracherkennung').click();
  const start = await browser.$('#mic-check-start');
  await start.waitForDisplayed({ timeout: 10_000 });

  // 1. Everything works.
  await fakeMicrophone(0.3);
  const ttsBefore = mock.stats.tts ?? 0;
  await start.scrollIntoView({ block: 'center' });
  await start.click();
  await browser.waitUntil(async () => (await stepState('vad')) === 'ok', { timeout: 10_000, timeoutMsg: 'Sprachaktivität nicht erkannt' });
  await browser.$('#mic-check-transcript').waitForDisplayed({ timeout: 15_000, timeoutMsg: 'Keine Abschrift' });
  assert.match(await browser.$('#mic-check-transcript').getText(), /Hallo, das ist ein Test\./);
  assert.ok((mock.stats.sttBytes ?? 0) > 10_000, `Aufnahme zu kurz: ${mock.stats.sttBytes} Bytes`);
  await browser.waitUntil(async () => (await stepState('tts')) === 'ok', { timeout: 15_000, timeoutMsg: 'Figur spricht nicht nach' });
  const said = (mock.stats.ttsInputs ?? []).slice(ttsBefore);
  assert.deepEqual(said, ['Hallo, das ist ein Test.'], `Nachgesprochen: ${JSON.stringify(said)}`);
  assert.equal((mock.stats.ttsModels ?? []).at(-1), 'pruefstand', 'Prüfstand nutzt nicht die eingestellte Stimme');
  await browser.$('#mic-check').scrollIntoView({ block: 'center' });
  await browser.pause(300);
  await browser.saveScreenshot(path.join(screenshotDir, '81-audio-pruefstand.png'));

  // 2. Too quiet for the threshold: no recording, a lower threshold is suggested and applied.
  await fakeMicrophone(0.015);
  const sttBefore = mock.stats.stt ?? 0;
  await browser.$('#mic-check-start').click();
  await browser.$('#mic-check-stop').waitForDisplayed({ timeout: 5_000 });
  await browser.pause(2_000);
  await browser.$('#mic-check-stop').click();
  const apply = await browser.$('#mic-check-apply');
  await apply.waitForDisplayed({ timeout: 5_000, timeoutMsg: 'Kein Vorschlag bei zu leiser Stimme' });
  assert.equal(mock.stats.stt ?? 0, sttBefore, 'Stille wurde an die Spracherkennung geschickt');
  assert.equal(await stepState('vad'), 'fail');
  await browser.saveScreenshot(path.join(screenshotDir, '82-audio-pruefstand-zu-leise.png'));
  const suggested = Number((await apply.getText()).match(/0\.\d+/)?.[0]);
  assert.ok(suggested > 0 && suggested < 0.025, `Vorschlag ${suggested} liegt nicht unter der Schwelle`);
  await apply.click();
  await browser.waitUntil(() => browser.execute(() => document.body.textContent.includes('Empfindlichkeit')
    && [...document.querySelectorAll('input[type="range"]')].some((el) => Number(el.value) < 0.025 && Number(el.max) === 0.12)),
  { timeout: 3_000, timeoutMsg: 'Vorschlag nicht übernommen' });

  console.log(`Audio-Prüfstand: Pegel, Abschrift, Nachsprechen und Schwellen-Vorschlag (${suggested}) bestanden.`);
} finally {
  await close();
}
