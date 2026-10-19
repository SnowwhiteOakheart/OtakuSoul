// Emotionsbilder müssen im Chat, im Testmenü und nach dem Speichern weiter funktionieren; ein Zusatzbild (Erröten)
// folgt der Antwort, der Emotions-Tag des Modells entscheidet unsichtbar, und ein wieder geöffneter Chat zeigt den Ausdruck seiner letzten Antwort.
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
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
  await selectMood('Freude', 'happy');
  // The portrait breathes and sways (transforms at a low frame rate), the switch keeps it still.
  const motion = () => browser.execute(() => {
    const frame = document.querySelector('[data-alive]');
    const sway = document.querySelector('.portrait-alive');
    const breath = document.querySelector('.portrait-alive > .portrait-breath');
    return { alive: !!frame, sway: sway?.style.transform ?? '', breath: breath?.style.transform ?? '' };
  });
  const first = await motion();
  assert.ok(first.alive && first.sway.startsWith('rotate(') && first.breath.startsWith('scale('), JSON.stringify(first));
  await browser.waitUntil(async () => (await motion()).sway !== first.sway, { timeout: 3000, timeoutMsg: 'Porträt bewegt sich nicht' });
  // No endless CSS animation is left: each makes WebKitGTK repaint the window 60 times a second.
  assert.deepEqual(await browser.execute(() => document.getAnimations().map((a) => a.animationName ?? '').filter(Boolean)), []);
  await browser.saveScreenshot(path.join(screenshotDir, 'avatar-portrait-lebendig.png'));
  const motionSwitch = await browser.$('#setting-portrait-motion');
  await motionSwitch.click();
  assert.deepEqual(await motion(), { alive: false, sway: '', breath: '' });
  assert.equal(await motionSwitch.getAttribute('aria-pressed'), 'false');
  await motionSwitch.click();
  await selectMood('Wut', 'angry');
  await selectMood('Überraschung', 'surprised');
  mock.stats.chatReply = '*weint traurig* "Ich bin traurig und enttäuscht."';
  await browser.$('textarea[aria-label="Nachricht"]').setValue('Wie geht es dir?');
  await clickSend(browser);
  await waitForPortrait('sad');
  await browser.saveScreenshot(path.join(screenshotDir, 'avatar-portrait-chat-sad.png'));
  // The prompt offers only the expressions the card has pictures for (Cosmos: the six moods).
  const tagRule = async () => ((await invoke('get_last_prompt'))?.messages ?? []).map((m) => m.content).join('\n')
    .match(/NAME one of: ([^.]*)\./)?.[1];
  assert.equal(await tagRule(), 'neutral, happy, sad, angry, surprised, relaxed');

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

  // An extra slot: a blushing reply shows the card's blush picture, also after reopening the chat.
  const blush = path.join(path.dirname(saved.card.data.extensions.expressions.happy), 'blush.webp');
  copyFileSync(saved.card.data.extensions.expressions.happy, blush);
  const withBlush = await invoke('save_character_card', { profile: { ...saved,
    card: { ...saved.card, data: { ...saved.card.data, extensions: { ...saved.card.data.extensions,
      expressions: { ...saved.card.data.extensions.expressions, blush } } } } } });
  await reloadSaved(withBlush.id);
  mock.stats.chatReply = '*wird rot und schaut verlegen zur Seite* „D-das hättest du nicht sagen müssen …“';
  await browser.$('textarea[aria-label="Nachricht"]').setValue('Du siehst süß aus.');
  await clickSend(browser);
  await waitForPortrait('blush');
  await browser.saveScreenshot(path.join(screenshotDir, 'avatar-portrait-chat-blush.png'));
  assert.equal(await tagRule(), 'neutral, happy, sad, angry, surprised, relaxed, blush');
  await reloadSaved(withBlush.id);
  await waitForPortrait('blush');

  // Bereits beschädigte Nutzerkopien aus älteren Versionen bekommen fehlende Presetbilder.
  saved.card.data.extensions.expressions = originalRelative;
  writeFileSync(path.join(home, 'data/characters/Cosmos.json'), JSON.stringify(saved.card));
  rmSync(saved.source_path);
  await reloadSaved(saved.id);
  // Without a blush picture the blushing reply falls back to its mood (embarrassment → sad).
  await waitForPortrait('sad');
  await selectMood('Wut', 'angry');
  await browser.saveScreenshot(path.join(screenshotDir, 'avatar-portrait-repaired-angry.png'));

  // The model's expression tag decides without any cue word and never shows in the chat.
  mock.stats.chatReply = '„Na gut, dann eben so.“ [emotion: surprised]';
  await browser.$('textarea[aria-label="Nachricht"]').setValue('Ich habe eine Neuigkeit.');
  await clickSend(browser);
  await waitForPortrait('surprised');
  await browser.waitUntil(async () => (await browser.execute(() => document.body.innerText)).includes('Na gut, dann eben so.'),
    { timeout: 10000, timeoutMsg: 'Antwort fehlt' });
  assert.ok(!(await browser.execute(() => document.body.innerText)).includes('[emotion'), 'Tag im Chat sichtbar');
  console.log('Portraits: manuelle Emotionen, Chatantwort, Erröten, Emotions-Tag, wieder geöffneter Chat, gespeicherte Karte und Reparatur alter Pfade bestanden.');
} finally {
  await close();
}
