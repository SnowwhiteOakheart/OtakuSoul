// Gedächtnis der Gäste: im Gruppen-Chat zeigt der Memory-Drawer auf Wunsch das Gedächtnis eines Gasts; neues Wissen
// landet bei ihm, nach dem Schließen zeigt der Drawer wieder die Gastgeberin.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);
const memories = async (characterId) => (await invoke('get_cognitive_overview', { charId: characterId, userName: 'User' })).recent_memories.map((m) => m.content);

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const host = (await invoke('load_settings')).active_character_id;
  const lirwen = (await invoke('scan_characters')).find((c) => c.card.data.name === 'Lirwen');
  const [session] = await invoke('list_chat_sessions', { characterId: host });
  await invoke('set_chat_members', { chatId: session.id, members: [lirwen.id] });
  await browser.execute(() => window.location.reload());
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });

  const open = await browser.$('button[aria-label="Kognitives Gedächtnis öffnen"]');
  await open.waitForDisplayed({ timeout: 20_000 });
  await jsClick(open);
  const whose = await browser.$('select[data-memory-character]');
  await whose.waitForDisplayed({ timeout: 10_000 });
  assert.equal(await whose.getValue(), '', 'Drawer beginnt nicht mit der Gastgeberin');
  await whose.selectByVisibleText('Lirwen');
  await browser.waitUntil(async () => (await browser.$('#memory-drawer-title').getText()).includes('Lirwen'), { timeout: 10_000, timeoutMsg: 'Drawer zeigt Lirwen nicht' });

  await jsClick(await browser.$('button*=Episoden & Themen'));
  const field = await browser.$('input[aria-label="Neues Wissen / Notiz manuell hinzufügen"]');
  await field.waitForDisplayed({ timeout: 5000 });
  await field.setValue('Lirwen hat Angst vor Gewittern');
  await jsClick(await browser.$('button=Speichern'));
  await browser.waitUntil(async () => (await memories(lirwen.id)).includes('Lirwen hat Angst vor Gewittern'), { timeout: 10_000, timeoutMsg: 'Erinnerung nicht bei Lirwen' });
  assert.ok(!(await memories(host)).includes('Lirwen hat Angst vor Gewittern'), 'Erinnerung bei der Gastgeberin gelandet');
  await browser.saveScreenshot(path.join(screenshotDir, '105-gedaechtnis-gast.png'));

  await browser.keys('Escape');
  await whose.waitForExist({ reverse: true, timeout: 5000 });
  await jsClick(open);
  await browser.$('select[data-memory-character]').waitForDisplayed({ timeout: 10_000 });
  assert.equal(await browser.$('select[data-memory-character]').getValue(), '', 'Nach dem Schließen nicht zurück bei der Gastgeberin');
  console.log('Gedächtnis der Gäste: Umschalten, Wissen beim Gast, nach dem Schließen wieder Gastgeberin bestanden.');
} finally {
  await close();
}
