// „Was könnte ich sagen?“: die KI schlägt Antworten vor, ein Klick übernimmt eine ins Eingabefeld.
import assert from 'node:assert/strict';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';
import { REPLY_IDEAS } from './mock-llm.mjs';

const { browser, mock, close } = await launch();
const jsClick = (element) => browser.execute((el) => el.click(), element);

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  await input.setValue('Ich habe eine alte Karte gefunden.');
  const before = mock.stats.chat;
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000 });
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });

  const ideasButton = await browser.$('button[aria-label="Was könnte ich sagen?"]');
  await browser.waitUntil(() => ideasButton.isEnabled(), { timeout: 20_000, timeoutMsg: 'Ideen-Knopf bleibt gesperrt' });
  await jsClick(ideasButton);
  const group = await browser.$('[data-reply-ideas]');
  await browser.waitUntil(async () => (await group.$$('button[title="In das Eingabefeld übernehmen"]')).length === REPLY_IDEAS.length,
    { timeout: 20_000, timeoutMsg: 'Vorschläge erscheinen nicht' });
  assert.equal(mock.stats.replyIdeasRequests, 1);
  const transcript = mock.stats.lastReplyIdeasMessages.at(-1)?.content ?? '';
  assert.ok(transcript.includes('Ich habe eine alte Karte gefunden.'), 'Verlauf fehlt in der Anfrage');
  assert.ok(mock.stats.lastReplyIdeasMessages[0].content.includes('Deutsch'), 'Antwortsprache fehlt');
  await browser.saveScreenshot(path.join(screenshotDir, '90-antwortvorschlaege.png'));

  const chips = await group.$$('button[title="In das Eingabefeld übernehmen"]');
  await jsClick(chips[1]);
  await browser.waitUntil(async () => (await input.getValue()) === REPLY_IDEAS[1], { timeout: 5000, timeoutMsg: 'Vorschlag nicht übernommen' });
  await group.waitForExist({ reverse: true, timeout: 5000 });

  const sent = mock.stats.chat;
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > sent, { timeout: 20_000, timeoutMsg: 'Übernommener Vorschlag nicht gesendet' });
  console.log('Antwortvorschläge: Anfrage mit Verlauf, drei Vorschläge, Übernahme und Senden bestanden.');
} finally {
  await close();
}
