import { describe, expect, it } from 'vitest';
import { PROACTIVE_DEFAULTS, inQuietHours, pauseInWords, proactiveInstruction, proactiveReason, sentToday } from '../utils/proactive';
import { notificationBody } from '../services/notifications';
import type { IntentionEntry } from '../types/generated/IntentionEntry';

const at = (iso: string) => new Date(iso);
const seconds = (iso: string) => Math.floor(at(iso).getTime() / 1000);

const intention = (over: Partial<IntentionEntry> = {}): IntentionEntry => ({
  id: 7, character_id: 'shiori', user_name: 'Kai', title: 'Vorstellungsgespräch', details: '', initiator: 'user',
  time_basis: 'real', status: 'pending', due_at: seconds('2026-10-20T09:00:00'), due_has_time: true, origin: 'auto',
  source_chat_id: null, created_at: 0, resolved_at: null, memory_id: null, ...over,
});

const chat = [
  { id: 'm1', role: 'assistant', created_at: seconds('2026-10-20T08:00:00') },
  { id: 'm2', role: 'user', created_at: seconds('2026-10-20T09:00:00') },
  { id: 'm3', role: 'assistant', created_at: seconds('2026-10-20T09:01:00') },
];
const on = { ...PROACTIVE_DEFAULTS, enabled: true };
const reason = (over: Partial<Parameters<typeof proactiveReason>[0]> = {}) =>
  proactiveReason({ settings: on, charId: 'shiori', chatId: 'c1', messages: chat, intentions: [], now: at('2026-10-20T14:00:00'), ...over });

describe('proactive messages', () => {
  it('knows the quiet time, also over midnight', () => {
    expect(inQuietHours(at('2026-10-20T23:30:00'), 22, 8)).toBe(true);
    expect(inQuietHours(at('2026-10-20T07:59:00'), 22, 8)).toBe(true);
    expect(inQuietHours(at('2026-10-20T08:00:00'), 22, 8)).toBe(false);
    expect(inQuietHours(at('2026-10-20T13:00:00'), 12, 14)).toBe(true);
    expect(inQuietHours(at('2026-10-20T03:00:00'), 5, 5)).toBe(false);
  });

  it('counts the messages of today only', () => {
    const sent = [seconds('2026-10-19T20:00:00'), seconds('2026-10-20T10:00:00')].map((s) => ({ at: s, chat_id: 'c1', message_id: 'x', intention_id: null }));
    expect(sentToday(sent, at('2026-10-20T18:00:00'))).toBe(1);
  });

  it('writes after the pause, but not when off, muted, quiet or over the limit', () => {
    expect(reason()).toMatchObject({ kind: 'idle' });
    expect(reason({ now: at('2026-10-20T12:00:00') })).toBeNull(); // 3 hours < 4
    expect(reason({ settings: PROACTIVE_DEFAULTS })).toBeNull();
    expect(reason({ settings: { ...on, muted_character_ids: ['shiori'] } })).toBeNull();
    expect(reason({ now: at('2026-10-20T23:00:00') })).toBeNull();
    const twice = [1, 2].map((n) => ({ at: seconds('2026-10-20T10:00:00'), chat_id: 'other', message_id: `o${n}`, intention_id: null }));
    expect(reason({ settings: { ...on, sent: twice } })).toBeNull();
  });

  it('needs a conversation and waits for an answer after writing on their own', () => {
    expect(reason({ messages: [chat[0]!] })).toBeNull();
    const own = { at: seconds('2026-10-19T10:00:00'), chat_id: 'c1', message_id: 'm3', intention_id: null };
    expect(reason({ settings: { ...on, sent: [own] } })).toBeNull();
    // The same id in another chat does not count.
    expect(reason({ settings: { ...on, sent: [{ ...own, chat_id: 'c2' }] } })).toMatchObject({ kind: 'idle' });
  });

  it('brings up a due plan once, without waiting for the long pause', () => {
    const now = at('2026-10-20T09:30:00');
    expect(reason({ now, intentions: [intention()] })).toMatchObject({ kind: 'due', intention: { id: 7 } });
    expect(reason({ now, intentions: [intention({ due_at: seconds('2026-10-20T10:00:00') })] })).toBeNull();
    expect(reason({ now, intentions: [intention({ time_basis: 'story' })] })).toBeNull();
    const announced = { at: seconds('2026-10-19T10:00:00'), chat_id: 'c0', message_id: 'z', intention_id: 7 };
    expect(reason({ now, intentions: [intention()], settings: { ...on, sent: [announced] } })).toBeNull();
    // Not right after the last message.
    expect(reason({ now: at('2026-10-20T09:05:00'), intentions: [intention()] })).toBeNull();
  });

  it('tells a dream only on the first check after a night-like pause', () => {
    const night = at('2026-10-21T09:30:00'); // more than 8 hours after 09:01 the day before
    const long = { ...on, idle_minutes: 48 * 60 };
    expect(reason({ settings: long, now: night, startup: true })).toMatchObject({ kind: 'dream' });
    expect(reason({ settings: long, now: night })).toBeNull();
    expect(reason({ settings: { ...long, dreams: false }, now: night, startup: true })).toBeNull();
    // Not after a short break, and a due plan comes first.
    expect(reason({ settings: long, now: at('2026-10-20T15:00:00'), startup: true })).toBeNull();
    expect(reason({ settings: long, now: night, startup: true, intentions: [intention({ due_at: seconds('2026-10-21T09:00:00') })] }))
      .toMatchObject({ kind: 'due' });
  });

  it('tells what happened with a guest of a group chat instead of a dream', () => {
    const night = at('2026-10-21T09:30:00');
    const long = { ...on, idle_minutes: 48 * 60 };
    const sota = { id: 'sota', name: 'Sota', description: 'Gamer und Speedrunner' };
    const lirwen = { id: 'lirwen', name: 'Lirwen', description: 'junge Elbin' };
    const first = <T,>(items: T[]) => items[0]!;
    expect(reason({ settings: long, now: night, startup: true, guests: [sota, lirwen], pick: first }))
      .toMatchObject({ kind: 'offscreen', guest: { id: 'sota' } });
    // Switched off, or without guests: the dream as before.
    expect(reason({ settings: { ...long, offscreen: false }, now: night, startup: true, guests: [sota] })).toMatchObject({ kind: 'dream' });
    expect(reason({ settings: long, now: night, startup: true, guests: [] })).toMatchObject({ kind: 'dream' });
    // Only on the first check after a long pause.
    expect(reason({ settings: long, now: night, guests: [sota] })).toBeNull();
    const told = proactiveInstruction({ kind: 'offscreen', idleSeconds: 40_000, guest: sota, memories: ['Kai mag Gewitter'] }, 'Shiori', 'Kai');
    expect(told).toContain('While Kai was away, Shiori and Sota (Gamer und Speedrunner) spent some time together');
    expect(told).toContain('- Kai mag Gewitter');
    expect(proactiveInstruction({ kind: 'offscreen', idleSeconds: 40_000, guest: sota, memories: [] }, 'Shiori', 'Kai')).not.toContain('memories');
  });

  it('tells the model why it writes', () => {
    expect(pauseInWords(1800)).toBe('30 minutes');
    expect(pauseInWords(5 * 3600)).toBe('5 hours');
    expect(pauseInWords(3 * 86400)).toBe('3 days');
    expect(proactiveInstruction({ kind: 'idle', idleSeconds: 5 * 3600 }, 'Shiori', 'Kai')).toContain('Kai has not written for 5 hours');
    const due = proactiveInstruction({ kind: 'due', intention: intention({ details: 'um 9 Uhr' }) }, 'Shiori', 'Kai');
    expect(due).toContain('"Vorstellungsgespräch" (um 9 Uhr) is due now');
    const dream = proactiveInstruction({ kind: 'dream', idleSeconds: 30_000, memories: ['Erster Ausflug ans Meer', 'Kai mag Gewitter'] }, 'Shiori', 'Kai');
    expect(dream).toContain('about a dream');
    expect(dream).toContain('- Erster Ausflug ans Meer\n- Kai mag Gewitter');
  });

  it('shortens notification texts without role-play markup', () => {
    expect(notificationBody('*winkt*  Hallo\nKai!')).toBe('winkt Hallo Kai!');
    expect(notificationBody('a'.repeat(300))).toHaveLength(160);
  });
});
