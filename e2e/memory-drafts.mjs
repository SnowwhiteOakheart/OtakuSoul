// Explicit saves persist complete drafts; real database failures preserve edits for retry.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, home, close } = await launch();
const database = path.join(home, 'data', 'otakusoul.db');
const sql = (statement) => execFileSync('sqlite3', [database, statement], { encoding: 'utf8' }).trim();
const open = async () => {
  const button = browser.$('button[aria-label="Kognitiven Seelenspeicher öffnen"]');
  await button.waitForDisplayed({ timeout: 20_000 });
  await button.click();
};
const tab = async (name) => {
  const button = browser.$(`button=${name}`);
  await button.scrollIntoView({ block: 'nearest', inline: 'center' });
  await button.click();
};
const replaceText = async (input, value) => {
  // WebKit's clearElement does not emit React's change event for controlled fields.
  await input.click();
  await browser.execute((selector) => {
    const field = document.querySelector(selector);
    field.focus();
    field.select();
  }, await input.selector);
  await browser.keys('Backspace');
  await input.addValue(value);
};
try {
  await open();
  const tension = browser.$('input[aria-label="Innere Anspannung & Konflikte"]');
  await tension.waitForDisplayed();
  const original = sql('SELECT psychological_tension FROM soul_psychology;');
  await replaceText(tension, 'Konflikt am Tor');
  assert.equal(sql('SELECT psychological_tension FROM soul_psychology;'), original);
  await tab('Beziehung');
  const role = browser.$('#mem-role');
  const originalRole = sql('SELECT role_in_story FROM soul_relationship;');
  await replaceText(role, 'Vertrauter');
  assert.equal(sql('SELECT role_in_story FROM soul_relationship;'), originalRole);
  await tab('Geist & Psyche');
  assert.equal(await tension.getValue(), 'Konflikt am Tor');
  await browser.$('[role="dialog"] button[aria-label="Schließen"]').click();
  await open();
  assert.equal(await browser.$('input[aria-label="Innere Anspannung & Konflikte"]').getValue(), 'Konflikt am Tor');

  sql("CREATE TRIGGER test_psych_failure BEFORE INSERT ON soul_psychology BEGIN SELECT RAISE(ABORT, 'Psychologie-Schreibfehler (Test).'); END;");
  await browser.$('button=Psychologie speichern').click();
  await browser.$('p*=Psychologie-Schreibfehler (Test).').waitForDisplayed();
  assert.equal(await browser.$('input[aria-label="Innere Anspannung & Konflikte"]').getValue(), 'Konflikt am Tor');
  assert.equal(sql('SELECT psychological_tension FROM soul_psychology;'), original);
  assert.equal(await browser.$('p=Psychologie gespeichert.').isExisting(), false);
  await browser.saveScreenshot(path.join(screenshotDir, '30-psychologie-entwurf.png'));
  sql('DROP TRIGGER test_psych_failure;');
  await browser.$('button=Psychologie speichern').click();
  await browser.$('p=Psychologie gespeichert.').waitForDisplayed();
  assert.equal(sql('SELECT psychological_tension FROM soul_psychology;'), 'Konflikt am Tor');

  await tab('Beziehung');
  assert.equal(await role.getValue(), 'Vertrauter');
  sql("CREATE TRIGGER test_rel_failure BEFORE INSERT ON soul_relationship BEGIN SELECT RAISE(ABORT, 'Beziehungs-Schreibfehler (Test).'); END;");
  await browser.$('button=Beziehung speichern').click();
  await browser.$('p*=Beziehungs-Schreibfehler (Test).').waitForDisplayed();
  assert.equal(await role.getValue(), 'Vertrauter');
  assert.equal(sql('SELECT role_in_story FROM soul_relationship;'), originalRole);
  assert.equal(await browser.$('p=Beziehung gespeichert.').isExisting(), false);
  await browser.saveScreenshot(path.join(screenshotDir, '31-beziehung-entwurf.png'));
  sql('DROP TRIGGER test_rel_failure;');
  await browser.$('button=Beziehung speichern').click();
  await browser.$('p=Beziehung gespeichert.').waitForDisplayed();
  assert.equal(sql('SELECT role_in_story FROM soul_relationship;'), 'Vertrauter');
  await replaceText(role, 'Verworfene Änderung');
  for (const discard of await browser.$$('button=Entwurf verwerfen')) {
    if (await discard.isDisplayed()) {
      await discard.click();
      break;
    }
  }
  assert.equal(await role.getValue(), 'Vertrauter');
  assert.equal(sql('SELECT role_in_story FROM soul_relationship;'), 'Vertrauter');
  console.log('Memory: Entwürfe bleiben über Reiterwechsel und Schließen erhalten; Schreibfehler und Wiederholen geprüft.');
} catch (error) {
  await browser.saveScreenshot(path.join(screenshotDir, 'memory-drafts-fehler.png'));
  throw error;
} finally {
  await close();
}
