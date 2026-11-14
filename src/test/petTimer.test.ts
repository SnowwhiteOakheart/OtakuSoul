import { describe, expect, it } from 'vitest';
import { advance, minutesLeft, startPomodoro, startTimer } from '../components/companion/petTimer';

describe('petTimer', () => {
  it('a timer runs, then ends once', () => {
    const t = startTimer(5, 0);
    expect(advance(t, 299_000)).toEqual({ state: t, finished: null });
    expect(advance(t, 300_000)).toEqual({ state: null, finished: 'timer' });
    expect(advance(null, 1)).toEqual({ state: null, finished: null });
  });

  it('a pomodoro alternates work and break', () => {
    const work = startPomodoro(0);
    const a = advance(work, 25 * 60_000);
    expect(a.finished).toBe('work');
    expect(a.state).toMatchObject({ phase: 'break', pomodoro: true, endsAt: 30 * 60_000 });
    const b = advance(a.state, 30 * 60_000);
    expect(b.finished).toBe('break');
    expect(b.state).toMatchObject({ phase: 'work', endsAt: 55 * 60_000 });
  });

  it('a long overdue pomodoro starts its next phase from now', () => {
    const r = advance(startPomodoro(0), 10 * 60 * 60_000);
    expect(r.finished).toBe('work');
    expect(r.state?.endsAt).toBe(10 * 60 * 60_000 + 5 * 60_000);
  });

  it('counts whole minutes left, at least one', () => {
    const t = startTimer(5, 0);
    expect(minutesLeft(t, 0)).toBe(5);
    expect(minutesLeft(t, 241_000)).toBe(1);
    expect(minutesLeft(t, 299_999)).toBe(1);
  });
});
