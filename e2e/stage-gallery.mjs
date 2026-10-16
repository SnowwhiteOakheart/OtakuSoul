// Beginner's way into Stage: the first visit shows the story gallery instead of a demo scene,
// a bundled story starts from its preview with its own opening and suggestions, and Stage
// reopens it after a restart.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const shot = (browser, name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));

const { browser, close } = await launch({ stage_last_scene: '' });
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);

try {
  await browser.$('button=Stage').waitForExist({ timeout: 15_000 });
  await browser.$('button=Stage').click();
  const gallery = await browser.$('[data-story-gallery]');
  await gallery.waitForDisplayed({ timeout: 15_000, timeoutMsg: 'Stage zeigt keine Galerie beim ersten Besuch' });
  await browser.$('[data-story="story_frozen_bells"]').waitForExist({ timeout: 10_000 });
  const stories = await browser.execute(() => [...document.querySelectorAll('[data-story]')].map((el) => el.getAttribute('data-story')));
  for (const id of ['story_frozen_bells', 'story_hanami_live', 'story_missing_mic', 'story_silent_station', 'story_ryokan_night', 'akt1_waldstrasse']) {
    assert.ok(stories.includes(id), `Karte fehlt: ${id} (${stories})`);
  }
  // Beginner stories come first.
  assert.deepEqual(stories.slice(0, 2).sort(), ['story_frozen_bells', 'story_hanami_live']);
  assert.match(await browser.$('[data-story="story_frozen_bells"]').getText(), /Die Glocken von Frostweiler[\s\S]*Für Einsteiger|Für Einsteiger[\s\S]*Die Glocken von Frostweiler/);
  await browser.pause(300);
  await shot(browser, '81-story-galerie');

  // Genre filter in one row.
  await jsClick(await browser.$('button[role="tab"]=Krimi'));
  await browser.waitUntil(
    () => browser.execute(() => document.querySelectorAll('[data-story]').length === 1),
    { timeout: 3000, timeoutMsg: 'Krimi-Filter zeigt mehr als eine Geschichte' },
  );
  await jsClick(await browser.$('button[role="tab"]=Alle'));

  await jsClick(await browser.$('[data-story="story_frozen_bells"]').$('button*=Ansehen'));
  const preview = await browser.$('[data-story-preview="story_frozen_bells"]');
  await preview.waitForDisplayed({ timeout: 5000 });
  const previewText = await preview.getText();
  assert.match(previewText, /Untersuche die gefrorene Glocke im Turm/);
  assert.match(previewText, /ca\. 45 Min\./);
  await browser.pause(300);
  await shot(browser, '82-story-vorschau');
  await jsClick(await preview.$('button*=Geschichte starten'));

  // The story runs with its own opening and suggestions; the gallery is gone.
  await browser.$('textarea').waitForDisplayed({ timeout: 15_000 });
  assert.equal(await gallery.isExisting(), false);
  const state = await invoke('get_stage_state');
  assert.equal(state.definition.id, 'story_frozen_bells');
  assert.match(state.chat_log[0].content, /Ich bin Emilia/);
  assert.equal(state.world.location, 'Der verschneite Dorfplatz von Frostweiler');
  assert.equal(state.pending_choices[1].text, 'Untersuche die gefrorene Glocke im Turm');
  // Story texts of the app follow the reply language (shipped locales).
  assert.equal(state.relationships[0].target, 'Spieler');
  assert.equal(state.clocks[0].name, 'Dramatische Spannung');
  await browser.$('button*=Untersuche die gefrorene Glocke im Turm').waitForDisplayed({ timeout: 5000 });
  await browser.pause(300);
  await shot(browser, '83-story-gestartet');
  assert.equal((await invoke('load_settings')).stage_last_scene, 'story_frozen_bells');

  // Back to the gallery and into the running story again.
  await jsClick(await browser.$('button=Geschichten'));
  await browser.$('[data-story-gallery]').waitForDisplayed({ timeout: 5000 });
  await jsClick(await browser.$('button*=Zurück zur laufenden Geschichte'));
  await browser.$('textarea').waitForDisplayed({ timeout: 5000 });

  // After a reload Stage opens the remembered story directly.
  await browser.refresh();
  await browser.$('button=Stage').waitForExist({ timeout: 20_000 });
  await browser.$('button=Stage').click();
  await browser.$('textarea').waitForDisplayed({ timeout: 15_000 });
  assert.equal((await invoke('get_stage_state')).definition.id, 'story_frozen_bells');
  assert.equal(await browser.$('[data-story-gallery]').isExisting(), false);
  console.log('Story-Galerie: erster Besuch, Filter, Vorschau, Start mit eigenen Vorschlägen und Wiederaufnahme bestanden.');
} finally {
  await close();
}
