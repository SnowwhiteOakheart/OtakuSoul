/**
 * Desktop physics of the pet: the pet window is the body (top-left corner, physical pixels),
 * the floor is the bottom of the monitor's work area (above the taskbar / dock), its sides are
 * walls. Top edges of other windows (`desktop_windows.rs`) are platforms: a falling pet lands on
 * the first one under its feet, walks along it and turns at its ends; when the window moves,
 * closes or gets covered there, the pet falls – or, with `ride`, moves along with the window.
 * Speeds are logical pixels, scaled to the monitor.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A walkable stretch of a window's top edge (physical px); one window may have several. */
export interface Platform {
  id: string;
  left: number;
  right: number;
  y: number;
}

export interface Body {
  x: number;
  y: number;
  /** Falling speed, physical px/s (down positive). */
  vy: number;
  /** Sideways speed in the air (a throw), physical px/s; gone once it lands. */
  vx?: number;
  /** The window it stands on; null = the floor or in the air. */
  support: string | null;
  /** That window's edge as last seen, to follow it when it moves (riding). */
  edge: { left: number; right: number; y: number } | null;
}

export interface StepResult {
  body: Body;
  /** Standing on the floor or a window after this step. */
  grounded: boolean;
  /** Touched ground in this step after falling. */
  landed: boolean;
  /** Ran into a wall or the end of a window: -1 left, 1 right, 0 none. */
  wall: -1 | 0 | 1;
}

type Size = { width: number; height: number };

/** Logical px/s². */
export const GRAVITY = 2600;
/** Logical px/s; the walk is a stroll, not a run. */
export const WALK_SPEED = 55;
/** Fastest fall, logical px/s. */
const MAX_FALL = 2400;
/** Fastest throw, logical px/s (a flick of the mouse should not shoot it off the screen). */
export const MAX_THROW = 2600;
/** Share of sideways speed lost per second in the air. */
const AIR_DRAG = 0.6;
/** Share of sideways speed kept when bouncing off a wall. */
const WALL_BOUNCE = 0.45;

/** Speed of a throw from the window's last moves (physical px and ms), clamped to MAX_THROW. */
export function throwVelocity(samples: { t: number; x: number; y: number }[], scale: number) {
  if (samples.length < 2) return { vx: 0, vy: 0 };
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const seconds = (last.t - first.t) / 1000;
  if (seconds <= 0) return { vx: 0, vy: 0 };
  const limit = MAX_THROW * scale;
  const clampSpeed = (v: number) => Math.max(-limit, Math.min(limit, v));
  return { vx: clampSpeed((last.x - first.x) / seconds), vy: clampSpeed((last.y - first.y) / seconds) };
}
/**
 * Share of the window that may stand outside the work area at the sides: the figure is
 * narrower than its window and should reach the screen edge.
 */
const SIDE_OVERHANG = 0.3;
/** A platform that moved more than this (physical px) is gone from under the feet. */
const SUPPORT_TOLERANCE = 2;
/**
 * Let go with the feet a little inside a title bar (logical px below its top edge) still lands
 * on it: nobody drops the figure exactly onto the edge.
 */
export const LANDING_GRACE = 28;
/**
 * A stretch of the same window counts as the moved edge when its width changed by at most this
 * (physical px); otherwise part of it got covered and the horizontal shift is unknown.
 */
const SAME_WIDTH = 4;

/** Monitors closer than this (physical px) count as side by side (rounding, small gaps). */
const MONITOR_GAP = 8;

/**
 * The area to walk in: floor and height from the monitor under the feet, walls only where no
 * other monitor continues to the side, so the figure walks over to the next screen.
 */
export function walkArea(monitors: Rect[], feetX: number, fallback: Rect): Rect {
  const under = monitors.find((m) => feetX >= m.x && feetX < m.x + m.width) ?? fallback;
  const beside = (a: Rect, b: Rect) => Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0;
  let left = under;
  let right = under;
  for (let guard = 0; guard < monitors.length; guard++) {
    const next = monitors.find((m) => m !== left && Math.abs(m.x + m.width - left.x) <= MONITOR_GAP && beside(m, under));
    if (!next) break;
    left = next;
  }
  for (let guard = 0; guard < monitors.length; guard++) {
    const next = monitors.find((m) => m !== right && Math.abs(m.x - (right.x + right.width)) <= MONITOR_GAP && beside(m, under));
    if (!next) break;
    right = next;
  }
  return { x: left.x, y: under.y, width: right.x + right.width - left.x, height: under.height };
}

/** The floor (window top when the feet are on it) and the side limits for a window of `size`. */
export function bounds(size: Size, area: Rect) {
  const overhang = size.width * SIDE_OVERHANG;
  return {
    floor: area.y + area.height - size.height,
    minX: area.x - overhang,
    maxX: area.x + area.width - size.width + overhang,
  };
}

/**
 * Platforms the pet fits on: inside the work area, with room for the whole figure above
 * (a maximised window's edge at the top of the screen is no place to stand).
 */
export function usablePlatforms(platforms: Platform[], size: Size, area: Rect): Platform[] {
  const bottom = area.y + area.height;
  return platforms.filter(
    (p) =>
      p.y - size.height >= area.y - size.height * 0.1 &&
      p.y < bottom - 4 &&
      p.right > area.x &&
      p.left < area.x + area.width &&
      p.right - p.left >= size.width * 0.25,
  );
}

/**
 * The window under the feet moved: the same window's edge with the figure shifted along, or
 * undefined when the feet would not be on it any more (closed, covered there, moved away).
 */
function movedEdge(
  usable: Platform[],
  support: string,
  edge: NonNullable<Body['edge']>,
  feetX: number,
): { platform: Platform; dx: number } | undefined {
  const width = edge.right - edge.left;
  return usable
    .filter((p) => p.id === support)
    .map((platform) => ({
      platform,
      dx: Math.abs(platform.right - platform.left - width) <= SAME_WIDTH ? platform.left - edge.left : 0,
    }))
    .find(({ platform, dx }) => feetX + dx >= platform.left && feetX + dx <= platform.right);
}

/** A jump that ends on a window's edge: launch speeds (physical px/s; up is negative `vy`). */
export interface JumpPlan {
  vx: number;
  vy: number;
  /** The window it lands on. */
  target: string;
}

/** Highest edge the figure jumps up to, lowest it jumps down to, widest gap it jumps over (logical px). */
export const JUMP_MAX_RISE = 240;
export const JUMP_MAX_DROP = 320;
export const JUMP_MAX_GAP = 320;
/** The jump clears the target edge by this much at its peak (logical px). */
const JUMP_CLEARANCE = 40;
/** Aims this far inside the target's ends (logical px, at most a quarter of its width). */
const JUMP_INSET = 40;
/** Step of the trial flight; the pet's physics runs at about this rate. */
const JUMP_SIM_DT = 0.033;
/** Air drag eats some of the sideways speed: try launching faster by these factors. */
const JUMP_BOOSTS = [1, 1.12, 1.25, 1.4, 1.6];
const JUMP_MAX_CANDIDATES = 3;

/**
 * A jump from where the figure stands to the edge of a nearby window – up (climbing), across or
 * down – found by flying trial jumps through `stepBody` itself, so what lands here lands there.
 * Null when it does not stand on something or no edge is in reach.
 */
export function planJump(
  body: Body,
  size: Size,
  area: Rect,
  scale: number,
  platforms: Platform[],
): JumpPlan | null {
  const { floor } = bounds(size, area);
  if (body.support === null && body.y < floor - 0.5) return null;
  const feetX = body.x + size.width / 2;
  const feetY = body.y + size.height;
  const gravity = GRAVITY * scale;
  const candidates = usablePlatforms(platforms, size, area)
    .filter((p) => p.id !== body.support)
    .map((p) => {
      const gap = feetX < p.left ? p.left - feetX : feetX > p.right ? feetX - p.right : 0;
      return { p, gap, rise: feetY - p.y };
    })
    .filter(({ gap, rise }) => gap <= JUMP_MAX_GAP * scale && rise <= JUMP_MAX_RISE * scale && rise >= -JUMP_MAX_DROP * scale)
    .sort((a, b) => a.gap + Math.abs(a.rise) * 0.5 - (b.gap + Math.abs(b.rise) * 0.5))
    .slice(0, JUMP_MAX_CANDIDATES);

  for (const { p, rise } of candidates) {
    const inset = Math.min(JUMP_INSET * scale, (p.right - p.left) / 4);
    const aim = Math.min(p.right - inset, Math.max(p.left + inset, feetX));
    const dx = aim - feetX;
    const peak = Math.max(rise, 0) + JUMP_CLEARANCE * scale;
    const vy = Math.sqrt(2 * gravity * peak);
    const flight = vy / gravity + Math.sqrt((2 * (peak - rise)) / gravity);
    for (const boost of dx === 0 ? [0] : JUMP_BOOSTS) {
      const vx = (dx / flight) * boost;
      let trial: Body = { ...body, vy: -vy, vx, support: null, edge: null };
      for (let t = 0; t < 4; t += JUMP_SIM_DT) {
        const result = stepBody(trial, size, area, JUMP_SIM_DT, 0, scale, platforms);
        trial = result.body;
        if (result.landed) {
          if (trial.support === p.id) return { vx, vy: -vy, target: p.id };
          break;
        }
      }
    }
  }
  return null;
}

/**
 * Advances the body by `dt` seconds; `walk` is the walking direction (0 = stand). With `ride`
 * the figure moves along with the window it stands on instead of falling off it.
 */
export function stepBody(
  body: Body,
  size: Size,
  area: Rect,
  dt: number,
  walk: -1 | 0 | 1,
  scale: number,
  platforms: Platform[] = [],
  ride = false,
): StepResult {
  const { floor, minX, maxX } = bounds(size, area);
  const usable = usablePlatforms(platforms, size, area);
  let { x, y, vy, support } = body;
  let vx = body.vx ?? 0;
  const { edge } = body;
  const feetX = () => x + size.width / 2;
  const feetY = y + size.height;
  let landed = false;

  // Still standing where it stood? A window that moved, closed or got covered there is gone.
  let standing: Platform | undefined;
  if (support !== null) {
    standing = usable.find(
      (p) => p.id === support && Math.abs(p.y - feetY) <= SUPPORT_TOLERANCE && feetX() >= p.left && feetX() <= p.right,
    );
    if (!standing && ride && edge) {
      const moved = movedEdge(usable, support, edge, feetX());
      if (moved) {
        x += moved.dx;
        standing = moved.platform;
      }
    }
    if (!standing) support = null;
  }

  if (standing) {
    y = standing.y - size.height;
    vy = 0;
  } else if (y < floor - 0.5 || vy < 0) {
    vy = Math.min(vy + GRAVITY * scale * dt, MAX_FALL * scale);
    // A throw carries on sideways, slowed by the air.
    x += vx * dt;
    vx *= Math.max(0, 1 - AIR_DRAG * dt);
    const nextFeet = feetY + vy * dt;
    // The highest platform passed in this step under the feet (or just above them, see LANDING_GRACE).
    const grace = LANDING_GRACE * scale;
    const hit = usable
      .filter((p) => p.y >= feetY - grace && p.y <= nextFeet && feetX() >= p.left && feetX() <= p.right)
      .sort((a, b) => a.y - b.y)[0];
    if (hit) {
      y = hit.y - size.height;
      support = hit.id;
      standing = hit;
      vy = 0;
      vx = 0;
      landed = true;
    } else {
      y += vy * dt;
      if (y >= floor) {
        y = floor;
        vy = 0;
        vx = 0;
        landed = true;
      }
    }
  } else {
    // On the floor, or below it (taskbar moved, other monitor): stand on it.
    y = floor;
    vy = 0;
    vx = 0;
  }
  const grounded = !!standing || y >= floor - 0.5;

  if (grounded && walk !== 0) x += walk * WALK_SPEED * scale * dt;
  let wall: -1 | 0 | 1 = 0;
  // On a window its ends are walls too: the figure walks back instead of off it.
  const left = standing ? Math.max(minX, standing.left - size.width / 2) : minX;
  const right = standing ? Math.min(maxX, standing.right - size.width / 2) : maxX;
  if (x < left) {
    x = left;
    wall = -1;
    vx = Math.abs(vx) * WALL_BOUNCE;
  } else if (x > right) {
    x = right;
    wall = 1;
    vx = -Math.abs(vx) * WALL_BOUNCE;
  }
  const nextEdge = standing ? { left: standing.left, right: standing.right, y: standing.y } : null;
  return { body: { x, y, vy, vx, support, edge: nextEdge }, grounded, landed, wall };
}
