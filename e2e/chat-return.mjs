// Leaving the chat for another view and coming back shows the messages again (the virtualized list
// once found no scroll container on remount and stayed empty).
import assert from 'node:assert/strict';
import { launch } from './harness.mjs';

const { browser, close } = await launch();
const greetingShown = () => browser.execute(() => document.querySelectorAll('[data-message-id]').length > 0);
try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.waitUntil(greetingShown, { timeout: 15_000, timeoutMsg: 'Begrüßung fehlt' });
  for (const view of ['Charaktere', 'Avatare', 'Stage']) {
    await browser.$(`button=${view}`).click();
    await browser.pause(800);
    await browser.$('button=Chat').click();
    await browser.waitUntil(greetingShown, { timeout: 5000, timeoutMsg: `Nach ${view} → Chat keine Nachrichten` });
  }
  assert.ok(await greetingShown());
  console.log('Chat nach Ansichtswechsel: Nachrichten wieder sichtbar.');
} finally {
  await close();
}
