import { translate } from '../../i18n';
import { api } from '../../services/api';
import { soundFx } from '../../services/soundFx';
import { streamingTts } from '../../services/streamingTts';
import { extractStateUpdates, applyStateUpdates } from '../../utils/stateParser';
import { HUD_PRESETS } from '../../constants/hudPresets';
import { APP_LANGUAGE_NAMES, llmTarget, resolvePromptWithLore } from '../helpers';
import type {
  DoneEvent,
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
import { trackTask } from './taskSlice';
import { reportFailure } from '../reportFailure';
import { toast } from '../../components/ui/feedback';
import { errorMessage } from '../../utils/errors';
import { fileToBase64 } from '../../utils/files';
import { waitWithAbort } from '../../utils/cancellation';
import { fillCardMacros, languageCode, localizeCard } from '../../utils/cardI18n';

type GenerationFailure = {
  chatId: string;
  message: string;
  kind: 'send' | 'swipe' | 'continue';
  messageId: string;
};

/** Chat messages, streaming, sessions, swipes, HUD presets, reply language and voice. */
export interface ChatSlice {
  /** Message to scroll to and highlight (search hit, bookmark); `nonce` repeats a jump. */
  chatJumpTarget: { messageId: string; nonce: number } | null;
  requestChatJump: (messageId: string) => void;
  /** Bookmarked messages of the open chat (important scenes), in story order. */
  bookmarkedMessageIds: string[];
  toggleBookmark: (messageId: string) => Promise<void>;
  /** Continues the open chat as a new one from `messageId` and opens it. */
  branchChatFrom: (messageId: string) => Promise<void>;
  replyLanguage: string;
  setReplyLanguage: (lang: string) => void;
  messages: ChatMessage[];
  streamingText: string;
  streamingThought: string;
  isGenerating: boolean;
  generationChatId: string | null;
  generationFailure: GenerationFailure | null;
  retryGeneration: () => Promise<void>;
  /** How full the context window was for the last reply. */
  contextUsage: ContextUsage | null;
  isSummarizing: boolean;
  /** After a reply: summarize the messages that no longer fit once enough have piled up. */
  summarizeDroppedMessages: (usage: ContextUsage | null | undefined, history: StoredChatMessage[]) => void;
  updateChatSummary: (summary: string, summaryUntil: number) => Promise<void>;
  /** Translates a message into the app language with the chat model. */
  translateText: (text: string) => Promise<string>;
  /** Sends a message; retries pass the ID of the already saved user message. */
  sendMessage: (content: string, files?: File[], storedMessageId?: string) => Promise<void>;
  generationId: string | null;
  abortGeneration: () => Promise<void>;
  clearChat: () => void;
  activeChatId: string | null;
  isChatLoading: boolean;
  chatLoadError: string | null;
  retryChatLoad: () => Promise<void>;
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

/** A deleted message can be restored this long (the undo toast stays as long). */
const UNDO_DELETE_MS = 8000;

/** Chats deleted but still restorable; lists from the backend leave them out until then. */
const pendingChatDeletes = new Set<string>();
const visibleSessions = (sessions: ChatSession[]) => sessions.filter((s) => !pendingChatDeletes.has(s.id));

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

/**
 * Mirrors the backend (`discard_stale_summary`): changing a message the running summary already
 * covers drops it, so the old version doesn't stay in the prompt; it is rebuilt later.
 */
const withoutStaleSummary = (sessions: ChatSession[], message: StoredChatMessage): ChatSession[] =>
  sessions.map((s) =>
    s.id === message.chat_id && s.summary_until >= message.order_index ? { ...s, summary: '', summary_until: -1 } : s,
  );

/**
 * After the user changed or deleted a message: if the character learned memories from it, say
 * so and offer to check them (they are flagged in the memory drawer).
 */
const hintMemorySources = async (chatId: string, messageId: string, openDrawer: () => void) => {
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

export const createChatSlice: SliceCreator<ChatSlice> = (set, get) => {
  let sessionRequest = 0;
  let generationSessionRequest = 0;
  let cancelled = false;
  let generationSequence = 0;
  let abortPending: Promise<void> | null = null;
  let generationPreparation: AbortController | null = null;
  const isCurrentContext = (chatId: string, charId: string | undefined) =>
    generationSessionRequest === sessionRequest && get().activeChatId === chatId && get().activeCharacter?.id === charId;
  const inContext = (chatId: string, charId: string | undefined) =>
    !cancelled && isCurrentContext(chatId, charId);
  /** A reply the user stopped keeps the text so far (and can be continued) while its chat stays open. */
  const keepsPartial = (done: DoneEvent, chatId: string, charId: string | undefined) =>
    cancelled && done.aborted && done.full_text.trim() !== '' && isCurrentContext(chatId, charId);
  const finishGeneration = async () => {
    if (abortPending) await abortPending.catch(() => {});
    generationPreparation = null;
    set({ isGenerating: false, generationChatId: null, streamingText: '', streamingThought: '' });
  };
  const beginSessionLoad = (chatId: string | null) => {
    const request = ++sessionRequest;
    streamingTts.cancel();
    if (get().isGenerating && get().generationChatId) {
      void get().abortGeneration().catch((error) => console.warn('Navigation abort failed:', error));
    }
    set({ activeChatId: chatId, storedMessages: [], messages: [], contextUsage: null,
      generationId: null, generationFailure: null, streamingText: '', streamingThought: '', isChatLoading: true, chatLoadError: null });
    return request;
  };
  const isSessionCurrent = (request: number, charId: string | undefined) =>
    request === sessionRequest && get().activeCharacter?.id === charId;
  return ({
  replyLanguage: 'Deutsch',

  setReplyLanguage: (replyLanguage) => {
    set({ replyLanguage });
    get().saveCurrentSettings();
  },

  generationChatId: null,
  generationFailure: null,
  retryGeneration: async () => {
    const failure = get().generationFailure;
    if (!failure || get().isGenerating || get().activeChatId !== failure.chatId) return;
    if (failure.kind === 'send') {
      const message = get().storedMessages.find((m) => m.id === failure.messageId && m.role === 'user');
      if (message) await get().sendMessage(message.content, [], message.id);
    } else if (failure.kind === 'swipe') {
      await get().regenerateMessageSwipe(failure.messageId);
    } else {
      await get().continueChatMessage(failure.messageId);
    }
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
    const charName = state.activeCharacter.card.data.name;

    set({ isSummarizing: true });
    const task = { kind: 'summary' as const, title: translate('task.summary', { chat: session.title }) };
    trackTask(get(), task, () => api
      .summarizeChat({
        chat_id: chatId,
        up_to_index: upTo,
        char_name: charName,
        user_name: state.activePersona.name,
        reply_language: state.replyLanguage || 'Deutsch',
        context_tokens: usage.context_tokens,
        ...llmTarget(state),
      }))
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
  generationId: null,

  activeChatId: null,

  chatJumpTarget: null,

  bookmarkedMessageIds: [],

  branchChatFrom: async (messageId) => {
    const chatId = get().activeChatId;
    const char = get().activeCharacter;
    if (!chatId || !char) return;
    const original = get().chatSessions.find((s) => s.id === chatId)?.title ?? translate('chat.newChatTitle');
    try {
      const branch = await api.branchChat(chatId, messageId, translate('chat.branchTitle', { title: original }));
      const sessions = await api.listChatSessions(char.id);
      if (get().activeCharacter?.id !== char.id) return;
      set({ chatSessions: visibleSessions(sessions) });
      await get().switchChatSession(branch.id);
      toast.success(translate('chat.branched', { title: branch.title }));
    } catch (e) {
      reportFailure('Failed to branch chat:', e);
    }
  },

  toggleBookmark: async (messageId) => {
    const chatId = get().activeChatId;
    if (!chatId) return;
    const bookmarked = !get().bookmarkedMessageIds.includes(messageId);
    try {
      await api.setChatBookmark(chatId, messageId, bookmarked);
      if (get().activeChatId !== chatId) return;
      const order = get().storedMessages.map((m) => m.id);
      set((st) => ({
        bookmarkedMessageIds: bookmarked
          ? [...st.bookmarkedMessageIds, messageId].sort((a, b) => order.indexOf(a) - order.indexOf(b))
          : st.bookmarkedMessageIds.filter((id) => id !== messageId),
      }));
    } catch (e) {
      reportFailure('Failed to set bookmark:', e);
    }
  },

  requestChatJump: (messageId) => set((st) => ({ chatJumpTarget: { messageId, nonce: (st.chatJumpTarget?.nonce ?? 0) + 1 } })),
  isChatLoading: false,
  chatLoadError: null,
  retryChatLoad: async () => {
    const { activeChatId, activeCharacter } = get();
    if (activeChatId) await get().switchChatSession(activeChatId);
    else if (activeCharacter) await get().loadChatSessions(activeCharacter.id);
  },

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
    if (get().activeCharacter?.id !== charId) return;
    const previousChatId = get().activeChatId;
    const greeting = greetingFor(get());
    const request = beginSessionLoad(null);
    set({ chatSessions: [] });
    try {
      let sessions = visibleSessions(await api.listChatSessions(charId));
      if (!isSessionCurrent(request, charId)) return;
      let targetId = sessions.find((session) => session.id === previousChatId)?.id ?? sessions[0]?.id;
      if (!targetId) {
        const session = await api.createChatSession(charId, translate('chat.newChatTitle'), greeting);
        if (!isSessionCurrent(request, charId)) return;
        sessions = visibleSessions(await api.listChatSessions(charId));
        if (!isSessionCurrent(request, charId)) return;
        targetId = session.id;
      }
      set({ chatSessions: visibleSessions(sessions) });
      await get().switchChatSession(targetId);
    } catch (e) {
      console.error('Failed to load chat sessions:', e);
      if (isSessionCurrent(request, charId)) set({ chatLoadError: errorMessage(e) });
    } finally {
      if (isSessionCurrent(request, charId)) set({ isChatLoading: false });
    }
  },

  switchChatSession: async (chatId: string) => {
    const charId = get().activeCharacter?.id;
    const request = beginSessionLoad(chatId);
    try {
      const stored = await api.getChatMessages(chatId);
      // Bookmarks are a convenience: the chat opens even if they can't be read.
      const bookmarks = await api.listChatBookmarks(chatId).catch(() => [] as string[]);
      if (!isSessionCurrent(request, charId)) return;
      set({ storedMessages: stored, messages: stored.map(toFlat), bookmarkedMessageIds: bookmarks ?? [] });
    } catch (e) {
      console.error('Failed to switch chat session:', e);
      if (isSessionCurrent(request, charId)) set({ chatLoadError: errorMessage(e) });
    } finally {
      if (isSessionCurrent(request, charId)) set({ isChatLoading: false });
    }
  },

  createNewChat: async (title?: string) => {
    const char = get().activeCharacter;
    if (!char) return null;
    const greeting = greetingFor(get());
    const sessionTitle = title || translate('chat.defaultSessionTitle', { n: get().chatSessions.length + 1 });
    const request = beginSessionLoad(null);
    try {
      const session = await api.createChatSession(char.id, sessionTitle, greeting);
      if (!isSessionCurrent(request, char.id)) return null;
      const sessions = await api.listChatSessions(char.id);
      if (!isSessionCurrent(request, char.id)) return null;
      set({ chatSessions: visibleSessions(sessions) });
      const switchRequest = sessionRequest + 1;
      await get().switchChatSession(session.id);
      return isSessionCurrent(switchRequest, char.id) && get().activeChatId === session.id && !get().chatLoadError ? session : null;
    } catch (e) {
      console.error('Failed to create new chat:', e);
      if (isSessionCurrent(request, char.id)) set({ chatLoadError: errorMessage(e) });
      return null;
    } finally {
      if (isSessionCurrent(request, char.id)) set({ isChatLoading: false });
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
    // Hidden at once (another chat opens), deleted after the undo window.
    const char = get().activeCharacter;
    const removed = get().chatSessions.find((s) => s.id === chatId);
    if (!char || !removed || pendingChatDeletes.has(chatId)) return;
    pendingChatDeletes.add(chatId);
    set((st) => ({ chatSessions: st.chatSessions.filter((s) => s.id !== chatId) }));
    if (get().activeChatId === chatId) await get().loadChatSessions(char.id);
    const commit = async () => {
      try {
        await api.deleteChatSession(chatId);
        pendingChatDeletes.delete(chatId);
      } catch (e) {
        // Still stored: show it in the list again.
        pendingChatDeletes.delete(chatId);
        reportFailure('Failed to delete chat session:', e);
        if (get().activeCharacter?.id === char.id) {
          const sessions = await api.listChatSessions(char.id).catch(() => null);
          if (sessions && get().activeCharacter?.id === char.id) set({ chatSessions: visibleSessions(sessions) });
        }
      }
    };
    const timer = setTimeout(() => void commit(), UNDO_DELETE_MS);
    toast.info(translate('chat.sessionDeleted', { title: removed.title }), {
      label: translate('common.undo'),
      onClick: () => {
        clearTimeout(timer);
        pendingChatDeletes.delete(chatId);
        if (get().activeCharacter?.id !== char.id) return;
        void (async () => {
          try {
            const sessions = await api.listChatSessions(char.id);
            if (get().activeCharacter?.id !== char.id) return;
            set({ chatSessions: visibleSessions(sessions) });
            await get().switchChatSession(chatId);
          } catch (e) {
            reportFailure('Failed to restore chat session:', e);
          }
        })();
      },
    });
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
          chatSessions: withoutStaleSummary(state.chatSessions, updated),
        };
      });
    } catch (e) {
      reportFailure('Failed to switch swipe:', e);
    }
  },

  editChatMessage: async (msgId: string, newContent: string) => {
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

  deleteChatMessage: async (msgId: string) => {
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

    if (get().isGenerating || get().isChatLoading || get().chatLoadError || !activeChatId || !activeCharacter) return;
    const targetMsg = storedMessages.find((m) => m.id === msgId);
    if (!targetMsg) return;

    const activeSession = chatSessions.find((s) => s.id === activeChatId);

    // Messages before this message
    const priorStored = storedMessages.filter((m) => m.order_index < targetMsg.order_index);
    const priorFlat: ChatMessage[] = priorStored.map(toFlat);

    cancelled = false;
    generationSessionRequest = sessionRequest;
    generationSequence += 1;
    const preparation = new AbortController();
    generationPreparation = preparation;
    const generationId = crypto.randomUUID();
    set({ isGenerating: true, generationId, generationChatId: activeChatId, generationFailure: null, streamingText: '', streamingThought: '' });

    try {
      const prompt = await waitWithAbort(() => resolvePromptWithLore(get(), priorFlat, undefined, preparation.signal), preparation.signal);
      if (!inContext(activeChatId, activeCharacter.id)) return;
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
      }, generationId, selectedBackend === 'cloud' ? get().cloudContextTokens : undefined, get().chatTools);
      if (!inContext(activeChatId, activeCharacter.id) && !keepsPartial(done, activeChatId, activeCharacter.id)) return;

      const { cleanedText, stateUpdates } = extractStateUpdates(done.full_text);

      const updatedMsg = await api.addMessageSwipe(
        msgId,
        cleanedText,
        done.full_thought.trim() ? done.full_thought : null
      );
      set((state) => ({ chatSessions: withoutStaleSummary(state.chatSessions, updatedMsg) }));

      if (!isCurrentContext(activeChatId, activeCharacter.id)) return;
      set({ contextUsage: done.context ?? null });
      if (stateUpdates) set({ stateVariables: applyStateUpdates(get().stateVariables, stateUpdates) });
      get().summarizeDroppedMessages(done.context, priorStored);
      set((state) => {
        const stored = state.storedMessages.map((m) => (m.id === msgId ? updatedMsg : m));
        const flat: ChatMessage[] = stored.map(toFlat);
        return {
          storedMessages: stored,
          messages: flat,
          streamingText: '',
          streamingThought: '',
        };
      });

      soundFx.playMessageSent();
    } catch (e) {
      console.error('Regenerate swipe error:', e);
      if (inContext(activeChatId, activeCharacter.id)) {
        set({ generationFailure: { chatId: activeChatId, message: errorMessage(e), kind: 'swipe', messageId: msgId } });
      }
    } finally {
      await finishGeneration();
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

    if (get().isGenerating || get().isChatLoading || get().chatLoadError || !activeChatId || !activeCharacter) return;
    const targetMsg = storedMessages.find((m) => m.id === msgId);
    if (!targetMsg) return;

    // All messages up to and including targetMsg
    const historyStored = storedMessages.filter((m) => m.order_index <= targetMsg.order_index);
    const historyFlat: ChatMessage[] = historyStored.map(toFlat);

    cancelled = false;
    generationSessionRequest = sessionRequest;
    generationSequence += 1;
    const preparation = new AbortController();
    generationPreparation = preparation;
    const generationId = crypto.randomUUID();
    set({ isGenerating: true, generationId, generationChatId: activeChatId, generationFailure: null, streamingText: '', streamingThought: '' });

    try {
      const prompt = await waitWithAbort(() => resolvePromptWithLore(get(), historyFlat, undefined, preparation.signal), preparation.signal);
      if (!inContext(activeChatId, activeCharacter.id)) return;
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
      }, generationId, selectedBackend === 'cloud' ? get().cloudContextTokens : undefined, get().chatTools);
      if (!inContext(activeChatId, activeCharacter.id) && !keepsPartial(done, activeChatId, activeCharacter.id)) return;

      const { cleanedText, stateUpdates } = extractStateUpdates(done.full_text);

      const mergedContent = `${targetMsg.content} ${cleanedText}`.trim();
      const updatedMsg = await api.updateChatMessage(
        msgId,
        mergedContent,
        targetMsg.thought
      );
      set((state) => ({ chatSessions: withoutStaleSummary(state.chatSessions, updatedMsg) }));

      if (!isCurrentContext(activeChatId, activeCharacter.id)) return;
      set({ contextUsage: done.context ?? null });
      if (stateUpdates) set({ stateVariables: applyStateUpdates(get().stateVariables, stateUpdates) });
      get().summarizeDroppedMessages(done.context, historyStored);
      set((state) => {
        const stored = state.storedMessages.map((m) => (m.id === msgId ? updatedMsg : m));
        const flat: ChatMessage[] = stored.map(toFlat);
        return {
          storedMessages: stored,
          messages: flat,
          streamingText: '',
          streamingThought: '',
        };
      });

      soundFx.playMessageSent();
    } catch (e) {
      console.error('Continue message error:', e);
      if (inContext(activeChatId, activeCharacter.id)) {
        set({ generationFailure: { chatId: activeChatId, message: errorMessage(e), kind: 'continue', messageId: msgId } });
      }
    } finally {
      await finishGeneration();
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
      reportFailure('Export failed:', e);
      return null;
    }
  },

  importChatJsonl: async (jsonlContent: string, title?: string) => {
    const char = get().activeCharacter;
    if (!char) return;
    try {
      const imported = await api.importChatJsonl(char.id, jsonlContent, title);
      const sessions = await api.listChatSessions(char.id);
      set({ chatSessions: visibleSessions(sessions) });
      await get().switchChatSession(imported.id);
    } catch (e) {
      console.error('Import failed:', e);
      throw e;
    }
  },

  sendMessage: async (content: string, files: File[] = [], storedMessageId?: string) => {
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

    if (get().isChatLoading || get().chatLoadError) throw new Error(get().chatLoadError ?? translate('chat.historyLoading'));
    if (get().isGenerating || (!content.trim() && files.length === 0 && !storedMessageId)) return;
    cancelled = false;
    generationSessionRequest = sessionRequest;
    generationSequence += 1;
    const preparation = new AbortController();
    generationPreparation = preparation;
    const generationId = crypto.randomUUID();
    set({ isGenerating: true, generationId, generationChatId: activeChatId, generationFailure: null, streamingText: '', streamingThought: '' });
    let userStored: StoredChatMessage | undefined;
    try {
      // Ensure we have an active chat session
      if (!activeChatId && activeCharacter) {
        const newSess = await get().createNewChat();
        if (newSess) activeChatId = newSess.id;
      }

      generationSessionRequest = sessionRequest;
      set({ generationChatId: activeChatId, generationId });
      if (!activeChatId) throw new Error(get().chatLoadError ?? translate('chat.noActiveSession'));
      if (cancelled) throw new Error(translate('chat.sendCancelled'));
      if (!inContext(activeChatId, activeCharacter?.id)) return;

      soundFx.playMessageSent();

      // 1. Store attachments, then the user message
      // A failed upload rejects before anything is stored; the composer reports it.
      const chatId = activeChatId;
      userStored = storedMessageId ? get().storedMessages.find((m) => m.id === storedMessageId && m.role === 'user' && m.chat_id === chatId) : undefined;
      if (storedMessageId && !userStored) return;
      if (!userStored) {
        const attachments: Attachment[] = [];
        for (const file of files) {
          const base64 = await fileToBase64(file, preparation.signal);
          preparation.signal.throwIfAborted();
          // Native writes cannot be rolled back: wait for this one before unlocking.
          attachments.push(await api.saveAttachment(chatId, file.name, base64));
          preparation.signal.throwIfAborted();
        }
        if (cancelled) throw new Error(translate('chat.sendCancelled'));
        if (!inContext(chatId, activeCharacter?.id)) return;
        userStored = await api.addChatMessage(chatId, 'user', content, null, attachments);
      }
      if (!isCurrentContext(chatId, activeCharacter?.id)) return;
      const updatedStored = storedMessageId ? get().storedMessages : [...get().storedMessages, userStored];
      const updatedFlat: ChatMessage[] = updatedStored.map(toFlat);

      set({
        storedMessages: updatedStored,
        messages: updatedFlat,
        streamingText: '',
        streamingThought: '',
        isGenerating: true,
      });

      if (cancelled) return;
      const activeSession = chatSessions.find((s) => s.id === activeChatId);

      // 2. Build context-aware system prompt
      let systemPromptMsg: ChatMessage | null = null;
      let prompt: AssembledPrompt | null = null;
      if (activeCharacter) {
        prompt = await waitWithAbort(() => resolvePromptWithLore(get(), updatedFlat, content, preparation.signal), preparation.signal);
        systemPromptMsg = { role: 'system', content: prompt.system };
      }

      if (!inContext(chatId, activeCharacter?.id)) return;
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
      }, generationId, selectedBackend === 'cloud' ? get().cloudContextTokens : undefined, get().chatTools);
      if (!inContext(chatId, activeCharacter?.id) && !keepsPartial(done, chatId, activeCharacter?.id)) return;

      // 4. Parse <state> tags
      const { cleanedText, stateUpdates } = extractStateUpdates(done.full_text);

      // 5. Add assistant message to DB
      const asstStored = await api.addChatMessage(
        activeChatId,
        'assistant',
        cleanedText,
        done.full_thought.trim() ? done.full_thought : null
      );

      if (!isCurrentContext(chatId, activeCharacter?.id)) return;
      set({ contextUsage: done.context ?? null });
      if (stateUpdates) set({ stateVariables: applyStateUpdates(get().stateVariables, stateUpdates) });
      get().summarizeDroppedMessages(done.context, updatedStored);
      const finalStored = [...get().storedMessages, asstStored];
      const finalFlat: ChatMessage[] = finalStored.map(toFlat);

      set({
        storedMessages: finalStored,
        messages: finalFlat,
        streamingText: '',
        streamingThought: '',
      });

      // Refresh chat sessions to update message count badges
      if (activeCharacter?.id) {
        const refreshRequest = sessionRequest;
        api.listChatSessions(activeCharacter.id).then((sessions) => {
          if (refreshRequest === sessionRequest && get().activeCharacter?.id === activeCharacter.id) set({ chatSessions: visibleSessions(sessions) });
        }).catch((err) => console.warn('Chat session refresh failed:', err));
      }

      // Naturally apply emotional decay tick & refresh soul overview
      if (activeCharacter?.id) {
        api.applyEmotionalDecay(activeCharacter.id)
          .then(() => { if (get().activeCharacter?.id === activeCharacter.id) return get().fetchCognitiveOverview(); })
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
      if (!userStored) throw preparation.signal.aborted ? new Error(translate('chat.sendCancelled')) : e; // Restore an unsaved draft only.
      if (activeChatId && inContext(activeChatId, activeCharacter?.id)) {
        set({ generationFailure: { chatId: activeChatId, message: errorMessage(e), kind: 'send', messageId: userStored.id } });
      }
    } finally {
      await finishGeneration();
    }
  },

  abortGeneration: async () => {
    if (!get().isGenerating) return;
    if (abortPending) return abortPending;
    const sequence = generationSequence;
    const preparation = generationPreparation;
    const chatId = get().generationChatId;
    const generationId = get().generationId;
    cancelled = true;
    set({ generationChatId: null, generationId: null });
    const pending = api.abortChatGeneration();
    abortPending = pending;
    try {
      await pending;
      preparation?.abort();
      // Native inference/writes still retain their lock until the original operation settles.
    } catch (e) {
      if (sequence === generationSequence) {
        cancelled = false;
        set({ generationChatId: generationSessionRequest === sessionRequest ? chatId : null,
          generationId: generationSessionRequest === sessionRequest ? generationId : null });
      }
      console.error('Failed to abort generation:', e);
      throw e;
    } finally {
      if (abortPending === pending) abortPending = null;
    }
  },

  clearChat: async () => {
    const { activeChatId } = get();
    if (activeChatId) await get().deleteChatSession(activeChatId);
  },


  autoTtsEnabled: false,

  setAutoTtsEnabled: (enabled) => set({ autoTtsEnabled: enabled }),

  activeVoiceConfig: null,

  loadVoiceConfigForCharacter: async (charId) => {
    try {
      const config = await api.getCharacterVoiceConfig(charId);
      if (get().activeCharacter?.id === charId) set({ activeVoiceConfig: config });
    } catch (e) {
      console.error('Failed to load voice config:', e);
      if (get().activeCharacter?.id === charId) set({ activeVoiceConfig: null });
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
      throw e;
    }
  },
});
};
