// Hub updates: a scene from the gateway keeps its translations and story data, a newer revision
// in the registry shows "update available", and updating keeps the progress instead of adding
// a second copy.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, home, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);

const hubBase = mock.url.replace('/v1/chat/completions', '/hub');
const scene = (revision) => ({
  id: null,
  title: 'Matchball',
  description: revision === 1 ? 'Erste Fassung' : 'Zweite Fassung',
  starting_location: 'Centre Court',
  time_of_day: 'Tag',
  opening_narration: 'Die Sonne steht hoch über dem Platz.',
  party: [],
  starting_bg: 'Centre Court.png',
  extensions: {
    // The picture comes along from the content repository.
    otakusoul_assets: { backgrounds: [{ file: 'Centre Court.png', path: 'presets/tennis/backgrounds/Centre Court.png' }] },
    otakusoul_i18n: { source_language: 'de', translations: { en: { title: 'Match point' }, ru: { title: 'Матчбол' } } },
    otakusoul_story: { genre: 'slice_of_life', minutes: 30, difficulty: 'easy', beginner: true, notes: [], choices: {} },
  },
});
const registry = (revision) => ({
  version: '1.0',
  scenes: [{ id: 'matchball', title: 'Matchball', author: 'snow', description: 'Tennis', starting_location: 'Centre Court', revision, updated: `2026-10-1${revision}`, download_url: `${hubBase}/matchball.json` }],
});

try {
  const picture = readFileSync(path.resolve('public/stage/heroes/finn.png'));
  mock.stats.hubFiles = {
    'stages_registry.json': registry(1),
    'matchball.json': scene(1),
    'presets/tennis/backgrounds/Centre Court.png': picture,
  };
  await browser.$('button=Hub').waitForExist({ timeout: 20_000 });
  await jsClick(await browser.$('button=Hub'));
  await browser.$('#hub-tab-scenes').waitForExist({ timeout: 15_000 });
  await jsClick(await browser.$('#hub-tab-scenes'));
  const importButton = await browser.$('button*=Szenario importieren');
  await importButton.waitForDisplayed({ timeout: 15_000 });
  await jsClick(importButton);
  await browser.$('[data-hub-status="current"]').waitForExist({ timeout: 10_000, timeoutMsg: 'Szene nicht als installiert markiert' });

  const installed = (await invoke('list_installed_hub_items')).find((item) => item.kind === 'scene');
  assert.equal(installed.revision, 1);
  const first = await invoke('load_stage_scene', { sceneId: installed.local_id });
  assert.equal(first.definition.extensions.otakusoul_story.genre, 'slice_of_life', 'Story-Daten beim Download verloren');
  assert.equal(first.definition.extensions.otakusoul_i18n.translations.en.title, 'Match point', 'Übersetzungen verloren');
  const background = path.join(home, 'data', 'backgrounds', 'Centre Court.png');
  assert.ok(existsSync(background), 'Hintergrund der Szene nicht mitgeladen');
  assert.equal(readFileSync(background).length, picture.length);
  // Some progress that an update must keep.
  first.chat_log.push({ ...first.chat_log[0], id: 'progress', sender_role: 'player', content: 'KEEP_PROGRESS', turn_mode: 'say' });
  await invoke('save_stage_scene', { sceneState: first });

  // A newer revision appears in the registry.
  mock.stats.hubFiles = { 'stages_registry.json': registry(2), 'matchball.json': scene(2) };
  await browser.execute(() => window.location.reload());
  await browser.$('button=Hub').waitForExist({ timeout: 20_000 });
  await jsClick(await browser.$('button=Hub'));
  await browser.$('#hub-tab-scenes').waitForExist({ timeout: 15_000 });
  await jsClick(await browser.$('#hub-tab-scenes'));
  await browser.$('[data-hub-status="update"]').waitForExist({ timeout: 15_000, timeoutMsg: 'Kein Update angezeigt' });
  await browser.$('[data-hub-updates="1"]').waitForExist({ timeout: 5000 });
  await browser.pause(300);
  await browser.saveScreenshot(path.join(screenshotDir, '84-hub-update.png'));
  await jsClick(await browser.$('button*=Alle aktualisieren'));
  await browser.$('[data-hub-status="current"]').waitForExist({ timeout: 15_000, timeoutMsg: 'Update nicht übernommen' });

  const after = await invoke('load_stage_scene', { sceneId: installed.local_id });
  assert.equal(after.definition.description, 'Zweite Fassung');
  assert.ok(after.chat_log.some((m) => m.content === 'KEEP_PROGRESS'), 'Spielstand beim Update verloren');
  const copies = (await invoke('list_stage_scenes')).filter((s) => s.title === 'Matchball' || s.title === 'Match point' || s.title === 'Матчбол');
  assert.equal(copies.length, 1, `Update hat eine Kopie angelegt: ${copies.map((c) => c.id)}`);
  assert.equal((await invoke('list_installed_hub_items')).find((item) => item.kind === 'scene').revision, 2);
  console.log('Hub-Updates: Story-Daten erhalten, Update angezeigt, Spielstand behalten, keine Doppelung bestanden.');
} finally {
  await close();
}
