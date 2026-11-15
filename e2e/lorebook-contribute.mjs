// Contributing a lorebook to the hub: the lorebook view offers "Zum Hub beisteuern", the check
// stops a keyword entry without keywords, a complete book can be packed. The package is written
// through the same command as the dialog (the save dialog cannot be driven) to
// `OTAKUSOUL_E2E_LOREBOOK_ZIP` or the temp folder, so the data repository's check can read it.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, close } = await launch();
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);

const entry = (over) => ({
  key: [], secondary_keys: [], exclude_key: [], regex_keys: [], trigger_type: 'keyword', probability: 100, priority: 10,
  enabled: true, injection_behavior: 'passive', case_sensitive: false, match_whole_words: false, chain_requires: [],
  chain_activates: [], ...over,
});
const book = (entries) => ({
  id: 'e2e_laternen', name: 'Laternenmarkt am Fluss', description: 'Ein Abendmarkt mit Papierlaternen.', scan_depth: 5,
  is_global: false, entries,
});

/** Opens the lorebook view on the test book and the contribute dialog for it. */
const openDialog = async () => {
  await browser.refresh();
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await jsClick(await browser.$('button=Lorebooks'));
  const item = await browser.$('span=Laternenmarkt am Fluss');
  await item.waitForDisplayed({ timeout: 10_000, timeoutMsg: 'Test-Lorebook nicht in der Liste' });
  await jsClick(item);
  const contribute = await browser.$('[data-contribute-lorebook]');
  await contribute.waitForDisplayed({ timeout: 10_000, timeoutMsg: 'Kein Knopf „Zum Hub beisteuern“' });
  await contribute.click();
  await browser.$('h2=Zum Hub beisteuern').waitForDisplayed({ timeout: 10_000 });
  await browser.waitUntil(async () => !(await browser.$('p=Prüfe …').isExisting()), { timeout: 10_000, timeoutMsg: 'Prüfung endet nicht' });
};

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });

  // A keyword entry without keywords never fires: the check stops it.
  await invoke('save_lorebook', { lorebook: book([
    entry({ name: 'Laternenmarkt', trigger_type: 'always_on', content: 'Jeden Freitag leuchten am Fluss Papierlaternen.' }),
    entry({ name: 'Die Teehändlerin', content: 'Hana verkauft Gerstentee aus einem Kupferkessel.' }),
  ]) });
  await openDialog();
  const dialog = await browser.$('[role="dialog"]');
  assert.match(await dialog.getText(), /„Schlüsselwort“ hat keine Schlüsselwörter: Die Teehändlerin/);
  assert.ok(!(await browser.$('button=Paket speichern und Issue öffnen').isEnabled()), 'Einreichen trotz Fehler möglich');
  await shot('112-lorebook-beitrag-fehler');
  await browser.$('button=Abbrechen').click();

  // Fixed: keywords, and a chain that names its prerequisite by name.
  await invoke('save_lorebook', { lorebook: book([
    entry({ name: 'Laternenmarkt', trigger_type: 'always_on', content: 'Jeden Freitag leuchten am Fluss Papierlaternen.' }),
    entry({ name: 'Die Teehändlerin', key: ['Hana', 'Tee'], content: 'Hana verkauft Gerstentee aus einem Kupferkessel.', chain_requires: ['Laternenmarkt'] }),
  ]) });
  await openDialog();
  const text = await browser.$('[role="dialog"]').getText();
  assert.ok(!/keine Schlüsselwörter/.test(text), `Fehler bleibt nach der Korrektur: ${text}`);
  assert.match(text, /Keine englische Übersetzung/, 'Hinweis auf fehlendes Englisch fehlt');
  await browser.$('[role="dialog"] input:not([type])').setValue('E2E-Autorin');
  const rights = (await browser.$$('[role="dialog"] input[type="checkbox"]'))[1];
  await rights.click();
  await browser.waitUntil(() => browser.$('button=Paket speichern und Issue öffnen').isEnabled(), { timeout: 5000, timeoutMsg: 'Einreichen bleibt gesperrt' });
  await shot('113-lorebook-beitrag-bereit');
  await browser.$('button=Abbrechen').click();

  // The package, as the dialog's "save package" writes it.
  const saved = (await invoke('list_all_lorebooks')).find((b) => b.name === 'Laternenmarkt am Fluss');
  const zip = process.env.OTAKUSOUL_E2E_LOREBOOK_ZIP || path.join(tmpdir(), 'otakusoul-e2e-lorebook.zip');
  const result = await invoke('export_lorebook_contribution', {
    lorebook: saved,
    info: { license: 'CC-BY-4.0', author: 'E2E-Autorin', adult: false },
    targetPath: zip,
  });
  assert.ok(existsSync(zip) && readFileSync(zip).length > 200, 'kein Paket geschrieben');
  assert.match(result.issue_url, /otakusoul-data\/issues\/new\?title=Beitrag%3A%20Laternenmarkt/);
  assert.equal(result.files, 3);
  console.log(`Lorebook beisteuern: Prüfung, Korrektur und Paket bestanden (${zip}).`);
} finally {
  await close();
}
