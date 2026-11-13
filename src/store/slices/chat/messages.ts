import { translate } from '../../../i18n';
import { api } from '../../../services/api';
import { cutAtHeard } from '../../../utils/bargeIn';
import { llmTarget } from '../../helpers';
import { trackTask } from '../taskSlice';
import { reportFailure } from '../../reportFailure';
import { toast } from '../../../components/ui/feedback';
import { STAGE_NARRATOR_VOICE_ID, forgetNarratorVoice } from '../../../services/narratorVoice';
import { loadCharacterVoiceConfig } from '../../../services/characterVoice';
import type { ChatMessage, StoredChatMessage } from '../../../types';
import {
  SUMMARY_BATCH,
  UNDO_DELETE_MS,
  hintMemorySources,
  toFlat,
  visibleSessions,
  withoutStaleSummary,
} from './helpers';
import type { ChatRuntime } from './runtime';
import type { ChatGet, ChatSet, ChatSlice } from './types';

export type ChatMessagesSlice = Pick<
  ChatSlice,
  | 'promptHits'
  | 'replyEmotionTags'
  | 'contextUsage'
  | 'isSummarizing'
  | 'summarizeDroppedMessages'
  | 'translateText'
  | 'suggestReplies'
  | 'draftReply'
  | 'sendSelfie'
  | 'sendDreamPicture'
  | 'switchMessageSwipe'
  | 'editChatMessage'
  | 'deleteChatMessage'
  | 'autoTtsEnabled'
  | 'setAutoTtsEnabled'
  | 'activeVoiceConfig'
  | 'speakerVoices'
  | 'loadSpeakerVoice'
  | 'loadVoiceConfigForCharacter'
  | 'saveVoiceConfigForCharacter'
  | 'markReplyInterrupted'
>;

export function createChatMessagesSlice(rt: ChatRuntime, set: ChatSet, get: ChatGet): ChatMessagesSlice {
  return {
    promptHits: {},
    replyEmotionTags: {},
    contextUsage: null,
    isSummarizing: false,

    summarizeDroppedMessages: (usage, history) => {
      const state = get();
      if (!usage || usage.dropped_messages === 0 || state.isSummarizing) return;
      const chatId = state.activeChatId;
      const session = state.chatSessions.find((s) => s.id === chatId);
      if (!chatId || !session || !state.activeCharacter) return;
      // The context window drops from the front, so the first N conversation messages are out.
      const dropped = history.filter((m) => m.role !== 'system').slice(0, usage.dropped_messages);
      const pending = dropped.filter((m) => m.order_index > session.summary_until);
      const last = pending[pending.length - 1];
      if (pending.length < SUMMARY_BATCH || !last) return;
      const upTo = last.order_index;
      const charName = state.activeCharacter.card.data.name;

      set({ isSummarizing: true });
      const task = { kind: 'summary' as const, title: translate('task.summary', { chat: session.title }) };
      trackTask(get(), task, () =>
        api.summarizeChat({
          chat_id: chatId,
          up_to_index: upTo,
          char_name: charName,
          user_name: state.activePersona.name,
          reply_language: state.replyLanguage || 'Deutsch',
          context_tokens: usage.context_tokens,
          ...llmTarget(state),
        }),
      )
        .then((updated) =>
          set((st) => ({
            chatSessions: st.chatSessions.map((s) => (s.id === updated.id ? updated : s)),
          })),
        )
        .catch((e) => console.warn('Chat summary failed:', e))
        .finally(() => set({ isSummarizing: false }));
    },

    translateText: async (text) => {
      const state = get();
      return api.translateMessage({
        text,
        target_language: state.availableLanguages.find((l) => l.id === state.appLanguage)?.name ?? 'Deutsch',
        ...llmTarget(state),
      });
    },

    suggestReplies: async (notes = '') => {
      const request = await rt.replyHelpRequest(notes);
      return request ? api.suggestChatReplies(request) : [];
    },

    draftReply: async (notes = '') => {
      const request = await rt.replyHelpRequest(notes);
      return request ? api.draftChatReply(request) : '';
    },

    sendSelfie: () => rt.sendPicture('selfie'),

    sendDreamPicture: (dream) => rt.sendPicture('dream', [dream]),

    switchMessageSwipe: async (msgId, swipeIndex) => {
      try {
        const updated = await api.switchMessageSwipe(msgId, swipeIndex);
        set((state) => {
          const stored = state.storedMessages.map((m) => (m.id === msgId ? updated : m));
          const flat: ChatMessage[] = stored.map(toFlat);
          return {
            storedMessages: stored,
            messages: flat,
            chatSessions: withoutStaleSummary(state.chatSessions, updated),
          };
        });
      } catch (e) {
        reportFailure('Failed to switch swipe:', e);
      }
    },

    editChatMessage: async (msgId, newContent) => {
      const chatId = get().activeChatId;
      try {
        const updated = await api.updateChatMessage(msgId, newContent);
        set((state) => ({ chatSessions: withoutStaleSummary(state.chatSessions, updated) }));
        void hintMemorySources(updated.chat_id, msgId, () => get().setMemoryDrawerOpen(true));
        if (get().activeChatId !== chatId) return;
        set((state) => {
          const stored = state.storedMessages.map((m) => (m.id === msgId ? updated : m));
          const flat: ChatMessage[] = stored.map(toFlat);
          return {
            storedMessages: stored,
            messages: flat,
          };
        });
      } catch (e) {
        console.error('Failed to edit chat message:', e);
        throw e;
      }
    },

    deleteChatMessage: async (msgId) => {
      // Hidden at once, deleted after the undo window; "Undo" brings it back untouched.
      const chatOfMessage = get().activeChatId;
      const removed = get().storedMessages.find((m) => m.id === msgId);
      if (!chatOfMessage || !removed) return;
      const show = (stored: StoredChatMessage[]) => set({ storedMessages: stored, messages: stored.map(toFlat) });
      show(get().storedMessages.filter((m) => m.id !== msgId));
      const commit = async () => {
        try {
          await api.deleteChatMessage(msgId);
          void hintMemorySources(chatOfMessage, msgId, () => get().setMemoryDrawerOpen(true));
          const char = get().activeCharacter;
          if (char) {
            const sessions = await api.listChatSessions(char.id);
            if (get().activeCharacter?.id === char.id) set({ chatSessions: visibleSessions(sessions) });
          }
        } catch (e) {
          // The message is still stored; show it again where it was.
          if (get().activeChatId === chatOfMessage && !get().storedMessages.some((m) => m.id === msgId)) {
            show([...get().storedMessages, removed].sort((x, y) => x.order_index - y.order_index));
          }
          reportFailure('Failed to delete chat message:', e);
        }
      };
      const timer = setTimeout(() => void commit(), UNDO_DELETE_MS);
      toast.info(translate('chat.messageDeleted'), {
        label: translate('common.undo'),
        onClick: () => {
          clearTimeout(timer);
          if (get().activeChatId === chatOfMessage && !get().storedMessages.some((m) => m.id === msgId)) {
            show([...get().storedMessages, removed].sort((x, y) => x.order_index - y.order_index));
          }
        },
      });
    },

    autoTtsEnabled: false,
    setAutoTtsEnabled: (enabled) => set({ autoTtsEnabled: enabled }),
    activeVoiceConfig: null,
    speakerVoices: {},

    loadSpeakerVoice: async (speakerId) => {
      if (!speakerId) return get().activeVoiceConfig;
      if (speakerId in get().speakerVoices) return get().speakerVoices[speakerId] ?? null;
      const config = await loadCharacterVoiceConfig(speakerId, [
        ...get().availableCharacters,
        get().activeCharacter,
      ]).catch(() => null);
      set((st) => ({ speakerVoices: { ...st.speakerVoices, [speakerId]: config } }));
      return config;
    },

    loadVoiceConfigForCharacter: async (charId) => {
      try {
        const config = await loadCharacterVoiceConfig(charId, [get().activeCharacter, ...get().availableCharacters]);
        if (get().activeCharacter?.id === charId) set({ activeVoiceConfig: config });
      } catch (e) {
        console.error('Failed to load voice config:', e);
        if (get().activeCharacter?.id === charId) set({ activeVoiceConfig: null });
      }
    },

    saveVoiceConfigForCharacter: async (charId, config) => {
      try {
        await api.saveCharacterVoiceConfig(charId, config);
        if (charId === STAGE_NARRATOR_VOICE_ID) forgetNarratorVoice();
        if (get().activeCharacter?.id === charId) {
          set({ activeVoiceConfig: config });
        }
        // A group chat guest speaks with the new voice from their next reply on (loaded fresh,
        // completed by the card's voice description).
        if (charId in get().speakerVoices) {
          set((st) => {
            const { [charId]: _old, ...rest } = st.speakerVoices;
            return { speakerVoices: rest };
          });
        }
      } catch (e) {
        console.error('Failed to save voice config:', e);
        throw e;
      }
    },

    markReplyInterrupted: async (chatId, heard) => {
      if (get().activeChatId !== chatId || get().isGenerating) return;
      const last = get().storedMessages.at(-1);
      if (!last || last.role !== 'assistant' || last.chat_id !== chatId) return;
      const cut = cutAtHeard(last.content, heard);
      if (cut === null) return;
      await get().editChatMessage(last.id, cut);
    },
  };
}
