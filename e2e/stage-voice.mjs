// Voices and atmosphere in Soul Stage: app voices per speaker, automatic read-aloud, ambient loop.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, home, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));

/** A short WAV so ambient files can be imported; `tone` makes the two files differ. */
const writeWav = (name, tone) => {
  const file = path.join(home, name);
  const samples = 800;
  const wav = Buffer.alloc(44 + samples * 2, tone);
  wav.write('RIFF'); wav.writeUInt32LE(36 + samples * 2, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  writeFileSync(file, wav);
  return file;
};

// Every `new Audio()` the page creates (the ambient loop) is kept for inspection.
// Voice playback creates Audio elements too; the ambient ones are those that loop.
const ambientPlayers = () => browser.execute(() => (window.__ambient ?? [])
  .filter((a) => a.loop).map((a) => ({ src: a.src.slice(0, 40), paused: a.paused, loop: a.loop })));

try {
  await browser.$('button=Stage').waitForExist({ timeout: 20_000 });
  await browser.execute(() => {
    const Original = window.Audio;
    window.__ambient = [];
    window.Audio = function (src) {
      const audio = new Original(src);
      window.__ambient.push(audio);
      return audio;
    };
  });

  // Voices: narrator and the first companion speak through the mock's /v1/audio/speech.
  const scene = await invoke('get_stage_state');
  const companion = scene.definition.party[0];
  const characters = await invoke('scan_characters');
  const companionId = characters.find((c) => c.card.data.name === companion)?.id;
  assert.ok(companionId, `Charakter ${companion} fehlt`);
  const speechUrl = mock.url.replace('/chat/completions', '/audio/speech');
  for (const [id, model] of [['stage_narrator', 'narrator-voice'], [companionId, 'companion-voice']]) {
    const config = await invoke('get_character_voice_config', { charId: id });
    await invoke('save_character_voice_config', { charId: id, config: { ...config, engine: 'openai', openai_endpoint: speechUrl, openai_model: model } });
  }

  // Ambient: the scene's sound loops as soon as the stage opens.
  const wind = await invoke('import_stage_asset', { filePath: writeWav('wind.wav', 1), kind: 'ambient' });
  await invoke('update_stage_scene_definition', { definition: { ...scene.definition, starting_ambient: wind, disable_ambient: false } });
  await browser.$('button=Stage').click();
  const stageInput = await browser.$('form textarea');
  await stageInput.waitForDisplayed({ timeout: 15_000 });
  await browser.waitUntil(async () => (await ambientPlayers()).some((a) => !a.paused && a.loop && a.src.startsWith('data:audio/wav')), {
    timeout: 10_000,
    timeoutMsg: 'Ambient-Ton der Szene läuft nicht',
  });

  // The atmosphere button switches it off and on.
  const ambientButton = await browser.$('button[title^="Ambient-Ton der Szene"]');
  await ambientButton.click();
  await browser.waitUntil(async () => (await ambientPlayers()).every((a) => a.paused), { timeout: 5000, timeoutMsg: 'Ambient lässt sich nicht ausschalten' });
  await ambientButton.click();
  await browser.waitUntil(async () => (await ambientPlayers()).some((a) => !a.paused), { timeout: 5000, timeoutMsg: 'Ambient lässt sich nicht wieder einschalten' });

  // Read aloud + planner switching the ambient sound in one turn.
  const rain = await invoke('import_stage_asset', { filePath: writeWav('rain.wav', 2), kind: 'ambient' });
  mock.stats.ambient = rain;
  // The switch is remembered in the webview's storage (shared between runs): set it, don't toggle.
  const setReadAloud = async (on) => {
    const toggle = await browser.$('button*=Vorlesen');
    if ((await toggle.getAttribute('aria-pressed')) !== String(on)) await toggle.click();
  };
  await setReadAloud(true);
  const ttsBefore = mock.stats.tts ?? 0;
  const plannerBefore = mock.stats.stagePlanner;
  await stageInput.setValue(`${companion}, hörst du den Regen?`);
  await browser.keys('Enter');
  await browser.waitUntil(() => mock.stats.stagePlanner > plannerBefore, { timeout: 20_000 });
  await browser.$('button=Stopp').waitForExist({ reverse: true, timeout: 40_000 });
  await browser.waitUntil(() => (mock.stats.tts ?? 0) >= ttsBefore + 2, { timeout: 20_000, timeoutMsg: 'Beiträge werden nicht vorgelesen' });
  const read = mock.stats.ttsInputs.slice(ttsBefore);
  assert.ok(read.some((text) => text.includes('Der Nebel lichtet sich')), 'Erzählung nicht vorgelesen');
  assert.ok(!read.some((text) => text.includes('hörst du den Regen')), 'eigene Eingabe wurde vorgelesen');
  const models = mock.stats.ttsModels.slice(ttsBefore);
  assert.ok(models.includes('narrator-voice'), 'Spielleiter spricht nicht mit der Erzählerstimme');
  assert.ok(models.includes('companion-voice'), `${companion} spricht nicht mit der eigenen Stimme`);
  const state = await invoke('get_stage_state');
  assert.equal(state.current_ambient, rain, 'Planer wechselt den Ambient-Ton nicht');
  await browser.waitUntil(async () => {
    const players = await ambientPlayers();
    return players.length >= 2 && !players.at(-1).paused && players.slice(0, -1).every((a) => a.paused);
  }, { timeout: 10_000, timeoutMsg: 'neuer Ambient-Ton ersetzt den alten nicht' });
  await shot('23-stage-stimme-atmosphaere');

  // The speaker button on a single message uses the app voice, not the browser's.
  await setReadAloud(false);
  const before = mock.stats.tts;
  // The per-message buttons only show on hover; trigger the last one directly.
  const speakButtons = await browser.$$('button[aria-label="Vorlesen"]');
  await browser.execute((button) => button.click(), speakButtons.at(-1));
  await browser.waitUntil(() => mock.stats.tts > before, { timeout: 10_000, timeoutMsg: 'Vorlese-Knopf nutzt nicht die App-Stimme' });

  // Muting stops the ambient loop.
  await browser.$('button[aria-label="Stummschalten"]').click();
  await browser.waitUntil(async () => (await ambientPlayers()).every((a) => a.paused), { timeout: 5000, timeoutMsg: 'Stummschalten stoppt den Ambient-Ton nicht' });
  console.log(`Stimme & Atmosphäre: ${mock.stats.tts} Sprachausgaben, Ambient-Schleife, Wechsel durch den Planer und Stummschalten bestanden.`);
} finally {
  await close();
}
