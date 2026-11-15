// First-run wizard on the local way without any model: the last step warns and leads back to the
// model step, the hub is named in the character step and can be the place to finish. Afterwards
// the empty chat says what is missing (no model → model hub) or, with a model chosen, that the
// first message starts the local AI by itself. The model is a sparse file, so no server starts.
// A debug build also lists the GGUF files in the repository's assets/models (gpu_e2e): with any
// there, a model is always chosen, so the "no model" part only runs on machines without them.
import assert from 'node:assert/strict';
import { mkdirSync, truncateSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, saveSettingsAndReload, screenshotDir } from './harness.mjs';

const { browser, home, close } = await launch({ onboarding_completed: false, selected_backend: 'local' });
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));
const dialog = () => browser.$('[role="dialog"]');
// Scoped to the wizard: the chat behind it has a "Weiter" (continue) button too.
const next = () => dialog().$('button=Weiter').click();
const jsClick = (element) => browser.execute((el) => el.click(), element);
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);

/** From the model step to the last step, choosing the first character on the way. */
const toDone = async () => {
  await next();
  await browser.$('h2=Mit wem möchtest du sprechen?').waitForDisplayed();
  await browser.waitUntil(async () => (await browser.$$('[role="dialog"] .grid button[aria-pressed]')).length > 0, {
    timeout: 20_000,
    timeoutMsg: 'keine Charaktere im Assistenten',
  });
  const firstCharacter = (await browser.$$('[role="dialog"] .grid button[aria-pressed]'))[0];
  if ((await firstCharacter.getAttribute('aria-pressed')) !== 'true') await firstCharacter.click();
  await next();
  await browser.$('h2=Stimme und Bilder (optional)').waitForDisplayed();
  await next();
  await browser.$('h2=Alles bereit!').waitForDisplayed();
};

try {
  await browser.$('h2=Willkommen bei OtakuSoul').waitForDisplayed({ timeout: 30_000 });
  const hasModels = (await invoke('scan_models')).length > 0;
  assert.match(await dialog().getText(), /In wenigen kurzen Schritten/, 'Begrüßung nennt die Schritte nicht');
  await next();

  // Model step: the model hub button says that it ends the setup.
  await browser.$('h2=Womit soll gechattet werden?').waitForDisplayed();
  const hubButton = await dialog().$('button*=Einrichtung beenden und Modell-Hub öffnen');
  await hubButton.waitForExist({ timeout: 15_000, timeoutMsg: 'Modell-Hub-Knopf ohne Hinweis aufs Beenden' });
  assert.match(await dialog().getText(), /Charakter und Stimme wählst du dann später/);

  // Character step names the hub; nothing is downloaded on the way.
  await next();
  await browser.$('h2=Mit wem möchtest du sprechen?').waitForDisplayed();
  assert.match(await dialog().getText(), /Weitere Figuren, Geschichten und Welten findest du nach der Einrichtung im Hub/);
  await dialog().$('button=Zurück').click();
  await browser.$('h2=Womit soll gechattet werden?').waitForDisplayed();
  await toDone();

  if (hasModels) {
    // A model found on disk is chosen: no warning, the first reply is offered instead.
    await browser.$('button=Erste Antwort holen').waitForDisplayed({ timeout: 10_000, timeoutMsg: 'Erste Antwort mit Modell fehlt' });
    assert.ok(!(await browser.$('[data-local-model-missing]').isExisting()), 'Warnung trotz gewähltem Modell');
  } else {
    // Last step without a model: a warning with the way back, no first reply, no download note.
    const missing = await browser.$('[data-local-model-missing]');
    await missing.waitForDisplayed({ timeout: 10_000, timeoutMsg: 'Keine Warnung ohne Modell' });
    assert.match(await missing.getText(), /Noch kein KI-Modell gewählt/);
    assert.ok(!(await browser.$('[data-chat-model-pending]').isExisting()), 'Download-Hinweis ohne laufenden Download');
    assert.ok(!(await browser.$('button=Erste Antwort holen').isExisting()), 'Erste Antwort ohne Modell angeboten');
    await browser.$('[data-onboarding-hub]').waitForDisplayed();
    await shot('38-assistent-ohne-modell');

    await missing.$('button=Modell einrichten').click();
    await browser.$('h2=Womit soll gechattet werden?').waitForDisplayed({ timeout: 10_000, timeoutMsg: 'Kein Weg zurück zum Modell' });
    await toDone();
  }

  // Finish on the hub. With a model found the wizard would start the server, and a profile
  // without the runtime would download it first: not in a test.
  if (hasModels) {
    const startNow = await browser.$('[role="dialog"]').$('input[type="checkbox"]');
    if (await startNow.isSelected()) await startNow.click();
  }
  await browser.$('[data-onboarding-hub]').$('button=Zum Hub').click();
  await browser.$('h1=Community Hub').waitForDisplayed({ timeout: 15_000, timeoutMsg: 'Hub nach der Einrichtung nicht geöffnet' });
  assert.ok(!(await browser.$('[role="dialog"]').isExisting()), 'Assistent nach „Zum Hub“ noch offen');
  await browser.waitUntil(async () => (await invoke('load_settings')).onboarding_completed === true, {
    timeout: 10_000,
    timeoutMsg: 'Einrichtung nicht als erledigt gespeichert',
  });
  await shot('39-assistent-zum-hub');

  // The chat starts with the character's greeting; the badge above it says how the local AI stands.
  const badge = () => browser.$('[data-chat-ai-badge]');
  if (!hasModels) {
    // Without a model: named as missing, and it leads to the model downloads.
    await jsClick(await browser.$('button=Chat'));
    await badge().waitForDisplayed({ timeout: 10_000, timeoutMsg: 'Kein KI-Hinweis im Chat' });
    assert.equal(await badge().getAttribute('data-chat-ai-badge'), 'missing');
    assert.equal(await badge().getText(), 'Kein KI-Modell gewählt');
    await shot('40-chat-ohne-modell');
    await jsClick(await badge());
    const hubTab = await browser.$('#settings-tab-hub');
    await hubTab.waitForDisplayed({ timeout: 10_000 });
    await browser.waitUntil(async () => (await hubTab.getAttribute('aria-selected')) === 'true', {
      timeout: 10_000,
      timeoutMsg: 'Hinweis führt nicht zu „Chat-Modelle herunterladen“',
    });
  }

  // With a model chosen the server is not running yet, but the first message starts it: no alarm.
  const model = path.join(home, 'data', 'models', 'gemma-4-E4B-it-Q4_K_M.gguf');
  mkdirSync(path.dirname(model), { recursive: true });
  writeFileSync(model, '');
  truncateSync(model, 1024);
  const settings = await invoke('load_settings');
  await saveSettingsAndReload(browser, { start_tab: 'chat', server_config: { ...settings.server_config, model_path: model } });
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await badge().waitForDisplayed({ timeout: 10_000, timeoutMsg: 'Kein KI-Hinweis im Chat' });
  // The settings arrive a moment after the chat: until then no model is known.
  await browser.waitUntil(async () => (await badge().getAttribute('data-chat-ai-badge')) === 'on-demand', {
    timeout: 10_000,
    timeoutMsg: 'Gewähltes Modell als fehlend gemeldet',
  });
  assert.equal(await badge().getText(), 'Lokale KI startet mit der ersten Nachricht');
  await shot('41-chat-startet-von-selbst');

  console.log(
    hasModels
      ? 'Einrichtungshinweise bestanden (Modelle in assets/models gefunden: Teil „ohne Modell“ nur auf Rechnern ohne sie).'
      : 'Einrichtung ohne Modell: Warnung mit Weg zurück, Hub-Hinweise, Abschluss im Hub und leerer Chat mit/ohne Modell bestanden.',
  );
} finally {
  await close();
}
