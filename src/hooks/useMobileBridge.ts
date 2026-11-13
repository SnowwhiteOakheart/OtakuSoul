import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../store/useAppStore';
import { api } from '../services/api';
import { APP_DEFAULT_COMPANION_NAME } from '../constants/branding';
import { withoutEmotionTag } from '../utils/replyTags';
import { followPortrait } from './portraitFeed';

/** Event of the backend: a message typed in the phone's web client (`{ text }`). */
const MOBILE_MESSAGE_EVENT = 'mobile-message';
/** The phone shows the picture small; more would only cost bandwidth. */
const PORTRAIT_PX = 192;

type StoreState = ReturnType<typeof useAppStore.getState>;

/** A message as the phone shows it: no emotion tag, no hidden thoughts, no roleplay asterisks. */
function phoneText(content: string): string {
  return withoutEmotionTag(content)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/[*`]+/g, '')
    .trim();
}

/** The open chat for the phone; in a group chat a guest's replies carry the guest's name. */
function historyOf(s: StoreState) {
  return s.storedMessages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const guest = m.role === 'assistant' && m.speaker_id ? s.availableCharacters.find((c) => c.id === m.speaker_id) : undefined;
      return { role: m.role, text: phoneText(m.content), ...(guest ? { name: guest.card.data.name } : {}) };
    })
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
    let lastState = '';
    let historyQueued = false;

    const push = (message: Record<string, unknown>) => {
      void api.mobilePush(message).catch(() => {});
    };

    const sendState = () => {
      const s = useAppStore.getState();
      const state = {
        type: 'state',
        characterName: s.activeCharacter?.card.data.name || APP_DEFAULT_COMPANION_NAME,
        emotion: s.currentEmotion.emotion,
        thinking: s.isGenerating,
      };
      const key = JSON.stringify(state);
      if (key === lastState) return;
      lastState = key;
      push(state);
    };

    // Changes of one store update are bundled into one push. A microtask rather than a timer:
    // the main window often sits hidden in the tray, where the webview throttles timers.
    const sendHistory = () => {
      if (historyQueued) return;
      historyQueued = true;
      queueMicrotask(() => {
        historyQueued = false;
        push({ type: 'history', messages: historyOf(useAppStore.getState()) });
      });
    };

    const stopStore = useAppStore.subscribe((s, prev) => {
      if (s.activeCharacter !== prev.activeCharacter || s.currentEmotion !== prev.currentEmotion || s.isGenerating !== prev.isGenerating) {
        sendState();
      }
      if (s.storedMessages !== prev.storedMessages || s.activeChatId !== prev.activeChatId) sendHistory();
    });
    const stopPortrait = followPortrait(PORTRAIT_PX, (portrait) => push({ type: 'state', portrait }));

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
      stopStore();
      stopPortrait();
      void stopInbox.then((stop) => stop());
    };
  }, [enabled]);
}
