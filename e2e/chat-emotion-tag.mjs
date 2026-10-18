// Emotions-Tag im Prompt: angeboten werden nur Ausdrücke, die zu sehen sind – Porträtbilder der Karte,
// bei 3D/Live2D zusätzlich die sechs Grundstimmungen. Eine Karte ohne Bilder bekommt im Bildmodus keinen Tag.
import assert from 'node:assert/strict';
import { clickSend, launch, saveSettingsAndReload } from './harness.mjs';

const { browser, mock, close } = await launch({ avatar_mode: '3d' });
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);
const tagRule = async () => {
  const text = ((await invoke('get_last_prompt'))?.messages ?? []).map((m) => m.content).join('\n');
  return text.includes('[emotion: NAME]') ? text.match(/NAME one of: ([^.]*)\./)?.[1] : null;
};
const send = async (text) => {
  const before = (await invoke('get_last_prompt'))?.at ?? 0;
  await browser.$('textarea[aria-label="Nachricht"]').setValue(text);
  await clickSend(browser);
  await browser.waitUntil(async () => {
    const log = await invoke('get_last_prompt');
    return !!log && (log.at > before || log.messages.some((m) => m.content.includes(text)));
  }, { timeout: 20_000, timeoutMsg: 'Kein Prompt gesendet' });
  await browser.$('textarea[aria-label="Nachricht"]:not([disabled])').waitForExist({ timeout: 20_000 });
};

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const base = (await invoke('scan_characters'))[0];
  const plain = await invoke('save_character_card', { profile: { ...base, id: 'ohne_bilder', source_path: null,
    card: { ...base.card, data: { ...base.card.data, name: 'Ohne Bilder', extensions: { ...base.card.data.extensions, expressions: {}, custom_expressions: {} } } } } });
  await saveSettingsAndReload(browser, { active_character_id: plain.id, avatar_mode: '3d' });
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  mock.stats.chatReply = '„Na gut.“ [emotion: happy]';

  await send('Hallo im 3D-Modus');
  assert.equal(await tagRule(), 'neutral, happy, sad, angry, surprised, relaxed', '3D bietet die Grundstimmungen nicht an');

  // Image mode without any portrait picture: no tag at all.
  await jsClick(await browser.$('button[aria-label="Bild"]'));
  await send('Hallo im Bildmodus');
  assert.equal(await tagRule(), null, 'Tag ohne Bilder angefordert');
  console.log('Emotions-Tag: 3D bietet die Grundstimmungen an, Bildmodus ohne Bilder keinen Tag.');
} finally {
  await close();
}
