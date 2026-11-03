import { useAppStore } from '../store/useAppStore';
import { bubbleText } from '../components/companion/petBehavior';

/** A reply counts as new this long after a generation ended (also a regenerated one). */
const AFTER_GENERATION_MS = 10_000;
/** …or while it is at most this old (replies written on their own, without a generation here). */
const FRESH_REPLY_S = 120;

type StoreState = ReturnType<typeof useAppStore.getState>;

/** The figure's latest finished reply in the open chat (id and shown swipe), or null. */
function lastReplyKey(s: StoreState): string | null {
  const last = s.storedMessages[s.storedMessages.length - 1];
  return last && last.role === 'assistant' ? `${last.id}:${last.swipe_index}` : null;
}

/**
 * Calls `onReply` with the bubble text of each new reply of the figure in the open chat. Replies
 * already there when a chat opens are not announced; new and regenerated ones are. Returns the stop function.
 */
export function watchNewReplies(onReply: (text: string) => void): () => void {
  let replyChat = useAppStore.getState().activeChatId;
  let seenReply = lastReplyKey(useAppStore.getState());
  let generationEndedAt = 0;

  const announce = (s: StoreState) => {
    if (s.activeChatId !== replyChat) {
      replyChat = s.activeChatId;
      seenReply = lastReplyKey(s);
      return;
    }
    if (s.isGenerating) return;
    const key = lastReplyKey(s);
    if (!key || key === seenReply) return;
    seenReply = key;
    const last = s.storedMessages[s.storedMessages.length - 1]!;
    // A chat's history arrives after the chat switch: its last reply is old, not new.
    const fresh = Date.now() - generationEndedAt < AFTER_GENERATION_MS || Date.now() / 1000 - last.created_at < FRESH_REPLY_S;
    if (!fresh) return;
    const text = bubbleText(last.content);
    if (text) onReply(text);
  };

  return useAppStore.subscribe((s, prev) => {
    if (prev.isGenerating && !s.isGenerating) generationEndedAt = Date.now();
    if (s.storedMessages !== prev.storedMessages || s.isGenerating !== prev.isGenerating || s.activeChatId !== prev.activeChatId) {
      announce(s);
    }
  });
}
