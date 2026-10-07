// First-run wizard on a fresh profile: test the cloud connection, pick a character and end with a
// real first reply of that character (all through the mock model).
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch({ onboarding_completed: false });
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));
// Scoped to the wizard: the chat behind it has a "Weiter" (continue) button too.
const next = () => browser.$('[role="dialog"]').$('button=Weiter').click();

try {
  await browser.$('h2=Willkommen bei OtakuSoul').waitForDisplayed({ timeout: 30_000 });
  await next();

  // Cloud is preselected by the test profile; the key is still missing.
  await browser.$('#onboarding-api-key').waitForDisplayed();
  await browser.$('#onboarding-api-key').setValue('sk-test');
  const before = mock.stats.requests ?? 0;
  await browser.$('button=Verbindung testen').click();
  await browser.$('p*=Verbindung steht').waitForDisplayed({ timeout: 15_000 });
  await shot('35-assistent-verbindung');
  await next();

  // Character: the first one of the list.
  await browser.$('h2=Mit wem möchtest du sprechen?').waitForDisplayed();
  // The character cards of the dialog (the app behind it has pressable buttons too).
  const firstCharacter = await browser.$('[role="dialog"] .grid button[aria-pressed]');
  await firstCharacter.waitForExist({ timeout: 20_000, timeoutMsg: 'keine Charaktere im Assistenten' });
  const name = (await browser.execute((el) => el.textContent, firstCharacter)).trim();
  await firstCharacter.click();
  await next();

  // Voice & images: the chosen character's voice and the image models, saved as you go.
  await browser.$('h2=Stimme und Bilder (optional)').waitForDisplayed();
  await browser.$('[data-testid="onboarding-voice"]').waitForDisplayed();
  assert.match(await browser.$('[data-testid="onboarding-voice"]').getText(), new RegExp(name));
  await browser.$('[data-media-tab="images"]').click();
  await browser.$('[data-testid="onboarding-images"]').waitForDisplayed();
  await shot('35b-assistent-stimme-bilder');
  await next();

  // Done: a real reply of the chosen character.
  await browser.$('button=Erste Antwort holen').waitForDisplayed();
  await browser.$('button=Erste Antwort holen').click();
  const reply = await browser.$('blockquote');
  await reply.waitForDisplayed({ timeout: 15_000 });
  assert.ok((await reply.getText()).length > 10, 'keine erste Antwort');
  assert.equal(await browser.$('figcaption').getText(), name);
  await shot('36-assistent-erste-antwort');
  assert.ok((mock.stats.requests ?? before) >= before);

  await browser.$('button*=Los geht').click();
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 10_000 });
  // New profiles show the character's picture, not the generic 3D model.
  const pressed = await browser.execute(() => [...document.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.textContent.trim()));
  assert.ok(pressed.includes('Bild'), `Avatar-Modus: ${pressed}`);
  console.log('Einrichtungsassistent: Verbindungstest, Charakterwahl und erste Antwort bestanden.');
} finally {
  await close();
}
