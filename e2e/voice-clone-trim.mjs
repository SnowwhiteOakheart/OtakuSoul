// Voice cloning from a longer file: the dialog suggests the part with speech, the user can move
// start and end, and only that part is stored as the reference.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const RATE = 24_000;
/** 40 s mono WAV: quiet except for "syllables" (modulated tone) from 20 s to 34 s. */
function longRecording(file) {
  const samples = 40 * RATE;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(RATE, 24);
  buffer.writeUInt32LE(RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i += 1) {
    const t = i / RATE;
    const speech = t >= 20 && t < 34 ? Math.sin(2 * Math.PI * 180 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t)) * 0.5 : 0;
    buffer.writeInt16LE(Math.round((speech + (Math.random() - 0.5) * 0.002) * 32767), 44 + i * 2);
  }
  writeFileSync(file, buffer);
}

const { browser, home, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const characterId = (await invoke('load_settings')).active_character_id;
  const config = await invoke('get_character_voice_config', { charId: characterId });
  await invoke('save_character_voice_config', { charId: characterId, config: { ...config, engine: 'local' } });

  await jsClick(await browser.$('button[aria-label="Weitere Chat-Aktionen"]'));
  await jsClick(await browser.$('button*=Stimme & Sprachausgabe anpassen'));
  const fileInput = await browser.$('input[type="file"][aria-label="Audiodatei wählen"]');
  await fileInput.waitForExist({ timeout: 10_000 });
  const wav = path.join(home, 'lange-aufnahme.wav');
  longRecording(wav);
  await browser.execute((el) => el.classList.remove('hidden'), fileInput);
  await fileInput.setValue(wav);

  const trim = await browser.$('[data-clone-trim]');
  await trim.waitForExist({ timeout: 10_000, timeoutMsg: 'Kein Zuschnitt für die lange Datei' });
  const [start, end] = (await trim.getAttribute('data-clone-trim')).split('-').map(Number);
  assert.ok(start > 18 && start < 23, `Vorschlag beginnt bei ${start} s statt beim Sprechen`);
  assert.ok(end - start > 10 && end - start < 16, `Vorschlag ist ${end - start} s lang`);
  await trim.scrollIntoView({ block: 'center' });
  await browser.pause(300);
  await browser.saveScreenshot(path.join(screenshotDir, '80-stimme-zuschneiden.png'));

  await browser.execute(() => {
    const name = [...document.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Name der Stimme'))?.querySelector('input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(name, 'E2E Zuschnitt');
    name.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await browser.$('#clone-ref-text').setValue('Hallo, das ist ein Test.');
  await browser.execute(() => {
    const box = [...document.querySelectorAll('label')].find((l) => l.textContent?.includes('Ich bestätige'))?.querySelector('input');
    if (box && !box.checked) box.click();
  });
  await jsClick(await browser.$('button*=Stimme speichern'));
  await browser.waitUntil(async () => (await invoke('list_cloned_voices')).some((v) => v.name === 'E2E Zuschnitt'), {
    timeout: 10_000,
    timeoutMsg: 'Stimme nicht gespeichert',
  });
  const voice = (await invoke('list_cloned_voices')).find((v) => v.name === 'E2E Zuschnitt');
  assert.ok(Math.abs(voice.duration_secs - (end - start)) < 0.1, `Gespeichert ${voice.duration_secs} s statt des Ausschnitts (${end - start} s)`);
  console.log('Stimme zuschneiden: Vorschlag, Anzeige und gespeicherter Ausschnitt bestanden.');
} finally {
  await close();
}
