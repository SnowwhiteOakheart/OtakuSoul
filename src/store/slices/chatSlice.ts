import { translate } from '../../i18n';
import { api } from '../../services/api';
import { soundFx } from '../../services/soundFx';
import { extractStateUpdates, applyStateUpdates } from '../../utils/stateParser';
import { HUD_PRESETS } from '../../constants/hudPresets';
import { resolvePromptWithLore } from '../helpers';
import type {
  ChatMessage,
  ChatSession,
  StoredChatMessage,
  VoiceConfig,
} from '../../types';
import type { SliceCreator } from '../storeTypes';

/** Chat messages, streaming, sessions, swipes, HUD presets, reply language and voice. */
export interface ChatSlice {
  replyLanguage: string;
  setReplyLanguage: (lang: string) => void;
  messages: ChatMessage[];
  streamingText: string;
  streamingThought: string;
  isGenerating: boolean;
  sendMessage: (content: string) => Promise<void>;
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

export const createChatSlice: SliceCreator<ChatSlice> = (set, get) => ({
  replyLanguage: 'Deutsch',

  setReplyLanguage: (replyLanguage) => {
    set({ replyLanguage });
    get().saveCurrentSettings();
  },

  messages: [],

  streamingText: '',

  streamingThought: '',

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
        const char = get().activeCharacter;
        if (char?.card.data.first_mes) {
          await api.addChatMessage(newSession.id, 'assistant', char.card.data.first_mes);
        }
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
      const flatMsgs: ChatMessage[] = storedMsgs.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        thought: m.thought || undefined,
      }));

      set({
        activeChatId: chatId,
        storedMessages: storedMsgs,
        messages: flatMsgs,
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

      if (char.card.data.first_mes) {
        await api.addChatMessage(session.id, 'assistant', char.card.data.first_mes);
      }

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
      const char = get().activeCharacter;
      if (char) {
        const sessions = await api.listChatSessions(char.id);
        set({ chatSessions: sessions });
      }
    } catch (e) {
      console.error('Failed to rename chat session:', e);
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
      const char = get().activeCharacter;
      if (char) {
        const sessions = await api.listChatSessions(char.id);
        set({ chatSessions: sessions });
      }
    } catch (e) {
      console.error('Failed to update author note:', e);
    }
  },

  switchMessageSwipe: async (msgId: string, swipeIndex: number) => {
    try {
      const updated = await api.switchMessageSwipe(msgId, swipeIndex);
      set((state) => {
        const stored = state.storedMessages.map((m) => (m.id === msgId ? updated : m));
        const flat: ChatMessage[] = stored.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          thought: m.thought || undefined,
        }));
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
    try {
      const updated = await api.updateChatMessage(msgId, newContent);
      set((state) => {
        const stored = state.storedMessages.map((m) => (m.id === msgId ? updated : m));
        const flat: ChatMessage[] = stored.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          thought: m.thought || undefined,
        }));
        return {
          storedMessages: stored,
          messages: flat,
        };
      });
    } catch (e) {
      console.error('Failed to edit chat message:', e);
    }
  },

  deleteChatMessage: async (msgId: string) => {
    try {
      await api.deleteChatMessage(msgId);
      set((state) => {
        const stored = state.storedMessages.filter((m) => m.id !== msgId);
        const flat: ChatMessage[] = stored.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          thought: m.thought || undefined,
        }));
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
    const priorFlat: ChatMessage[] = priorStored.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
      thought: m.thought || undefined,
    }));

    set({ isGenerating: true, streamingText: '', streamingThought: '' });

    const promptText = await resolvePromptWithLore(get(), priorFlat);
    const systemPromptMsg: ChatMessage = { role: 'system', content: promptText };

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
      });

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
        const flat: ChatMessage[] = stored.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          thought: m.thought || undefined,
        }));
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
    const historyFlat: ChatMessage[] = historyStored.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
      thought: m.thought || undefined,
    }));

    set({ isGenerating: true, streamingText: '', streamingThought: '' });

    const promptText = await resolvePromptWithLore(get(), historyFlat);
    const systemPromptMsg: ChatMessage = { role: 'system', content: promptText };
    const continueInstruction: ChatMessage = {
      role: 'system',
      content: '[Anweisung: Setze deine letzte Nachricht nahtlos und flüssig fort. Wiederhole keine bereits geschriebenen Sätze!]',
    };

    const payloadMessages = [systemPromptMsg, ...historyFlat, continueInstruction];

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
      });

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
        const flat: ChatMessage[] = stored.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          thought: m.thought || undefined,
        }));
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

  sendMessage: async (content: string) => {
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

    if (!content.trim()) return;

    // Ensure we have an active chat session
    if (!activeChatId && activeCharacter) {
      const newSess = await get().createNewChat();
      if (newSess) activeChatId = newSess.id;
    }

    if (!activeChatId) return;

    soundFx.playMessageSent();

    // 1. Add user message to DB
    const userStored = await api.addChatMessage(activeChatId, 'user', content);
    const updatedStored = [...get().storedMessages, userStored];
    const updatedFlat: ChatMessage[] = updatedStored.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
      thought: m.thought || undefined,
    }));

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
    if (activeCharacter) {
      const promptText = await resolvePromptWithLore(get(), updatedFlat, content);
      systemPromptMsg = { role: 'system', content: promptText };
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
      });

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
      const finalFlat: ChatMessage[] = finalStored.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        thought: m.thought || undefined,
      }));

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
      const { autoReflectionEnabled, autoReflectionThreshold, isReflecting } = get();
      if (
        autoReflectionEnabled &&
        !isReflecting &&
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
            content: `⚠️ Inferenz-Fehler: ${e instanceof Error ? e.message : String(e)}`,
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
