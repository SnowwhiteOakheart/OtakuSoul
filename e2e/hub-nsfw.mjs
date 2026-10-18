// Inhalte für Erwachsene: ohne Freigabe fragt der Hub die 18+-Quelle nie an und blendet markierte Einträge aus;
// nach der Altersbestätigung in den Einstellungen listet er beide Quellen und kennzeichnet 18+-Einträge.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch();
const jsClick = (element) => browser.execute((el) => el.click(), element);
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const entry = (name, extra = {}) => ({ name, author: 'snow', download_url: `https://example.invalid/${name}.png`, revision: 1, updated: '2026-10-18', ...extra });

const openCharacters = async () => {
  await jsClick(await browser.$('button=Hub'));
  await browser.$('#hub-tab-soul_gateway').waitForExist({ timeout: 15_000 });
  await jsClick(await browser.$('#hub-tab-soul_gateway'));
};

try {
  mock.stats.hubFiles = { 'soul_registry.json': { version: '1.0', characters: [entry('Sonnenkind'), entry('Markiert', { nsfw: true })] } };
  mock.stats.nsfwHubFiles = { 'soul_registry.json': { version: '1.0', characters: [entry('Nachtfee', { nsfw: true })] } };
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });

  // An installed adult card (marked as the hub import does): hidden while adult content is off.
  const names = async () => (await invoke('scan_characters')).map((c) => c.card.data.name);
  const base = (await invoke('scan_characters'))[0];
  await invoke('save_character_card', { profile: { ...base, id: 'nachtfalter', source_path: null,
    card: { ...base.card, data: { ...base.card.data, name: 'Nachtfalter', extensions: { ...base.card.data.extensions, otakusoul_nsfw: true } } } } });
  assert.ok(!(await names()).includes('Nachtfalter'), 'Markierte Karte ohne Freigabe sichtbar');

  await openCharacters();
  await browser.$('h3=Sonnenkind').waitForExist({ timeout: 15_000 });
  assert.equal(await browser.$('h3=Markiert').isExisting(), false, 'Markierter Eintrag ohne Freigabe sichtbar');
  assert.equal(await browser.$('h3=Nachtfee').isExisting(), false);
  assert.equal(mock.stats.nsfwHubRequests ?? 0, 0, '18+-Quelle ohne Freigabe angefragt');

  // Turn it on in the settings: the age is confirmed once.
  await jsClick(await browser.$('button=Einstellungen'));
  const toggle = await browser.$('#setting-nsfw-toggle');
  await toggle.waitForExist({ timeout: 10_000 });
  await toggle.scrollIntoView();
  await jsClick(toggle);
  const dialog = await browser.$('[data-adult-confirm]');
  await dialog.waitForDisplayed({ timeout: 5000 });
  assert.equal(await dialog.$('button=Aktivieren').isEnabled(), false, 'Aktivieren ohne Haken möglich');
  await jsClick(await dialog.$('input[type="checkbox"]'));
  await browser.saveScreenshot(path.join(screenshotDir, '107-altersbestaetigung.png'));
  await jsClick(await dialog.$('button=Aktivieren'));
  await browser.waitUntil(async () => (await toggle.getAttribute('aria-checked')) === 'true', { timeout: 5000, timeoutMsg: 'Schalter bleibt aus' });

  assert.ok((await names()).includes('Nachtfalter'), 'Markierte Karte nach Freigabe nicht sichtbar');
  await jsClick(await browser.$('button=Charaktere'));
  await browser.waitUntil(async () => (await browser.execute(() => document.body.innerText)).includes('Nachtfalter'),
    { timeout: 10_000, timeoutMsg: 'Bibliothek nicht neu geladen' });

  await openCharacters();
  await browser.$('h3=Nachtfee').waitForExist({ timeout: 15_000, timeoutMsg: '18+-Quelle nicht gelistet' });
  await browser.$('h3=Markiert').waitForExist({ timeout: 5000 });
  assert.ok(mock.stats.nsfwHubRequests >= 1);
  assert.ok((await browser.$$('[data-nsfw]')).length >= 2, '18+-Kennzeichnung fehlt');
  await browser.saveScreenshot(path.join(screenshotDir, '108-hub-18plus.png'));
  console.log('Inhalte für Erwachsene: ohne Freigabe nichts angefragt und nichts gezeigt (auch installierte Karten), nach Bestätigung beide Quellen mit 18+ und die Karte bestanden.');
} finally {
  await close();
}
