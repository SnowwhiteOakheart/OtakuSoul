// Quick-Replies: Knöpfe über dem Eingabefeld senden vorbereiteten Text sofort ({{char}} eingesetzt) oder setzen ihn ins
// Eingabefeld ({{input}} übernimmt den getippten Text); der Einstellungsbereich zeigt sie.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch({
  quick_replies: [
    { label: 'Weiter', message: '*nickt* Erzähl weiter, {{char}}!', mode: 'send' },
    { label: 'Kürzer', message: '((Antworte kürzer: {{input}}))', mode: 'insert' },
  ],
});
const jsClick = (element) => browser.execute((el) => el.click(), element);

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  const bar = await browser.$('[data-quick-replies]');
  await bar.waitForDisplayed({ timeout: 10_000, timeoutMsg: 'Quick-Replies fehlen über dem Eingabefeld' });

  await input.setValue('mehr Dialog');
  await jsClick(await bar.$('button=Kürzer'));
  assert.equal(await input.getValue(), '((Antworte kürzer: mehr Dialog))', 'Einfügen mit {{input}} falsch');
  await browser.saveScreenshot(path.join(screenshotDir, '124-quick-replies.png'));

  await input.clearValue();
  const before = mock.stats.chat;
  await jsClick(await bar.$('button=Weiter'));
  await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000, timeoutMsg: 'Quick-Reply sendet nicht' });
  const sent = mock.stats.lastChatMessages.filter((m) => m.role === 'user').map((m) => String(m.content)).join('\n');
  assert.match(sent, /\*nickt\* Erzähl weiter, [^{]+!/, `Quick-Reply nicht gesendet oder {{char}} nicht eingesetzt: ${sent}`);

  await jsClick(await browser.$('button=Einstellungen'));
  const tab = await browser.$('button[role="tab"]*=Antwortstil');
  await tab.waitForExist({ timeout: 10_000 });
  await jsClick(tab);
  const section = await browser.$('#setting-quick-replies');
  await section.waitForExist({ timeout: 10_000 });
  assert.equal((await browser.$$('[data-quick-reply]')).length, 2);
  console.log('Quick-Replies: Einfügen mit {{input}}, Senden mit {{char}} und Einstellungen bestanden.');
} finally {
  await close();
}
