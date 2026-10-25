// Voice effects: a preset chosen in the voice dialog is rendered into the clip before it plays
// (OfflineAudioContext in the real WebKit) and stored with the character's voice.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const characterId = (await invoke('load_settings')).active_character_id;
  const speechUrl = mock.url.replace('/chat/completions', '/audio/speech');
  const config = await invoke('get_character_voice_config', { charId: characterId });
  const voice = { ...config, engine: 'openai', openai_endpoint: speechUrl, openai_model: 'fx-voice' };
  await invoke('save_character_voice_config', { charId: characterId, config: voice });
  const plain = await invoke('synthesize_speech', { text: 'Probe', config: voice });
  // The app loaded the voice before it was written here: reload so the dialog starts from it.
  await browser.refresh();
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  // Every clip the page loads is recorded. The player decodes clips with Web Audio after
  // fetching them (no <audio> element), so `fetch` of `data:audio/…` URLs is watched. The effect
  // renderer fetches the plain clip too; the mock answers every text with the same clip, so the
  // rendered one is the clip that differs from it.
  await browser.execute(() => {
    window.__played = [];
    const original = window.fetch;
    window.fetch = function (input, ...args) {
      const url = typeof input === 'string' ? input : input?.url ?? String(input);
      if (url.startsWith('data:audio/')) window.__played.push(url);
      return original.call(this, input, ...args);
    };
  });

  await jsClick(await browser.$('button[aria-label="Weitere Chat-Aktionen"]'));
  await jsClick(await browser.$('button*=Stimme & Sprachausgabe anpassen'));
  await jsClick(await browser.$('button[role="tab"]*=Effekte'));
  await jsClick(await browser.$('button=Roboter'));
  await browser.waitUntil(async () => (await browser.$('button=Roboter').getAttribute('aria-pressed')) === 'true', { timeout: 3000, timeoutMsg: 'Vorlage nicht markiert' });
  assert.equal(await browser.$('button=Keine').getAttribute('aria-pressed'), 'false');
  await browser.pause(300); // colour transition of the preset buttons
  await browser.saveScreenshot(path.join(screenshotDir, '57-stimmeffekte.png'));
  await jsClick(await browser.$('button*=Sprachausgabe testen'));

  // The player got a rendered WAV: longer than the plain clip (reverb tail), not the original.
  await browser.waitUntil(
    () => browser.execute((original) => (window.__played ?? []).some((src) => src.startsWith('data:audio/wav') && src !== original), plain),
    { timeout: 15_000, timeoutMsg: 'Kein bearbeiteter Clip abgespielt' },
  );
  const played = await browser.execute((original) => (window.__played ?? []).find((src) => src.startsWith('data:audio/wav') && src !== original), plain);
  assert.ok(played.length > plain.length, 'Bearbeiteter Clip nicht länger (Hall-Ausklang fehlt)');

  await jsClick(await browser.$('button=Speichern'));
  await browser.waitUntil(async () => (await invoke('get_character_voice_config', { charId: characterId })).effects?.preset === 'robot', {
    timeout: 5000,
    timeoutMsg: 'Effekte nicht gespeichert',
  });
  const stored = (await invoke('get_character_voice_config', { charId: characterId })).effects;
  assert.ok(stored.robot > 0.5 && stored.highpass_hz > 0);
  console.log('Stimmeffekte: Vorlage gewählt, im Clip gerendert, gespielt und gespeichert bestanden.');
} finally {
  await close();
}
