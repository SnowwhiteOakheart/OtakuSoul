import { translate } from '../../../i18n';
import { api } from '../../../services/api';
import { soundFx } from '../../../services/soundFx';
import { extractStateUpdates, applyStateUpdates } from '../../../utils/stateParser';
import { withoutEmotionTag } from '../../../utils/replyTags';
import { chatSampling, hitKey, mergeHits, resolvePromptWithLore } from '../../helpers';
import { toast } from '../../../components/ui/feedback';
import { errorMessage } from '../../../utils/errors';
import { fileToBase64 } from '../../../utils/files';
import { waitWithAbort } from '../../../utils/cancellation';
import { isRepeat } from '../../../utils/repetition';
import { applyReplacements, applyScripts, forPrompt } from '../../../utils/replyFilters';
import { GROUP_MAX_REPLIES, chatSpeakers, memoryIdFor, presentedAs } from '../../../utils/groupChat';
import type { Attachment, ChatMessage, StoredChatMessage } from '../../../types';
import {
  makeRoomForChat,
  postHistory,
  toFlat,
  visibleSessions,
  withEmotionTag,
  withoutStaleSummary,
} from './helpers';
import type { ChatRuntime } from './runtime';
import type { ChatGet, ChatSet, ChatSlice } from './types';

export type ChatTurnsSlice = Pick<
  ChatSlice,
  | 'isGenerating'
  | 'generationId'
  | 'generationChatId'
  | 'generationSpeakerId'
  | 'generationFailure'
  | 'streamingText'
  | 'streamingThought'
  | 'retryGeneration'
  | 'abortGeneration'
  | 'regenerateMessageSwipe'
  | 'continueChatMessage'
  | 'sendMessage'
>;

export function createChatTurnsSlice(rt: ChatRuntime, set: ChatSet, get: ChatGet): ChatTurnsSlice {
  return {
    isGenerating: false,
    generationId: null,
    generationChatId: null,
    generationSpeakerId: '',
    generationFailure: null,
    streamingText: '',
    streamingThought: '',

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

    abortGeneration: () => rt.abortGeneration(),

    regenerateMessageSwipe: async (msgId) => {
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
      const priorStored = storedMessages.filter((m) => m.order_index < targetMsg.order_index);
      const speakerId = targetMsg.speaker_id ?? '';
      const { preparation, generationId } = rt.startGeneration(activeChatId);

      try {
        // The local AI starts with the first message (the task list shows the loading).
        await waitWithAbort(() => get().ensureLocalAi(), preparation.signal);
        // A new variant comes from the same speaker as the reply it replaces.
        const setup = await rt.speakerSetup(activeChatId, speakerId, priorStored, preparation.signal);
        const prompt = await waitWithAbort(
          () => resolvePromptWithLore(get(), setup.flat, undefined, preparation.signal, setup.speaker),
          preparation.signal,
        );
        if (!rt.inContext(activeChatId, activeCharacter.id)) return;
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
        if (!rt.inContext(activeChatId, activeCharacter.id) && !rt.keepsPartial(done, activeChatId, activeCharacter.id)) return;

        const { cleanedText, stateUpdates } = extractStateUpdates(withoutEmotionTag(applyReplacements(done.full_text, get().replyReplacements)));

        const updatedMsg = await api.addMessageSwipe(
          msgId,
          cleanedText,
          done.full_thought.trim() ? done.full_thought : null,
        );
        set((state) => ({
          chatSessions: withoutStaleSummary(state.chatSessions, updatedMsg),
          promptHits: { ...state.promptHits, [hitKey(updatedMsg.id, updatedMsg.swipe_index)]: prompt.hits },
          replyEmotionTags: withEmotionTag(state.replyEmotionTags, hitKey(updatedMsg.id, updatedMsg.swipe_index), done.full_text),
        }));

        if (!rt.isCurrentContext(activeChatId, activeCharacter.id)) return;
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
        if (rt.inContext(activeChatId, activeCharacter.id)) {
          set({
            generationFailure: {
              chatId: activeChatId,
              message: errorMessage(e),
              cause: e instanceof Error ? e.message : String(e),
              kind: 'swipe',
              messageId: msgId,
            },
          });
        }
      } finally {
        await rt.finishGeneration();
      }
    },

    continueChatMessage: async (msgId) => {
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
      const { preparation, generationId } = rt.startGeneration(activeChatId);

      try {
        // The local AI starts with the first message (the task list shows the loading).
        await waitWithAbort(() => get().ensureLocalAi(), preparation.signal);
        // The same speaker carries on with their reply.
        const setup = await rt.speakerSetup(activeChatId, speakerId, historyStored, preparation.signal);
        const historyFlat = setup.flat;
        const prompt = await waitWithAbort(
          () => resolvePromptWithLore(get(), historyFlat, undefined, preparation.signal, setup.speaker),
          preparation.signal,
        );
        if (!rt.inContext(activeChatId, activeCharacter.id)) return;
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
        if (!rt.inContext(activeChatId, activeCharacter.id) && !rt.keepsPartial(done, activeChatId, activeCharacter.id)) return;

        const { cleanedText, stateUpdates } = extractStateUpdates(withoutEmotionTag(applyReplacements(done.full_text, get().replyReplacements)));

        const mergedContent = `${targetMsg.content} ${cleanedText}`.trim();
        const updatedMsg = await api.updateChatMessage(msgId, mergedContent, targetMsg.thought);
        const key = hitKey(updatedMsg.id, updatedMsg.swipe_index);
        set((state) => ({
          chatSessions: withoutStaleSummary(state.chatSessions, updatedMsg),
          promptHits: { ...state.promptHits, [key]: mergeHits(state.promptHits[key], prompt.hits) },
          replyEmotionTags: withEmotionTag(state.replyEmotionTags, key, done.full_text),
        }));

        if (!rt.isCurrentContext(activeChatId, activeCharacter.id)) return;
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
        if (rt.inContext(activeChatId, activeCharacter.id)) {
          set({
            generationFailure: {
              chatId: activeChatId,
              message: errorMessage(e),
              cause: e instanceof Error ? e.message : String(e),
              kind: 'continue',
              messageId: msgId,
            },
          });
        }
      } finally {
        await rt.finishGeneration();
      }
    },

    sendMessage: async (content, files = [], storedMessageId, replySpeaker) => {
      let { activeChatId } = get();
      /** The saved reply nearly repeats an earlier one: it is written anew once the send is done. */
      let repeatedReplyId: string | null = null;
      const { activeCharacter } = get();

      if (get().isChatLoading || get().chatLoadError) throw new Error(get().chatLoadError ?? translate('chat.historyLoading'));
      if (get().isGenerating || (!content.trim() && files.length === 0 && !storedMessageId)) return;
      const { preparation, generationId } = rt.startGeneration(activeChatId);
      let userStored: StoredChatMessage | undefined;
      try {
        // Ensure we have an active chat session
        if (!activeChatId && activeCharacter) {
          const newSess = await get().createNewChat();
          if (newSess) activeChatId = newSess.id;
        }

        rt.syncGenerationSession();
        set({ generationChatId: activeChatId, generationId });
        if (!activeChatId) throw new Error(get().chatLoadError ?? translate('chat.noActiveSession'));
        if (rt.stopped()) throw new Error(translate('chat.sendCancelled'));
        if (!rt.inContext(activeChatId, activeCharacter?.id)) return;

        soundFx.playMessageSent();

        // 1. Store attachments, then the user message
        // A failed upload rejects before anything is stored; the composer reports it.
        const chatId = activeChatId;
        userStored = storedMessageId
          ? get().storedMessages.find((m) => m.id === storedMessageId && m.role === 'user' && m.chat_id === chatId)
          : undefined;
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
          if (rt.stopped()) throw new Error(translate('chat.sendCancelled'));
          if (!rt.inContext(chatId, activeCharacter?.id)) return;
          // The user's regex scripts that change what is saved apply before it is stored.
          content = applyScripts(content, get().replyReplacements, 'user', 'save');
          userStored = await api.addChatMessage(chatId, 'user', content, null, attachments);
        }
        if (!rt.isCurrentContext(chatId, activeCharacter?.id)) return;
        const updatedStored = storedMessageId ? get().storedMessages : [...get().storedMessages, userStored];
        const updatedFlat: ChatMessage[] = updatedStored.map(toFlat);

        set({
          storedMessages: updatedStored,
          messages: updatedFlat,
          streamingText: '',
          streamingThought: '',
          isGenerating: true,
        });

        if (rt.stopped()) return;
        // A group chat answers with whoever the user picked or addressed, else the director decides.
        const state = get();
        const speakers = chatSpeakers(activeCharacter, state.chatSessions.find((s) => s.id === chatId), state.availableCharacters);
        const round = speakers.length > 1 && replySpeaker === undefined;
        const nameOf = (id: string) => presentedAs((speakers.find((s) => s.id === id) ?? speakers[0]!).character, state.replyLanguage).name;
        const firstSpeaker = round
          ? (await rt.nextSpeaker(chatId, { name: state.activePersona.name, text: content }, [], true, preparation.signal, content)) ?? ''
          : replySpeaker ?? '';
        const written = await rt.writeReply({
          chatId,
          charId: activeCharacter?.id,
          history: updatedStored,
          speakerId: firstSpeaker,
          latestUserText: content,
          generationId,
          preparation,
        });
        if (!written) return;
        const { stored: asstStored, done, cleanedText } = written;

        // Group round: more characters may react until it is the user's turn (Stop ends the round).
        if (round) {
          const thisTurn = [nameOf(firstSpeaker)];
          let last = { name: nameOf(firstSpeaker), text: cleanedText };
          for (let n = 1; n < GROUP_MAX_REPLIES && !rt.stopped() && !done.aborted; n += 1) {
            const next = await rt.nextSpeaker(chatId, last, thisTurn, false, preparation.signal, content);
            if (next === null || rt.stopped()) break;
            const replyId = crypto.randomUUID();
            set({ generationId: replyId });
            const more = await rt.writeReply({
              chatId,
              charId: activeCharacter?.id,
              history: get().storedMessages,
              speakerId: next,
              generationId: replyId,
              preparation,
            });
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
          const refreshRequest = rt.getSessionRequest();
          api.listChatSessions(activeCharacter.id).then((sessions) => {
            if (refreshRequest === rt.getSessionRequest() && get().activeCharacter?.id === activeCharacter.id) {
              set({ chatSessions: visibleSessions(sessions) });
            }
          }).catch((err) => console.warn('Chat session refresh failed:', err));
        }

        // Naturally apply emotional decay tick & refresh soul overview
        if (activeCharacter?.id) {
          api.applyEmotionalDecay(memoryIdFor(activeCharacter.id, get().chatSessions.find((s) => s.id === get().activeChatId)))
            .then(() => {
              if (get().activeCharacter?.id === activeCharacter.id) return get().fetchCognitiveOverview();
            })
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
        if (activeChatId && rt.inContext(activeChatId, activeCharacter?.id)) {
          set({
            generationFailure: {
              chatId: activeChatId,
              message: errorMessage(e),
              cause: e instanceof Error ? e.message : String(e),
              kind: 'send',
              messageId: userStored.id,
            },
          });
        }
      } finally {
        await rt.finishGeneration();
      }
      // Local models sometimes copy their last answer: write it anew once (the copy stays a swipe).
      if (repeatedReplyId && get().storedMessages.at(-1)?.id === repeatedReplyId && !get().isGenerating) {
        toast.info(translate('chat.repeatRewritten'));
        await get().regenerateMessageSwipe(repeatedReplyId);
      }
    },
  };
}
