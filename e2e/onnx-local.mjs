// Optional real-model test for the built app. No model downloads or audio playback.
// Requires OTAKUSOUL_KOKORO_TEST_MODEL, OTAKUSOUL_KOKORO_TEST_VOICES and OTAKUSOUL_TEST_SILERO.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launch } from './harness.mjs';

const required = (name) => {
  assert.ok(process.env[name], `${name} muss auf vorhandene lokale Modelle zeigen`);
  return process.env[name];
};
const model = required('OTAKUSOUL_KOKORO_TEST_MODEL');
const voices = required('OTAKUSOUL_KOKORO_TEST_VOICES');
const silero = readFileSync(required('OTAKUSOUL_TEST_SILERO'));
process.env.KOKORO_ORT_PROVIDER = 'cpu';
const { browser, close } = await launch({}, { homeFiles: { 'data/models/vad/silero_vad.onnx': silero } });
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const defaults = await invoke('get_character_voice_config', { charId: 'onnx-test' });
  const config = { ...defaults, engine: 'kokoro', voice_id: 'af_heart', kokoro: { model_path: model, voices_path: voices } };
  const audio = await browser.execute(async (voiceConfig) => {
    // oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
    const call = window.__TAURI_INTERNALS__.invoke;
    const [speech] = await Promise.all([
      call('synthesize_speech', { text: 'Hello from the desktop app.', config: voiceConfig }),
      call('vad_open', { stream: 'onnx-concurrent' }),
    ]);
    return speech;
  }, config);
  await invoke('vad_close', { stream: 'onnx-concurrent' });
  assert.ok(audio.startsWith('data:audio/wav;base64,'));
  const decoded = await browser.execute(async (url) => {
    const context = new AudioContext();
    try {
      const buffer = await context.decodeAudioData(await (await fetch(url)).arrayBuffer());
      const data = buffer.getChannelData(0);
      return { duration: buffer.duration, channels: buffer.numberOfChannels, peak: data.reduce((p, s) => Math.max(p, Math.abs(s)), 0) };
    } finally {
      await context.close();
    }
  }, audio);
  assert.equal(decoded.channels, 1);
  assert.ok(decoded.duration > 0.5 && decoded.duration < 30);
  assert.ok(decoded.peak > 0.01, 'Sprachausgabe ist still');
  for (const stream of ['onnx-first', 'onnx-second']) {
    await invoke('vad_open', { stream });
    const probability = await invoke('vad_process', { stream, samples: Array(1024).fill(0) });
    assert.ok(Number.isFinite(probability) && probability >= 0 && probability < 0.3);
    await invoke('vad_close', { stream });
  }
  const again = await invoke('synthesize_speech', { text: 'Hello again.', config: { ...config, voice_id: 'am_michael' } });
  assert.ok(again.length > 10_000);
  if (process.env.OTAKUSOUL_KOKORO_TEST_LEGACY_VOICES) {
    const legacy = await invoke('synthesize_speech', {
      text: 'Hello from a legacy voice file.',
      config: { ...config, kokoro: { ...config.kokoro, voices_path: process.env.OTAKUSOUL_KOKORO_TEST_LEGACY_VOICES } },
    });
    assert.ok(legacy.length > 10_000);
    console.log('Windows-App: ursprüngliche Bincode-2-Sammelstimme mit neuem Decoder synthetisiert.');
  }
  console.log(`Windows-App: Kokoro-Audio dekodiert (${decoded.duration.toFixed(2)} s), VAD mehrfach geöffnet und zweite Stimme synthetisiert.`);
} finally {
  await close();
}
