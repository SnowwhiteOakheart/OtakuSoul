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
  await shot('49-chat-kleines-fenster');
  await browser.setWindowSize(1280, 840);

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
  console.log('Oberfläche: Kompaktansicht, einklappbares HUD, Tastaturmenü, kleines Fenster und Themes bestanden.');
} finally {
  await close();
}
