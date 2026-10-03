import { translate } from '../../i18n';
import { api } from '../../services/api';
import { soundFx } from '../../services/soundFx';
import { extractStateUpdates, applyStateUpdates } from '../../utils/stateParser';
import { HUD_PRESETS } from '../../constants/hudPresets';
import { APP_LANGUAGE_NAMES, llmTarget, resolvePromptWithLore } from '../helpers';
import type {
  AssembledPrompt,
  Attachment,
  CharacterProfile,
  ChatMessage,
  ChatSession,
  ContextUsage,
  StoredChatMessage,
  UserPersona,
  VoiceConfig,
} from '../../types';
import type { SliceCreator } from '../storeTypes';
import { errorMessage } from '../../utils/errors';
import { fileToBase64 } from '../../utils/files';
import { fillCardMacros, languageCode, localizeCard } from '../../utils/cardI18n';

/** Chat messages, streaming, sessions, swipes, HUD presets, reply language and voice. */
export interface ChatSlice {
  replyLanguage: string;
  setReplyLanguage: (lang: string) => void;
  messages: ChatMessage[];
  streamingText: string;
  streamingThought: string;
  isGenerating: boolean;
  /** How full the context window was for the last reply. */
  contextUsage: ContextUsage | null;
  isSummarizing: boolean;
  /** After a reply: summarize the messages that no longer fit once enough have piled up. */
  summarizeDroppedMessages: (usage: ContextUsage | null | undefined, history: StoredChatMessage[]) => void;
  updateChatSummary: (summary: string, summaryUntil: number) => Promise<void>;
  /** Translates a message into the app language with the chat model. */
  translateText: (text: string) => Promise<string>;
  /** Sends a message; `files` are attached to it (images, text, PDF). */
  sendMessage: (content: string, files?: File[]) => Promise<void>;
  abortGeneration: () => Promise<void>;
  clearChat: () => void;
  activeChatId: string | null;
  chatSessions: ChatSession[];
  storedMessages: StoredChatMessage[];
  chatSidebarOpen: boolean;
  setChatSidebarOpen: (open: boolean) => void;
  activeHudPresetId: string;
  applyHudPreset: (presetId: string) => void;
  loadChatSessions: (charId: string) => Promise<void>;
  switchChatSession: (chatId: string) => Promise<void>;
  createNewChat: (title?: string) => Promise<ChatSession | null>;
  renameChatSession: (chatId: string, title: string) => Promise<void>;
  deleteChatSession: (chatId: string) => Promise<void>;
  updateAuthorNote: (authorNote: string, depth: number) => Promise<void>;
  switchMessageSwipe: (msgId: string, swipeIndex: number) => Promise<void>;
  regenerateMessageSwipe: (msgId: string) => Promise<void>;
  editChatMessage: (msgId: string, newContent: string) => Promise<void>;
  deleteChatMessage: (msgId: string) => Promise<void>;
  continueChatMessage: (msgId: string) => Promise<void>;
  exportCurrentChat: () => Promise<string | null>;
  importChatJsonl: (jsonlContent: string, title?: string) => Promise<void>;
  autoTtsEnabled: boolean;
  setAutoTtsEnabled: (enabled: boolean) => void;
  activeVoiceConfig: VoiceConfig | null;
  loadVoiceConfigForCharacter: (charId: string) => Promise<void>;
  saveVoiceConfigForCharacter: (charId: string, config: VoiceConfig) => Promise<void>;
}

/** A stored message as it goes to the model (attachments included). */
const toFlat = (m: StoredChatMessage): ChatMessage => ({
  role: m.role as 'user' | 'assistant' | 'system',
  content: m.content,
  thought: m.thought || undefined,
  attachments: m.attachments.length > 0 ? m.attachments : undefined,
});

/** The card's or template's post-history instruction as a trailing system message. */
const postHistory = (prompt: AssembledPrompt | null): ChatMessage[] =>
  prompt?.post_history ? [{ role: 'system', content: prompt.post_history }] : [];

/** Summarize once this many conversation messages have left the context window. */
const SUMMARY_BATCH = 6;

/** The active character's first message in the reply language, with {{char}}/{{user}} filled in. */
const greetingFor = (state: {
  activeCharacter: CharacterProfile | null;
  activePersona: UserPersona;
  replyLanguage: string;
}): string => {
  if (!state.activeCharacter) return '';
  const data = localizeCard(state.activeCharacter.card.data, languageCode(state.replyLanguage));
  return data.first_mes ? fillCardMacros(data.first_mes, data.name, state.activePersona.name) : '';
};

export const createChatSlice: SliceCreator<ChatSlice> = (set, get) => ({
  replyLanguage: 'Deutsch',

  setReplyLanguage: (replyLanguage) => {
    set({ replyLanguage });
    get().saveCurrentSettings();
  },

  messages: [],

  streamingText: '',

  streamingThought: '',

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

    set({ isSummarizing: true });
    api
      .summarizeChat({
        chat_id: chatId,
        up_to_index: upTo,
        char_name: state.activeCharacter.card.data.name,
        user_name: state.activePersona.name,
        reply_language: state.replyLanguage || 'Deutsch',
        context_tokens: usage.context_tokens,
        ...llmTarget(state),
      })
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
      target_language: APP_LANGUAGE_NAMES[state.appLanguage] ?? 'Deutsch',
      ...llmTarget(state),
    });
  },

  updateChatSummary: async (summary, summaryUntil) => {
    const chatId = get().activeChatId;
    if (!chatId) return;
    await api.updateChatSummary(chatId, summary, summaryUntil);
    set((st) => ({
      chatSessions: st.chatSessions.map((s) =>
        s.id === chatId ? { ...s, summary, summary_until: summaryUntil } : s,
      ),
    }));
  },

  isGenerating: false,

  activeChatId: null,

  chatSessions: [],

  storedMessages: [],

  chatSidebarOpen: false,

  setChatSidebarOpen: (chatSidebarOpen) => set({ chatSidebarOpen }),

  activeHudPresetId: 'romance',

  applyHudPreset: (presetId: string) => {
    const preset = HUD_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      set({
        activeHudPresetId: presetId,
        stateVariables: preset.defaultVariables,
      });
    }
  },

  loadChatSessions: async (charId: string) => {
    try {
      const sessions = await api.listChatSessions(charId);
      if (sessions.length === 0) {
        const newSession = await api.createChatSession(charId, translate('chat.newChatTitle'));
        const greeting = greetingFor(get());
        if (greeting) await api.addChatMessage(newSession.id, 'assistant', greeting);
        const updatedSessions = await api.listChatSessions(charId);
        set({ chatSessions: updatedSessions });
        await get().switchChatSession(newSession.id);
      } else {
        set({ chatSessions: sessions });
        const currentActive = sessions.find((s) => s.id === get().activeChatId);
        const targetId = currentActive?.id ?? sessions[0]?.id;
        if (targetId) await get().switchChatSession(targetId);
      }
    } catch (e) {
      console.error('Failed to load chat sessions:', e);
    }
  },

  switchChatSession: async (chatId: string) => {
    try {
      const storedMsgs = await api.getChatMessages(chatId);
      const flatMsgs: ChatMessage[] = storedMsgs.map(toFlat);

      set({
        activeChatId: chatId,
        storedMessages: storedMsgs,
        messages: flatMsgs,
        contextUsage: null,
        streamingText: '',
        streamingThought: '',
      });
    } catch (e) {
      console.error('Failed to switch chat session:', e);
    }
  },

  createNewChat: async (title?: string) => {
    const char = get().activeCharacter;
    if (!char) return null;

    try {
      const sessionTitle = title || translate('chat.defaultSessionTitle', { n: get().chatSessions.length + 1 });
      const session = await api.createChatSession(char.id, sessionTitle);

      const greeting = greetingFor(get());
      if (greeting) await api.addChatMessage(session.id, 'assistant', greeting);

      const sessions = await api.listChatSessions(char.id);
      set({ chatSessions: sessions });
      await get().switchChatSession(session.id);
      return session;
    } catch (e) {
      console.error('Failed to create new chat:', e);
      return null;
    }
  },

  renameChatSession: async (chatId: string, title: string) => {
    try {
      await api.renameChatSession(chatId, title);
      set((st) => ({
        chatSessions: st.chatSessions.map((s) => s.id === chatId ? { ...s, title } : s),
      }));
    } catch (e) {
      console.error('Failed to rename chat session:', e);
      throw e;
    }
  },

  deleteChatSession: async (chatId: string) => {
    const char = get().activeCharacter;
    if (!char) return;

    try {
      await api.deleteChatSession(chatId);
      await get().loadChatSessions(char.id);
    } catch (e) {
      console.error('Failed to delete chat session:', e);
    }
  },

  updateAuthorNote: async (authorNote: string, depth: number) => {
    const chatId = get().activeChatId;
    if (!chatId) return;

    try {
      await api.updateChatAuthorNote(chatId, authorNote, depth);
      set((st) => ({
        chatSessions: st.chatSessions.map((s) => s.id === chatId ? { ...s, author_note: authorNote, author_note_depth: depth } : s),
      }));
    } catch (e) {
      console.error('Failed to update author note:', e);
      throw e;
    }
  },

  switchMessageSwipe: async (msgId: string, swipeIndex: number) => {
    try {
      const updated = await api.switchMessageSwipe(msgId, swipeIndex);
      set((state) => {
        const stored = state.storedMessages.map((m) => (m.id === msgId ? updated : m));
        const flat: ChatMessage[] = stored.map(toFlat);
        return {
          storedMessages: stored,
          messages: flat,
        };
      });
    } catch (e) {
      console.error('Failed to switch swipe:', e);
    }
  },

  editChatMessage: async (msgId: string, newContent: string) => {
    const chatId = get().activeChatId;
    try {
      const updated = await api.updateChatMessage(msgId, newContent);
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

  deleteChatMessage: async (msgId: string) => {
    try {
      await api.deleteChatMessage(msgId);
      set((state) => {
        const stored = state.storedMessages.filter((m) => m.id !== msgId);
        const flat: ChatMessage[] = stored.map(toFlat);
        return {
          storedMessages: stored,
          messages: flat,
        };
      });
      const char = get().activeCharacter;
      if (char) {
        const sessions = await api.listChatSessions(char.id);
        set({ chatSessions: sessions });
      }
    } catch (e) {
      console.error('Failed to delete chat message:', e);
    }
  },

  regenerateMessageSwipe: async (msgId: string) => {
    const {
      activeChatId,
      storedMessages,
      selectedBackend,
      serverConfig,
      cloudEndpoint,
      cloudApiKey,
      cloudModel,
      cloudProvider,
      activeCharacter,
      sampling,
      chatSessions,
    } = get();

    if (!activeChatId || !activeCharacter) return;
    const targetMsg = storedMessages.find((m) => m.id === msgId);
    if (!targetMsg) return;

    const activeSession = chatSessions.find((s) => s.id === activeChatId);

    // Messages before this message
    const priorStored = storedMessages.filter((m) => m.order_index < targetMsg.order_index);
    const priorFlat: ChatMessage[] = priorStored.map(toFlat);

    set({ isGenerating: true, streamingText: '', streamingThought: '' });

    const prompt = await resolvePromptWithLore(get(), priorFlat);
    const systemPromptMsg: ChatMessage = { role: 'system', content: prompt.system };

    const payloadMessages = [systemPromptMsg, ...priorFlat];

    // Inject author note at depth if requested
    if (activeSession?.author_note && (activeSession.author_note_depth || 0) > 0) {
      const depth = activeSession.author_note_depth;
      const insertIdx = Math.max(1, payloadMessages.length - depth);
      payloadMessages.splice(insertIdx, 0, {
        role: 'system',
        content: `[Author's note: ${activeSession.author_note}]`,
      });
    }
    payloadMessages.push(...postHistory(prompt));

    const endpoint =
      selectedBackend === 'local'
        ? `http://127.0.0.1:${serverConfig.port}/v1/chat/completions`
        : cloudEndpoint;

    try {
      const done = await api.sendChatMessage({
        endpoint_url: endpoint,
        provider: selectedBackend === 'cloud' ? cloudProvider : 'local_llama',
        api_key: selectedBackend === 'cloud' ? cloudApiKey : undefined,
        model: selectedBackend === 'cloud' ? cloudModel : undefined,
        messages: payloadMessages,
        reasoning_mode: serverConfig.reasoning_mode,
        sampling: {
          ...sampling,
        },
      }, selectedBackend === 'cloud' ? get().cloudContextTokens : undefined);
      set({ contextUsage: done.context ?? null });
      get().summarizeDroppedMessages(done.context, priorStored);

      const { cleanedText, stateUpdates } = extractStateUpdates(done.full_text);
      if (stateUpdates) {
        set({ stateVariables: applyStateUpdates(get().stateVariables, stateUpdates) });
      }

      const updatedMsg = await api.addMessageSwipe(
        msgId,
        cleanedText,
        done.full_thought.trim() ? done.full_thought : null
      );

      set((state) => {
        const stored = state.storedMessages.map((m) => (m.id === msgId ? updatedMsg : m));
        const flat: ChatMessage[] = stored.map(toFlat);
        return {
          storedMessages: stored,
          messages: flat,
          streamingText: '',
          streamingThought: '',
          isGenerating: false,
        };
      });

      soundFx.playMessageSent();
    } catch (e) {
      console.error('Regenerate swipe error:', e);
      set({ isGenerating: false });
    }
  },

  continueChatMessage: async (msgId: string) => {
    const {
      activeChatId,
      storedMessages,
      selectedBackend,
      serverConfig,
      cloudEndpoint,
      cloudApiKey,
      cloudModel,
      cloudProvider,
      activeCharacter,
      sampling,
    } = get();

    if (!activeChatId || !activeCharacter) return;
    const targetMsg = storedMessages.find((m) => m.id === msgId);
    if (!targetMsg) return;

    // All messages up to and including targetMsg
    const historyStored = storedMessages.filter((m) => m.order_index <= targetMsg.order_index);
    const historyFlat: ChatMessage[] = historyStored.map(toFlat);

    set({ isGenerating: true, streamingText: '', streamingThought: '' });

    const prompt = await resolvePromptWithLore(get(), historyFlat);
    const systemPromptMsg: ChatMessage = { role: 'system', content: prompt.system };
    const continueInstruction: ChatMessage = {
      role: 'system',
      content: '[Anweisung: Setze deine letzte Nachricht nahtlos und flüssig fort. Wiederhole keine bereits geschriebenen Sätze!]',
    };

    const payloadMessages = [systemPromptMsg, ...historyFlat, ...postHistory(prompt), continueInstruction];

    const endpoint =
      selectedBackend === 'local'
        ? `http://127.0.0.1:${serverConfig.port}/v1/chat/completions`
        : cloudEndpoint;

    try {
      const done = await api.sendChatMessage({
        endpoint_url: endpoint,
        provider: selectedBackend === 'cloud' ? cloudProvider : 'local_llama',
        api_key: selectedBackend === 'cloud' ? cloudApiKey : undefined,
        model: selectedBackend === 'cloud' ? cloudModel : undefined,
        messages: payloadMessages,
        reasoning_mode: serverConfig.reasoning_mode,
        sampling: {
          ...sampling,
        },
      }, selectedBackend === 'cloud' ? get().cloudContextTokens : undefined);
      set({ contextUsage: done.context ?? null });
      get().summarizeDroppedMessages(done.context, historyStored);

      const { cleanedText, stateUpdates } = extractStateUpdates(done.full_text);
      if (stateUpdates) {
        set({ stateVariables: applyStateUpdates(get().stateVariables, stateUpdates) });
      }

      const mergedContent = `${targetMsg.content} ${cleanedText}`.trim();
      const updatedMsg = await api.updateChatMessage(
        msgId,
        mergedContent,
        targetMsg.thought
      );

      set((state) => {
        const stored = state.storedMessages.map((m) => (m.id === msgId ? updatedMsg : m));
        const flat: ChatMessage[] = stored.map(toFlat);
        return {
          storedMessages: stored,
          messages: flat,
          streamingText: '',
          streamingThought: '',
          isGenerating: false,
        };
      });

      soundFx.playMessageSent();
    } catch (e) {
      console.error('Continue message error:', e);
      set({ isGenerating: false });
    }
  },

  exportCurrentChat: async () => {
    const { activeChatId, activeCharacter, activePersona } = get();
    if (!activeChatId || !activeCharacter) return null;
    try {
      return await api.exportChatJsonl(
        activeChatId,
        activeCharacter.card.data.name,
        activePersona.name
      );
    } catch (e) {
      console.error('Export failed:', e);
      return null;
    }
  },

  importChatJsonl: async (jsonlContent: string, title?: string) => {
    const char = get().activeCharacter;
    if (!char) return;
    try {
      const imported = await api.importChatJsonl(char.id, jsonlContent, title);
      const sessions = await api.listChatSessions(char.id);
      set({ chatSessions: sessions });
      await get().switchChatSession(imported.id);
    } catch (e) {
      console.error('Import failed:', e);
    }
  },

  sendMessage: async (content: string, files: File[] = []) => {
    let { activeChatId } = get();
    const {
      activeCharacter,
      selectedBackend,
      serverConfig,
      cloudEndpoint,
      cloudApiKey,
      cloudModel,
      cloudProvider,
      sampling,
      chatSessions,
    } = get();

    if (!content.trim() && files.length === 0) return;

    // Ensure we have an active chat session
    if (!activeChatId && activeCharacter) {
      const newSess = await get().createNewChat();
      if (newSess) activeChatId = newSess.id;
    }

    if (!activeChatId) return;

    soundFx.playMessageSent();

    // 1. Store attachments, then the user message
    // A failed upload rejects before anything is stored; the composer reports it.
    const chatId = activeChatId;
    const attachments: Attachment[] = await Promise.all(
      files.map(async (file) => api.saveAttachment(chatId, file.name, await fileToBase64(file))),
    );
    const userStored = await api.addChatMessage(activeChatId, 'user', content, null, attachments);
    const updatedStored = [...get().storedMessages, userStored];
    const updatedFlat: ChatMessage[] = updatedStored.map(toFlat);

    set({
      storedMessages: updatedStored,
      messages: updatedFlat,
      streamingText: '',
      streamingThought: '',
      isGenerating: true,
    });

    const activeSession = chatSessions.find((s) => s.id === activeChatId);

    // 2. Build context-aware system prompt
    let systemPromptMsg: ChatMessage | null = null;
    let prompt: AssembledPrompt | null = null;
    if (activeCharacter) {
      prompt = await resolvePromptWithLore(get(), updatedFlat, content);
      systemPromptMsg = { role: 'system', content: prompt.system };
    }

    const payloadMessages = systemPromptMsg
      ? [systemPromptMsg, ...updatedFlat]
      : updatedFlat;

    // 3. Inject Author's Note at depth if configured
    if (activeSession?.author_note && (activeSession.author_note_depth || 0) > 0) {
      const depth = activeSession.author_note_depth;
      const insertIdx = Math.max(1, payloadMessages.length - depth);
      payloadMessages.splice(insertIdx, 0, {
        role: 'system',
        content: `[Author's note: ${activeSession.author_note}]`,
      });
    }
    payloadMessages.push(...postHistory(prompt));

    const endpoint =
      selectedBackend === 'local'
        ? `http://127.0.0.1:${serverConfig.port}/v1/chat/completions`
        : cloudEndpoint;

    try {
      const done = await api.sendChatMessage({
        endpoint_url: endpoint,
        provider: selectedBackend === 'cloud' ? cloudProvider : 'local_llama',
        api_key: selectedBackend === 'cloud' ? cloudApiKey : undefined,
        model: selectedBackend === 'cloud' ? cloudModel : undefined,
        messages: payloadMessages,
        reasoning_mode: serverConfig.reasoning_mode,
        sampling: {
          ...sampling,
        },
      }, selectedBackend === 'cloud' ? get().cloudContextTokens : undefined);
      set({ contextUsage: done.context ?? null });
      get().summarizeDroppedMessages(done.context, updatedStored);

      // 4. Parse <state> tags
      const { cleanedText, stateUpdates } = extractStateUpdates(done.full_text);
      if (stateUpdates) {
        set({ stateVariables: applyStateUpdates(get().stateVariables, stateUpdates) });
      }

      // 5. Add assistant message to DB
      const asstStored = await api.addChatMessage(
        activeChatId,
        'assistant',
        cleanedText,
        done.full_thought.trim() ? done.full_thought : null
      );

      const finalStored = [...get().storedMessages, asstStored];
      const finalFlat: ChatMessage[] = finalStored.map(toFlat);

      set({
        storedMessages: finalStored,
        messages: finalFlat,
        streamingText: '',
        streamingThought: '',
        isGenerating: false,
      });

      // Refresh chat sessions to update message count badges
      if (activeCharacter?.id) {
        api.listChatSessions(activeCharacter.id).then((sessions) => {
          set({ chatSessions: sessions });
        });
      }

      // Naturally apply emotional decay tick & refresh soul overview
      if (activeCharacter?.id) {
        api.applyEmotionalDecay(activeCharacter.id)
          .then(() => get().fetchCognitiveOverview())
          .catch((err) => console.warn('Decay tick error:', err));
      }

      // Check for automatic cognitive reflection after batch
      const { autoReflectionEnabled, autoReflectionThreshold, isReflecting, memoryOperation } = get();
      if (
        autoReflectionEnabled &&
        !isReflecting &&
        !memoryOperation &&
        finalStored.length >= autoReflectionThreshold &&
        finalStored.length % autoReflectionThreshold === 0
      ) {
        get().triggerMemoryPipeline(autoReflectionThreshold).catch((err) => {
          console.warn('Auto-reflection error:', err);
        });
      }
    } catch (e) {
      console.error('Chat error:', e);
      set((state) => ({
        messages: [
          ...state.messages,
          {
            role: 'assistant',
            content: translate('chat.inferenceError', { error: errorMessage(e) }),
          },
        ],
        streamingText: '',
        streamingThought: '',
        isGenerating: false,
      }));
    }
  },

  abortGeneration: async () => {
    try {
      await api.abortChatGeneration();
      set({ isGenerating: false });
    } catch (e) {
      console.error('Failed to abort generation:', e);
    }
  },

  clearChat: async () => {
    const { activeChatId, activeCharacter } = get();
    if (!activeChatId) return;

    try {
      await api.deleteChatSession(activeChatId);
      if (activeCharacter) {
        await get().loadChatSessions(activeCharacter.id);
      }
    } catch (e) {
      console.error('Failed to clear chat:', e);
    }
  },

  autoTtsEnabled: false,

  setAutoTtsEnabled: (enabled) => set({ autoTtsEnabled: enabled }),

  activeVoiceConfig: null,

  loadVoiceConfigForCharacter: async (charId) => {
    try {
      const config = await api.getCharacterVoiceConfig(charId);
      set({ activeVoiceConfig: config });
    } catch (e) {
      console.error('Failed to load voice config:', e);
      set({ activeVoiceConfig: null });
    }
  },

  saveVoiceConfigForCharacter: async (charId, config) => {
    try {
      await api.saveCharacterVoiceConfig(charId, config);
      if (get().activeCharacter?.id === charId) {
        set({ activeVoiceConfig: config });
      }
    } catch (e) {
      console.error('Failed to save voice config:', e);
    }
  },
});
