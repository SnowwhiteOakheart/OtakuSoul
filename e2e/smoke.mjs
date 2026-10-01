// End-to-end smoke test: start the app with a throwaway profile, chat against the mock LLM
// until old messages leave the context window, and check the context meter and the automatic
// summary in the chat sidebar. Run with `npm run e2e` (needs a debug build, tauri-driver and
// WebKitWebDriver; see e2e/README.md).
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';
import { STAGE_NARRATION, SUMMARY, TRANSLATION } from './mock-llm.mjs';

const step = (name) => console.log(`• ${name}`);
const shot = (browser, name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));

// A small window (cloud setting) so a dozen turns are enough to overflow it.
const { browser, mock, close } = await launch({ cloud_context_tokens: 4096 });
let failed = false;
try {
  step('App startet im Chat');
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  await shot(browser, '01-start');

  step('Nachricht senden, Antwort vom Mock erscheint');
  const send = async (text) => {
    const before = mock.stats.chat;
    await input.setValue(text);
    await browser.$('button[aria-label="Nachricht senden"]').click();
    // The request reached the model (attachments upload first), then generation is done:
    // the send button is back (the abort button replaces it meanwhile).
    await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000, timeoutMsg: 'keine Anfrage am LLM' });
    await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });
  };
  await send('Hallo! Was machen wir morgen?');
  await browser.waitUntil(async () => (await browser.$('body').getText()).includes('Fushimi-Inari'), {
    timeout: 20_000,
    timeoutMsg: 'Antwort des Mock-LLM erscheint nicht',
  });
  const meter = () => browser.$('div[title*="Antwort frei"]');
  assert.match(await meter().getText(), /Kontext ~[\d.]+k? \/ 4\.1k Tokens \(geschätzt\)/);
  await shot(browser, '02-erste-antwort');

  step('Weiterchatten, bis ältere Nachrichten aus dem Kontext fallen');
  let turns = 1;
  while (!(await meter().getText()).includes('passen nicht mehr') && turns < 30) {
    await send(`Erzähl mir mehr, Teil ${turns}.`);
    turns += 1;
  }
  const meterText = await meter().getText();
  assert.match(meterText, /\d+ ältere Nachrichten? pass/, 'Kontextanzeige meldet keine weggelassenen Nachrichten');
  console.log(`  ${turns} Runden: ${meterText.replace(/\n/g, ' ')}`);
  await shot(browser, '03-kontext-voll');

  step('Automatische Zusammenfassung läuft im Hintergrund');
  // It starts once six conversation messages are out; a few more turns at most.
  for (let i = 0; i < 6 && mock.stats.summary === 0; i += 1) await send(`Und dann, Teil ${turns + i}?`);
  await browser.waitUntil(() => mock.stats.summary > 0, { timeout: 20_000, timeoutMsg: 'keine Zusammenfassung angefragt' });

  step('Zusammenfassung steht in der Seitenleiste');
  await browser.$('button[title^="Gespräche, Author"]').click();
  await browser.$('button=Author\'s Note').click();
  const summary = await browser.$('#chat-summary-input');
  await browser.waitUntil(async () => (await summary.getValue()) === SUMMARY, {
    timeout: 20_000,
    timeoutMsg: 'Zusammenfassung erscheint nicht im Editor',
  });
  await shot(browser, '04-zusammenfassung');

  step('Die nächste Anfrage enthält die Zusammenfassung im System-Prompt');
  await browser.$('aside button[aria-label="Schließen"]').click();
  await send('Was weißt du noch von vorhin?');
  assert.ok(mock.stats.lastChatSystemPrompt.includes(SUMMARY), 'System-Prompt enthält die Zusammenfassung nicht');
  await shot(browser, '05-mit-zusammenfassung');
  step('Prompt-Vorlage „Companion“ wählen, Vorschau, speichern');
  await browser.$('button=Einstellungen').click();
  await browser.$('button[role="tab"]=Prompt').click();
  await browser.$('[aria-label="Vorlagen"]').$('button=Companion').click();
  await browser.$('button*=Vorschau für').click();
  await browser.waitUntil(async () => (await browser.$('pre').getText()).includes('a close companion chatting with'), {
    timeout: 10_000,
    timeoutMsg: 'Vorschau zeigt die Companion-Vorlage nicht',
  });
  await shot(browser, '06-prompt-editor');
  await browser.$('button=Speichern').click();
  await browser.$('button=Chat').click();
  await send('Wie war dein Tag?');
  assert.ok(
    mock.stats.lastChatSystemPrompt.includes('Reply like a chat message'),
    'Chat nutzt die gespeicherte Prompt-Vorlage nicht',
  );

  step('Bild und Textdatei anhängen, das Modell bekommt beides');
  const dir = mkdtempSync(path.join(tmpdir(), 'otakusoul-e2e-files-'));
  const png = path.join(dir, 'pixel.png');
  // 2×2 red PNG.
  writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64'));
  const txt = path.join(dir, 'notiz.txt');
  writeFileSync(txt, 'Einkaufsliste: Tee, Reis, Mochi');
  const fileInput = await browser.$('input[type="file"]');
  await fileInput.addValue(png);
  await fileInput.addValue(txt);
  await browser.$('img[src^="blob:"]').waitForExist({ timeout: 10_000 });
  await send('Was siehst du auf dem Bild, und was steht in der Notiz?');
  const last = mock.stats.lastChatMessages.filter((m) => m.role === 'user').at(-1);
  assert.ok(Array.isArray(last.content), 'Nachricht mit Bild wird nicht als Liste von Teilen gesendet');
  const textPart = last.content.find((p) => p.type === 'text').text;
  assert.ok(textPart.includes('[Attached file: notiz.txt]') && textPart.includes('Mochi'), 'Textdatei fehlt im Nachrichtentext');
  assert.ok(
    last.content.some((p) => p.type === 'image_url' && /^data:image\/(png|jpeg);base64,/.test(p.image_url.url)),
    'Bild fehlt als image_url',
  );
  await browser.$('img[alt="pixel.png"]').waitForExist({ timeout: 10_000 });
  await shot(browser, '07-anhaenge');

  step('Antwort übersetzen');
  const bubbles = await browser.$$('.group\\/bubble');
  const lastBubble = bubbles[bubbles.length - 1];
  await lastBubble.moveTo();
  await lastBubble.$('button[aria-label="Übersetzen"]').click();
  await browser.waitUntil(async () => (await lastBubble.getText()).includes('Testübersetzung'), {
    timeout: 15_000,
    timeoutMsg: 'Übersetzung erscheint nicht unter der Nachricht',
  });
  assert.equal(mock.stats.translate, 1);
  assert.ok(TRANSLATION.includes('Testübersetzung'));
  await shot(browser, '08-uebersetzung');

  step('Soul Stage: Erzählertext erscheint live');
  await browser.$('button=Soul Stage').click();
  await shot(browser, '09-stage-start');
  const stageInput = await browser.$('textarea');
  await stageInput.waitForDisplayed({ timeout: 15_000 });
  await stageInput.setValue('Ich gehe vorsichtig auf das Tor zu.');
  await browser.keys('Enter');
  // Part of the narration is visible while the turn still runs (stop button shown).
  await browser.waitUntil(async () => (await browser.$('body').getText()).includes('Der Nebel lichtet sich'), {
    timeout: 20_000,
    timeoutMsg: 'kein Live-Text vom Erzähler',
  });
  assert.ok(await browser.$('button=Stopp').isExisting(), 'Runde schon vorbei – Text kam nicht gestreamt');
  assert.ok((await browser.$('body').getText()).includes('Ich gehe vorsichtig'), 'eigene Eingabe erscheint erst am Rundenende');
  assert.ok(!(await browser.$('body').getText()).includes('dreimal'), 'Erzähltext kam nicht schrittweise');
  await shot(browser, '10-stage-live');
  await browser.$('button=Stopp').waitForExist({ reverse: true, timeout: 30_000 });
  assert.ok((await browser.$('body').getText()).includes('schlägt eine Glocke dreimal'), 'Erzähltext fehlt nach der Runde');
  assert.ok(STAGE_NARRATION.includes('dreimal'));
  await shot(browser, '11-stage-fertig');

  step('Soul Stage: Flüstern bleibt privat, Spielerwerte gelten auch ohne Kampf');
  await browser.$('button=Flüstern').click();
  const whisperSelect = await browser.$('select[aria-label^="Ziel"]');
  const recipient = await whisperSelect.getValue();
  assert.ok(recipient, 'kein Flüsterziel wählbar');
  await stageInput.setValue('Das Passwort lautet Mondlicht.');
  await browser.keys('Enter');
  await browser.$('button=Stopp').waitForExist({ reverse: true, timeout: 30_000 });
  const narratorText = JSON.stringify(mock.stats.lastNarratorMessages);
  assert.ok(!narratorText.includes('Mondlicht'), 'Erzähler kennt den geflüsterten Inhalt');
  assert.ok(narratorText.includes('whispers something'), 'Erzähler erfährt nicht, dass geflüstert wurde');
  assert.ok(JSON.stringify(mock.stats.lastCompanionMessages).includes('Mondlicht'), `${recipient} kennt das Geflüsterte nicht`);
  // Two turns with -5 HP from the mock planner: 45 → 35, plus a fresh condition.
  const party = await browser.$('body').getText();
  assert.ok(/35\s*\/\s*50/.test(party), `HP des Spielers nicht aktualisiert: ${party}`);
  assert.ok(party.includes('Erschöpft · 3'), 'Zustand fehlt im Party-HUD');
  await shot(browser, '12-stage-fluestern');

  console.log(`\n✔ Rauchtest bestanden (${mock.stats.chat} Chat-Anfragen, ${mock.stats.summary} Zusammenfassung)`);
} catch (e) {
  failed = true;
  console.error(`\n✘ ${e.message}`);
  await shot(browser, 'fehler').catch(() => {});
} finally {
  await close();
}
process.exit(failed ? 1 : 0);
