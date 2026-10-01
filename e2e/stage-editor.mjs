// Scene configuration through the desktop UI, preserving an existing campaign.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';
const { browser, mock, home, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));
try {
  await browser.$('button=Soul Stage').waitForExist({ timeout: 20_000 });
  const initial = await invoke('get_stage_state');
  const definition = { ...initial.definition, id: 'scene_custom_editor', title: 'Editor-Kampagne', party: ['Ayu Ikue', 'Missing companion'], starting_bg: '', max_actor_depth: 3 };
  const created = await invoke('create_stage_scene', { definition });
  created.world.location = 'Erreichter Ort';
  created.chat_log.push({ ...created.chat_log[0], id: 'progress-test', content: 'KEEP_PROGRESS', turn_mode: 'say' });
  await invoke('save_stage_scene', { sceneState: created });
  await invoke('stage_upsert_npc', { sceneId: definition.id, draft: { name: 'Liora', archetype: 'merchant', personality: 'Geduldig' } });
  const before = await invoke('get_stage_state');
  const image = await invoke('import_stage_asset', { filePath: path.resolve('public/npc/merchant.png'), kind: 'backgrounds' });
  const audioFile = path.join(home, 'wind.wav');
  const wave = Buffer.alloc(44);
  wave.write('RIFF'); wave.writeUInt32LE(36, 4); wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(8000, 24); wave.writeUInt32LE(16000, 28);
  wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36);
  writeFileSync(audioFile, wave);
  const audio = await invoke('import_stage_asset', { filePath: audioFile, kind: 'ambient' });
  const rejected = await browser.execute(async (filePath) => {
    try {
      // oxlint-disable-next-line no-underscore-dangle -- explicit IPC rejection across WebDriver
      await window.__TAURI_INTERNALS__.invoke('import_stage_asset', { filePath, kind: '../config' });
      return false;
    } catch { return true; }
  }, path.resolve('Cargo.toml'));
  assert.equal(rejected, true, 'invalid media kind was accepted');
  await invoke('save_lorebook', { lorebook: { id: 'editor-lore', name: 'Editor-Lore', entries: [{ content: 'EDITOR_LORE_MARKER', trigger_type: 'always_on', enabled: true, probability: 100, priority: 1, injection_behavior: 'passive', uid: 1 }] } });
  await browser.$('button=Soul Stage').click();
  await browser.$('button=Szenen-Lobby').waitForDisplayed();
  const openEditor = async (title) => {
    if (!await browser.$('#scene-lobby-title').isDisplayed()) await browser.$('button=Szenen-Lobby').click();
    await browser.$(`button[aria-label='Weitere Aktionen für „${title}“']`).click();
    await browser.$('button=Szene bearbeiten').click();
    await browser.$('#scene-title').waitForDisplayed();
  };
  await openEditor('Editor-Kampagne');
  await browser.$('#scene-title').setValue('Bearbeitete Kampagne');
  await browser.$('#scene-location').setValue('Neuer Startort');
  await browser.$('#scene-time').selectByVisibleText('Mitternacht');
  await browser.$('#scene-background').selectByAttribute('value', image);
  await browser.$('#scene-ambient').selectByAttribute('value', audio);
  await browser.$('#scene-actors').setValue('1');
  await browser.$('label*=Editor-Lore').click();
  await browser.$('#scene-ambient').scrollIntoView();
  await shot('19-szenen-editor');
  await browser.$('button=Änderungen speichern').click();
  await browser.$('#scene-title').waitForExist({ reverse: true });
  const edited = await invoke('get_stage_state');
  for (const key of ['world', 'chat_log', 'npcs', 'clocks', 'arcs', 'inventory', 'private_knowledge', 'consequence_ledger']) assert.deepEqual(edited[key], before[key], `${key} lost on edit`);
  assert.equal(edited.definition.created_at, before.definition.created_at);
  assert.equal(edited.definition.starting_bg, image);
  assert.equal(edited.current_bg, before.current_bg);
  assert.equal(edited.definition.starting_ambient, audio);
  assert.equal(edited.definition.max_actor_depth, 1);
  assert.ok(edited.definition.lorebook.includes('editor-lore'));
  assert.ok(edited.definition.party.includes('Missing companion'));
  await openEditor('Bearbeitete Kampagne');
  assert.equal(await browser.$('#scene-background').getValue(), image);
  assert.equal(await browser.$('#scene-actors').getValue(), '1');
  await browser.setWindowSize(960, 640);
  await browser.$('#scene-actors').scrollIntoView();
  await shot('20-szenen-editor-klein');
  await browser.$('button=Abbrechen').click();
  await browser.$('[role="dialog"] button[aria-label="Schließen"]').click();
  mock.stats.spawnNpc = { name: 'Liora', archetype: 'merchant', personality: 'Geduldig' };
  mock.stats.stageBackground = image;
  const input = await browser.$('form textarea');
  await input.setValue('Prüfe die gebundene Lore.');
  await browser.keys('Enter');
  await browser.waitUntil(() => mock.stats.stageNarrator > 0, { timeout: 20_000 });
  await browser.$('button=Stopp').waitForExist({ reverse: true, timeout: 30_000 });
  const played = await invoke('get_stage_state');
  const replies = played.chat_log.slice(edited.chat_log.length).filter((m) => m.sender_role === 'npc' || m.sender_role === 'companion');
  assert.equal(replies.length, 1, 'actor limit ignored');
  assert.ok(JSON.stringify(mock.stats.lastPlannerMessages).includes('EDITOR_LORE_MARKER'), 'bound lore not included');
  assert.equal(played.current_bg, image);
  assert.equal(played.definition.starting_bg, image);
  // A later scene switch must not rewrite the starting background.
  const secondImage = await invoke('import_stage_asset', { filePath: path.resolve('public/npc/guard.png'), kind: 'backgrounds' });
  mock.stats.stageBackground = secondImage;
  await input.setValue('Wir wechseln den Ort.');
  await browser.keys('Enter');
  await browser.waitUntil(() => mock.stats.stageNarrator >= 2, { timeout: 20_000 });
  await browser.$('button=Stopp').waitForExist({ reverse: true, timeout: 30_000 });
  const moved = await invoke('get_stage_state');
  assert.equal(moved.current_bg, secondImage);
  assert.equal(moved.definition.starting_bg, image);
  const reloaded = await invoke('load_stage_scene', { sceneId: definition.id });
  assert.equal(reloaded.current_bg, secondImage);
  const restarted = await invoke('stage_reset_scene', { sceneId: definition.id });
  assert.equal(restarted.current_bg, image);
  assert.equal(restarted.world.location, 'Neuer Startort');
  assert.equal(restarted.definition.starting_ambient, audio);
  const scenes = await invoke('list_stage_scenes');
  // Bundled presets are copied into the user's scene folder at startup, so they count as own scenes.
  const preset = scenes.find((scene) => scene.folder === 'No Game No Life' && scene.id !== definition.id);
  assert.ok(preset, 'missing preset fixture');
  const presetState = JSON.parse(await invoke('stage_export_scene_json', { sceneId: preset.id }));
  const override = await invoke('update_stage_scene_definition', { definition: { ...presetState.definition, title: 'Eigene Preset-Anpassung' } });
  assert.equal(override.definition.title, 'Eigene Preset-Anpassung');
  assert.equal((await invoke('get_stage_state')).definition.id, definition.id, 'editing inactive scene switched the engine');
  const savedOverride = JSON.parse(await invoke('stage_export_scene_json', { sceneId: preset.id }));
  assert.equal(savedOverride.definition.title, 'Eigene Preset-Anpassung');
  assert.deepEqual(savedOverride.chat_log, presetState.chat_log);
  console.log('Scene editor: progress, persistence, media import, lore and actor limit passed.');
} finally { await close(); }
