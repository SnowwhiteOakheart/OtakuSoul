// Contrast of visible text in every theme, dark and light: start page, chat, story gallery,
// characters and settings. Each text is measured against the background actually behind it
// (semi-transparent layers composited); WCAG AA asks for 4.5:1, 3:1 for large text.
// Usage: `xvfb-run -a node e2e/contrast.mjs` (fails when a theme has texts below the limit).
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const THEMES = ['obsidian', 'cyberpunk', 'sakura', 'midnight', 'emerald'];
const MODES = ['dark', 'light'];
// Ctrl+N in the order of the sidebar.
const VIEWS = [['Start', 1], ['Chat', 2], ['Geschichten', 3], ['Charaktere', 5], ['Einstellungen', 9]];

/** Runs in the page: texts below the WCAG limit as {text, ratio, fg, bg, where}. */
function lowContrast() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  // Any CSS colour (oklab, color-mix, …) through the canvas into sRGB bytes.
  const rgba = (color) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const over = (top, below) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + below[i] * (1 - a)).concat(1);
  };
  const luminance = ([r, g, b]) => {
    const lin = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const ratio = (a, b) => {
    const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  };
  // Background behind an element: layers from the root down to it. Gradients count by their
  // first colour; images make the result unknown (skipped).
  const background = (el) => {
    const chain = [];
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) chain.unshift(node);
    let color = rgba(getComputedStyle(document.body).backgroundColor);
    if (color[3] < 1) color = over(color, [255, 255, 255, 1]);
    for (const node of chain) {
      const style = getComputedStyle(node);
      const image = style.backgroundImage;
      if (image && image !== 'none') {
        if (image.includes('url(')) return null;
        const stop = image.match(/(rgba?\([^)]*\)|oklab\([^)]*\)|oklch\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8})/i);
        if (stop) color = over(rgba(stop[1]), color);
      }
      const layer = rgba(style.backgroundColor);
      if (layer[3] > 0) color = over(layer, color);
      // Strongly see-through elements (overlays, disabled) are not judged.
      if (Number(style.opacity) < 0.6) return null;
    }
    return color;
  };
  const found = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.trim();
    const el = node.parentElement;
    if (!text || !el || el.closest('[aria-hidden="true"], script, style, option, canvas, svg')) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || rect.bottom < 0 || rect.top > innerHeight) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || el.closest('[disabled], .sr-only')) continue;
    // Gradient lettering (logo): the text itself is transparent, the gradient is its colour.
    if (style.backgroundClip === 'text' || style.webkitBackgroundClip === 'text') continue;
    const bg = background(el);
    if (!bg) continue;
    const fg = over(rgba(style.color), bg);
    const size = parseFloat(style.fontSize);
    const bold = Number(style.fontWeight) >= 700;
    const limit = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const value = ratio(fg, bg);
    if (value < limit) {
      found.push({
        text: text.slice(0, 40),
        ratio: Math.round(value * 100) / 100,
        fg: `rgb(${fg.slice(0, 3).map(Math.round)})`,
        bg: `rgb(${bg.slice(0, 3).map(Math.round)})`,
        where: (el.className && typeof el.className === 'string' ? el.className : el.tagName).slice(0, 90),
      });
    }
  }
  return found;
}

const { browser, close } = await launch({ start_tab: 'home', stage_last_scene: '' });
const failures = [];
try {
  await browser.$('[data-home]').waitForDisplayed({ timeout: 30_000 });
  await browser.setWindowSize(1400, 900);
  for (const theme of THEMES) {
    for (const mode of MODES) {
      await browser.execute((t, m) => {
        document.documentElement.dataset.theme = t;
        document.documentElement.dataset.colorMode = m;
      }, theme, mode);
      for (const [view, key] of VIEWS) {
        await browser.execute((k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: String(k), ctrlKey: true })), key);
        await browser.pause(700);
        const found = await browser.execute(lowContrast);
        for (const f of found) failures.push({ theme, mode, view, ...f });
        if (view === 'Geschichten' || view === 'Charaktere') {
          await browser.saveScreenshot(path.join(screenshotDir, `contrast-${theme}-${mode}-${view === 'Geschichten' ? 'stories' : 'characters'}.png`));
        }
      }
      const count = failures.filter((f) => f.theme === theme && f.mode === mode).length;
      console.log(`${theme}/${mode}: ${count} Texte unter WCAG AA`);
    }
  }
} finally {
  await close();
}
// Same text style in the same colours counts once.
const unique = new Map();
for (const f of failures) {
  const key = `${f.theme}/${f.mode} ${f.fg} on ${f.bg} ${f.where}`;
  if (!unique.has(key)) unique.set(key, f);
}
for (const f of [...unique.values()].sort((a, b) => a.ratio - b.ratio).slice(0, 80)) {
  console.log(`${f.ratio.toFixed(2)}  ${f.theme}/${f.mode}  ${f.view}  „${f.text}“  ${f.fg} auf ${f.bg}  [${f.where}]`);
}
assert.equal(unique.size, 0, `${unique.size} Textstile unter WCAG AA`);
console.log('Kontrast: alle Themes hell und dunkel ohne Befund.');
