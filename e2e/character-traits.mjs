// Long character traits show at most three lines and scroll inside (chat portrait mode).
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, close } = await launch({ avatar_mode: '2d' });
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const [character] = await invoke('scan_characters');
  const traits = Array.from({ length: 12 }, (_, i) => `Charakterzug ${i + 1}: neugierig, freundlich und ein wenig verträumt.`).join(' ');
  await invoke('save_character_card', { profile: { ...character, card: { ...character.card, data: { ...character.card.data, personality: traits } } } });
  await browser.refresh();

  const region = await browser.$(`[role="region"][aria-label="Charakterzüge von ${character.card.data.name}"]`);
  await region.waitForDisplayed({ timeout: 30_000 });
  const box = await browser.execute((el) => {
    const style = getComputedStyle(el);
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = [...new Set([...range.getClientRects()].map((r) => Math.round(r.top)))].sort((x, y) => x - y);
    return { max: parseFloat(style.maxHeight), line: parseFloat(style.lineHeight), client: el.clientHeight, scroll: el.scrollHeight, fourth: tops[3] - tops[0] };
  }, region);
  // Exactly three lines: the fourth starts where the visible area ends.
  assert.ok(Math.abs(box.fourth - box.client) <= 1, `nicht genau drei Zeilen: ${JSON.stringify(box)}`);
  assert.ok(box.scroll > box.client, 'langer Text scrollt nicht');
  await browser.saveScreenshot(path.join(screenshotDir, '30-charakterzuege.png'));
  console.log('Charakterzüge: drei Zeilen, Rest scrollbar bestanden.');
} finally {
  await close();
}
