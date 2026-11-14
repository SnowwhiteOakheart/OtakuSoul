/**
 * Whether the user is at the computer, for the pet's greetings and its break reminder. Fed with
 * "the user did something now" (a key or mouse input the backend saw, see `pet_input_stamp`, or
 * the pointer moving); only times, never what was typed. Pure and time-injected (wall clock ms).
 */

/** Without any input this long the user counts as away; coming back after it is greeted. */
export const AWAY_AFTER_MS = 20 * 60_000;
/** A pause of this long ends a stretch of work (the break reminder starts counting anew). */
export const PAUSE_MS = 5 * 60_000;
/** Working this long without such a pause, the pet suggests a break … */
export const BREAK_AFTER_MS = 90 * 60_000;
/** … and again after this long if the user goes on. */
export const BREAK_AGAIN_MS = 30 * 60_000;

export class Presence {
  private lastActive: number;
  private workingSince: number;
  private lastReminder = Number.NEGATIVE_INFINITY;

  constructor(now: number) {
    this.lastActive = now;
    this.workingSince = now;
  }

  /**
   * The user did something at `now`. Returns how long they were away when that was long enough
   * to greet them (null otherwise).
   */
  active(now: number): number | null {
    const gap = now - this.lastActive;
    if (gap < 0) return null;
    this.lastActive = now;
    if (gap >= PAUSE_MS) {
      this.workingSince = now;
      this.lastReminder = Number.NEGATIVE_INFINITY;
    }
    return gap >= AWAY_AFTER_MS ? gap : null;
  }

  /** How long the user has been working without a pause (0 while they are away). */
  workedFor(now: number): number {
    return now - this.lastActive >= PAUSE_MS ? 0 : now - this.workingSince;
  }

  /** Time for a break suggestion now? Counts it as given when it says yes. */
  breakDue(now: number): boolean {
    const worked = this.workedFor(now);
    if (worked < BREAK_AFTER_MS || now - this.lastReminder < BREAK_AGAIN_MS) return false;
    this.lastReminder = now;
    return true;
  }

  /** The suggestion could not be shown now (the pet was busy): it may come again soon. */
  postpone(now: number) {
    this.lastReminder = now - BREAK_AGAIN_MS + 60_000;
  }
}

/** Which greeting fits: the first visit of a morning, after days away, a new day, or back after a while. */
export type Greeting = 'morning' | 'longAway' | 'newDay' | 'back';

/**
 * The greeting for a visit: `newDay` and `away` (days since the last) from the bond's day count,
 * `gap` how long the pet did not see the user (ms), `hour` the local hour.
 */
export function greetingFor(newDay: boolean, away: number, gap: number, hour: number): Greeting | null {
  if (newDay && away >= 2) return 'longAway';
  if (newDay && hour >= 5 && hour < 11) return 'morning';
  if (newDay) return 'newDay';
  return gap >= AWAY_AFTER_MS ? 'back' : null;
}

const SEEN_KEY = 'otakusoul.desktopPetSeen';

/** When the pet last saw the user (wall clock ms; 0 if never). */
export function loadSeen(): number {
  try {
    const value = Number(localStorage.getItem(SEEN_KEY) ?? 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function saveSeen(now: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(Math.round(now)));
  } catch {
    // Only a convenience: the next greeting may be a plain one.
  }
}
