// Real write failures must retain an unsaved draft or retry the saved user message exactly once.
// oxlint-disable no-underscore-dangle -- Tauri IPC interception only in a disposable test profile
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';
const { browser, home, mock, close } = await launch();
const sql = (statement) => execFileSync('sqlite3', [path.join(home, 'data', 'otakusoul.db'), statement], { encoding: 'utf8' }).trim();
try {
  await browser.$('[class~="group/bubble"]').waitForDisplayed({ timeout: 20_000 });
  const input = browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 20_000 });
  sql("CREATE TRIGGER test_user_failure BEFORE INSERT ON chat_messages WHEN NEW.role = 'user' BEGIN SELECT RAISE(ABORT, 'Nutzernachricht-Schreibfehler (Test).'); END;");
  await input.addValue('Unser Gespräch über den See.');
  await browser.$('button[aria-label="Nachricht senden"]').click();
  await browser.$('[role="alert"]*=Nutzernachricht-Schreibfehler (Test).').waitForDisplayed();
  await browser.waitUntil(async () => await input.getValue() === 'Unser Gespräch über den See.');
  assert.equal(sql("SELECT count(*) FROM chat_messages WHERE role = 'user';"), '0');
  await browser.$('[role="alert"] button[aria-label="Schließen"]').click();
  await browser.$('[role="alert"]').waitForExist({ reverse: true });
  sql('DROP TRIGGER test_user_failure;');
  sql("CREATE TRIGGER test_reply_failure BEFORE INSERT ON chat_messages WHEN NEW.role = 'assistant' BEGIN SELECT RAISE(ABORT, 'Antwort-Schreibfehler (Test).'); END;");
  await browser.$('button[aria-label="Nachricht senden"]').click();
  await browser.$('[role="alert"]*=Antwort-Schreibfehler (Test).').waitForDisplayed({ timeout: 20_000 });
  assert.equal(await input.getValue(), '');
  assert.equal(sql("SELECT count(*) FROM chat_messages WHERE role = 'user';"), '1');
  await browser.saveScreenshot(path.join(screenshotDir, '41-chat-generierungsfehler.png'));
  sql('DROP TRIGGER test_reply_failure;');
  await browser.$('button=Erneut versuchen').click();
  await browser.waitUntil(async () => sql("SELECT count(*) FROM chat_messages WHERE role = 'assistant' AND order_index > 0;") === '1', { timeout: 20_000 });
  await browser.$('[role="alert"]').waitForExist({ reverse: true });
  assert.equal(sql("SELECT count(*) FROM chat_messages WHERE role = 'user';"), '1');
  console.log('Chat: Schreibfehler erhalten ungespeicherten Entwurf; Antwort-Wiederholung erzeugt keine doppelte Nutzernachricht.');
  // Hold prompt assembly at the IPC boundary, independently of backend inference.
  await browser.execute(() => {
    const original = window.fetch;
    window.promptAbortTest = { original, held: false };
    window.fetch = (url, ...args) => {
      if (String(url).endsWith('/assemble_prompt') && !window.promptAbortTest.held) {
        window.promptAbortTest.held = true;
        return new Promise((resolve) => { window.promptAbortTest.release = resolve; });
      }
      return original(url, ...args);
    };
  });
  const requestsBefore = mock.stats.chat;
  await input.setValue('Diese Vorbereitung breche ich ab.');
  await browser.$('button[aria-label="Nachricht senden"]').click();
  await browser.waitUntil(() => browser.execute(() => window.promptAbortTest.held));
  await browser.$('button[aria-label="Generierung abbrechen"]').click();
  await browser.$('button[aria-label="Nachricht senden"]').waitForDisplayed({ timeout: 5_000 });
  await input.setValue('Neuer Entwurf nach dem Stopp.');
  assert.equal(await browser.$('button[aria-label="Nachricht senden"]').isEnabled(), true);
  assert.equal(mock.stats.chat, requestsBefore, 'Gestoppte Vorbereitung darf keine Modellanfrage starten');
  await browser.saveScreenshot(path.join(screenshotDir, '48-chat-vorbereitungsabbruch.png'));
  await browser.execute(() => {
    window.fetch = window.promptAbortTest.original;
    window.promptAbortTest.release(new Response(JSON.stringify({ system: 'LATE_CANCELLED_PROMPT', post_history: null }), { headers: { 'Content-Type': 'application/json', 'Tauri-Response': 'ok' } }));
  });
  await input.setValue('Jetzt senden wir wieder.');
  await browser.$('button[aria-label="Nachricht senden"]').click();
  await browser.waitUntil(() => sql("SELECT count(*) FROM chat_messages WHERE role = 'assistant' AND order_index > 0;") === '2', { timeout: 20_000 });
  assert.equal(mock.stats.chat, requestsBefore + 1, 'Nur die neue Vorbereitung darf das Modell aufrufen');
  assert.equal(sql("SELECT count(*) FROM chat_messages WHERE role = 'user';"), '3');
  console.log('Chat-Vorbereitung: Stopp gibt den Composer ohne Promptresultat frei; späte Ergebnisse bleiben wirkungslos und die nächste Anfrage funktioniert.');
} catch (failure) {
  await browser.saveScreenshot(path.join(screenshotDir, 'chat-generation-errors-fehler.png'));
  throw failure;
} finally {
  await close();
}
