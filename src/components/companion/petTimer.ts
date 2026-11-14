/**
 * The pet's alarm: a plain timer or a pomodoro (work, break, work …). Pure and time-injected;
 * the state lives in the shared webview storage so a timer survives closing the pet. `DesktopPet`
 * polls `advance` and lets the figure speak up when a phase ends.
 */
export type TimerPhase = 'timer' | 'work' | 'break';

export interface PetTimerState {
  phase: TimerPhase;
  /** Wall-clock end of the running phase (ms since epoch). */
  endsAt: number;
  /** Pomodoro: goes on with the next phase after this one. */
  pomodoro: boolean;
}

export const TIMER_PRESETS_MIN = [5, 15, 25, 45] as const;
export const POMODORO_WORK_MIN = 25;
export const POMODORO_BREAK_MIN = 5;

const KEY = 'otakusoul.desktopPetTimer';
const MIN_MS = 60_000;

export const startTimer = (minutes: number, now: number): PetTimerState => ({
  phase: 'timer',
  endsAt: now + minutes * MIN_MS,
  pomodoro: false,
});

export const startPomodoro = (now: number): PetTimerState => ({
  phase: 'work',
  endsAt: now + POMODORO_WORK_MIN * MIN_MS,
  pomodoro: true,
});

/**
 * Moves the timer to `now`: the phase that just ended (null while it runs) and the state that
 * goes on (null when finished). A pomodoro that ended long ago (app was closed) reports its last
 * phase once and starts the next one from now, not from the past.
 */
export function advance(
  state: PetTimerState | null,
  now: number,
): { state: PetTimerState | null; finished: TimerPhase | null } {
  if (!state || now < state.endsAt) return { state, finished: null };
  if (!state.pomodoro) return { state: null, finished: state.phase };
  const next: TimerPhase = state.phase === 'work' ? 'break' : 'work';
  const minutes = next === 'work' ? POMODORO_WORK_MIN : POMODORO_BREAK_MIN;
  return { state: { phase: next, endsAt: now + minutes * MIN_MS, pomodoro: true }, finished: state.phase };
}

/** Whole minutes left (at least 1 while it runs). */
export const minutesLeft = (state: PetTimerState, now: number) => Math.max(1, Math.ceil((state.endsAt - now) / MIN_MS));

export function loadTimer(): PetTimerState | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<PetTimerState> | null;
    if (
      raw &&
      (raw.phase === 'timer' || raw.phase === 'work' || raw.phase === 'break') &&
      typeof raw.endsAt === 'number' &&
      Number.isFinite(raw.endsAt)
    ) {
      return { phase: raw.phase, endsAt: raw.endsAt, pomodoro: raw.pomodoro === true };
    }
  } catch {
    // Nothing stored or no storage: no timer.
  }
  return null;
}

export function saveTimer(state: PetTimerState | null) {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch {
    // The timer then only lives until the pet closes.
  }
}
