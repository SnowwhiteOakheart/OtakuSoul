// Every option in the settings explains itself in a sentence: each input, select, slider and switch
// in every settings tab (simple and expert view) has a description – `aria-describedby`, a hint
// text in its own box, or a title. Lists the ones without.
// Usage: `xvfb-run -a node e2e/settings-hints.mjs`
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

/** Runs in the page: options of the visible settings panel without a description. */
function missingHints() {
  const panel = document.querySelector('[role="tabpanel"]');
  if (!panel) return ['kein Einstellungsbereich'];
  const controls = [...panel.querySelectorAll('input, select, textarea, [role="switch"]')].filter((el) => {
    if (el.type === 'hidden' || el.type === 'file' || el.closest('[aria-hidden="true"]')) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  const missing = [];
  window.__checkedControls = controls.length;
  for (const el of controls) {
    if (el.getAttribute('aria-describedby') || el.title || el.type === 'search') continue;
    // Entries of a choice list (models, LoRAs) describe themselves in their label (size, licence).
    if ((el.type === 'checkbox' || el.type === 'radio') && (el.closest('label')?.textContent.trim().length ?? 0) >= 40) continue;
    // A hint right at the option: in its own box or one level up, not shared with other options.
    let described = false;
    let box = el.parentElement;
    for (let i = 0; i < 2 && box && box !== panel; i += 1, box = box.parentElement) {
      if (box.querySelectorAll('input, select, textarea, [role="switch"]').length > 2) break;
      described = [...box.querySelectorAll('p, span, div')].some((n) => {
        if (n.contains(el) || n.children.length > 2) return false;
        const text = n.textContent.trim();
        const size = parseFloat(getComputedStyle(n).fontSize);
        // A sentence in small type, not the label itself.
        return text.length >= 25 && size <= 13 && !n.closest('label')?.contains(el);
      });
      if (described) break;
    }
    if (described) continue;
    const label = el.getAttribute('aria-label')
      || (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent)
      || el.closest('label')?.textContent
      || el.placeholder
      || el.name
      || el.type;
    missing.push(String(label).trim().replace(/\s+/g, ' ').slice(0, 70));
  }
  return missing;
}

const results = [];
let total = 0;
for (const expert of [false, true]) {
  const { browser, close } = await launch({ expert_mode: expert });
  try {
    await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
    await browser.setWindowSize(1400, 900);
    await browser.$('button=Einstellungen').click();
    await browser.$('[role="tab"][id^="settings-tab-"]').waitForDisplayed({ timeout: 10_000 });
    const tabs = await browser.$$('[role="tab"][id^="settings-tab-"]');
    const found = [];
    for (const tab of tabs) found.push([await tab.getAttribute('id'), await tab.getText()]);
    for (const [id, name] of found) {
      await browser.$(`#${id}`).click();
      await browser.pause(600);
      const missing = await browser.execute(missingHints);
      const checked = await browser.execute(() => window.__checkedControls);
      console.log(`[${expert ? 'Experte' : 'Einfach'}] ${name}: ${checked} Optionen, ${missing.length} ohne Beschreibung`);
      total += checked;
      if ((expert && id === 'settings-tab-server') || (!expert && id === 'settings-tab-voice')) {
        // The tuning box / the voice options in view for a look at the hints.
        await browser.execute((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), expert ? '#settings-batch' : '#voice-filter-hint');
        await browser.pause(300);
        await browser.saveScreenshot(path.join(screenshotDir, `97-hinweise-${expert ? 'lokale-ki' : 'stimme'}.png`));
      }
      for (const label of missing) results.push(`${expert ? 'Experte' : 'Einfach'} · ${name} · ${label}`);
    }
  } finally {
    await close();
  }
}
assert.ok(total > 30, `nur ${total} Optionen gefunden – Auswahl der Reiter prüfen`);
const unique = [...new Set(results)];
for (const line of unique) console.log(line);
console.log(`${unique.length} Optionen ohne Beschreibung.`);
assert.equal(unique.length, 0, `${unique.length} Optionen ohne Beschreibung`);
