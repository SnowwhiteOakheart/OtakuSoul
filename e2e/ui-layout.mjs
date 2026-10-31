// Layout check: compact chat and folded HUD stay set after a restart of the view, the chat
// toolbar works by keyboard, and small windows and other themes render without overflow.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, close } = await launch();
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));
const activeLabel = () => browser.execute(() => document.activeElement?.getAttribute('aria-label') ?? '');
/** The page must not scroll sideways; a too wide bar or HUD would show up here. */
const assertNoOverflow = async (where) => {
  const { scroll, width } = await browser.execute(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  assert.ok(scroll <= width, `${where}: Seite ist ${scroll}px breit bei ${width}px Fenster`);
};
/** Opens a menu and checks that every entry lies on top (not under a bar or the cards below). */
const assertMenuOnTop = async (trigger, where) => {
  await browser.$(`button[aria-label="${trigger}"]`).click();
  await browser.$('[role="menu"]').waitForDisplayed();
  const covered = await browser.execute(() => {
    const menu = document.querySelector('[role="menu"]');
    return [...menu.querySelectorAll('[role^="menuitem"]')].filter((item) => {
      const r = item.getBoundingClientRect();
      return !menu.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    }).map((item) => item.textContent);
  });
  assert.deepEqual(covered, [], `${where}: Menüeinträge verdeckt`);
  await browser.keys('Escape');
};

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.setWindowSize(1280, 840);

  // Compact view and folded story values.
  await browser.$('button[aria-label="Kompakt"]').click();
  await browser.$('[data-density="compact"]').waitForExist();
  await browser.$('button[aria-label="Zustandswerte ausblenden"]').click();
  await browser.$('button[aria-label="Zustandswerte einblenden"]').waitForExist();
  await shot('48-chat-kompakt');

  // Both survive leaving the chat and coming back.
  await browser.$('button*=Einstellungen').click();
  await browser.$('button*=Chat').click();
  await browser.$('[data-density="compact"]').waitForExist({ timeout: 10_000 });
  assert.equal(await browser.$('button[aria-label="Zustandswerte einblenden"]').isExisting(), true);

  // Keyboard: the overflow menu opens with Enter, arrows move, Escape returns focus.
  const more = await browser.$('button[aria-label="Weitere Chat-Aktionen"]');
  await browser.execute((el) => el.focus(), more);
  await browser.keys('Enter');
  const menu = await browser.$('[role="menu"]');
  await menu.waitForDisplayed();
  await browser.keys('ArrowDown');
  assert.ok((await browser.execute(() => document.activeElement?.getAttribute('role'))).startsWith('menuitem'));
  await browser.keys('Escape');
  await menu.waitForExist({ reverse: true });
  assert.equal(await activeLabel(), 'Weitere Chat-Aktionen');

  // Back to the normal view for the other checks.
  await browser.$('button[aria-label="Kompakt"]').click();
  await browser.$('button[aria-label="Zustandswerte einblenden"]').click();

  // Small window.
  await browser.setWindowSize(820, 600);
  await browser.pause(300);
  await assertNoOverflow('Kleines Fenster');
  // The HUD wraps instead of cutting off its last buttons.
  assert.ok(await browser.$('button[aria-label="Situationsbild des aktuellen Charakters generieren"]').isDisplayed({ withinViewport: true }), 'HUD abgeschnitten');
  // The avatar controls wrap inside their column instead of being cut off at its left edge.
  const clipped = await browser.execute(() => {
    const emotionButton = document.querySelector('button[aria-label^="Aktuelle Emotion"]');
    const column = emotionButton?.closest('.\\@container');
    if (!emotionButton || !column) return 'nicht gefunden';
    return emotionButton.getBoundingClientRect().left < column.getBoundingClientRect().left ? 'abgeschnitten' : '';
  });
  assert.equal(clipped, '', `Gefühlsmenü des Avatars: ${clipped}`);
  await shot('49-chat-kleines-fenster');
  await browser.setWindowSize(1280, 840);

  // Menus in the bars open over what follows below them.
  await assertMenuOnTop('Weitere Chat-Aktionen', 'Chat');
  await browser.$('button*=Charaktere').click();
  await browser.$('button[aria-label="Weitere Aktionen"]').waitForDisplayed({ timeout: 10_000 });
  await assertMenuOnTop('Weitere Aktionen', 'Charakterbibliothek');
  await browser.$('button*=Chat').click();
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 10_000 });

  // The sidebar tabs wrap instead of overlapping in the narrow panel.
  await browser.execute(() => document.querySelector('button[title^="Gespräche, Author"]').click());
  await browser.$('[role="tablist"][aria-label="Bereiche"]').waitForDisplayed();
  const tabClash = await browser.execute(() => {
    const list = document.querySelector('[role="tablist"][aria-label="Bereiche"]');
    const box = list.getBoundingClientRect();
    const tabs = [...list.querySelectorAll('[role="tab"]')].map((tab) => ({ name: tab.textContent, r: tab.getBoundingClientRect(), fits: tab.scrollWidth <= tab.clientWidth }));
    const problems = tabs.filter((t) => !t.fits || t.r.left < box.left || t.r.right > box.right).map((t) => `${t.name} passt nicht`);
    tabs.forEach((a, i) => tabs.slice(i + 1).forEach((b) => {
      if (a.r.left < b.r.right && b.r.left < a.r.right && a.r.top < b.r.bottom && b.r.top < a.r.bottom) problems.push(`${a.name} überlappt ${b.name}`);
    }));
    return problems;
  });
  assert.deepEqual(tabClash, [], 'Tabs der Chat-Seitenleiste');
  await shot('48b-chat-seitenleiste-tabs');
  await browser.keys('Escape');

  // Themes and light mode (applied the same way the settings do).
  for (const [theme, mode] of [['sakura', 'light'], ['midnight', 'dark'], ['cyberpunk', 'dark']]) {
    await browser.execute((t, m) => {
      document.documentElement.setAttribute('data-theme', t);
      document.documentElement.dataset.colorMode = m;
    }, theme, mode);
    await browser.pause(200);
    await assertNoOverflow(theme);
    await shot(`50-theme-${theme}-${mode}`);
  }
  console.log('Oberfläche: Kompaktansicht, einklappbares HUD, Tastaturmenü, Menüs über den Leisten, Seitenleisten-Tabs, kleines Fenster und Themes bestanden.');
} finally {
  await close();
}
