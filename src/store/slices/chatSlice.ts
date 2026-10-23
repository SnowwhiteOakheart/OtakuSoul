import { translate } from '../../i18n';
import { api } from '../../services/api';
import { soundFx } from '../../services/soundFx';
import { streamingTts } from '../../services/streamingTts';
import { extractStateUpdates, applyStateUpdates } from '../../utils/stateParser';
import { emotionTagOf, withoutEmotionTag } from '../../utils/replyTags';
import { HUD_PRESETS } from '../../constants/hudPresets';
import { chatSampling, llmTarget, hitKey, mergeHits, resolvePromptWithLore, type PromptHits, type PromptSpeaker } from '../helpers';
import type {
  DoneEvent,
  AssembledPrompt,
  Attachment,
  CharacterProfile,
  ChatMessage,
  ChatSession,
  ChatStyle,
  ContextUsage,
  ReplyIdeasRequest,
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
import { languageCode, localizeCard } from '../../utils/cardI18n';
import { isRepeat } from '../../utils/repetition';
import { applyReplacements, applyScripts, forPrompt } from '../../utils/replyFilters';
import { STAGE_NARRATOR_VOICE_ID, forgetNarratorVoice } from '../../services/narratorVoice';
import { loadCharacterVoiceConfig } from '../../services/characterVoice';
import { GROUP_MAX_REPLIES, chatSpeakers, groupHistory, memoryCharacter, presentedAs } from '../../utils/groupChat';

type GenerationFailure = {
  chatId: string;
  message: string;
  /** The error as thrown (coded backend text), for the fix button. */
  cause?: string;
  /** `speak`: a reply by `messageId` (a speaker ID) without a new user message ("reply as"). */
  kind: 'send' | 'swipe' | 'continue' | 'speak';
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
  /** Lorebook entries, memories and summary each reply could draw on, by `hitKey` (this session only). */
  promptHits: Record<string, PromptHits>;
  /** The expression tag each reply ended with (`[emotion: …]`, removed from the text), by `hitKey`; this session only. */
  replyEmotionTags: Record<string, string>;
  /** A few short ideas for the user's next message in the open chat, built on `notes` (throws on failure). */
  suggestReplies: (notes?: string) => Promise<string[]>;
  /** "Write for me": the user's next message, built from `notes` if any (throws on failure). */
  draftReply: (notes?: string) => Promise<string>;
  /**
   * Sends a message; retries pass the ID of the already saved user message. In a group chat
   * `replySpeaker` picks who answers ('' = the chat's own character).
   */
  sendMessage: (content: string, files?: File[], storedMessageId?: string, replySpeaker?: string) => Promise<void>;
  /** A reply by one character of a group chat ('' = the chat's own) without a new user message. */
  replyAs: (speakerId: string) => Promise<void>;
  /**
   * The chat's character writes on their own (`instruction` says why, given their name); returns
   * the saved message, or null when nothing was written (busy, other chat, failure).
   */
  writeOnOwn: (instruction: (name: string) => string) => Promise<StoredChatMessage | null>;
  /**
   * Like `writeOnOwn`, for a character's chat that is not open: written in the background (a
   * reply in the open chat has priority and stops it). Null when nothing was written.
   */
  writeOnOwnIn: (charId: string, chatId: string, instruction: (name: string) => string) => Promise<StoredChatMessage | null>;
  /**
   * The chat's character sends a selfie (as their message with the picture), drawn from the
   * recent chat and their portrait. Returns the message, or null when no picture came (no image
   * engine, other chat meanwhile); failures are thrown.
   */
  sendSelfie: () => Promise<StoredChatMessage | null>;
  /** A picture of the dream the character just told (`dream` = its text), as their message. */
  sendDreamPicture: (dream: string) => Promise<StoredChatMessage | null>;
  /** Invites characters into a chat or removes them (group chat); throws on failure. */
  setChatMembers: (chatId: string, members: string[]) => Promise<void>;
  /** Who writes the running (or last) reply: '' = the chat's own character, else a guest's ID. */
  generationSpeakerId: string;
  /** Voices of group chat guests by character ID (loaded when they first speak). */
  speakerVoices: Record<string, VoiceConfig | null>;
  /** The voice of a speaker of the open chat ('' = the chat's own character), loading a guest's once. */
  loadSpeakerVoice: (speakerId: string) => Promise<VoiceConfig | null>;
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
  /** Look and sound of a chat; errors go to the caller. */
  updateChatStyle: (chatId: string, style: ChatStyle | null) => Promise<void>;
  deleteChatSession: (chatId: string) => Promise<void>;
  updateAuthorNote: (authorNote: string, depth: number) => Promise<void>;
  switchMessageSwipe: (msgId: string, swipeIndex: number) => Promise<void>;
  regenerateMessageSwipe: (msgId: string) => Promise<void>;
  editChatMessage: (msgId: string, newContent: string) => Promise<void>;
  deleteChatMessage: (msgId: string) => Promise<void>;
  continueChatMessage: (msgId: string) => Promise<void>;
  /** Writes the open chat as SillyTavern JSONL to `targetPath`; reports failures itself. */
  exportCurrentChat: (targetPath: string) => Promise<boolean>;
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
/** Remembers a reply's expression tag (a continuation's own tag replaces the earlier one). */
const withEmotionTag = (tags: Record<string, string>, key: string, fullText: string): Record<string, string> => {
  const tag = emotionTagOf(fullText);
  return tag ? { ...tags, [key]: tag } : tags;
};

const postHistory = (prompt: AssembledPrompt | null): ChatMessage[] =>
  prompt?.post_history ? [{ role: 'system', content: prompt.post_history }] : [];

/** The chat's author's note at its depth (counted from the end of the history). */
const withAuthorNote = (messages: ChatMessage[], session: ChatSession | undefined): ChatMessage[] => {
  if (!session?.author_note || (session.author_note_depth || 0) <= 0) return messages;
  const at = Math.max(1, messages.length - session.author_note_depth);
  return [...messages.slice(0, at), { role: 'system', content: `[Author's note: ${session.author_note}]` }, ...messages.slice(at)];
};

/**
 * A message a character writes on their own in another chat than the open one. The backend runs
 * one chat generation at a time, so a reply in the open chat stops it first ([`makeRoomForChat`]).
 */
let backgroundWrite: { abort: AbortController; done: Promise<unknown> } | null = null;

/** Stops a message being written in the background and waits until the backend is free. */
async function makeRoomForChat() {
  const running = backgroundWrite;
  if (!running) return;
  running.abort.abort();
  await api.abortChatGeneration().catch(() => {});
  await running.done.catch(() => {});
}

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

/**
 * The active character's greetings in the reply language (first message, then the alternatives as
 * swipes), with their macros filled in once: a greeting is stored as the chat began.
 */
const greetingsFor = async (state: {
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

export const createChatSlice: SliceCreator<ChatSlice> = (set, get) => {
  let sessionRequest = 0;
  let generationSessionRequest = 0;
  let cancelled = false;
  let generationSequence = 0;
  let abortPending: Promise<void> | null = null;
  let generationPreparation: AbortController | null = null;
  /** What reply ideas and "Write for me" send: names, persona, language and the end of the open chat. */
  const replyHelpRequest = async (notes: string): Promise<ReplyIdeasRequest | null> => {
    const chatId = get().activeChatId;
    const char = get().activeCharacter;
    if (!chatId || !char) return null;
    await get().ensureLocalAi();
    const state = get();
    return {
      chat_id: chatId,
      char_name: localizeCard(char.card.data, languageCode(state.replyLanguage)).name || char.card.data.name,
      user_name: state.activePersona.name,
      user_description: state.activePersona.description ?? '',
      language: state.replyLanguage,
      notes,
      ...llmTarget(state),
    };
  };
  const isCurrentContext = (chatId: string, charId: string | undefined) =>
    generationSessionRequest === sessionRequest && get().activeChatId === chatId && get().activeCharacter?.id === charId;
  const inContext = (chatId: string, charId: string | undefined) =>
    !cancelled && isCurrentContext(chatId, charId);
  /** A reply the user stopped keeps the text so far (and can be continued) while its chat stays open. */
  const keepsPartial = (done: DoneEvent, chatId: string, charId: string | undefined) =>
    cancelled && done.aborted && done.full_text.trim() !== '' && isCurrentContext(chatId, charId);
  /**
   * How one speaker sees the chat: in a group chat their own card and memory, the others present
   * and the history with names; in a normal chat the history as it is.
   */
  const speakerSetup = async (chatId: string, speakerId: string, stored: StoredChatMessage[], signal: AbortSignal) => {
    const state = get();
    const session = state.chatSessions.find((s) => s.id === chatId);
    const speakers = chatSpeakers(state.activeCharacter, session, state.availableCharacters);
    if (speakers.length < 2) return { speaker: undefined, flat: stored.map(toFlat), name: state.activeCharacter?.card.data.name ?? '' };
    // A guest who left the chat (or whose card is gone) falls back to the chat's own character.
    const self = speakers.find((s) => s.id === speakerId) ?? speakers[0]!;
    const nameOf = (id: string) => presentedAs((speakers.find((s) => s.id === id) ?? speakers[0]!).character, state.replyLanguage).name;
    // The loaded overview is the host's unless the memory drawer shows a guest right now.
    const showsHost = memoryCharacter(state)?.id === state.activeCharacter?.id;
    const cognitive = self.id === '' && showsHost
      ? state.cognitiveOverview
      : await waitWithAbort(() => api.getCognitiveOverview(self.character.id, state.activePersona.name).catch(() => null), signal);
    const speaker: PromptSpeaker = {
      character: self.character,
      cognitive,
      others: speakers.filter((s) => s.id !== self.id).map((s) => presentedAs(s.character, state.replyLanguage)),
    };
    return { speaker, flat: groupHistory(stored, self.id, nameOf, state.activePersona.name), name: nameOf(self.id) };
  };

  /**
   * Prompt, request and saving of one new reply by `speakerId` ('' = the chat's own character)
   * after `history`. Runs inside a generation its caller started (lock, abort, failure handling);
   * returns null when the chat changed meanwhile.
   */
  const writeReply = async (run: {
    chatId: string;
    charId: string | undefined;
    history: StoredChatMessage[];
    speakerId: string;
    latestUserText?: string;
    generationId: string;
    preparation: AbortController;
    /** No new user message before this reply ("reply as …"): tell the model whose turn it is. */
    nudge?: boolean;
    /** Instead of the nudge: why the character writes now (on their own), given their name. */
    instruction?: (name: string) => string;
  }) => {
    const { chatId, charId, history, speakerId, generationId, preparation } = run;
    // The local AI starts with the first message (the task list shows the loading).
    await waitWithAbort(() => get().ensureLocalAi(), preparation.signal);
    const setup = await speakerSetup(chatId, speakerId, history, preparation.signal);
    const prompt = await waitWithAbort(
      () => resolvePromptWithLore(get(), setup.flat, run.latestUserText, preparation.signal, setup.speaker), preparation.signal);
    if (!inContext(chatId, charId)) return null;
    const payloadMessages: ChatMessage[] = prompt.system ? [{ role: 'system', content: prompt.system }, ...setup.flat] : [...setup.flat];

    payloadMessages.splice(0, payloadMessages.length, ...withAuthorNote(payloadMessages, get().chatSessions.find((s) => s.id === chatId)));
    payloadMessages.push(...postHistory(prompt));
    if (run.instruction) payloadMessages.push({ role: 'system', content: run.instruction(setup.name) });
    else if (run.nudge) payloadMessages.push({ role: 'system', content: `[It is ${setup.name}'s turn to speak.]` });

    // A guest reads aloud with their own voice: load it before the first token arrives.
    if (speakerId) await get().loadSpeakerVoice(speakerId);
    const state = get();
    set({ generationSpeakerId: speakerId });
    await makeRoomForChat();
    const done = await api.sendChatMessage({
      endpoint_url: state.selectedBackend === 'local' ? `http://127.0.0.1:${state.serverConfig.port}/v1/chat/completions` : state.cloudEndpoint,
      provider: state.selectedBackend === 'cloud' ? state.cloudProvider : 'local_llama',
      api_key: state.selectedBackend === 'cloud' ? state.cloudApiKey : undefined,
      model: state.selectedBackend === 'cloud' ? state.cloudModel : undefined,
      messages: forPrompt(payloadMessages, get().replyReplacements),
      reasoning_mode: state.serverConfig.reasoning_mode,
      sampling: chatSampling(state),
    }, generationId, state.selectedBackend === 'cloud' ? state.cloudContextTokens : undefined, state.chatTools);
    if (!inContext(chatId, charId) && !keepsPartial(done, chatId, charId)) return null;

    // <state> tags update the HUD; the user's replacement rules apply first.
    const { cleanedText, stateUpdates } = extractStateUpdates(withoutEmotionTag(applyReplacements(done.full_text, get().replyReplacements)));
    const thought = done.full_thought.trim() ? done.full_thought : null;
    const stored = speakerId
      ? await api.addChatMessage(chatId, 'assistant', cleanedText, thought, undefined, speakerId)
      : await api.addChatMessage(chatId, 'assistant', cleanedText, thought);
    set((st) => ({
      promptHits: { ...st.promptHits, [hitKey(stored.id, stored.swipe_index)]: prompt.hits },
      replyEmotionTags: withEmotionTag(st.replyEmotionTags, hitKey(stored.id, stored.swipe_index), done.full_text),
    }));

    if (!isCurrentContext(chatId, charId)) return null;
    set({ contextUsage: done.context ?? null });
    if (stateUpdates) set({ stateVariables: applyStateUpdates(get().stateVariables, stateUpdates) });
    get().summarizeDroppedMessages(done.context, history);
    const finalStored = [...get().storedMessages, stored];
    set({ storedMessages: finalStored, messages: finalStored.map(toFlat), streamingText: '', streamingThought: '' });
    return { stored, done, cleanedText };
  };

  /**
   * Group chat: who answers next after `last` – someone addressed by name, else the routing
   * model. `null` = the user's turn; right after the user's message someone always answers (the
   * chat's own character if routing gives none).
   */
  const nextSpeaker = async (
    chatId: string,
    last: { name: string; text: string },
    thisTurn: string[],
    firstReply: boolean,
    signal: AbortSignal,
  ): Promise<string | null> => {
    const state = get();
    const speakers = chatSpeakers(state.activeCharacter, state.chatSessions.find((s) => s.id === chatId), state.availableCharacters);
    const named = speakers.map((s) => ({ id: s.id, name: presentedAs(s.character, state.replyLanguage).name }));
    const userName = state.activePersona.name;
    const recent = state.storedMessages.slice(-8).filter((m) => m.role !== 'system').map((m) =>
      m.role === 'user' ? userName : (named.find((n) => n.id === (m.speaker_id ?? '')) ?? named[0])?.name ?? '');
    let answer = 'PLAYER';
    try {
      answer = await waitWithAbort(() => api.routeGroupChat({
        last_speaker: last.name, last_text: last.text, candidates: named.map((n) => n.name), this_turn: [...thisTurn], recent, ...llmTarget(state),
      }), signal);
    } catch (e) {
      if (signal.aborted) throw e;
      console.warn('Group chat routing failed:', e);
    }
    const found = named.find((n) => n.name.toLowerCase() === String(answer ?? '').trim().toLowerCase());
    if (found) return found.id;
    return firstReply ? '' : null;
  };

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
    set({ activeChatId: chatId, storedMessages: [], messages: [], contextUsage: null, generationSpeakerId: '', speakerEmotions: {},
      generationId: null, generationFailure: null, streamingText: '', streamingThought: '', isChatLoading: true, chatLoadError: null });
    return request;
  };
  /**
   * A picture the character sends as their message: a selfie from the recent chat, or a dream
   * picture from the dream's text. Null when no picture came (no image engine, other chat).
   */
  const sendPicture = async (kind: 'selfie' | 'dream', story?: string[]): Promise<StoredChatMessage | null> => {
    const { activeChatId: chatId, activeCharacter } = get();
    if (!chatId || !activeCharacter) return null;
    const image = await get().generateSceneImage('chat', { kind, story });
    if (!image) return null;
    const data = image.base64_data_url.slice(image.base64_data_url.indexOf(',') + 1);
    const name = translate(kind === 'dream' ? 'dream.fileName' : 'selfie.fileName');
    const attachment = await api.saveAttachment(chatId, `${name}.png`, data);
    // A caption in no language: the bubble with its actions needs some text.
    const stored = await api.addChatMessage(chatId, 'assistant', kind === 'dream' ? '🌙' : '📸', null, [attachment]);
    if (isCurrentContext(chatId, activeCharacter.id)) {
      const storedMessages = [...get().storedMessages, stored];
      set({ storedMessages, messages: storedMessages.map(toFlat) });
    }
    return stored;
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
    } else if (failure.kind === 'speak') {
      await get().replyAs(failure.messageId);
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

  promptHits: {},
  replyEmotionTags: {},

  generationSpeakerId: '',

  speakerVoices: {},

  loadSpeakerVoice: async (speakerId) => {
    if (!speakerId) return get().activeVoiceConfig;
    if (speakerId in get().speakerVoices) return get().speakerVoices[speakerId] ?? null;
    const config = await loadCharacterVoiceConfig(speakerId, [...get().availableCharacters, get().activeCharacter]).catch(() => null);
    set((st) => ({ speakerVoices: { ...st.speakerVoices, [speakerId]: config } }));
    return config;
  },

  setChatMembers: async (chatId, members) => {
    const stored = await api.setChatMembers(chatId, members);
    set((st) => ({ chatSessions: st.chatSessions.map((s) => (s.id === chatId ? { ...s, members: stored } : s)) }));
  },

  replyAs: async (speakerId) => {
    const { activeChatId, activeCharacter } = get();
    if (get().isGenerating || get().isChatLoading || get().chatLoadError || !activeChatId || !activeCharacter) return;
    cancelled = false;
    generationSessionRequest = sessionRequest;
    generationSequence += 1;
    const preparation = new AbortController();
    generationPreparation = preparation;
    const generationId = crypto.randomUUID();
    set({ isGenerating: true, generationId, generationChatId: activeChatId, generationFailure: null, streamingText: '', streamingThought: '' });
    try {
      await writeReply({ chatId: activeChatId, charId: activeCharacter.id, history: get().storedMessages, speakerId,
        generationId, preparation, nudge: true });
    } catch (e) {
      console.error('Reply as speaker error:', e);
      if (inContext(activeChatId, activeCharacter.id)) {
        set({ generationFailure: { chatId: activeChatId, message: errorMessage(e), cause: e instanceof Error ? e.message : String(e), kind: 'speak', messageId: speakerId } });
      }
    } finally {
      await finishGeneration();
    }
  },

  writeOnOwn: async (instruction) => {
    const { activeChatId, activeCharacter } = get();
    if (get().isGenerating || get().isChatLoading || get().chatLoadError || !activeChatId || !activeCharacter) return null;
    cancelled = false;
    generationSessionRequest = sessionRequest;
    generationSequence += 1;
    const preparation = new AbortController();
    generationPreparation = preparation;
    const generationId = crypto.randomUUID();
    set({ isGenerating: true, generationId, generationChatId: activeChatId, generationFailure: null, streamingText: '', streamingThought: '' });
    try {
      const written = await writeReply({ chatId: activeChatId, charId: activeCharacter.id, history: get().storedMessages, speakerId: '',
        generationId, preparation, instruction });
      // A stopped message stays as far as it got, but does not count as written on their own.
      return written && !written.done.aborted ? written.stored : null;
    } catch (e) {
      // Nobody asked for this message: a failure is only logged, the chat stays as it was.
      console.warn('Writing on their own failed:', e);
      return null;
    } finally {
      await finishGeneration();
    }
  },

  writeOnOwnIn: async (charId, chatId, instruction) => {
    const state = get();
    const character = state.availableCharacters.find((c) => c.id === charId);
    if (backgroundWrite || state.isGenerating || chatId === state.activeChatId || !character) return null;
    const abort = new AbortController();
    const signal = abort.signal;
    const run = async (): Promise<StoredChatMessage | null> => {
      const [session, history] = await Promise.all([api.getChatSession(chatId), api.getChatMessages(chatId)]);
      if (!session || session.character_id !== charId) return null;
      const userName = state.activePersona.name;
      const speakers = chatSpeakers(character, session, state.availableCharacters);
      const nameOf = (id: string) => presentedAs((speakers.find((s) => s.id === id) ?? speakers[0]!).character, state.replyLanguage).name;
      const cognitive = await waitWithAbort(() => api.getCognitiveOverview(charId, userName).catch(() => null), signal);
      const group = speakers.length > 1;
      const flat = group ? groupHistory(history, '', nameOf, userName) : history.map(toFlat);
      const speaker: PromptSpeaker | undefined = group
        ? { character, cognitive, others: speakers.slice(1).map((s) => presentedAs(s.character, state.replyLanguage)) }
        : undefined;
      // The prompt as if this chat were open; the open chat's scene state stays untouched.
      const view = {
        ...get(), activeCharacter: character, activeChatId: chatId, chatSessions: [session], storedMessages: history,
        cognitiveOverview: cognitive, stateVariables: [], activeLorebooks: [], sceneTensionEnabled: false,
        currentTension: 0, setCurrentTension: () => {},
      };
      const prompt = await resolvePromptWithLore(view, flat, undefined, signal, speaker);
      const messages: ChatMessage[] = [
        ...withAuthorNote(prompt.system ? [{ role: 'system', content: prompt.system }, ...flat] : flat, session),
        ...postHistory(prompt),
        { role: 'system', content: instruction(group ? nameOf('') : presentedAs(character, state.replyLanguage).name) },
      ];
      signal.throwIfAborted();
      const now = get();
      const target = llmTarget(now);
      const done = await api.sendChatMessage({
        endpoint_url: target.endpoint_url,
        provider: target.provider,
        api_key: target.api_key ?? undefined,
        model: target.model ?? undefined,
        messages: forPrompt(messages, now.replyReplacements),
        reasoning_mode: now.serverConfig.reasoning_mode,
        sampling: chatSampling(view),
      }, crypto.randomUUID(), now.selectedBackend === 'cloud' ? now.cloudContextTokens : undefined);
      if (done.aborted || signal.aborted) return null;
      const { cleanedText } = extractStateUpdates(withoutEmotionTag(applyReplacements(done.full_text, get().replyReplacements)));
      if (!cleanedText.trim()) return null;
      const stored = await api.addChatMessage(chatId, 'assistant', cleanedText, done.full_thought.trim() ? done.full_thought : null);
      // Opened meanwhile: the message shows right away.
      if (get().activeChatId === chatId && !get().isChatLoading) {
        const storedMessages = [...get().storedMessages, stored];
        set({ storedMessages, messages: storedMessages.map(toFlat) });
      }
      return stored;
    };
    const done = run().catch((e) => {
      // Nobody asked for this message: a failure or a stop is only logged.
      if (!signal.aborted) console.warn('Writing on their own in another chat failed:', e);
      return null;
    });
    backgroundWrite = { abort, done };
    try {
      return await done;
    } finally {
      if (backgroundWrite?.done === done) backgroundWrite = null;
    }
  },

  sendSelfie: () => sendPicture('selfie'),

  sendDreamPicture: (dream) => sendPicture('dream', [dream]),


  translateText: async (text) => {
    const state = get();
    return api.translateMessage({
      text,
      target_language: state.availableLanguages.find((l) => l.id === state.appLanguage)?.name ?? 'Deutsch',
      ...llmTarget(state),
    });
  },

  suggestReplies: async (notes = '') => {
    const request = await replyHelpRequest(notes);
    return request ? api.suggestChatReplies(request) : [];
  },

  draftReply: async (notes = '') => {
    const request = await replyHelpRequest(notes);
    return request ? api.draftChatReply(request) : '';
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
    const request = beginSessionLoad(null);
    set({ chatSessions: [] });
    try {
      let sessions = visibleSessions(await api.listChatSessions(charId));
      if (!isSessionCurrent(request, charId)) return;
      let targetId = sessions.find((session) => session.id === previousChatId)?.id ?? sessions[0]?.id;
      if (!targetId) {
        const greetings = await greetingsFor(get());
        if (!isSessionCurrent(request, charId)) return;
        const session = await api.createChatSession(charId, translate('chat.newChatTitle'), greetings);
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
    const sessionTitle = title || translate('chat.defaultSessionTitle', { n: get().chatSessions.length + 1 });
    const request = beginSessionLoad(null);
    try {
      const greetings = await greetingsFor(get());
      if (!isSessionCurrent(request, char.id)) return null;
      const session = await api.createChatSession(char.id, sessionTitle, greetings);
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

  updateChatStyle: async (chatId, style) => {
    await api.updateChatStyle(chatId, style);
    set((st) => ({
      chatSessions: st.chatSessions.map((s) => (s.id === chatId ? { ...s, style: style ?? undefined } : s)),
    }));
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
      chatSessions,
    } = get();

    if (get().isGenerating || get().isChatLoading || get().chatLoadError || !activeChatId || !activeCharacter) return;
    const targetMsg = storedMessages.find((m) => m.id === msgId);
    if (!targetMsg) return;

    const activeSession = chatSessions.find((s) => s.id === activeChatId);

    // Messages before this message
    const priorStored = storedMessages.filter((m) => m.order_index < targetMsg.order_index);
    const speakerId = targetMsg.speaker_id ?? '';

    cancelled = false;
    generationSessionRequest = sessionRequest;
    generationSequence += 1;
    const preparation = new AbortController();
    generationPreparation = preparation;
    const generationId = crypto.randomUUID();
    set({ isGenerating: true, generationId, generationChatId: activeChatId, generationFailure: null, streamingText: '', streamingThought: '' });

    try {
      // The local AI starts with the first message (the task list shows the loading).
      await waitWithAbort(() => get().ensureLocalAi(), preparation.signal);
      // A new variant comes from the same speaker as the reply it replaces.
      const setup = await speakerSetup(activeChatId, speakerId, priorStored, preparation.signal);
      const prompt = await waitWithAbort(
        () => resolvePromptWithLore(get(), setup.flat, undefined, preparation.signal, setup.speaker), preparation.signal);
      if (!inContext(activeChatId, activeCharacter.id)) return;
      const systemPromptMsg: ChatMessage = { role: 'system', content: prompt.system };
      if (speakerId) await get().loadSpeakerVoice(speakerId);
      set({ generationSpeakerId: speakerId });

      const payloadMessages = [systemPromptMsg, ...setup.flat];

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

      await makeRoomForChat();
    const done = await api.sendChatMessage({
        endpoint_url: endpoint,
        provider: selectedBackend === 'cloud' ? cloudProvider : 'local_llama',
        api_key: selectedBackend === 'cloud' ? cloudApiKey : undefined,
        model: selectedBackend === 'cloud' ? cloudModel : undefined,
        messages: forPrompt(payloadMessages, get().replyReplacements),
        reasoning_mode: serverConfig.reasoning_mode,
        sampling: chatSampling(get()),
      }, generationId, selectedBackend === 'cloud' ? get().cloudContextTokens : undefined, get().chatTools);
      if (!inContext(activeChatId, activeCharacter.id) && !keepsPartial(done, activeChatId, activeCharacter.id)) return;

      const { cleanedText, stateUpdates } = extractStateUpdates(withoutEmotionTag(applyReplacements(done.full_text, get().replyReplacements)));

      const updatedMsg = await api.addMessageSwipe(
        msgId,
        cleanedText,
        done.full_thought.trim() ? done.full_thought : null
      );
      set((state) => ({
        chatSessions: withoutStaleSummary(state.chatSessions, updatedMsg),
        promptHits: { ...state.promptHits, [hitKey(updatedMsg.id, updatedMsg.swipe_index)]: prompt.hits },
        replyEmotionTags: withEmotionTag(state.replyEmotionTags, hitKey(updatedMsg.id, updatedMsg.swipe_index), done.full_text),
      }));

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
        set({ generationFailure: { chatId: activeChatId, message: errorMessage(e), cause: e instanceof Error ? e.message : String(e), kind: 'swipe', messageId: msgId } });
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
    } = get();

    if (get().isGenerating || get().isChatLoading || get().chatLoadError || !activeChatId || !activeCharacter) return;
    const targetMsg = storedMessages.find((m) => m.id === msgId);
    if (!targetMsg) return;

    // All messages up to and including targetMsg
    const historyStored = storedMessages.filter((m) => m.order_index <= targetMsg.order_index);
    const speakerId = targetMsg.speaker_id ?? '';

    cancelled = false;
    generationSessionRequest = sessionRequest;
    generationSequence += 1;
    const preparation = new AbortController();
    generationPreparation = preparation;
    const generationId = crypto.randomUUID();
    set({ isGenerating: true, generationId, generationChatId: activeChatId, generationFailure: null, streamingText: '', streamingThought: '' });

    try {
      // The local AI starts with the first message (the task list shows the loading).
      await waitWithAbort(() => get().ensureLocalAi(), preparation.signal);
      // The same speaker carries on with their reply.
      const setup = await speakerSetup(activeChatId, speakerId, historyStored, preparation.signal);
      const historyFlat = setup.flat;
      const prompt = await waitWithAbort(
        () => resolvePromptWithLore(get(), historyFlat, undefined, preparation.signal, setup.speaker), preparation.signal);
      if (!inContext(activeChatId, activeCharacter.id)) return;
      if (speakerId) await get().loadSpeakerVoice(speakerId);
      set({ generationSpeakerId: speakerId });
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

      await makeRoomForChat();
    const done = await api.sendChatMessage({
        endpoint_url: endpoint,
        provider: selectedBackend === 'cloud' ? cloudProvider : 'local_llama',
        api_key: selectedBackend === 'cloud' ? cloudApiKey : undefined,
        model: selectedBackend === 'cloud' ? cloudModel : undefined,
        messages: forPrompt(payloadMessages, get().replyReplacements),
        reasoning_mode: serverConfig.reasoning_mode,
        sampling: chatSampling(get()),
      }, generationId, selectedBackend === 'cloud' ? get().cloudContextTokens : undefined, get().chatTools);
      if (!inContext(activeChatId, activeCharacter.id) && !keepsPartial(done, activeChatId, activeCharacter.id)) return;

      const { cleanedText, stateUpdates } = extractStateUpdates(withoutEmotionTag(applyReplacements(done.full_text, get().replyReplacements)));

      const mergedContent = `${targetMsg.content} ${cleanedText}`.trim();
      const updatedMsg = await api.updateChatMessage(
        msgId,
        mergedContent,
        targetMsg.thought
      );
      const key = hitKey(updatedMsg.id, updatedMsg.swipe_index);
      set((state) => ({
        chatSessions: withoutStaleSummary(state.chatSessions, updatedMsg),
        promptHits: { ...state.promptHits, [key]: mergeHits(state.promptHits[key], prompt.hits) },
        replyEmotionTags: withEmotionTag(state.replyEmotionTags, key, done.full_text),
      }));

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
        set({ generationFailure: { chatId: activeChatId, message: errorMessage(e), cause: e instanceof Error ? e.message : String(e), kind: 'continue', messageId: msgId } });
      }
    } finally {
      await finishGeneration();
    }
  },

  exportCurrentChat: async (targetPath) => {
    const { activeChatId, activeCharacter, activePersona } = get();
    if (!activeChatId || !activeCharacter) return false;
    try {
      await api.exportChatJsonl(activeChatId, activeCharacter.card.data.name, activePersona.name, targetPath);
      return true;
    } catch (e) {
      reportFailure('Export failed:', e);
      return false;
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

  sendMessage: async (content: string, files: File[] = [], storedMessageId?: string, replySpeaker?: string) => {
    let { activeChatId } = get();
    /** The saved reply nearly repeats an earlier one: it is written anew once the send is done. */
    let repeatedReplyId: string | null = null;
    const { activeCharacter } = get();

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
        // The user's regex scripts that change what is saved apply before it is stored.
        content = applyScripts(content, get().replyReplacements, 'user', 'save');
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
      // A group chat answers with whoever the user picked or addressed, else the director decides.
      const state = get();
      const speakers = chatSpeakers(activeCharacter, state.chatSessions.find((s) => s.id === chatId), state.availableCharacters);
      const round = speakers.length > 1 && replySpeaker === undefined;
      const nameOf = (id: string) => presentedAs((speakers.find((s) => s.id === id) ?? speakers[0]!).character, state.replyLanguage).name;
      const firstSpeaker = round
        ? (await nextSpeaker(chatId, { name: state.activePersona.name, text: content }, [], true, preparation.signal)) ?? ''
        : replySpeaker ?? '';
      const written = await writeReply({ chatId, charId: activeCharacter?.id, history: updatedStored, speakerId: firstSpeaker,
        latestUserText: content, generationId, preparation });
      if (!written) return;
      const { stored: asstStored, done, cleanedText } = written;

      // Group round: more characters may react until it is the user's turn (Stop ends the round).
      if (round) {
        const thisTurn = [nameOf(firstSpeaker)];
        let last = { name: nameOf(firstSpeaker), text: cleanedText };
        for (let n = 1; n < GROUP_MAX_REPLIES && !cancelled && !done.aborted; n += 1) {
          const next = await nextSpeaker(chatId, last, thisTurn, false, preparation.signal);
          if (next === null || cancelled) break;
          const replyId = crypto.randomUUID();
          set({ generationId: replyId });
          const more = await writeReply({ chatId, charId: activeCharacter?.id, history: get().storedMessages, speakerId: next,
            generationId: replyId, preparation });
          if (!more || more.done.aborted) break;
          thisTurn.push(nameOf(next));
          last = { name: nameOf(next), text: more.cleanedText };
        }
      }
      if (get().rerollRepeats && !done.aborted) {
        const earlier = updatedStored.filter((m) => m.role === 'assistant').map((m) => m.content);
        if (isRepeat(cleanedText, earlier)) repeatedReplyId = asstStored.id;
      }
      const finalStored = get().storedMessages;

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
        // In a group chat every character present learns into their own memory, one after another.
        const learners = chatSpeakers(activeCharacter ?? null, get().chatSessions.find((s) => s.id === chatId), get().availableCharacters);
        void (async () => {
          for (const learner of learners.length > 0 ? learners : [{ id: '' }]) {
            await get().triggerMemoryPipeline(autoReflectionThreshold, learner.id || undefined).catch((err) => {
              console.warn('Auto-reflection error:', err);
            });
          }
        })();
      }
    } catch (e) {
      console.error('Chat error:', e);
      if (!userStored) throw preparation.signal.aborted ? new Error(translate('chat.sendCancelled')) : e; // Restore an unsaved draft only.
      if (activeChatId && inContext(activeChatId, activeCharacter?.id)) {
        set({ generationFailure: { chatId: activeChatId, message: errorMessage(e), cause: e instanceof Error ? e.message : String(e), kind: 'send', messageId: userStored.id } });
      }
    } finally {
      await finishGeneration();
    }
    // Local models sometimes copy their last answer: write it anew once (the copy stays a swipe).
    if (repeatedReplyId && get().storedMessages.at(-1)?.id === repeatedReplyId && !get().isGenerating) {
      toast.info(translate('chat.repeatRewritten'));
      await get().regenerateMessageSwipe(repeatedReplyId);
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
    } catch (e) {
      console.error('Failed to save voice config:', e);
      throw e;
    }
  },
});
};
