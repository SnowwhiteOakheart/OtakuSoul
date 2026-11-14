import { PET_FOODS, type PetFood } from './petFood';

/**
 * What the desktop pet remembers of the user, per character: a quiet bond that grows with time
 * spent together and with care (pats, meals, high fives, finished pomodoros), its meals (likes,
 * dislikes, the same thing again) and when it last ate and played. Hunger and boredom come from
 * these times; they only ever make the figure hint, never sad or worse off.
 *
 * Pure and time-injected (wall clock in ms, the date for the day count); the state lives in the
 * shared webview storage, so the main window could read it too.
 */
export interface PetBondState {
  /** Bond points so far (never drop). */
  points: number;
  /** The last day counted (local `YYYY-MM-DD`) and how many days together so far. */
  day: string;
  days: number;
  /** Points from care on that day (capped, see `DAILY_CARE_CAP`). */
  dayPoints: number;
  /** Wall-clock ms of the last meal and the last play (pat, high five, chase …); 0 = never. */
  lastMealAt: number;
  lastPlayAt: number;
  /** Meals per food, and the last few (newest last). */
  meals: Partial<Record<PetFood['id'], number>>;
  recent: PetFood['id'][];
}

export type BondCare = 'pat' | 'feed' | 'favorite' | 'highFive' | 'holdHand' | 'play' | 'pomodoro';

/** Points per kind of care. */
const CARE_POINTS: Record<BondCare, number> = {
  pat: 2,
  feed: 4,
  favorite: 7,
  highFive: 2,
  holdHand: 3,
  play: 3,
  pomodoro: 6,
};
/** A new day together (the first time the pet sees the user that day). */
export const NEW_DAY_POINTS = 10;
/** Care counts at most this much per day: petting all afternoon is lovely, but no shortcut. */
export const DAILY_CARE_CAP = 60;
/** Points at which the next level starts (level 0 … 5). */
export const BOND_LEVELS = [0, 40, 120, 280, 550, 1000] as const;
export const MAX_BOND_LEVEL = BOND_LEVELS.length - 1;
/** From this level on it comes over to the user now and then by itself. */
export const VISIT_LEVEL = 3;
/** From this level on a pat on the head sends little hearts up. */
export const HEARTS_LEVEL = 4;

/** Hungry (1) this long after the last meal; it starts hinting at about half of it. */
export const HUNGER_MS = 5 * 60 * 60_000;
/** Bored (1) this long without play while the user is around. */
export const BOREDOM_MS = 45 * 60_000;
/** It hints at hunger or boredom from this level on … */
export const NEED_HINT = 0.6;
/** … and not more often than this (ms, random within). */
export const NEED_HINT_GAP_MS: [number, number] = [12 * 60_000, 22 * 60_000];
/** The same food this many times in a row: "again?". */
const SAME_FOOD_RUN = 3;

export const emptyBond = (): PetBondState => ({
  points: 0,
  day: '',
  days: 0,
  dayPoints: 0,
  lastMealAt: 0,
  lastPlayAt: 0,
  meals: {},
  recent: [],
});

/** Local calendar day of a time (ms). */
export function dayOf(now: number): string {
  const date = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole days between two `YYYY-MM-DD` days (0 when one is unknown). */
export function daysBetween(from: string, to: string): number {
  if (!from || !to) return 0;
  const ms = Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`);
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : 0;
}

export function bondLevel(points: number): number {
  let level = 0;
  for (let i = 0; i < BOND_LEVELS.length; i++) if (points >= BOND_LEVELS[i]!) level = i;
  return level;
}

/** Level, and how far into it (0…1; 1 at the top level). */
export function bondProgress(points: number): { level: number; share: number } {
  const level = bondLevel(points);
  if (level >= MAX_BOND_LEVEL) return { level, share: 1 };
  const from = BOND_LEVELS[level]!;
  const to = BOND_LEVELS[level + 1]!;
  return { level, share: Math.min(1, Math.max(0, (points - from) / (to - from))) };
}

/** A day passed since the last visit: the day's care cap starts over. */
function rollDay(state: PetBondState, now: number): PetBondState {
  const today = dayOf(now);
  return state.day === today ? state : { ...state, dayPoints: 0 };
}

/** Points added to the bond; `levelUp` is the new level when it rose. */
function addPoints(state: PetBondState, points: number): { state: PetBondState; levelUp: number | null } {
  const before = bondLevel(state.points);
  const next = { ...state, points: state.points + points };
  const after = bondLevel(next.points);
  return { state: next, levelUp: after > before ? after : null };
}

/**
 * The user is here (the pet opened, came back from the lock screen …): a new day together
 * counts once. `away` is the number of days since the last one (0 the same day; for the greeting).
 */
export function visit(
  state: PetBondState,
  now: number,
): { state: PetBondState; newDay: boolean; away: number; levelUp: number | null } {
  const today = dayOf(now);
  if (state.day === today) return { state, newDay: false, away: 0, levelUp: null };
  const away = daysBetween(state.day, today);
  const counted = { ...state, day: today, days: state.days + 1, dayPoints: 0 };
  const { state: next, levelUp } = addPoints(counted, NEW_DAY_POINTS);
  return { state: next, newDay: true, away, levelUp };
}

/** Care given: points (within the day's cap) and the times hunger and boredom count from. */
export function care(state: PetBondState, kind: BondCare, now: number): { state: PetBondState; levelUp: number | null } {
  const rolled = rollDay(state, now);
  const room = Math.max(0, DAILY_CARE_CAP - rolled.dayPoints);
  const points = Math.min(room, CARE_POINTS[kind]);
  const timed: PetBondState = {
    ...rolled,
    dayPoints: rolled.dayPoints + points,
    lastPlayAt: kind === 'feed' || kind === 'favorite' ? rolled.lastPlayAt : now,
    lastMealAt: kind === 'feed' || kind === 'favorite' ? now : rolled.lastMealAt,
  };
  return addPoints(timed, points);
}

/** How a food goes down with this character. */
export type Taste = 'favorite' | 'disliked' | 'again' | 'fine';

/** A small stable number from a text (the character's id): its tastes stay the same. */
function seedOf(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** The character's favourite and least liked food (fixed per character, never the same one). */
export function tastes(characterKey: string): { favorite: PetFood['id']; disliked: PetFood['id'] } {
  const seed = seedOf(characterKey || 'pet');
  const favorite = PET_FOODS[seed % PET_FOODS.length]!.id;
  const others = PET_FOODS.filter((food) => food.id !== favorite);
  const disliked = others[Math.floor(seed / PET_FOODS.length) % others.length]!.id;
  return { favorite, disliked };
}

/** How this meal goes down: the same food over and over is "again?", else its taste. */
export function tasteOf(state: PetBondState, characterKey: string, food: PetFood['id']): Taste {
  const run = state.recent.slice(-(SAME_FOOD_RUN - 1));
  if (run.length === SAME_FOOD_RUN - 1 && run.every((id) => id === food)) return 'again';
  const { favorite, disliked } = tastes(characterKey);
  if (food === favorite) return 'favorite';
  if (food === disliked) return 'disliked';
  return 'fine';
}

/** A meal eaten: counted, remembered, and care (more for its favourite). */
export function eatMeal(
  state: PetBondState,
  characterKey: string,
  food: PetFood['id'],
  now: number,
): { state: PetBondState; taste: Taste; levelUp: number | null } {
  const taste = tasteOf(state, characterKey, food);
  const counted: PetBondState = {
    ...state,
    meals: { ...state.meals, [food]: (state.meals[food] ?? 0) + 1 },
    recent: [...state.recent, food].slice(-5),
  };
  const { state: next, levelUp } = care(counted, taste === 'favorite' ? 'favorite' : 'feed', now);
  return { state: next, taste, levelUp };
}

/** Whether the user has found out its favourite (fed it at least once): the menu marks it then. */
export const knownFavorite = (state: PetBondState, characterKey: string): PetFood['id'] | null => {
  const { favorite } = tastes(characterKey);
  return (state.meals[favorite] ?? 0) > 0 ? favorite : null;
};

/**
 * Hunger and boredom (0…1). Hunger counts from the last meal (a pet never fed counts from when
 * it first came, `since`); it stops at 1, so a long time away is only "hungry", nothing worse.
 * Boredom counts only while the user is around (`since`: when this visit began).
 */
export function needs(state: PetBondState, now: number, since: number): { hunger: number; boredom: number } {
  const fed = state.lastMealAt || since;
  const played = Math.max(state.lastPlayAt, since);
  return {
    hunger: Math.min(1, Math.max(0, (now - fed) / HUNGER_MS)),
    boredom: Math.min(1, Math.max(0, (now - played) / BOREDOM_MS)),
  };
}

const KEY_PREFIX = 'otakusoul.desktopPetBond.';

/** The remembered bond with this character (an empty one when there is none or it is unreadable). */
export function loadBond(characterKey: string): PetBondState {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY_PREFIX + characterKey) ?? 'null') as Partial<PetBondState> | null;
    if (!stored || typeof stored !== 'object') return emptyBond();
    const empty = emptyBond();
    const num = (value: unknown, fallback: number) =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
    const ids = new Set(PET_FOODS.map((food) => food.id));
    const meals: PetBondState['meals'] = {};
    for (const [id, count] of Object.entries(stored.meals ?? {})) {
      if (ids.has(id as PetFood['id'])) meals[id as PetFood['id']] = num(count, 0);
    }
    return {
      points: num(stored.points, empty.points),
      day: typeof stored.day === 'string' ? stored.day : empty.day,
      days: num(stored.days, empty.days),
      dayPoints: num(stored.dayPoints, empty.dayPoints),
      lastMealAt: num(stored.lastMealAt, empty.lastMealAt),
      lastPlayAt: num(stored.lastPlayAt, empty.lastPlayAt),
      meals,
      recent: Array.isArray(stored.recent) ? stored.recent.filter((id) => ids.has(id)).slice(-5) : [],
    };
  } catch {
    return emptyBond();
  }
}

export function saveBond(characterKey: string, state: PetBondState) {
  if (!characterKey) return;
  try {
    localStorage.setItem(KEY_PREFIX + characterKey, JSON.stringify(state));
  } catch {
    // Only a convenience: the bond starts over next time.
  }
}
