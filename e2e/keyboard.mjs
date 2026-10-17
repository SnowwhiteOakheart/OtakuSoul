// Keyboard only through the new flows: story wizard, character preview, help and the setup
// assistant open with Enter, keep the focus inside (Tab never leaves the dialog), can be worked
// through without a mouse and give the focus back to where they were opened from on Escape.
// No view uses a positive tabindex (it would jumble the order).
import assert from 'node:assert/strict';
import { launch } from './harness.mjs';

const findings = [];
const active = (browser) => browser.execute(() => {
  const el = document.activeElement;
  return el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} „${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}“` : 'nichts';
});
const focusInside = (browser, selector) => browser.execute((sel) => !!document.activeElement?.closest(sel), selector);

/** Tab through the dialog (twice around): the focus must stay inside. */
async function tabStaysInside(browser, selector, label) {
  for (let i = 0; i < 30; i += 1) {
    await browser.keys('Tab');
    if (!(await focusInside(browser, selector))) {
      findings.push(`${label}: Tab verlässt den Dialog (Fokus bei ${await active(browser)})`);
      return;
    }
  }
}

/** Focus an element and press Enter. */
async function enterOn(browser, element) {
  await browser.execute((el) => el.focus(), element);
  await browser.keys('Enter');
}

async function positiveTabindex(browser, where) {
  const found = await browser.execute(() => [...document.querySelectorAll('[tabindex]')].filter((el) => Number(el.getAttribute('tabindex')) > 0).map((el) => el.outerHTML.slice(0, 80)));
  for (const html of found) findings.push(`${where}: positiver tabindex ${html}`);
}

// 1. Story gallery and wizard, character preview, help.
{
  const { browser, close } = await launch({ stage_last_scene: '' });
  try {
    await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
    await browser.setWindowSize(1400, 900);
    await positiveTabindex(browser, 'Chat');

    // Story wizard: open with Enter, pick a genre and go on with the keyboard, Escape back.
    await browser.$('button=Stage').click();
    await browser.$('[data-story-gallery]').waitForDisplayed({ timeout: 15_000 });
    await positiveTabindex(browser, 'Story-Galerie');
    const opener = await browser.$('[data-story-gallery]').$('button*=Eigene Geschichte');
    await enterOn(browser, opener);
    const wizard = await browser.$('[data-story-wizard]');
    await wizard.waitForDisplayed({ timeout: 5000 });
    if (!(await focusInside(browser, '[data-story-wizard]'))) findings.push(`Story-Assistent: Fokus nicht im Dialog (${await active(browser)})`);
    await tabStaysInside(browser, '[data-story-wizard]', 'Story-Assistent');
    // Genres are a radio group: the arrow keys move the choice and the focus.
    await browser.execute(() => document.querySelector('[data-story-wizard] [role="radio"][aria-checked="true"]')?.focus());
    await browser.keys('ArrowRight');
    const moved = await browser.execute(() => {
      const el = document.activeElement;
      return el?.getAttribute('role') === 'radio' && el.getAttribute('aria-checked') === 'true' ? el.getAttribute('data-genre') : null;
    });
    if (!moved || moved === 'fantasy') findings.push(`Story-Assistent: Pfeiltaste wählt kein anderes Genre (${moved})`);
    const tabStops = await browser.execute(() => [...document.querySelectorAll('[data-story-wizard] [role="radio"]')].filter((el) => el.tabIndex >= 0).length);
    if (tabStops !== 1) findings.push(`Story-Assistent: ${tabStops} Genres in der Tab-Reihenfolge statt einem`);
    if ((await wizard.getAttribute('data-story-wizard')) === 'genre') await enterOn(browser, await wizard.$('button*=Weiter'));
    await browser.waitUntil(async () => (await wizard.getAttribute('data-story-wizard')) !== 'genre', { timeout: 3000 })
      .catch(() => findings.push('Story-Assistent: „Weiter“ nicht per Tastatur'));
    await browser.keys('Escape');
    await wizard.waitForExist({ reverse: true, timeout: 3000 }).catch(() => findings.push('Story-Assistent: Escape schließt nicht'));
    const backToOpener = await browser.execute((el) => document.activeElement === el, opener);
    if (!backToOpener) findings.push(`Story-Assistent: Fokus nach Escape bei ${await active(browser)}`);

    // Character preview from the library.
    await browser.$('button=Charaktere').click();
    const card = await browser.$('[data-index="0"] button');
    await card.waitForDisplayed({ timeout: 10_000 });
    await positiveTabindex(browser, 'Charaktere');
    await enterOn(browser, card);
    const preview = await browser.$('[data-character-preview]');
    await preview.waitForDisplayed({ timeout: 5000 }).catch(() => findings.push('Charakter-Vorschau: Enter öffnet nicht'));
    if (await preview.isExisting()) {
      if (!(await focusInside(browser, '[data-character-preview]'))) findings.push(`Charakter-Vorschau: Fokus nicht im Dialog (${await active(browser)})`);
      await tabStaysInside(browser, '[data-character-preview]', 'Charakter-Vorschau');
      await browser.keys('Escape');
      await preview.waitForExist({ reverse: true, timeout: 3000 }).catch(() => findings.push('Charakter-Vorschau: Escape schließt nicht'));
      if (!(await browser.execute((el) => document.activeElement === el, card))) findings.push(`Charakter-Vorschau: Fokus nach Escape bei ${await active(browser)}`);
    }

    // Help: open from the header, switch to the glossary and search with the keyboard.
    const help = await browser.$('button[aria-label="Hilfe & Glossar"]');
    await enterOn(browser, help);
    const dialog = await browser.$('[data-help]');
    await dialog.waitForDisplayed({ timeout: 5000 });
    await tabStaysInside(browser, '[data-help]', 'Hilfe');
    await enterOn(browser, await dialog.$('button[role="tab"]*=Glossar'));
    await browser.waitUntil(async () => (await dialog.getAttribute('data-help')) === 'glossary', { timeout: 3000 })
      .catch(() => findings.push('Hilfe: Glossar nicht per Tastatur'));
    const search = await dialog.$('input');
    await browser.execute((el) => el.focus(), search);
    await browser.keys('VRAM'.split(''));
    await browser.waitUntil(async () => (await browser.$$('[data-glossary]')).length === 1, { timeout: 3000 })
      .catch(() => findings.push('Hilfe: Suche per Tastatur filtert nicht'));
    await browser.keys('Escape');
    await dialog.waitForExist({ reverse: true, timeout: 3000 }).catch(() => findings.push('Hilfe: Escape schließt nicht'));
    if (!(await browser.execute((el) => document.activeElement === el, help))) findings.push(`Hilfe: Fokus nach Escape bei ${await active(browser)}`);
    await positiveTabindex(browser, 'Einstellungen-Weg');
  } finally {
    await close();
  }
}

// 2. Setup assistant on a fresh profile: focus inside, Enter on „Weiter“ goes on.
{
  const { browser, close } = await launch({ onboarding_completed: false });
  try {
    const dialog = await browser.$('[role="dialog"]');
    await dialog.waitForDisplayed({ timeout: 30_000 });
    await browser.waitUntil(() => focusInside(browser, '[role="dialog"]'), { timeout: 3000 })
      .catch(async () => findings.push(`Einrichtung: Fokus nicht im Dialog (${await active(browser)})`));
    await tabStaysInside(browser, '[role="dialog"]', 'Einrichtung');
    await enterOn(browser, await dialog.$('button=Weiter'));
    await browser.$('h2=Womit soll gechattet werden?').waitForDisplayed({ timeout: 5000 })
      .catch(() => findings.push('Einrichtung: „Weiter“ nicht per Tastatur'));
    // The local/cloud choice works with Enter too.
    await enterOn(browser, await dialog.$('button*=Cloud'));
    await browser.$('#onboarding-api-key').waitForDisplayed({ timeout: 5000 })
      .catch(() => findings.push('Einrichtung: Cloud nicht per Tastatur wählbar'));
    // Providers are a radio group: one Tab stop, the arrow keys switch.
    const providers = () => browser.execute(() => [...document.querySelectorAll('[role="dialog"] [role="radio"]')]
      .map((el) => ({ value: el.getAttribute('data-radio-value'), checked: el.getAttribute('aria-checked') === 'true', tab: el.tabIndex })));
    const before = await providers();
    if (before.filter((p) => p.tab >= 0).length !== 1) findings.push('Einrichtung: mehrere Anbieter in der Tab-Reihenfolge');
    await browser.execute(() => document.querySelector('[role="dialog"] [role="radio"][tabindex="0"]')?.focus());
    await browser.keys('ArrowRight');
    const after = await providers();
    const was = before.find((p) => p.checked)?.value;
    const now = after.find((p) => p.checked)?.value;
    if (!now || now === was) findings.push(`Einrichtung: Pfeiltaste wechselt den Anbieter nicht (${was} → ${now})`);
  } finally {
    await close();
  }
}

for (const f of findings) console.log(`✘ ${f}`);
assert.equal(findings.length, 0, `${findings.length} Tastatur-Befunde`);
console.log('Tastatur: Story-Assistent, Charakter-Vorschau, Hilfe und Einrichtung ohne Maus bedienbar, Fokus bleibt im Dialog und kehrt zurück.');
