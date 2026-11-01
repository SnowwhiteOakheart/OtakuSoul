// Large hub catalog: virtual rows must use the actual grid columns, also after resizing.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const total = 240;
const characters = Array.from({ length: total }, (_, i) => ({
  name: `Scroll-Figur ${String(i).padStart(3, '0')}`, author: 'Scroll-Test',
  download_url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="160"%3E%3Crect width="120" height="160" fill="%23475569"/%3E%3C/svg%3E',
  revision: 1,
}));
const { browser, close } = await launch({}, { hubFiles: {
  'soul_registry.json': { version: '1', characters },
  'collections_registry.json': { version: '1', collections: [{
    id: 'scroll', title: 'Scroll-Sammlung', author: 'Test', description: 'Inhalte vor dem Raster',
    cover_url: '', characters: [characters[0].name], lorebooks: [], scenes: [], revision: 1,
  }] },
  'lorebooks_registry.json': { version: '1', lorebooks: [] },
  'stages_registry.json': { version: '1', scenes: [] },
} });
try {
  await browser.$('button[aria-label="Hub"]').waitForExist({ timeout: 20_000 });
  await browser.$('button[aria-label="Hub"]').click();
  await browser.$('[data-hub-collection="scroll"]').waitForDisplayed({ timeout: 15_000 });
  for (const width of [1100, 1500]) {
    await browser.setWindowSize(width, 900);
    await browser.waitUntil(() => browser.execute(() => {
      const row = document.querySelector('#hub-tabpanel [data-index]');
      if (!row) return false;
      const cols = getComputedStyle(row).gridTemplateColumns.split(' ').length;
      return row.children.length === cols;
    }), { timeout: 5000, timeoutMsg: 'Virtuelle Zeile und sichtbare Spalten stimmen nicht überein' });
    const result = await browser.execute(async () => {
      const panel = document.getElementById('hub-tabpanel');
      const frames = [];
      let previous = performance.now();
      let maxCards = 0;
      // Walk the entire list and let row measurements settle on each frame.
      for (let step = 0; step < 220; step++) {
        panel.scrollTop += 180;
        await new Promise(requestAnimationFrame);
        const now = performance.now();
        frames.push(now - previous);
        previous = now;
        maxCards = Math.max(maxCards, panel.querySelectorAll('[data-index] h3').length);
      }
      return { maxCards, reachedLast: [...panel.querySelectorAll('h3')].some((h) => h.textContent === 'Scroll-Figur 239'),
        maxFrameMs: Math.round(Math.max(...frames)), scrollTop: panel.scrollTop };
    });
    assert.ok(result.maxCards < 80, `Zu viele Karten im DOM: ${result.maxCards}`);
    assert.ok(result.reachedLast, `Listenende bei ${width}px nicht erreichbar`);
    console.log(`hub-scroll ${width}px: ${JSON.stringify(result)}`);
    await browser.execute(() => { document.getElementById('hub-tabpanel').scrollTop = 0; });
  }
  await browser.saveScreenshot(path.join(screenshotDir, 'hub-scroll.png'));
  console.log('hub-scroll: ok');
} catch (error) {
  await browser.saveScreenshot(path.join(screenshotDir, 'hub-scroll-error.png'));
  console.error(await browser.execute(() => document.body.innerText));
  throw error;
} finally {
  await close();
}
