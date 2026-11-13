import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../store/useAppStore';
import { api } from '../services/api';
import { APP_DEFAULT_COMPANION_NAME } from '../constants/branding';
import { withoutEmotionTag } from '../utils/replyTags';

/** Event of the backend: a message typed in the phone's web client (`{ text }`). */
const MOBILE_MESSAGE_EVENT = 'mobile-message';
/** History updates are bundled; a reply that streams in does not send one per token. */
const HISTORY_DEBOUNCE_MS = 200;

type StoreState = ReturnType<typeof useAppStore.getState>;

/** A message as the phone shows it: no emotion tag, no hidden thoughts, no roleplay asterisks. */
function phoneText(content: string): string {
  return withoutEmotionTag(content)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/[*`]+/g, '')
    .trim();
}

function historyOf(s: StoreState) {
  return s.storedMessages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, text: phoneText(m.content) }))
    .filter((m) => m.text);
}

/**
 * Main window side of the phone web client (LAN, `/` of the web server): the phone is a second
 * window onto the open chat. Its messages arrive as an event and go through the normal send
 * (figure, memory, voice); the state and the history of the open chat go back to the backend,
 * which hands them to the open phone pages.
 */
export function useMobileBridge(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    let sentPortrait: string | null = null;
    let lastState = '';
    let historyTimer: ReturnType<typeof setTimeout> | undefined;

    const push = (message: Record<string, unknown>) => {
      void api.mobilePush(message).catch(() => {});
    };

    const sendState = () => {
      const s = useAppStore.getState();
      const state: Record<string, unknown> = {
        type: 'state',
        characterName: s.activeCharacter?.card.data.name || APP_DEFAULT_COMPANION_NAME,
        emotion: s.currentEmotion.emotion,
        thinking: s.isGenerating,
      };
      const portrait = s.activeCharacter?.avatar_data_url ?? '';
      const key = JSON.stringify(state) + (portrait === sentPortrait ? '' : '+portrait');
      if (key === lastState) return;
      lastState = key;
      if (portrait !== sentPortrait) {
        state.portrait = portrait;
        sentPortrait = portrait;
      }
      push(state);
    };

    const sendHistory = () => {
      clearTimeout(historyTimer);
      historyTimer = setTimeout(() => {
        push({ type: 'history', messages: historyOf(useAppStore.getState()) });
      }, HISTORY_DEBOUNCE_MS);
    };

    const stopStore = useAppStore.subscribe((s, prev) => {
      if (s.activeCharacter !== prev.activeCharacter || s.currentEmotion !== prev.currentEmotion || s.isGenerating !== prev.isGenerating) {
        sendState();
      }
      if (s.storedMessages !== prev.storedMessages || s.activeChatId !== prev.activeChatId) sendHistory();
    });

    const stopInbox = listen<{ text?: string }>(MOBILE_MESSAGE_EVENT, (event) => {
      const text = event.payload?.text?.trim();
      if (!text) return;
      const s = useAppStore.getState();
      if (!s.activeCharacter) {
        push({ type: 'notice', code: 'noChat' });
        return;
      }
      if (s.isGenerating || s.isChatLoading) {
        push({ type: 'notice', code: 'busy' });
        return;
      }
      s.sendMessage(text).catch(() => push({ type: 'notice', code: 'failed' }));
    });

    sendState();
    sendHistory();
    return () => {
      clearTimeout(historyTimer);
      stopStore();
      void stopInbox.then((stop) => stop());
    };
  }, [enabled]);
}
