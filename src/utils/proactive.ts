import type { ProactiveSettings } from '../types/generated/ProactiveSettings';
import type { ProactiveSent } from '../types/generated/ProactiveSent';
import type { IntentionEntry } from '../types/generated/IntentionEntry';

/** Same defaults as the backend (`ProactiveSettings::default`). */
export const PROACTIVE_DEFAULTS: ProactiveSettings = {
  enabled: false,
  idle_minutes: 240,
  quiet_start_hour: 22,
  quiet_end_hour: 8,
  max_per_day: 2,
  notify: true,
  with_selfie: false,
  dreams: true,
  muted_character_ids: [],
  sent: [],
};

/** Sent messages the settings keep (enough for the daily limit and the "unanswered" check). */
export const PROACTIVE_SENT_KEPT = 30;

/** A due plan is brought up at the earliest this long after the last message (no interrupting). */
const DUE_MIN_IDLE_SECONDS = 10 * 60;

/** A dream is told on start only after a night-like pause. */
export const DREAM_MIN_IDLE_SECONDS = 8 * 3600;

/** Whether `date` lies in the quiet time; equal hours mean no quiet time. Over midnight works. */
export function inQuietHours(date: Date, start: number, end: number): boolean {
  if (start === end) return false;
  const hour = date.getHours();
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** Messages sent on the calendar day of `now` (local time). */
export function sentToday(sent: ProactiveSent[], now: Date): number {
  const day = now.toDateString();
  return sent.filter((s) => new Date(s.at * 1000).toDateString() === day).length;
}

export type ProactiveReason =
  | { kind: 'idle'; idleSeconds: number }
  | { kind: 'due'; intention: IntentionEntry }
  /** First check after the start following a long pause; the memories are added before writing. */
  | { kind: 'dream'; idleSeconds: number; memories: string[] };

/**
 * Whether the character of `chatId` should write on their own now, and why: a plan of theirs
 * became due (each once), or nobody wrote for `idle_minutes`. Never twice in a row: after a
 * message on their own the user answers first.
 */
export function proactiveReason(input: {
  settings: ProactiveSettings;
  charId: string;
  chatId: string;
  messages: { id: string; role: string; created_at: number }[];
  intentions: IntentionEntry[];
  now: Date;
  /** The first check since the app started (a dream is told only then). */
  startup?: boolean;
}): ProactiveReason | null {
  const { settings, charId, chatId, messages, intentions, now, startup = false } = input;
  if (!settings.enabled || settings.muted_character_ids.includes(charId)) return null;
  if (inQuietHours(now, settings.quiet_start_hour, settings.quiet_end_hour)) return null;
  if (sentToday(settings.sent, now) >= settings.max_per_day) return null;
  // Only in a chat that has started; the greeting alone is no conversation yet.
  const lastUser = messages.map((m) => m.role).lastIndexOf('user');
  if (lastUser < 0) return null;
  const ownIds = new Set(settings.sent.filter((s) => s.chat_id === chatId).map((s) => s.message_id));
  if (messages.slice(lastUser + 1).some((m) => ownIds.has(m.id))) return null;

  const nowSeconds = now.getTime() / 1000;
  const idleSeconds = Math.max(0, Math.round(nowSeconds - (messages.at(-1)?.created_at ?? nowSeconds)));
  const announced = new Set(settings.sent.map((s) => s.intention_id).filter((id) => id != null));
  const due = intentions.find((i) => i.status === 'pending' && i.time_basis === 'real' && i.due_at != null
    && i.due_at <= nowSeconds && !announced.has(i.id));
  if (due && idleSeconds >= DUE_MIN_IDLE_SECONDS) return { kind: 'due', intention: due };
  if (startup && settings.dreams && idleSeconds >= DREAM_MIN_IDLE_SECONDS) return { kind: 'dream', idleSeconds, memories: [] };
  if (idleSeconds >= settings.idle_minutes * 60) return { kind: 'idle', idleSeconds };
  return null;
}

/** "3 hours", "2 days": the pause in words for the model (English, like the other instructions). */
export function pauseInWords(seconds: number): string {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} minutes`;
  const hours = Math.round(seconds / 3600);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${Math.round(hours / 24)} days`;
}

/** The instruction after the history that lets the character write on their own. */
export function proactiveInstruction(reason: ProactiveReason, name: string, userName: string): string {
  const own = `${name} writes to ${userName} on their own initiative, like a short text message to a friend`;
  if (reason.kind === 'dream') {
    const woven = reason.memories.map((memory) => `- ${memory}`).join('\n');
    return `[${name} has just woken up and tells ${userName} on their own initiative, like a short text message, about a dream `
      + `they had tonight. The dream strangely mixes these memories of theirs:\n${woven}\n`
      + `Make it vivid, a little surreal and short, stay in character and end with a feeling or a small question. `
      + `Do not list the memories, and do not mention timers or being an AI.]`;
  }
  if (reason.kind === 'due') {
    const details = reason.intention.details ? ` (${reason.intention.details})` : '';
    return `[${own}: the plan or promise "${reason.intention.title}"${details} is due now – bring it up naturally. `
      + `Keep it short, stay in character and do not mention reminders, timers or being an AI.]`;
  }
  return `[${userName} has not written for ${pauseInWords(reason.idleSeconds)}. ${own}: check in, follow up on `
    + `something from your conversation or share a small moment of your day. Keep it short, stay in character, `
    + `do not complain about the silence and do not mention timers or being an AI.]`;
}
