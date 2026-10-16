// Accessibility and small-window sweep: in a 1024×700 window every main view and the beginner
// dialogs must give each control an accessible name, must not scroll sideways, and dialogs must
// fit the window.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, close } = await launch({ stage_last_scene: '' });
const jsClick = (element) => browser.execute((el) => el.click(), element);

/** Controls without a name, sideways overflow and dialogs outside the window, as text lines. */
const audit = () =>
  browser.execute(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const nameOf = (el) => {
      const labelled = el.getAttribute('aria-labelledby');
      const fromIds = labelled ? labelled.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : '';
      const labels = 'labels' in el && el.labels ? [...el.labels].map((l) => l.textContent ?? '').join(' ') : '';
      const img = el.querySelector('img[alt]')?.getAttribute('alt') ?? '';
      return [el.getAttribute('aria-label'), fromIds, labels, el.getAttribute('title'), el.textContent, img, el.getAttribute('placeholder')]
        .map((v) => (v ?? '').trim())
        .find(Boolean);
    };
    const problems = [];
    for (const el of document.querySelectorAll('button, [role="button"], [role="tab"], a[href], input:not([type="hidden"]), select, textarea')) {
      if (!visible(el) || el.closest('[aria-hidden="true"]')) continue;
      if (!nameOf(el)) problems.push(`ohne Namen: <${el.tagName.toLowerCase()} class="${(el.className?.baseVal ?? el.className ?? '').toString().slice(0, 60)}">`);
    }
    const doc = document.scrollingElement;
    if (doc.scrollWidth > window.innerWidth + 1) problems.push(`seitlicher Überlauf: ${doc.scrollWidth} > ${window.innerWidth}`);
    for (const dialog of document.querySelectorAll('[role="dialog"]')) {
      const panel = dialog.firstElementChild ?? dialog;
      const r = panel.getBoundingClientRect();
      if (r.top < -1 || r.bottom > window.innerHeight + 1 || r.left < -1 || r.right > window.innerWidth + 1) {
        problems.push(`Dialog ragt heraus: ${dialog.getAttribute('aria-labelledby')} (${Math.round(r.top)}–${Math.round(r.bottom)})`);
      }
    }
    return problems;
  });

const findings = [];
const check = async (where) => {
  await browser.pause(400);
  for (const problem of await audit()) findings.push(`${where}: ${problem}`);
};

try {
  await browser.$('button=Stage').waitForExist({ timeout: 20_000 });
  await browser.setWindowSize(1024, 700);
  for (const [nav, ready] of [
    ['Start', '[data-home]'],
    ['Chat', 'textarea[aria-label="Nachricht"]'],
    ['Stage', '[data-story-gallery]'],
    ['Charaktere', 'button[aria-label^="Mehr über"]'],
    ['Lorebooks', 'h1'],
    ['Hub', '#hub-tab-scenes'],
    ['Companion', 'h1, h2'],
    ['Integrationen', 'h1, h2'],
    ['Einstellungen', '#setting-expert-mode'],
  ]) {
    await jsClick(await browser.$(`button=${nav}`));
    await browser.$(ready).waitForExist({ timeout: 15_000, timeoutMsg: `${nav} lädt nicht` });
    await check(nav);
  }

  // Beginner dialogs in the small window.
  await jsClick(await browser.$('button[aria-label="Hilfe & Glossar"]'));
  await browser.$('[data-help]').waitForDisplayed({ timeout: 5000 });
  await check('Hilfe');
  await browser.keys('Escape');
  await jsClick(await browser.$('button=Stage'));
  await browser.$('[data-story-gallery]').waitForExist({ timeout: 10_000 });
  await jsClick(await browser.$('[data-story="story_frozen_bells"]').$('button*=Ansehen'));
  await browser.$('[data-story-preview]').waitForDisplayed({ timeout: 5000 });
  await check('Story-Vorschau');
  await browser.keys('Escape');
  // Keyboard: Enter opens a story preview, Escape closes it and focus returns to the card.
  const look = await browser.$('[data-story="story_hanami_live"]').$('button*=Ansehen');
  await browser.execute((el) => el.focus(), look);
  await browser.keys('Enter');
  await browser.$('[data-story-preview="story_hanami_live"]').waitForDisplayed({ timeout: 5000, timeoutMsg: 'Enter öffnet die Vorschau nicht' });
  await browser.keys('Escape');
  await browser.$('[data-story-preview]').waitForExist({ reverse: true, timeout: 3000 });
  const focusBack = await browser.execute(() => document.activeElement?.closest('[data-story]')?.getAttribute('data-story'));
  if (focusBack !== 'story_hanami_live') findings.push(`Tastatur: Fokus nach Escape bei ${focusBack ?? 'nichts'}`);

  await jsClick(await browser.$('[data-story-gallery]').$('button*=Eigene Geschichte'));
  await browser.$('[data-story-wizard]').waitForDisplayed({ timeout: 5000 });
  await check('Story-Assistent');
  await browser.saveScreenshot(path.join(screenshotDir, '91-kleines-fenster-assistent.png'));
  await browser.keys('Escape');

  if (findings.length) console.log(findings.join('\n'));
  assert.equal(findings.length, 0, `${findings.length} Befunde`);
  console.log('Barrierefreiheit & kleines Fenster: alle Ansichten und Einsteiger-Dialoge ohne Befund.');
} finally {
  await close();
}
