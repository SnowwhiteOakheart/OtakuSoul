// Song Studio: the tab opens with the form, the song folder can be changed, songs in it are listed
// with their request, "Load settings" fills the form, deleting removes the song and its origin.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, home, close } = await launch();
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);
const value = (selector) => browser.execute((sel) => document.querySelector(sel)?.value, selector);

try {
  await browser.$('button=Song-Studio').waitForExist({ timeout: 20_000 });

  // A folder of the test instead of the real music folder.
  const folder = path.join(home, 'meine-songs');
  const set = await invoke('set_song_folder', { path: folder });
  assert.equal(set.is_default, false);
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, 'Neon Nacht.mp3'), Buffer.from('ID3fake'));
  writeFileSync(
    path.join(folder, 'Neon Nacht.mp3.json'),
    JSON.stringify({
      title: 'Neon Nacht',
      lyrics: '[Verse]\nLichter der Stadt',
      seed: 42,
      request: { title: 'Neon Nacht', caption: 'synthwave, neon', lyrics: '', vocal_language: 'de', duration: 95, bpm: 118, versions: 2, model_id: 'standard' },
    }),
  );

  await jsClick(await browser.$('button=Song-Studio'));
  await browser.$('[data-testid="song-studio"]').waitForDisplayed({ timeout: 15_000 });
  await browser.waitUntil(async () => (await browser.$('[data-testid="song-folder"]').getText()).includes('meine-songs'), {
    timeout: 5000,
    timeoutMsg: 'Songordner wird nicht angezeigt',
  });
  // Without a runtime and a style nothing can start.
  assert.equal(await browser.$('[data-testid="song-generate"]').isEnabled(), false);

  const list = await browser.$('[data-testid="song-list"]');
  await list.waitForDisplayed({ timeout: 5000 });
  const listText = await browser.execute((el) => el.textContent, list);
  assert.ok(listText.includes('Neon Nacht'), `Songliste: ${listText}`);
  await browser.saveScreenshot(path.join(screenshotDir, 'song-studio.png'));

  // Load the song's settings back into the form.
  await jsClick(await list.$('button[aria-label="Einstellungen übernehmen"]'));
  await browser.waitUntil(async () => (await value('[data-testid="song-caption"]')) === 'synthwave, neon', { timeout: 5000, timeoutMsg: 'Einstellungen nicht übernommen' });
  assert.equal(await value('#song-title'), 'Neon Nacht');
  assert.equal(await value('#song-bpm'), '118');

  // The lyrics as sung can be shown.
  await jsClick(await list.$('button=Text zeigen'));
  await browser.waitUntil(async () => (await browser.execute((el) => el.textContent, list)).includes('Lichter der Stadt'), { timeout: 5000, timeoutMsg: 'Liedtext fehlt' });

  // Delete with confirmation.
  await jsClick(await list.$('button[aria-label="Löschen"]'));
  const confirm = await browser.$('[role="dialog"]').$('button=Löschen');
  await confirm.waitForDisplayed({ timeout: 5000 });
  await jsClick(confirm);
  await browser.$('p=Noch keine Songs in diesem Ordner.').waitForDisplayed({ timeout: 5000 });
  assert.equal(existsSync(path.join(folder, 'Neon Nacht.mp3')), false);
  assert.equal(existsSync(path.join(folder, 'Neon Nacht.mp3.json')), false);

  // Back to the default folder.
  const reset = await invoke('set_song_folder', { path: null });
  assert.equal(reset.is_default, true);
  console.log('Song-Studio: Ordner, Songliste, Einstellungen übernehmen und Löschen bestanden.');
} finally {
  await close();
}
