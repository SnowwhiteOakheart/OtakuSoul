/**
 * Geometry of the pet's radial menu: rings around the figure, the directions that stay on the
 * screen (a fan near a screen edge) and the slices of the main ring and the sub arc.
 *
 * Angles are radians, 0 points up and they grow clockwise (like a clock), so the first item
 * sits above the figure's head.
 */

/** Radii (logical px) around the centre (`cx`, `cy`, window coordinates). */
export interface RadialRings {
  cx: number;
  cy: number;
  /** Main ring: inner and outer radius. */
  r0: number;
  r1: number;
  /** Sub arc of the chosen item: inner and outer radius. */
  r2: number;
  r3: number;
}

/** Part of the window (logical px, window coordinates) that is on the screen. */
export interface VisibleBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Directions free for the menu: from `start` clockwise over `span`; `full` is the whole circle. */
export interface OpenArc {
  start: number;
  span: number;
  full: boolean;
}

export interface Slice {
  a0: number;
  a1: number;
  mid: number;
}

const TAU = Math.PI * 2;
/** The sub arc ends at most this far from the window's edge (px). */
const EDGE_MARGIN = 4;
/** Largest outer radius (px): on a tall pet the ring stays at hand. */
export const RADIAL_MAX_RADIUS = 200;
/** Smallest inner radius (px); a smaller pet gets the native menu instead. */
const MIN_INNER_RADIUS = 20;
/** Gap between the main ring and the sub arc (px). */
const RING_GAP = 5;
/** A fan narrower than this (radians) is too cramped for the menu. */
export const MIN_OPEN_SPAN = Math.PI * 0.75;
/** Sampled directions when looking for the free part of the circle. */
const ARC_SAMPLES = 180;

const clampTo = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A point at radius `r` in direction `a` around (`cx`, `cy`). */
export function polar(cx: number, cy: number, r: number, a: number): { x: number; y: number } {
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

/**
 * The rings for a window `height` high, centred at `cx` (the figure's middle) and halfway up.
 * Null when the pet is too small for a legible ring.
 */
export function radialRings(height: number, cx: number): RadialRings | null {
  const r3 = Math.min(height / 2 - EDGE_MARGIN, RADIAL_MAX_RADIUS);
  const band = clampTo(r3 * 0.27, 28, 50);
  const r2 = r3 - band;
  const r1 = r2 - RING_GAP;
  const r0 = r1 - band;
  if (r0 < MIN_INNER_RADIUS) return null;
  return { cx, cy: height / 2, r0, r1, r2, r3 };
}

/** Width (logical px) the window needs for the whole circle of the rings. */
export const radialWidth = (rings: RadialRings) => Math.ceil(2 * (rings.r3 + EDGE_MARGIN));

/** Normalises an angle to [0, 2π). */
export const wrapAngle = (a: number) => ((a % TAU) + TAU) % TAU;

/**
 * The longest run of directions whose outer points stay within `visible`: the whole circle in
 * the middle of a screen, a fan facing inwards at its edge. Null when nothing fits.
 */
export function openArc(rings: RadialRings, visible: VisibleBox): OpenArc | null {
  const step = TAU / ARC_SAMPLES;
  const fits = Array.from({ length: ARC_SAMPLES }, (_, i) => {
    const { x, y } = polar(rings.cx, rings.cy, rings.r3, i * step);
    return x >= visible.left && x <= visible.right && y >= visible.top && y <= visible.bottom;
  });
  if (fits.every(Boolean)) return { start: 0, span: TAU, full: true };
  if (!fits.some(Boolean)) return null;
  // Longest circular run: start counting right after a direction that does not fit.
  const first = fits.indexOf(false);
  let best = { from: 0, length: 0 };
  let run = { from: 0, length: 0 };
  for (let k = 1; k <= ARC_SAMPLES; k += 1) {
    const i = (first + k) % ARC_SAMPLES;
    if (fits[i]) {
      if (run.length === 0) run = { from: i, length: 0 };
      run.length += 1;
      if (run.length > best.length) best = { ...run };
    } else {
      run = { from: 0, length: 0 };
    }
  }
  // The run's outer samples are the last ones that fit; the slices stay inside them.
  return { start: best.from * step, span: Math.max(0, best.length - 1) * step, full: false };
}

/** Slices of the main ring: around the circle with the first on top, or spread over the fan. */
export function mainSlices(count: number, arc: OpenArc): Slice[] {
  if (count <= 0) return [];
  const each = arc.span / count;
  const start = arc.full ? -each / 2 : arc.start;
  return Array.from({ length: count }, (_, i) => {
    const a0 = start + i * each;
    return { a0, a1: a0 + each, mid: a0 + each / 2 };
  });
}

/**
 * Slices of the sub arc for `count` items around the chosen item's direction `around`: each
 * about as wide as the ring is deep, fewer degrees when they would not fit, kept inside a fan.
 */
export function subSlices(count: number, around: number, rings: RadialRings, arc: OpenArc): Slice[] {
  if (count <= 0) return [];
  const middle = (rings.r2 + rings.r3) / 2;
  const room = arc.full ? TAU * 0.92 : arc.span;
  const each = Math.min((rings.r3 - rings.r2 + 6) / middle, room / count);
  const total = each * count;
  let start = around - total / 2;
  if (!arc.full) {
    // Measured from the fan's start (the item lies in the fan), so a fan crossing "up" (0) works the same.
    const along = wrapAngle(around - arc.start);
    start = arc.start + clampTo(along - total / 2, 0, arc.span - total);
  }
  return Array.from({ length: count }, (_, i) => {
    const a0 = start + i * each;
    return { a0, a1: a0 + each, mid: a0 + each / 2 };
  });
}

/** SVG path of a ring segment from `a0` to `a1` between the radii, `pad` px apart from its neighbours. */
export function slicePath(cx: number, cy: number, rIn: number, rOut: number, a0: number, a1: number, pad = 2): string {
  const outerPad = pad / rOut;
  const innerPad = pad / rIn;
  const o0 = polar(cx, cy, rOut, a0 + outerPad);
  const o1 = polar(cx, cy, rOut, a1 - outerPad);
  const i1 = polar(cx, cy, rIn, a1 - innerPad);
  const i0 = polar(cx, cy, rIn, a0 + innerPad);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const f = (n: number) => n.toFixed(2);
  return (
    `M${f(o0.x)} ${f(o0.y)}A${f(rOut)} ${f(rOut)} 0 ${large} 1 ${f(o1.x)} ${f(o1.y)}` +
    `L${f(i1.x)} ${f(i1.y)}A${f(rIn)} ${f(rIn)} 0 ${large} 0 ${f(i0.x)} ${f(i0.y)}Z`
  );
}
