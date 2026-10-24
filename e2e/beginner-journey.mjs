// A beginner's whole first session on a fresh profile: setup (cloud through the mock), a story from
// the gallery with two rounds, back to the start page ("continue your story") and a chat with the
// chosen character. Along the way the simple views must not show technical jargon.
import assert from 'node:assert/strict';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch({ onboarding_completed: false, start_tab: 'home', stage_last_scene: '' });
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));
const jsClick = (element) => browser.execute((el) => el.click(), element);
const next = () => browser.$('[role="dialog"]').$('button=Weiter').click();

/** Words a beginner should not meet outside expert mode. */
const JARGON = ['llama-server', 'Sampler', 'Tokens', 'Reasoning', 'RegEx', 'GGUF', 'SillyTavern', 'Lorebook 2.0', 'GAME MASTER'];
const jargonIn = (where) =>
  browser.execute((words) => {
    const text = document.body.innerText;
    return words.filter((word) => text.includes(word));
  }, JARGON).then((found) => assert.deepEqual(found, [], `${where}: Fachbegriffe sichtbar: ${found}`));

try {
  // 1. Setup: cloud is preselected by the test profile; key, first character, finish into a story.
  await browser.$('h2=Willkommen bei OtakuSoul').waitForDisplayed({ timeout: 30_000 });
  await next();
  await browser.$('#onboarding-api-key').waitForDisplayed();
  await browser.$('#onboarding-api-key').setValue('sk-test');
  await next();
  const firstCharacter = await browser.$('[role="dialog"] .grid button[aria-pressed]');
  await firstCharacter.waitForExist({ timeout: 20_000 });
  const character = (await browser.execute((el) => el.textContent, firstCharacter)).trim();
  await firstCharacter.click();
  await next();
  await next();
  await jsClick(await browser.$('[role="dialog"]').$('button*=Geschichte beginnen'));

  // 2. Stage opens with the gallery; a beginner story starts from its preview.
  await browser.$('[data-story-gallery]').waitForDisplayed({ timeout: 15_000, timeoutMsg: 'Kein Weg vom Assistenten zur Geschichte' });
  await jargonIn('Story-Galerie');
  await shot('92-einstieg-galerie');
  await jsClick(await browser.$('[data-story="story_hanami_live"]').$('button*=Ansehen'));
  await jsClick(await browser.$('[data-story-preview]').$('button*=Geschichte starten'));
  const input = await browser.$('form textarea');
  await input.waitForDisplayed({ timeout: 15_000 });
  await jargonIn('Geschichte');

  // Two rounds: a clicked suggestion and an own sentence.
  for (const round of [1, 2]) {
    const before = mock.stats.stageNarrator ?? 0;
    if (round === 1) {
      // A suggestion is sent as the turn right away.
      await jsClick(await browser.$('button*=Beruhige Shiori'));
    } else {
      await input.setValue('Ich nehme mir den Stapel Hefte und fange an zu sortieren.');
      await browser.keys('Enter');
    }
    await browser.waitUntil(() => (mock.stats.stageNarrator ?? 0) > before, { timeout: 30_000, timeoutMsg: `Runde ${round}: kein Erzähler` });
    await browser.$('button=Stopp').waitForExist({ reverse: true, timeout: 30_000 });
  }
  await jargonIn('Geschichte nach zwei Runden');
  await shot('93-einstieg-geschichte');

  // 3. The start page offers to continue the story.
  await jsClick(await browser.$('button=Start'));
  const storyCard = await browser.$('[data-home-card="stage"]');
  await storyCard.waitForDisplayed({ timeout: 10_000 });
  await browser.waitUntil(async () => /Geschichte weiterspielen/.test(await storyCard.getText()), { timeout: 10_000, timeoutMsg: 'Startseite bietet kein Weiterspielen' });
  assert.match(await storyCard.getText(), /Lesung unter Kirschblüten/);
  await jargonIn('Startseite');
  await shot('94-einstieg-startseite');

  // 4. Chat with the character chosen in the setup.
  await jsClick(await browser.$('[data-home-card="chat"]'));
  const message = await browser.$('textarea[aria-label="Nachricht"]');
  await message.waitForDisplayed({ timeout: 10_000 });
  assert.match(await browser.execute(() => document.body.innerText), new RegExp(character.split(' ')[0]));
  const chats = mock.stats.chat;
  await message.setValue('Hallo! Schön, dich kennenzulernen.');
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > chats, { timeout: 20_000, timeoutMsg: 'Keine Chat-Anfrage' });
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });
  await jargonIn('Chat');
  await shot('95-einstieg-chat');
  console.log(`Einsteiger-Durchlauf: Einrichtung, Geschichte (2 Runden), Weiterspielen und Chat mit ${character} ohne Fachbegriffe bestanden.`);
} finally {
  await close();
}
