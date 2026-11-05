import type { WebtoonPanel } from '../types/generated/WebtoonPanel';
import type { WebtoonScript } from '../types/generated/WebtoonScript';

/**
 * Draws a Stage act as a webtoon: one long picture column, one panel per line (the place behind
 * it, the speaker's mood portrait, a speech bubble; narration as a caption box). Long acts are
 * split into several pages, since browsers limit a canvas' height. Returns the pages as PNG data
 * URLs. The pictures come from the backend as `data:` URLs, so the canvas can be read back.
 */

export const WEBTOON_WIDTH = 800;
/** A page ends after the panel that crosses this height (canvases above ~16k px fail in WebKit). */
export const WEBTOON_PAGE_HEIGHT = 12_000;

const GUTTER = 28;
const MARGIN = 24;
const PANEL_MIN = 380;
/** A scene picture keeps its proportions within these heights. */
const PICTURE_MIN = 260;
const PICTURE_MAX = 1100;
const RADIUS = 18;
const FONT = '"Segoe UI", "Noto Sans", "Noto Sans CJK JP", "Hiragino Sans", system-ui, sans-serif';
const COLORS = {
  page: '#f5f2ee',
  panelBorder: '#1f2430',
  empty: ['#2b2f45', '#5b4a7a'] as const,
  caption: '#fff8e7',
  captionInk: '#2a2118',
  bubble: '#ffffff',
  bubbleInk: '#14161c',
  player: '#ede9fe',
  name: '#6d28d9',
  muted: '#6b7280',
};

export interface WebtoonLabels {
  thinks: string;
  whispers: string;
}

type Ctx = CanvasRenderingContext2D;

/** Text as shown: markdown marks gone, paragraphs kept. */
export const plainText = (text: string): string =>
  text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Wraps `text` to `width`; scripts without spaces (Japanese, Chinese) break between characters. */
export function wrapText(ctx: Pick<Ctx, 'measureText'>, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    // Words, or single characters for CJK runs, each with the space that follows it.
    const pieces = paragraph.match(/[　-鿿가-힯＀-￯]|[^\s　-鿿가-힯＀-￯]+\s*|\s+/g) ?? [];
    let line = '';
    for (const piece of pieces) {
      const next = line + piece;
      if (line && ctx.measureText(next.trimEnd()).width > width) {
        lines.push(line.trimEnd());
        line = piece.trimStart();
        // A single word wider than the line is cut by characters.
        while (ctx.measureText(line).width > width && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > width) cut--;
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      } else {
        line = next;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

const loadImage = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws `img` to fill the box (cropped like `object-fit: cover`, anchored at `anchorY`). */
function drawCover(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number, anchorY = 0.5) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) * anchorY, sw, sh, x, y, w, h);
}

interface Layout {
  panel: WebtoonPanel;
  lines: string[];
  height: number;
  font: string;
  bubbleWidth: number;
}

const TEXT_SIZE = 22;
const LINE = 30;
const PAD = 18;
/** Height of a bubble's tail below it. */
const TAIL = 44;

/** A scene picture on its own: full width, its own proportions, no text. */
function layoutPicture(panel: WebtoonPanel, picture: HTMLImageElement): Layout {
  const w = WEBTOON_WIDTH - 2 * MARGIN;
  const height = Math.round(Math.min(PICTURE_MAX, Math.max(PICTURE_MIN, (w * picture.height) / picture.width)));
  return { panel, lines: [], height, font: '', bubbleWidth: 0 };
}

function layoutPanel(ctx: Ctx, panel: WebtoonPanel, hasPortrait: boolean): Layout {
  const narrator = panel.voice === 'narrator' || panel.voice === 'system';
  const italic = panel.mode === 'think' || panel.mode === 'do';
  const font = `${italic ? 'italic ' : ''}${TEXT_SIZE}px ${FONT}`;
  const inner = WEBTOON_WIDTH - 2 * MARGIN;
  const bubbleWidth = narrator ? inner - 2 * PAD : hasPortrait ? inner * 0.58 : inner * 0.72;
  ctx.font = font;
  const lines = wrapText(ctx, plainText(panel.text), bubbleWidth - 2 * PAD);
  const textHeight = lines.length * LINE + 2 * PAD + (narrator ? 0 : 26);
  const height = Math.max(PANEL_MIN, textHeight + 2 * PAD + TAIL + 10);
  return { panel, lines, height, font, bubbleWidth };
}

function drawTitle(ctx: Ctx, script: WebtoonScript, y: number): number {
  ctx.fillStyle = COLORS.captionInk;
  ctx.textBaseline = 'top';
  ctx.font = `700 40px ${FONT}`;
  const title = wrapText(ctx, script.title, WEBTOON_WIDTH - 2 * MARGIN);
  for (const line of title) {
    ctx.fillText(line, MARGIN, y);
    y += 50;
  }
  if (script.subtitle) {
    ctx.font = `italic 20px ${FONT}`;
    ctx.fillStyle = COLORS.muted;
    for (const line of wrapText(ctx, plainText(script.subtitle), WEBTOON_WIDTH - 2 * MARGIN).slice(0, 6)) {
      ctx.fillText(line, MARGIN, y + 6);
      y += 28;
    }
  }
  return y + GUTTER;
}

const titleHeight = (ctx: Ctx, script: WebtoonScript): number => {
  ctx.font = `700 40px ${FONT}`;
  const t = wrapText(ctx, script.title, WEBTOON_WIDTH - 2 * MARGIN).length * 50;
  ctx.font = `italic 20px ${FONT}`;
  const s = script.subtitle
    ? Math.min(6, wrapText(ctx, plainText(script.subtitle), WEBTOON_WIDTH - 2 * MARGIN).length) * 28 + 6
    : 0;
  return MARGIN + t + s + GUTTER;
};

function drawPanel(
  ctx: Ctx,
  layout: Layout,
  y: number,
  bg: HTMLImageElement | null,
  portrait: HTMLImageElement | null,
  labels: WebtoonLabels,
) {
  const { panel, lines, height, font, bubbleWidth } = layout;
  const x = MARGIN;
  const w = WEBTOON_WIDTH - 2 * MARGIN;

  if (panel.voice === 'picture') {
    ctx.save();
    roundRect(ctx, x, y, w, height, RADIUS);
    ctx.clip();
    if (bg) drawCover(ctx, bg, x, y, w, height);
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.panelBorder;
    roundRect(ctx, x, y, w, height, RADIUS);
    ctx.stroke();
    return;
  }

  // The frame with the place behind the line.
  ctx.save();
  roundRect(ctx, x, y, w, height, RADIUS);
  ctx.clip();
  if (bg) {
    drawCover(ctx, bg, x, y, w, height);
  } else {
    const gradient = ctx.createLinearGradient(x, y, x + w, y + height);
    gradient.addColorStop(0, COLORS.empty[0]);
    gradient.addColorStop(1, COLORS.empty[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, w, height);
  }
  // A soft shade at the bottom keeps the figure and the bubbles readable.
  const shade = ctx.createLinearGradient(0, y + height * 0.45, 0, y + height);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = shade;
  ctx.fillRect(x, y, w, height);
  if (portrait) {
    // The speaker stands in the lower left, cut at the frame like in a comic.
    const ph = height * 0.92;
    const pw = Math.min(w * 0.42, (portrait.width / portrait.height) * ph);
    drawCover(ctx, portrait, x + 8, y + height - ph, pw, ph, 0.15);
  }
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.panelBorder;
  roundRect(ctx, x, y, w, height, RADIUS);
  ctx.stroke();

  const narrator = panel.voice === 'narrator' || panel.voice === 'system';
  const textHeight = lines.length * LINE + 2 * PAD + (narrator ? 0 : 26);
  let bx: number;
  let by: number;
  if (narrator) {
    bx = x + PAD;
    by = y + PAD;
  } else if (panel.voice === 'player') {
    bx = x + w - bubbleWidth - PAD;
    // Room below for the tail (or the thought dots), which must stay inside the frame.
    by = y + height - textHeight - PAD - TAIL;
  } else {
    bx = portrait ? x + w - bubbleWidth - PAD : x + PAD;
    by = y + PAD + 10;
  }

  // Caption box, speech bubble, thought cloud or whisper (dashed).
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = narrator ? COLORS.caption : panel.voice === 'player' ? COLORS.player : COLORS.bubble;
  roundRect(ctx, bx, by, bubbleWidth, textHeight, narrator ? 6 : 26);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.setLineDash(panel.mode === 'whisper' ? [8, 6] : []);
  roundRect(ctx, bx, by, bubbleWidth, textHeight, narrator ? 6 : 26);
  ctx.stroke();
  ctx.setLineDash([]);
  if (!narrator) {
    // The tail points to the speaker: down-left to the portrait, down-right for the player.
    ctx.fillStyle = panel.voice === 'player' ? COLORS.player : COLORS.bubble;
    ctx.beginPath();
    const tx = panel.voice === 'player' ? bx + bubbleWidth - 60 : bx + 40;
    const tipX = panel.voice === 'player' ? tx + 30 : tx - 34;
    if (panel.mode === 'think') {
      for (const [dx, dy, r] of [[0, 18, 9], [-14, 36, 6]] as const) {
        ctx.beginPath();
        ctx.arc(tx + (panel.voice === 'player' ? -dx : dx), by + textHeight + dy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      ctx.moveTo(tx - 14, by + textHeight - 2);
      ctx.lineTo(tipX, by + textHeight + 30);
      ctx.lineTo(tx + 14, by + textHeight - 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(tx - 14, by + textHeight);
      ctx.lineTo(tipX, by + textHeight + 30);
      ctx.lineTo(tx + 14, by + textHeight);
      ctx.stroke();
    }
  }

  ctx.textBaseline = 'top';
  let ty = by + PAD;
  if (!narrator) {
    const tag = panel.mode === 'think' ? labels.thinks : panel.mode === 'whisper' ? labels.whispers : '';
    ctx.font = `700 17px ${FONT}`;
    ctx.fillStyle = COLORS.name;
    ctx.fillText(tag ? `${panel.speaker} · ${tag}` : panel.speaker, bx + PAD, ty);
    ty += 26;
  }
  ctx.font = font;
  ctx.fillStyle = narrator ? COLORS.captionInk : COLORS.bubbleInk;
  for (const line of lines) {
    ctx.fillText(line, bx + PAD, ty);
    ty += LINE;
  }
}

/** The pages of the webtoon as PNG data URLs. */
export async function renderWebtoon(script: WebtoonScript, labels: WebtoonLabels): Promise<string[]> {
  const images = await Promise.all(script.images.map(loadImage));
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('canvas');
  const layouts = script.panels.flatMap((panel) => {
    if (panel.voice !== 'picture') {
      return [layoutPanel(measure, panel, panel.portrait != null && !!images[panel.portrait])];
    }
    // A scene picture that did not load leaves no empty frame behind.
    const picture = panel.bg != null ? images[panel.bg] : null;
    return picture ? [layoutPicture(panel, picture)] : [];
  });

  // Pages: whole panels, the title on the first, the footer on the last.
  const pages: Layout[][] = [];
  let current: Layout[] = [];
  pages.push(current);
  let height = titleHeight(measure, script);
  for (const layout of layouts) {
    if (height + layout.height > WEBTOON_PAGE_HEIGHT && current.length > 0) {
      current = [];
      pages.push(current);
      height = MARGIN;
    }
    current.push(layout);
    height += layout.height + GUTTER;
  }

  const out: string[] = [];
  for (const [index, page] of pages.entries()) {
    const first = index === 0;
    const last = index === pages.length - 1;
    const canvas = document.createElement('canvas');
    canvas.width = WEBTOON_WIDTH;
    canvas.height =
      (first ? titleHeight(measure, script) : MARGIN) +
      page.reduce((sum, l) => sum + l.height + GUTTER, 0) +
      (last ? 60 : 0);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.fillStyle = COLORS.page;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let y = first ? drawTitle(ctx, script, MARGIN) : MARGIN;
    for (const layout of page) {
      const { panel } = layout;
      drawPanel(
        ctx,
        layout,
        y,
        panel.bg != null ? (images[panel.bg] ?? null) : null,
        panel.portrait != null ? (images[panel.portrait] ?? null) : null,
        labels,
      );
      y += layout.height + GUTTER;
    }
    if (last) {
      ctx.font = `15px ${FONT}`;
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'center';
      ctx.fillText(script.footer, WEBTOON_WIDTH / 2, y + 10);
      ctx.textAlign = 'start';
    }
    out.push(canvas.toDataURL('image/png'));
  }
  return out;
}
