// Chat tools: with "Tools" on, the model calls the calculator; the call stays hidden, the
// reply uses the result and the reasoning block names the tool.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch();
const jsClick = (element) => browser.execute((el) => el.click(), element);
const bodyText = () => browser.execute(() => document.body.textContent ?? '');

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  const toggle = await browser.$('button[aria-label="Werkzeuge"]');
  await jsClick(toggle);
  await browser.waitUntil(async () => (await toggle.getAttribute('aria-pressed')) === 'true', { timeout: 5000 });

  await input.setValue('Was ist 19 mal 21?');
  // The first chat is created a moment after the window; sending waits for it.
  const send = await browser.$('button[aria-label="Nachricht senden"]');
  await send.waitForEnabled({ timeout: 15_000 });
  await jsClick(send);
  await browser.waitUntil(async () => (await bodyText()).includes('Das sind 399.'), { timeout: 20_000, timeoutMsg: 'Antwort mit Werkzeugergebnis fehlt' });
  assert.equal(mock.stats.toolCalls, 1);
  assert.equal(mock.stats.toolResults, 1);
  assert.ok(!(await bodyText()).includes('<tool_call>'), 'Werkzeugaufruf sichtbar');

  // The reasoning block names the tool and its result.
  const reasoning = await browser.$('button*=Gedankengang');
  if (await reasoning.isExisting()) await jsClick(reasoning);
  await browser.waitUntil(async () => (await bodyText()).includes('[Tool] calculate'), { timeout: 5000, timeoutMsg: 'Werkzeugnutzung nicht sichtbar' });
  await browser.saveScreenshot(path.join(screenshotDir, '55-chat-werkzeuge.png'));
  console.log('Chat-Werkzeuge: Aufruf verborgen, Ergebnis in der Antwort, Nutzung im Gedankenblock bestanden.');
} finally {
  await close();
}
