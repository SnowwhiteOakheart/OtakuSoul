import type { AtlasEdge, AtlasNode, MemoryAtlas } from '../types';

/** Beliefs: who the character is and how they see the relationship (top lane). */
export const BELIEF_KINDS = ['identity', 'habit', 'milestone', 'trust', 'tension', 'agenda'] as const;
/** Lanes from top to bottom; beliefs share the first. */
export const LANES = ['belief', 'memory', 'diary', 'intention'] as const;
export type Lane = (typeof LANES)[number];

export const laneOf = (node: AtlasNode): Lane =>
  (BELIEF_KINDS as readonly string[]).includes(node.kind) ? 'belief' : (node.kind as Lane);

/** Vertical centre of each lane in the drawing. */
export const LANE_Y: Record<Lane, number> = { belief: 44, memory: 150, diary: 236, intention: 304 };
export const ATLAS_HEIGHT = 340;
/** Distance between two points on the time axis, and the margin left and right. */
const STEP = 34;
const PAD = 28;
const MIN_WIDTH = 560;
/** Beliefs need room for their dot and do not overlap. */
const BELIEF_GAP = 30;
/** Date marks closer than this are skipped. */
const TICK_GAP = 90;

export interface AtlasPoint { x: number; y: number; r: number }
export interface AtlasLayout {
  width: number;
  height: number;
  points: Map<string, AtlasPoint>;
  /** Date marks on the time axis. */
  ticks: { x: number; label: string }[];
}

export const radiusOf = (node: AtlasNode): number =>
  laneOf(node) === 'belief' ? 9 : node.kind === 'memory' ? 4 + node.weight * 1.4 : 6;

/**
 * Places the atlas: experiences, diary entries and plans in order of time (each one step, so
 * busy days do not pile up), beliefs above the experiences that shaped them.
 */
export function layoutAtlas(atlas: MemoryAtlas, formatDate: (at: number) => string): AtlasLayout {
  const timed = atlas.nodes
    .filter((n) => laneOf(n) !== 'belief')
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0) || a.id.localeCompare(b.id));
  const width = Math.max(MIN_WIDTH, PAD * 2 + Math.max(0, timed.length - 1) * STEP);
  const points = new Map<string, AtlasPoint>();
  const ticks: AtlasLayout['ticks'] = [];
  let lastLabel = '';
  timed.forEach((node, index) => {
    const x = PAD + index * STEP;
    points.set(node.id, { x, y: LANE_Y[laneOf(node)], r: radiusOf(node) });
    const label = node.at != null ? formatDate(node.at) : '';
    if (label && label !== lastLabel && (ticks.length === 0 || x - ticks.at(-1)!.x >= TICK_GAP)) {
      ticks.push({ x, label });
    }
    lastLabel = label;
  });

  // A belief sits above the mean of what shaped it; unlinked ones fill the right end.
  const beliefs = atlas.nodes.filter((n) => laneOf(n) === 'belief');
  const wanted = beliefs.map((node, index) => {
    const linked = atlas.edges
      .filter((e) => e.to === node.id || e.from === node.id)
      .map((e) => points.get(e.to === node.id ? e.from : e.to)?.x)
      .filter((x): x is number => x !== undefined);
    const x = linked.length > 0
      ? linked.reduce((a, b) => a + b, 0) / linked.length
      : width - PAD - (beliefs.length - 1 - index) * BELIEF_GAP;
    return { node, x };
  });
  wanted.sort((a, b) => a.x - b.x);
  // Push apart left to right, then back from the right edge if they ran over.
  for (let i = 0; i < wanted.length; i++) {
    const min = i === 0 ? PAD : wanted[i - 1]!.x + BELIEF_GAP;
    wanted[i]!.x = Math.max(wanted[i]!.x, min);
  }
  for (let i = wanted.length - 1; i >= 0; i--) {
    const max = i === wanted.length - 1 ? width - PAD : wanted[i + 1]!.x - BELIEF_GAP;
    wanted[i]!.x = Math.min(wanted[i]!.x, max);
  }
  const beliefWidth = PAD * 2 + Math.max(0, wanted.length - 1) * BELIEF_GAP;
  const finalWidth = Math.max(width, beliefWidth);
  wanted.forEach(({ node, x }, i) => {
    // Too many beliefs for the width: lined up evenly instead.
    const placed = finalWidth > width ? PAD + i * BELIEF_GAP : x;
    points.set(node.id, { x: placed, y: LANE_Y.belief, r: radiusOf(node) });
  });
  return { width: finalWidth, height: ATLAS_HEIGHT, points, ticks };
}

/** The links of `id` and the points at their other end. */
export function neighbours(edges: AtlasEdge[], id: string): { edge: AtlasEdge; other: string }[] {
  return edges
    .filter((e) => e.from === id || e.to === id)
    .map((edge) => ({ edge, other: edge.from === id ? edge.to : edge.from }));
}

/** A gently curved line between two points (vertical tangents, so lanes stay readable). */
export function edgePath(a: AtlasPoint, b: AtlasPoint): string {
  // Within one lane (a newer version of a memory) the line arcs below the dots.
  if (a.y === b.y) return `M${a.x},${a.y} Q${(a.x + b.x) / 2},${a.y + 40} ${b.x},${b.y}`;
  const mid = (a.y + b.y) / 2;
  return `M${a.x},${a.y} C${a.x},${mid} ${b.x},${mid} ${b.x},${b.y}`;
}
