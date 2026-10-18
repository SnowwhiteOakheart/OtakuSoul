// Inhalte für Erwachsene ausblenden: Charakter, Geschichte und Lorebook mit extensions.otakusoul_nsfw sind nach dem
// Ausschalten weder gelistet noch ladbar; eine geöffnete Figur und die gemerkte Geschichte schließen sich, Importe
// markierter Inhalte werden abgelehnt – auch nach einem Neustart.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, saveSettingsAndReload, screenshotDir } from './harness.mjs';

const { browser, close } = await launch({ nsfw_enabled: true, adult_confirmed: true });
const jsClick = (element) => browser.execute((el) => el.click(), element);
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
// WebKit's driver reports a rejected command as a script error: both count as a failed call here.
const call = async (command, args = {}) => {
  try {
    return await browser.executeAsync((cmd, payload, done) => window.__TAURI_INTERNALS__.invoke(cmd, payload)
      .then((value) => done({ ok: true, value }), (error) => done({ ok: false, error: String(error) })), command, args);
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
};
const value = async (command, args) => {
  const result = await call(command, args);
  assert.ok(result.ok, `${command}: ${result.error}`);
  return result.value;
};
const pageText = () => browser.execute(() => document.body.innerText);
const lists = async () => ({
  characters: (await value('scan_characters')).map((c) => c.card.data.name),
  lorebooks: (await value('list_all_lorebooks')).map((b) => b.name),
  scenes: (await value('list_stage_scenes')).map((s) => s.id),
});

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const marked = { otakusoul_nsfw: true };
  const base = (await value('scan_characters'))[0];
  const adultCard = await value('save_character_card', { profile: { ...base, id: 'nachtfalter', source_path: null,
    card: { ...base.card, data: { ...base.card.data, name: 'Nachtfalter', extensions: { ...base.card.data.extensions, ...marked } } } } });
  await value('save_lorebook', { lorebook: { id: 'erotik_test', name: 'Erotik-Test', description: '', entries: [], extensions: marked } });
  const [first] = await value('list_stage_scenes');
  const template = JSON.parse(await value('stage_export_scene_json', { sceneId: first.id }));
  const scene = { ...template, chat_log: [], definition: { ...template.definition, id: 'nacht_test', title: 'Nacht-Test',
    extensions: { ...(template.definition.extensions ?? {}), ...marked } } };
  await value('stage_import_scene_json', { jsonContent: JSON.stringify(scene), targetFolder: null });

  let shown = await lists();
  assert.ok(shown.characters.includes('Nachtfalter') && shown.lorebooks.includes('Erotik-Test') && shown.scenes.includes('nacht_test'),
    'Markierte Inhalte mit Freigabe nicht sichtbar');

  // The adult character is open and the adult story remembered.
  await saveSettingsAndReload(browser, { active_character_id: adultCard.id, stage_last_scene: 'nacht_test' });
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.waitUntil(async () => (await pageText()).includes('Nachtfalter'), { timeout: 15_000, timeoutMsg: 'Figur nicht geöffnet' });

  // Turn adult content off in the settings.
  await jsClick(await browser.$('button=Einstellungen'));
  const toggle = await browser.$('#setting-nsfw-toggle');
  await toggle.waitForExist({ timeout: 10_000 });
  await jsClick(toggle);
  await browser.waitUntil(async () => (await toggle.getAttribute('aria-checked')) === 'false', { timeout: 5000 });

  shown = await lists();
  assert.ok(!shown.characters.includes('Nachtfalter'), 'Charakter noch gelistet');
  assert.ok(!shown.lorebooks.includes('Erotik-Test'), 'Lorebook noch gelistet');
  assert.ok(!shown.scenes.includes('nacht_test'), 'Geschichte noch gelistet');
  const load = await call('load_stage_scene', { sceneId: 'nacht_test' });
  assert.ok(!load.ok && load.error.includes('backend.nsfw.disabled'), `Geschichte ladbar: ${JSON.stringify(load)}`);
  const reimport = await call('stage_import_scene_json', { jsonContent: JSON.stringify({ ...scene, definition: { ...scene.definition, id: 'nacht_2' } }), targetFolder: null });
  assert.ok(!reimport.ok && reimport.error.includes('backend.nsfw.disabled'), 'Markierte Geschichte importierbar');

  await jsClick(await browser.$('button=Chat'));
  await browser.waitUntil(async () => !(await pageText()).includes('Nachtfalter'), { timeout: 10_000, timeoutMsg: 'Figur bleibt geöffnet' });
  await jsClick(await browser.$('button=Stage'));
  await browser.pause(1500);
  assert.ok(!(await pageText()).includes('Nacht-Test'), 'Geschichte in Stage sichtbar');
  assert.notEqual((await value('load_settings')).stage_last_scene, 'nacht_test', 'Gemerkte Geschichte nicht vergessen');
  await browser.saveScreenshot(path.join(screenshotDir, '109-18plus-ausgeblendet.png'));

  // After a restart nothing comes back.
  await browser.execute(() => location.reload());
  await browser.pause(1000);
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.pause(1500);
  const text = await pageText();
  assert.ok(!text.includes('Nachtfalter') && !text.includes('Nacht-Test'), 'Nach Neustart wieder sichtbar');
  console.log('18+ ausblenden: Listen, Laden, offene Figur, gemerkte Geschichte, Import und Neustart bestanden.');
} finally {
  await close();
}
