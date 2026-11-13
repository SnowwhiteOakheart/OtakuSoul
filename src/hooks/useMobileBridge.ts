import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../store/useAppStore';
import { api } from '../services/api';
import { APP_DEFAULT_COMPANION_NAME } from '../constants/branding';
import { withoutEmotionTag } from '../utils/replyTags';
import { followPortrait } from './portraitFeed';

/** Events of the backend: a message typed on the phone (`{ text, image? }`) and a checked command. */
const MOBILE_MESSAGE_EVENT = 'mobile-message';
const MOBILE_COMMAND_EVENT = 'mobile-command';
/** The phone shows the picture small; more would only cost bandwidth. */
const PORTRAIT_PX = 192;
/** The reply that is being written goes to the phone at most this often. */
const STREAM_MS = 150;

type StoreState = ReturnType<typeof useAppStore.getState>;

type MobileCommand =
  | { action: 'stop' | 'newChat' }
  | { action: 'regenerate' | 'openChat' | 'openCharacter'; id: string }
  | { action: 'swipe'; id: string; index: number }
  | { action: 'edit'; id: string; text: string };

/** A message as the phone shows it: no emotion tag, no hidden thoughts, no roleplay asterisks. */
function phoneText(content: string): string {
  return withoutEmotionTag(content)
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, '')
    .replace(/[*`]+/g, '')
    .trim();
}

/** The open chat for the phone: text, pictures, variants; a guest's replies carry the guest's name. */
function historyOf(s: StoreState) {
  return s.storedMessages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const guest = m.role === 'assistant' && m.speaker_id ? s.availableCharacters.find((c) => c.id === m.speaker_id) : undefined;
      const images = m.attachments.filter((a) => a.kind === 'image').map((a) => ({ file: a.file, mime: a.mime }));
      return {
        id: m.id,
        role: m.role,
        text: phoneText(m.content),
        ...(guest ? { name: guest.card.data.name } : {}),
        ...(images.length ? { images } : {}),
        ...(m.swipes.length > 1 ? { swipe: m.swipe_index, swipes: m.swipes.length } : {}),
      };
    })
    .filter((m) => m.text || m.images);
}

/** Characters and the open character's chats, for the phone's menu. */
function catalogOf(s: StoreState) {
  return {
    type: 'catalog',
    characters: s.availableCharacters.map((c) => ({ id: c.id, name: c.card.data.name })),
    chats: [...s.chatSessions]
      .sort((a, b) => b.updated_at - a.updated_at)
      .map((c) => ({ id: c.id, title: c.title })),
    characterId: s.activeCharacter?.id ?? null,
    chatId: s.activeChatId,
  };
}

/** A picture from the phone (data URL) as a file for the normal send. */
function imageFile(dataUrl: string): File | null {
  const match = /^data:(image\/(png|jpeg|webp|gif));base64,(.*)$/s.exec(dataUrl);
  const [, mime = '', subtype = '', base64 = ''] = match ?? [];
  if (!match || !mime) return null;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const ext = subtype === 'jpeg' ? 'jpg' : subtype;
  return new File([bytes], `handy-${Date.now()}.${ext}`, { type: mime });
}

/**
 * Main window side of the phone web client (LAN, `/` of the web server): the phone is a second
 * window onto the open chat. Its messages and commands arrive as events and go through the normal
 * store actions (figure, memory, voice); state, history, the reply being written and the menu
 * go back to the backend, which hands them to the open phone pages.
 */
export function useMobileBridge(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    let lastState = '';
    let lastCatalog = '';
    let historyQueued = false;
    /** Open phone pages (the backend's answer to the last push): the live text only goes while one is open. */
    let pages = 0;
    let lastStreamAt = 0;
    /** The reply being written (the store does not hold it; the chat view keeps it locally). */
    let streamId = '';
    let streamText = '';
    let streamTimer: ReturnType<typeof setTimeout> | undefined;

    const push = (message: Record<string, unknown>) => {
      void api
        .mobilePush(message)
        .then((count) => {
          pages = count;
        })
        .catch(() => {});
    };
    const notice = (code: 'busy' | 'failed' | 'noChat' | 'notFound') => push({ type: 'notice', code });

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

    const sendCatalog = () => {
      const catalog = catalogOf(useAppStore.getState());
      const key = JSON.stringify(catalog);
      if (key === lastCatalog) return;
      lastCatalog = key;
      push(catalog);
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

    // The reply as it is written, at most every STREAM_MS. The trailing push waits on a timer,
    // which a hidden window may delay; the finished reply comes with the next history anyway.
    const flushStream = () => {
      streamTimer = undefined;
      lastStreamAt = performance.now();
      const text = phoneText(streamText);
      if (text) push({ type: 'stream', text });
    };
    const stopTokens = api.onLlmToken((token) => {
      const s = useAppStore.getState();
      // Like the chat view: only the running reply of the open chat.
      if (!s.isGenerating || s.generationChatId !== s.activeChatId || !token.generation_id || token.generation_id !== s.generationId) return;
      if (token.generation_id !== streamId) {
        streamId = token.generation_id;
        streamText = '';
      }
      streamText += token.text;
      if (pages === 0 || streamTimer) return;
      const wait = STREAM_MS - (performance.now() - lastStreamAt);
      if (wait <= 0) flushStream();
      else streamTimer = setTimeout(flushStream, wait);
    });

    const stopStore = useAppStore.subscribe((s, prev) => {
      if (s.activeCharacter !== prev.activeCharacter || s.currentEmotion !== prev.currentEmotion || s.isGenerating !== prev.isGenerating) {
        sendState();
      }
      if (s.storedMessages !== prev.storedMessages || s.activeChatId !== prev.activeChatId || s.availableCharacters !== prev.availableCharacters) {
        sendHistory();
      }
      if (
        s.availableCharacters !== prev.availableCharacters ||
        s.chatSessions !== prev.chatSessions ||
        s.activeChatId !== prev.activeChatId ||
        s.activeCharacter !== prev.activeCharacter
      ) {
        sendCatalog();
      }
      if (prev.isGenerating && !s.isGenerating) {
        clearTimeout(streamTimer);
        streamTimer = undefined;
        streamText = '';
      }
    });
    const stopPortrait = followPortrait(PORTRAIT_PX, (portrait) => push({ type: 'state', portrait }));

    /** Whether the chat can take something new now; tells the phone why not. */
    const ready = (s: StoreState): boolean => {
      if (!s.activeCharacter) {
        notice('noChat');
        return false;
      }
      if (s.isGenerating || s.isChatLoading) {
        notice('busy');
        return false;
      }
      return true;
    };

    const stopInbox = listen<{ text?: string; image?: string }>(MOBILE_MESSAGE_EVENT, (event) => {
      const text = event.payload?.text?.trim() ?? '';
      const file = event.payload?.image ? imageFile(event.payload.image) : null;
      if (!text && !file) return;
      const s = useAppStore.getState();
      if (!ready(s)) return;
      s.sendMessage(text, file ? [file] : []).catch(() => notice('failed'));
    });

    const run = async (command: MobileCommand) => {
      const s = useAppStore.getState();
      if (command.action === 'stop') {
        if (s.isGenerating) await s.abortGeneration();
        return;
      }
      if (command.action === 'openCharacter') {
        const character = s.availableCharacters.find((c) => c.id === command.id);
        if (!character) return notice('notFound');
        if (s.isGenerating) return notice('busy');
        if (character.id !== s.activeCharacter?.id) await s.selectCharacter(character);
        return;
      }
      if (!ready(s)) return;
      switch (command.action) {
        case 'newChat':
          await s.createNewChat();
          return;
        case 'openChat':
          if (!s.chatSessions.some((c) => c.id === command.id)) return notice('notFound');
          if (command.id !== s.activeChatId) await s.switchChatSession(command.id);
          return;
        default:
          break;
      }
      if (!('id' in command)) return;
      const message = s.storedMessages.find((m) => m.id === command.id);
      if (!message) return notice('notFound');
      switch (command.action) {
        case 'regenerate':
          if (message.role !== 'assistant') return notice('notFound');
          await s.regenerateMessageSwipe(message.id);
          return;
        case 'swipe':
          if (command.index >= message.swipes.length) return notice('notFound');
          await s.switchMessageSwipe(message.id, command.index);
          return;
        case 'edit':
          await s.editChatMessage(message.id, command.text);
          return;
      }
    };
    const stopCommands = listen<MobileCommand>(MOBILE_COMMAND_EVENT, (event) => {
      if (!event.payload?.action) return;
      run(event.payload).catch(() => notice('failed'));
    });

    sendState();
    sendCatalog();
    sendHistory();
    return () => {
      clearTimeout(streamTimer);
      stopStore();
      void stopTokens.then((stop) => stop());
      stopPortrait();
      void stopInbox.then((stop) => stop());
      void stopCommands.then((stop) => stop());
    };
  }, [enabled]);
}
