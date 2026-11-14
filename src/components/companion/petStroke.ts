/**
 * Detects stroking: the pointer wiggles back and forth (or circles) over the figure without a
 * button pressed. Pure and time-injected so it can be tested; `DesktopPet` feeds it the hover
 * moves and turns a hit into a pat of the zone under the pointer.
 */

/** Smallest swing (px) that counts as one stroke direction. */
const MIN_SWING_PX = 36;
/** This many direction changes within the window make a stroke. */
const TURNS_NEEDED = 3;
/** Window in which the turns must happen. */
const WINDOW_MS = 1600;
/** Pause after a stroke before the next one can be detected. */
const COOLDOWN_MS = 2500;
/** Samples older than this are forgotten (pointer left and came back). */
const IDLE_RESET_MS = 500;

interface Turn {
  t: number;
}

export class StrokeDetector {
  private turns: Turn[] = [];
  private lastT = Number.NEGATIVE_INFINITY;
  private coolUntil = Number.NEGATIVE_INFINITY;
  /** Direction of the current swing along x (-1/1), 0 = unknown. */
  private dir: -1 | 0 | 1 = 0;
  /** Extreme point of the current swing (where the last turn happened). */
  private anchor = 0;
  /** Same along y, so a vertical or circular stroke also counts. */
  private dirY: -1 | 0 | 1 = 0;
  private anchorY = 0;
  private turnsY: Turn[] = [];

  /** Forgets the running stroke (pointer left the figure). */
  reset() {
    this.turns = [];
    this.turnsY = [];
    this.dir = 0;
    this.dirY = 0;
  }

  /** A hover move to (`x`,`y`) at `now`; true when this move completes a stroke. */
  move(x: number, y: number, now: number): boolean {
    if (now - this.lastT > IDLE_RESET_MS) {
      this.reset();
      this.anchor = x;
      this.anchorY = y;
    }
    this.lastT = now;
    if (now < this.coolUntil) {
      this.anchor = x;
      this.anchorY = y;
      return false;
    }
    this.turns = this.axis(x, 'x', now);
    this.turnsY = this.axis(y, 'y', now);
    // Wiggling needs all turns on one axis; a circle gives a few on each, so the sum counts too.
    const total = this.turns.length + this.turnsY.length;
    if (this.turns.length >= TURNS_NEEDED || this.turnsY.length >= TURNS_NEEDED || total >= TURNS_NEEDED + 2) {
      this.coolUntil = now + COOLDOWN_MS;
      this.reset();
      this.anchor = x;
      this.anchorY = y;
      return true;
    }
    return false;
  }

  private axis(v: number, which: 'x' | 'y', now: number): Turn[] {
    const isX = which === 'x';
    const dir = isX ? this.dir : this.dirY;
    const anchor = isX ? this.anchor : this.anchorY;
    const list = (isX ? this.turns : this.turnsY).filter((turn) => now - turn.t <= WINDOW_MS);
    const delta = v - anchor;
    let nextDir = dir;
    let nextAnchor = anchor;
    if (dir === 0) {
      if (Math.abs(delta) >= MIN_SWING_PX) {
        nextDir = delta > 0 ? 1 : -1;
        nextAnchor = v;
      }
    } else if ((delta > 0 ? 1 : -1) === dir) {
      // Still going the same way: the extreme moves along.
      nextAnchor = v;
    } else if (Math.abs(delta) >= MIN_SWING_PX) {
      nextDir = dir === 1 ? -1 : 1;
      nextAnchor = v;
      list.push({ t: now });
    }
    if (isX) {
      this.dir = nextDir;
      this.anchor = nextAnchor;
    } else {
      this.dirY = nextDir;
      this.anchorY = nextAnchor;
    }
    return list;
  }
}
