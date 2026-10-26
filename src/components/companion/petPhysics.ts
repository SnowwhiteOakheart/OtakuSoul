/**
 * Desktop physics of the pet: the pet window is the body (top-left corner, physical pixels),
 * the floor is the bottom of the monitor's work area (above the taskbar / dock), the walls are
 * its sides. Speeds are in logical pixels and scaled to the monitor.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Body {
  x: number;
  y: number;
  /** Falling speed, physical px/s (down positive). */
  vy: number;
}

export interface StepResult {
  body: Body;
  /** Standing on the floor after this step. */
  grounded: boolean;
  /** Touched the floor in this step after falling. */
  landed: boolean;
  /** Ran into a side wall: -1 left, 1 right, 0 none. */
  wall: -1 | 0 | 1;
}

/** Logical px/s². */
export const GRAVITY = 2600;
/** Logical px/s; the walk is a stroll, not a run. */
export const WALK_SPEED = 55;
/** Fastest fall, logical px/s. */
const MAX_FALL = 2400;
/**
 * Share of the window that may stand outside the work area at the sides: the figure is
 * narrower than its window and should reach the screen edge.
 */
const SIDE_OVERHANG = 0.3;

/** The floor (window top when the feet are on it) and the side limits for a window of `size`. */
export function bounds(size: { width: number; height: number }, area: Rect) {
  const overhang = size.width * SIDE_OVERHANG;
  return {
    floor: area.y + area.height - size.height,
    minX: area.x - overhang,
    maxX: area.x + area.width - size.width + overhang,
  };
}

/** Advances the body by `dt` seconds; `walk` is the walking direction (0 = stand). */
export function stepBody(
  body: Body,
  size: { width: number; height: number },
  area: Rect,
  dt: number,
  walk: -1 | 0 | 1,
  scale: number,
): StepResult {
  const { floor, minX, maxX } = bounds(size, area);
  let { x, y, vy } = body;
  let landed = false;

  if (y < floor - 0.5) {
    vy = Math.min(vy + GRAVITY * scale * dt, MAX_FALL * scale);
    y += vy * dt;
    if (y >= floor) {
      y = floor;
      vy = 0;
      landed = true;
    }
  } else {
    // On the floor, or below it (taskbar moved, other monitor): stand on it.
    y = floor;
    vy = 0;
  }
  const grounded = y >= floor - 0.5;

  if (grounded && walk !== 0) x += walk * WALK_SPEED * scale * dt;
  let wall: -1 | 0 | 1 = 0;
  if (x < minX) {
    x = minX;
    wall = -1;
  } else if (x > maxX) {
    x = maxX;
    wall = 1;
  }
  return { body: { x, y, vy }, grounded, landed, wall };
}
