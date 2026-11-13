import { translate } from '../../../i18n';
import { api } from '../../../services/api';
import { streamingTts } from '../../../services/streamingTts';
import { extractStateUpdates, applyStateUpdates } from '../../../utils/stateParser';
import { withoutEmotionTag } from '../../../utils/replyTags';
import { chatSampling, llmTarget, hitKey, resolvePromptWithLore, type PromptSpeaker } from '../../helpers';
import { waitWithAbort } from '../../../utils/cancellation';
import { languageCode, localizeCard } from '../../../utils/cardI18n';
import { applyReplacements, forPrompt } from '../../../utils/replyFilters';
import { chatSpeakers, groupHistory, memoryCharacter, memoryId, memoryIdFor, presentedAs } from '../../../utils/groupChat';
import type { ChatMessage, DoneEvent, ReplyIdeasRequest, StoredChatMessage } from '../../../types';
import type { ChatGet, ChatSet } from './types';
import { makeRoomForChat, postHistory, toFlat, withAuthorNote, withEmotionTag } from './helpers';

/** Shared per-store session/generation state and reply pipeline helpers. */
export function createChatRuntime(set: ChatSet, get: ChatGet) {
  let sessionRequest = 0;
  let generationSessionRequest = 0;
  let cancelled = false;
  let generationSequence = 0;
  let abortPending: Promise<void> | null = null;
  let generationPreparation: AbortController | null = null;

  /** Read in loops over awaits: `abortGeneration` sets `cancelled` meanwhile. */
  const stopped = () => cancelled;
  const getSessionRequest = () => sessionRequest;
  const isSessionCurrent = (request: number, charId: string | undefined) =>
    request === sessionRequest && get().activeCharacter?.id === charId;
  const isCurrentContext = (chatId: string, charId: string | undefined) =>
    generationSessionRequest === sessionRequest && get().activeChatId === chatId && get().activeCharacter?.id === charId;
  const inContext = (chatId: string, charId: string | undefined) =>
    !cancelled && isCurrentContext(chatId, charId);

  /** A reply the user stopped keeps the text so far (and can be continued) while its chat stays open. */
  const keepsPartial = (done: DoneEvent, chatId: string, charId: string | undefined) =>
    cancelled && done.aborted && done.full_text.trim() !== '' && isCurrentContext(chatId, charId);

  const syncGenerationSession = () => {
    generationSessionRequest = sessionRequest;
  };

  const startGeneration = (chatId: string | null) => {
    cancelled = false;
    generationSessionRequest = sessionRequest;
    generationSequence += 1;
    const preparation = new AbortController();
    generationPreparation = preparation;
    const generationId = crypto.randomUUID();
    set({
      isGenerating: true,
      generationId,
      generationChatId: chatId,
      generationFailure: null,
      streamingText: '',
      streamingThought: '',
    });
    return { preparation, generationId };
  };

  const finishGeneration = async () => {
    if (abortPending) await abortPending.catch(() => {});
    generationPreparation = null;
    set({ isGenerating: false, generationChatId: null, streamingText: '', streamingThought: '' });
  };

  const beginSessionLoad = (chatId: string | null) => {
    const request = ++sessionRequest;
    const memoryBefore = memoryId(get());
    streamingTts.cancel();
    if (get().isGenerating && get().generationChatId) {
      void get().abortGeneration().catch((error) => console.warn('Navigation abort failed:', error));
    }
    // "Auto" belongs to the chat it was switched on in.
    set({
      activeChatId: chatId,
      storedMessages: [],
      messages: [],
      contextUsage: null,
      generationSpeakerId: '',
      speakerEmotions: {},
      groupAutoTalk: false,
      generationId: null,
      generationFailure: null,
      streamingText: '',
      streamingThought: '',
      isChatLoading: true,
      chatLoadError: null,
    });
    // Main line and a branch with its own memory differ in mood, memories and plans.
    if (memoryId(get()) !== memoryBefore) void get().fetchCognitiveOverview().catch(() => undefined);
    return request;
  };

  const abortGeneration = async () => {
    if (!get().isGenerating) return;
    if (abortPending) return abortPending;
    const sequence = generationSequence;
    const preparation = generationPreparation;
    const chatId = get().generationChatId;
    const generationId = get().generationId;
    cancelled = true;
    // Stop also ends a group chat's "Auto" (it would otherwise go on after the pause).
    set({ generationChatId: null, generationId: null, groupAutoTalk: false });
    const pending = api.abortChatGeneration();
    abortPending = pending;
    try {
      await pending;
      preparation?.abort();
      // Native inference/writes still retain their lock until the original operation settles.
    } catch (e) {
      if (sequence === generationSequence) {
        cancelled = false;
        set({
          generationChatId: generationSessionRequest === sessionRequest ? chatId : null,
          generationId: generationSessionRequest === sessionRequest ? generationId : null,
        });
      }
      console.error('Failed to abort generation:', e);
      throw e;
    } finally {
      if (abortPending === pending) abortPending = null;
    }
  };

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
      : await waitWithAbort(() => api.getCognitiveOverview(memoryIdFor(self.character.id, session), state.activePersona.name).catch(() => null), signal);
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
      () => resolvePromptWithLore(get(), setup.flat, run.latestUserText, preparation.signal, setup.speaker),
      preparation.signal,
    );
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
   * Group chat: who answers next after `last` – someone addressed by name (in `last`, then
   * anyone the user's `userText` addressed who has not answered yet), else the routing model.
   * `null` = the user's turn; right after the user's message someone always answers (the
   * chat's own character if routing gives none).
   */
  const nextSpeaker = async (
    chatId: string,
    last: { name: string; text: string },
    thisTurn: string[],
    firstReply: boolean,
    signal: AbortSignal,
    userText: string,
    autonomous = false,
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
        last_speaker: last.name,
        last_text: last.text,
        candidates: named.map((n) => n.name),
        this_turn: [...thisTurn],
        recent,
        user_text: userText,
        autonomous,
        ...llmTarget(state),
      }), signal);
    } catch (e) {
      if (signal.aborted) throw e;
      console.warn('Group chat routing failed:', e);
    }
    const found = named.find((n) => n.name.toLowerCase() === String(answer ?? '').trim().toLowerCase());
    if (found) return found.id;
    return firstReply ? '' : null;
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

  return {
    stopped,
    getSessionRequest,
    isSessionCurrent,
    isCurrentContext,
    inContext,
    keepsPartial,
    syncGenerationSession,
    startGeneration,
    finishGeneration,
    beginSessionLoad,
    abortGeneration,
    replyHelpRequest,
    speakerSetup,
    writeReply,
    nextSpeaker,
    sendPicture,
  };
}

export type ChatRuntime = ReturnType<typeof createChatRuntime>;
