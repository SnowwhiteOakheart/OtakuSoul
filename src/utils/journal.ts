import type { JournalSettings } from '../types/generated/JournalSettings';
import type { IntentionEntry } from '../types/generated/IntentionEntry';

/** Same defaults as the backend (`JournalSettings::default`). */
export const JOURNAL_DEFAULTS: JournalSettings = {
  enabled: false,
  evening_hour: 21,
  check_in: true,
  monthly: true,
};

const pad = (n: number) => String(n).padStart(2, '0');
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

/** One journal entry to write: its period key and the time it looks back on. */
export interface JournalPeriod {
  kind: 'evening' | 'monthly';
  /** `2026-11-05` or `2026-10` (local time). */
  period: string;
  from: number;
  to: number;
}

/** Today from local midnight until `now`. */
export function dayPeriod(now: Date): JournalPeriod {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    kind: 'evening',
    period: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    from: seconds(start),
    to: seconds(now) + 1,
  };
}

/** The calendar month `offset` months before the one of `now` (0 = this month, until `now`). */
export function monthPeriod(now: Date, offset = 1): JournalPeriod {
  const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const end = offset === 0 ? new Date(now.getTime() + 1000) : new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
  return {
    kind: 'monthly',
    period: `${start.getFullYear()}-${pad(start.getMonth() + 1)}`,
    from: seconds(start),
    to: seconds(end),
  };
}

/** Whether the evening reflection is due: from the chosen hour until midnight. */
export function eveningDue(settings: JournalSettings, now: Date): boolean {
  return settings.enabled && now.getHours() >= settings.evening_hour;
}

/** Open plans due tomorrow (real time), for the good-night message. */
export function plansForTomorrow(intentions: IntentionEntry[], now: Date): IntentionEntry[] {
  const start = seconds(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const end = seconds(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2));
  return intentions.filter((i) => i.status === 'pending' && i.time_basis === 'real' && i.due_at != null
    && i.due_at >= start && i.due_at < end);
}

/** The instruction after the history for the short good-night message after the reflection. */
export function eveningCheckInInstruction(name: string, userName: string, reflection: string, tomorrow: IntentionEntry[]): string {
  const plans = tomorrow.length > 0
    ? ` Tomorrow ${tomorrow.map((i) => `"${i.title}"`).join(', ')} ${tomorrow.length === 1 ? 'is' : 'are'} planned – mention it briefly.`
    : '';
  const thoughts = reflection.replace(/\s+/g, ' ').trim().slice(0, 600);
  return `[It is evening. ${name} has just written in their diary about today: "${thoughts}" `
    + `${name} now sends ${userName} a short good-night message on their own initiative, like a text to a friend: `
    + `one warm thought about the day and a gentle question how ${userName}'s day was.${plans} `
    + `Keep it short, stay in character, do not quote the diary and do not mention timers or being an AI.]`;
}
