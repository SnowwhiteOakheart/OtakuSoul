import { translate } from '../../../i18n';
import { api } from '../../../services/api';
import { emotionTagOf } from '../../../utils/replyTags';
import { toast } from '../../../components/ui/feedback';
import { languageCode, localizeCard } from '../../../utils/cardI18n';
import type {
  AssembledPrompt,
  CharacterProfile,
  ChatMessage,
  ChatSession,
  StoredChatMessage,
  UserPersona,
} from '../../../types';

/** A deleted message can be restored this long (the undo toast stays as long). */
export const UNDO_DELETE_MS = 8000;

/** Summarize once this many conversation messages have left the context window. */
export const SUMMARY_BATCH = 6;

/** Chats deleted but still restorable; lists from the backend leave them out until then. */
export const pendingChatDeletes = new Set<string>();
export const visibleSessions = (sessions: ChatSession[]) => sessions.filter((s) => !pendingChatDeletes.has(s.id));

/** A stored message as it goes to the model (attachments included). */
export const toFlat = (m: StoredChatMessage): ChatMessage => ({
  role: m.role as 'user' | 'assistant' | 'system',
  content: m.content,
  thought: m.thought || undefined,
  attachments: m.attachments.length > 0 ? m.attachments : undefined,
});

/** Remembers a reply's expression tag (a continuation's own tag replaces the earlier one). */
export const withEmotionTag = (tags: Record<string, string>, key: string, fullText: string): Record<string, string> => {
  const tag = emotionTagOf(fullText);
  return tag ? { ...tags, [key]: tag } : tags;
};

/** The card's or template's post-history instruction as a trailing system message. */
export const postHistory = (prompt: AssembledPrompt | null): ChatMessage[] =>
  prompt?.post_history ? [{ role: 'system', content: prompt.post_history }] : [];

/** The chat's author's note at its depth (counted from the end of the history). */
export const withAuthorNote = (messages: ChatMessage[], session: ChatSession | undefined): ChatMessage[] => {
  if (!session?.author_note || (session.author_note_depth || 0) <= 0) return messages;
  const at = Math.max(1, messages.length - session.author_note_depth);
  return [...messages.slice(0, at), { role: 'system', content: `[Author's note: ${session.author_note}]` }, ...messages.slice(at)];
};

/**
 * A message a character writes on their own in another chat than the open one. The backend runs
 * one chat generation at a time, so a reply in the open chat stops it first ([`makeRoomForChat`]).
 */
let backgroundWrite: { abort: AbortController; done: Promise<unknown> } | null = null;

export const hasBackgroundWrite = () => backgroundWrite !== null;

/** Stops a message being written in the background and waits until the backend is free. */
export async function makeRoomForChat() {
  const running = backgroundWrite;
  if (!running) return;
  running.abort.abort();
  await api.abortChatGeneration().catch(() => {});
  await running.done.catch(() => {});
}

/** Tracks a background-chat write while ensuring only one runs at a time. */
export async function runInBackgroundWrite<T>(
  start: (signal: AbortSignal) => Promise<T>,
  onError: (e: unknown, signal: AbortSignal) => T,
): Promise<T> {
  const abort = new AbortController();
  const signal = abort.signal;
  const done = start(signal).catch((e) => onError(e, signal));
  backgroundWrite = { abort, done };
  try {
    return await done;
  } finally {
    if (backgroundWrite?.done === done) backgroundWrite = null;
  }
}

/**
 * Mirrors the backend (`discard_stale_summary`): changing a message the running summary already
 * covers drops it, so the old version doesn't stay in the prompt; it is rebuilt later.
 */
export const withoutStaleSummary = (sessions: ChatSession[], message: StoredChatMessage): ChatSession[] =>
  sessions.map((s) =>
    s.id === message.chat_id && s.summary_until >= message.order_index ? { ...s, summary: '', summary_until: -1 } : s,
  );

/**
 * After the user changed or deleted a message: if the character learned memories from it, say
 * so and offer to check them (they are flagged in the memory drawer).
 */
export const hintMemorySources = async (chatId: string, messageId: string, openDrawer: () => void) => {
  try {
    const count = await api.countMemoriesFromMessage(chatId, messageId);
    if (count > 0) {
      toast.info(translate(count === 1 ? 'memory.sourceChangedOne' : 'memory.sourceChangedMany', { count }), {
        label: translate('memory.review'),
        onClick: openDrawer,
      });
    }
  } catch {
    // only a hint
  }
};

/**
 * The active character's greetings in the reply language (first message, then the alternatives as
 * swipes), with their macros filled in once: a greeting is stored as the chat began.
 */
export const greetingsFor = async (state: {
  activeCharacter: CharacterProfile | null;
  activePersona: UserPersona;
  replyLanguage: string;
}): Promise<string[]> => {
  if (!state.activeCharacter) return [];
  const data = localizeCard(state.activeCharacter.card.data, languageCode(state.replyLanguage));
  const greetings = [data.first_mes, ...(data.alternate_greetings ?? [])].filter((text) => text?.trim());
  if (greetings.length === 0) return [];
  return api.expandMacros(greetings, {
    char_name: data.name,
    user_name: state.activePersona.name,
    language: state.replyLanguage,
  });
};
