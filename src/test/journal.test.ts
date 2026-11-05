import { describe, expect, it } from 'vitest';
import { JOURNAL_DEFAULTS, dayPeriod, eveningCheckInInstruction, eveningDue, monthPeriod, plansForTomorrow } from '../utils/journal';
import type { IntentionEntry } from '../types';

const plan = (title: string, due: Date | null, status = 'pending'): IntentionEntry => ({
  id: 1, character_id: 'ayu', user_name: 'Kai', title, details: '', initiator: 'both', time_basis: 'real', status,
  due_at: due ? Math.floor(due.getTime() / 1000) : null, due_has_time: false, origin: 'auto', source_chat_id: null,
  created_at: 0, resolved_at: null, memory_id: null,
});

describe('journal periods', () => {
  const now = new Date(2026, 10, 5, 21, 30);

  it('covers today from local midnight', () => {
    const day = dayPeriod(now);
    expect(day.period).toBe('2026-11-05');
    expect(day.from).toBe(new Date(2026, 10, 5).getTime() / 1000);
    expect(day.to).toBeGreaterThan(now.getTime() / 1000);
  });

  it('covers the last calendar month, also over a new year', () => {
    const last = monthPeriod(now);
    expect(last.period).toBe('2026-10');
    expect(last.from).toBe(new Date(2026, 9, 1).getTime() / 1000);
    expect(last.to).toBe(new Date(2026, 10, 1).getTime() / 1000);
    expect(monthPeriod(new Date(2027, 0, 2)).period).toBe('2026-12');
    expect(monthPeriod(now, 0).period).toBe('2026-11');
  });

  it('is due from the evening hour when switched on', () => {
    expect(eveningDue(JOURNAL_DEFAULTS, now)).toBe(false);
    const on = { ...JOURNAL_DEFAULTS, enabled: true };
    expect(eveningDue(on, now)).toBe(true);
    expect(eveningDue(on, new Date(2026, 10, 5, 20, 59))).toBe(false);
  });

  it('names the plans due tomorrow in the good-night message', () => {
    const tomorrow = plansForTomorrow([
      plan('Zahnarzt', new Date(2026, 10, 6)),
      plan('Kino', new Date(2026, 10, 8)),
      plan('Joggen', new Date(2026, 10, 6), 'fulfilled'),
      plan('Irgendwann', null),
    ], now);
    expect(tomorrow.map((p) => p.title)).toEqual(['Zahnarzt']);
    const text = eveningCheckInInstruction('Ayu', 'Kai', 'Ein  ruhiger\nTag.', tomorrow);
    expect(text).toContain('"Ein ruhiger Tag."');
    expect(text).toContain('Tomorrow "Zahnarzt" is planned');
  });
});
