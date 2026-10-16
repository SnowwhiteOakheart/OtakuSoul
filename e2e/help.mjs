// Help for beginners: the question mark opens first steps and a searchable glossary.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, close } = await launch();
const jsClick = (element) => browser.execute((el) => el.click(), element);
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));

try {
  const helpButton = await browser.$('button[aria-label="Hilfe & Glossar"]');
  await helpButton.waitForExist({ timeout: 20_000 });
  await jsClick(helpButton);
  const dialog = await browser.$('[data-help]');
  await dialog.waitForDisplayed({ timeout: 5000 });
  assert.match(await dialog.getText(), /KI einrichten[\s\S]*Einen Charakter wählen/);
  await browser.pause(300);
  await shot('89-hilfe-erste-schritte');

  await jsClick(await dialog.$('button[role="tab"]*=Glossar'));
  await browser.$('[data-help="glossary"]').waitForDisplayed({ timeout: 3000 });
  await browser.$('input[aria-label="Begriff suchen …"]').setValue('Grafik');
  await browser.waitUntil(
    () => browser.execute(() => [...document.querySelectorAll('[data-glossary]')].map((el) => el.getAttribute('data-glossary')).join(',')),
    { timeout: 3000 },
  );
  const terms = await browser.execute(() => [...document.querySelectorAll('[data-glossary]')].map((el) => el.getAttribute('data-glossary')));
  assert.ok(terms.includes('vram') && !terms.includes('persona'), `Suche filtert nicht: ${terms}`);
  await shot('90-hilfe-glossar');
  await browser.keys('Escape');

  console.log('Hilfe: Erste Schritte und Glossar-Suche bestanden.');
} finally {
  await close();
}
