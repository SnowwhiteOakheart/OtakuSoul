// Wörter & Wendungen: die Phrasenliste steht als Anweisung am Ende des Prompts, Ersetzungsregeln (Text und RegEx)
// ändern die Antwort, bevor sie erscheint und gespeichert wird.
import assert from 'node:assert/strict';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch({
  expert_mode: true,
  avoid_phrases: ['ein Schauer lief'],
  reply_replacements: [
    { find: 'Kyoto', replace: 'Kioto', regex: false },
    { find: '(tausend) rote', replace: '$1 leuchtend rote', regex: true },
  ],
});

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  await input.setValue('Was machen wir morgen?');
  const before = mock.stats.chat;
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000 });
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });

  const last = mock.stats.lastChatRequest.messages.at(-1).content;
  assert.ok(last.includes('Never use these words or phrases, not even in other forms: "ein Schauer lief".'), 'Phrasenliste fehlt im Prompt');
  const pageText = () => browser.execute(() => document.body.innerText);
  await browser.waitUntil(async () => (await pageText()).includes('tausend leuchtend rote Tore'), { timeout: 10_000, timeoutMsg: 'RegEx-Regel nicht angewendet' });
  const page = await pageText();
  assert.ok(page.includes('über ganz Kioto') && !page.includes('über ganz Kyoto'), 'Text-Regel nicht angewendet');

  await browser.$('button=Einstellungen').click();
  await browser.$('button[role="tab"]*=Antwortstil').click();
  const phrases = await browser.$('#settings-avoid-phrases');
  await phrases.waitForDisplayed({ timeout: 10_000 });
  assert.equal(await phrases.getValue(), 'ein Schauer lief');
  assert.equal((await browser.$$('[data-replacement-rule]')).length, 2);
  await phrases.scrollIntoView();
  await browser.saveScreenshot(path.join(screenshotDir, '99-woerter-wendungen.png'));
  console.log('Wörter & Wendungen: Anweisung im Prompt, Text- und RegEx-Ersetzung, Anzeige in den Einstellungen bestanden.');
} finally {
  await close();
}
