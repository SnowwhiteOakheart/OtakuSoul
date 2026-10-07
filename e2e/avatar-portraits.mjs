// Emotionsbilder müssen im Chat, im Testmenü und nach dem Speichern weiter funktionieren.
import assert from 'node:assert/strict';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';

const { browser, mock, home, close } = await launch({ avatar_mode: '2d', active_character_id: 'cosmos' });
// oxlint-disable-next-line no-underscore-dangle -- IPC ausschließlich im isolierten Testprofil
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const portrait = () => browser.execute(() => {
  const image = document.querySelector('img[aria-hidden="false"]');
  return image ? { src: image.dataset.portrait || image.src, width: image.naturalWidth, opacity: getComputedStyle(image).opacity } : null;
});
const waitForPortrait = (mood) => browser.waitUntil(async () => {
  const image = await portrait();
  return image?.width > 0 && image.opacity === '1' && image.src.includes(`${mood}.webp`);
}, { timeout: 20000, timeoutMsg: `Portrait wechselt nicht auf ${mood}` });
const selectMood = async (label, mood) => {
  await browser.$('button[aria-label="Aktuelle Emotion – zum manuellen Testen auswählen"]').click();
  await browser.$(`button=${label}`).click();
  await waitForPortrait(mood);
};
const reloadSaved = async (id) => {
  const settings = await invoke('load_settings');
  await invoke('save_settings', { settings: { ...settings, active_character_id: id } });
  await browser.refresh();
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30000 });
};

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30000 });
  await waitForPortrait('neutral');
  await selectMood('Freude', 'happy');
  await selectMood('Wut', 'angry');
  await selectMood('Überraschung', 'surprised');
  mock.stats.chatReply = '*weint traurig* "Ich bin traurig und enttäuscht."';
  await browser.$('textarea[aria-label="Nachricht"]').setValue('Wie geht es dir?');
  await clickSend(browser);
  await waitForPortrait('sad');
  await browser.saveScreenshot(path.join(screenshotDir, 'avatar-portrait-chat-sad.png'));

  const cosmos = (await invoke('scan_characters')).find(c => c.id === 'cosmos');
  // Auch ein direkt übergebener relativer Pfad wird vor dem Ordnerwechsel aufgelöst.
  const originalRelative = Object.fromEntries(['neutral', 'happy', 'sad', 'angry', 'surprised', 'relaxed']
    .map(mood => [mood, `expressions/cosmos/${mood}.webp`]));
  cosmos.card.data.extensions.expressions = originalRelative;
  const saved = await invoke('save_character_card', { profile: cosmos });
  for (const image of Object.values(saved.card.data.extensions.expressions)) {
    assert.ok(path.isAbsolute(image) && existsSync(image), `Ungültiger gespeicherter Portraitpfad: ${image}`);
  }
  await reloadSaved(saved.id);
  await selectMood('Freude', 'happy');
  await browser.saveScreenshot(path.join(screenshotDir, 'avatar-portrait-saved-happy.png'));

  // Bereits beschädigte Nutzerkopien aus älteren Versionen bekommen fehlende Presetbilder.
  saved.card.data.extensions.expressions = originalRelative;
  writeFileSync(path.join(home, 'data/characters/Cosmos.json'), JSON.stringify(saved.card));
  rmSync(saved.source_path);
  await reloadSaved(saved.id);
  await waitForPortrait('neutral');
  await selectMood('Wut', 'angry');
  await browser.saveScreenshot(path.join(screenshotDir, 'avatar-portrait-repaired-angry.png'));
  console.log('Portraits: manuelle Emotionen, Chatantwort, gespeicherte Karte und Reparatur alter Pfade bestanden.');
} finally {
  await close();
}
