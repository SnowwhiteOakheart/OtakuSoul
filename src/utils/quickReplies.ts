import type { QuickReply } from '../types/generated/QuickReply';

export const NEW_QUICK_REPLY: QuickReply = { label: '', message: '', mode: 'send' };

/** Fills `{{char}}`, `{{user}}` and `{{input}}` (the text in the input field), in any case. */
export function fillQuickReply(message: string, values: { char: string; user: string; input: string }): string {
  return message.replace(/\{\{(char|user|input)\}\}/gi, (_, name: string) => values[name.toLowerCase() as keyof typeof values]);
}

/** Whether the quick reply takes over what is in the input field. */
export const usesInput = (message: string) => /\{\{input\}\}/i.test(message);

/** What a SillyTavern quick reply set gave, and how many replies were left out. */
export interface ImportedQuickReplies {
  replies: QuickReply[];
  /** Slash command scripts (STscript), which OtakuSoul does not run, and empty, switched off or hidden ones. */
  skipped: number;
}

/**
 * Reads a SillyTavern quick reply set: version 2 (`qrList` with `label`/`message`) or the older
 * `quickReplySlots` (`label`/`mes`). Replies that start with a slash are STscript commands, which
 * OtakuSoul does not run; they are left out and counted.
 */
export function importSillyTavernQuickReplies(json: unknown): ImportedQuickReplies {
  if (!json || typeof json !== 'object') throw new Error('no quick replies');
  const set = json as Record<string, unknown>;
  const list = Array.isArray(set.qrList) ? set.qrList : Array.isArray(set.quickReplySlots) ? set.quickReplySlots : null;
  if (!list) throw new Error('no quick replies');
  const replies: QuickReply[] = [];
  let skipped = 0;
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const message = typeof entry.message === 'string' ? entry.message : typeof entry.mes === 'string' ? entry.mes : '';
    if (!message.trim() || message.trimStart().startsWith('/') || entry.enabled === false || entry.isHidden === true) {
      skipped += 1;
      continue;
    }
    const label = typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : message.slice(0, 24).trim();
    replies.push({ label, message, mode: 'send' });
  }
  return { replies, skipped };
}
