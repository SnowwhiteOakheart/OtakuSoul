// Erzählerstimme für Handlungen: Mit „Handlungen mit der Erzählerstimme lesen“ spricht die Figur ihre eigenen Worte,
// *Handlungen* liest die Erzählerstimme – hier beim Klick auf „Vorlesen“ an der Begrüßung (Mock-/v1/audio/speech).
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const { active_character_id: charId } = await invoke('load_settings');
  const speechUrl = mock.url.replace('/chat/completions', '/audio/speech');
  for (const [id, model, narrator] of [['stage_narrator', 'erzaehler', false], [charId, 'figur', true]]) {
    const config = await invoke('get_character_voice_config', { charId: id });
    await invoke('save_character_voice_config', {
      charId: id,
      config: { ...config, engine: 'openai', openai_endpoint: speechUrl, openai_model: model, filter_mode: 'all', narrator_for_actions: narrator },
    });
  }
  // The chat loads the character's voice on start.
  await browser.execute(() => window.location.reload());
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });

  const speak = await browser.$('button[aria-label="Vorlesen"]');
  await speak.waitForExist({ timeout: 15_000 });
  await jsClick(speak);
  await browser.waitUntil(() => (mock.stats.ttsModels ?? []).includes('figur') && mock.stats.ttsModels.includes('erzaehler'),
    { timeout: 20_000, timeoutMsg: `Nicht beide Stimmen gefragt: ${JSON.stringify(mock.stats.ttsModels)}` });
  const said = (model) => mock.stats.ttsInputs.filter((_, i) => mock.stats.ttsModels[i] === model).join(' | ');
  const greeting = (await invoke('scan_characters')).find((c) => c.id === charId).card.data.first_mes;
  const action = /\*([^*]+)\*/.exec(greeting)?.[1]?.trim().slice(0, 20);
  assert.ok(action, 'Begrüßung ohne Handlung');
  assert.ok(said('erzaehler').includes(action), `Erzähler liest die Handlung nicht: ${said('erzaehler')}`);
  assert.ok(!said('figur').includes(action), `Figur liest die Handlung mit: ${said('figur')}`);
  assert.ok(said('figur').length > 0 && !said('figur').includes('*'), 'Figur liest ihre Worte nicht');

  await jsClick(await browser.$('button=Einstellungen'));
  const tab = await browser.$('button[role="tab"]*=Stimme');
  await tab.waitForExist({ timeout: 10_000 });
  await jsClick(tab);
  const box = await browser.$('[data-narrator-for-actions]');
  await box.waitForExist({ timeout: 10_000 });
  assert.equal(await box.isSelected(), true, 'Schalter zeigt die Einstellung nicht');
  await box.scrollIntoView();
  await browser.saveScreenshot(path.join(screenshotDir, '125-erzaehlerstimme.png'));
  console.log('Erzählerstimme: Handlungen mit dem Erzähler, Worte mit der Figur, Schalter in den Einstellungen bestanden.');
} finally {
  await close();
}
