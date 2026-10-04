// Importing a character that already exists asks first and replaces it, never a second entry.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch } from './harness.mjs';

const { browser, home, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = async (command, args = {}) => {
  try {
    return await browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
  } catch (e) {
    return { error: String(e) };
  }
};
const card = (description) => JSON.stringify({
  spec: 'chara_card_v2',
  spec_version: '2.0',
  data: { name: 'Testfigur', description, personality: '', scenario: '', first_mes: 'Hallo!', mes_example: '' },
});
const named = async () => (await invoke('scan_characters')).filter((c) => c.card.data.name.startsWith('Testfigur'));

try {
  await browser.$('button=Charaktere').waitForExist({ timeout: 20_000 });
  const first = path.join(home, 'erste.json');
  const second = path.join(home, 'zweite.json');
  writeFileSync(first, card('ALT'));
  writeFileSync(second, card('NEU'));

  const imported = await invoke('import_character_file', { filePath: first });
  assert.equal(imported.profile.card.data.name, 'Testfigur');
  const refused = await invoke('import_character_file', { filePath: second });
  // The webdriver hands over the rejected command error either as an exception or as its value.
  assert.match(JSON.stringify(refused) ?? '', /backend\.characters\.exists/, 'zweiter Import ohne Rückfrage');
  assert.equal((await named())[0].card.data.description, 'ALT', 'abgelehnter Import hat überschrieben');

  await invoke('import_character_file', { filePath: second, overwrite: true });
  const after = await named();
  assert.equal(after.length, 1, `doppelter Eintrag: ${after.map((c) => c.card.data.name)}`);
  assert.equal(after[0].card.data.name, 'Testfigur');
  assert.equal(after[0].card.data.description, 'NEU');

  // A deleted character shows again when it is imported anew.
  await invoke('delete_character', { charId: after[0].id });
  assert.equal((await named()).length, 0);
  await invoke('import_character_file', { filePath: first });
  assert.equal((await named()).length, 1, 'gelöschter Charakter bleibt nach erneutem Import verborgen');
  console.log('Charakter-Import: Rückfrage, Überschreiben ohne Doppel und erneuter Import nach Löschen bestanden.');
} finally {
  await close();
}
