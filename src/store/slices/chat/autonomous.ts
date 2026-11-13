import { api } from '../../../services/api';
import { extractStateUpdates } from '../../../utils/stateParser';
import { withoutEmotionTag } from '../../../utils/replyTags';
import { chatSampling, llmTarget, resolvePromptWithLore, type PromptSpeaker } from '../../helpers';
import { errorMessage } from '../../../utils/errors';
import { waitWithAbort } from '../../../utils/cancellation';
import { applyReplacements, forPrompt } from '../../../utils/replyFilters';
import { GROUP_MAX_REPLIES, chatSpeakers, groupHistory, memoryIdFor, presentedAs } from '../../../utils/groupChat';
import type { ChatMessage, StoredChatMessage } from '../../../types';
import {
  hasBackgroundWrite,
  postHistory,
  runInBackgroundWrite,
  toFlat,
  withAuthorNote,
} from './helpers';
import type { ChatRuntime } from './runtime';
import type { ChatGet, ChatSet, ChatSlice } from './types';

export type ChatAutonomousSlice = Pick<
  ChatSlice,
  'replyAs' | 'groupAutoTalk' | 'setGroupAutoTalk' | 'continueGroupOnOwn' | 'writeOnOwn' | 'writeOnOwnIn'
>;

export function createChatAutonomousSlice(rt: ChatRuntime, set: ChatSet, get: ChatGet): ChatAutonomousSlice {
  return {
    replyAs: async (speakerId) => {
      const { activeChatId, activeCharacter } = get();
      if (get().isGenerating || get().isChatLoading || get().chatLoadError || !activeChatId || !activeCharacter) return;
      const { preparation, generationId } = rt.startGeneration(activeChatId);
      try {
        await rt.writeReply({
          chatId: activeChatId,
          charId: activeCharacter.id,
          history: get().storedMessages,
          speakerId,
          generationId,
          preparation,
          nudge: true,
        });
      } catch (e) {
        console.error('Reply as speaker error:', e);
        if (rt.inContext(activeChatId, activeCharacter.id)) {
          set({
            generationFailure: {
              chatId: activeChatId,
              message: errorMessage(e),
              cause: e instanceof Error ? e.message : String(e),
              kind: 'speak',
              messageId: speakerId,
            },
          });
        }
      } finally {
        await rt.finishGeneration();
      }
    },

    groupAutoTalk: false,
    setGroupAutoTalk: (enabled) => set({ groupAutoTalk: enabled }),

    continueGroupOnOwn: async () => {
      const { activeChatId, activeCharacter } = get();
      if (get().isGenerating || get().isChatLoading || get().chatLoadError || !activeChatId || !activeCharacter) return false;
      const state = get();
      const speakers = chatSpeakers(activeCharacter, state.chatSessions.find((s) => s.id === activeChatId), state.availableCharacters);
      const lastMessage = [...state.storedMessages].reverse().find((m) => m.role !== 'system');
      // Only after a character's line: a user message gets its round from `sendMessage`.
      if (speakers.length < 2 || lastMessage?.role !== 'assistant') return false;
      const nameOf = (id: string) => presentedAs((speakers.find((s) => s.id === id) ?? speakers[0]!).character, state.replyLanguage).name;
      const lastUser = [...state.storedMessages].reverse().find((m) => m.role === 'user');
      const { preparation } = rt.startGeneration(activeChatId);
      let wrote = false;
      try {
        let last = { name: nameOf(lastMessage.speaker_id ?? ''), text: lastMessage.content };
        const thisTurn = [last.name];
        for (let n = 0; n < GROUP_MAX_REPLIES && !rt.stopped(); n += 1) {
          const next = await rt.nextSpeaker(activeChatId, last, thisTurn, false, preparation.signal, lastUser?.content ?? '', true);
          if (next === null || rt.stopped() || !rt.inContext(activeChatId, activeCharacter.id)) break;
          const replyId = crypto.randomUUID();
          set({ generationId: replyId });
          const more = await rt.writeReply({
            chatId: activeChatId,
            charId: activeCharacter.id,
            history: get().storedMessages,
            speakerId: next,
            generationId: replyId,
            preparation,
            nudge: true,
          });
          if (!more) break;
          wrote = true;
          if (more.done.aborted) break;
          thisTurn.push(nameOf(next));
          last = { name: nameOf(next), text: more.cleanedText };
        }
      } catch (e) {
        // Nobody asked for this reply: a failure is logged and "Auto" waits for the user.
        if (!preparation.signal.aborted) console.warn('Group chat "Auto" failed:', e);
        set({ groupAutoTalk: false });
      } finally {
        await rt.finishGeneration();
      }
      return wrote;
    },

    writeOnOwn: async (instruction) => {
      const { activeChatId, activeCharacter } = get();
      if (get().isGenerating || get().isChatLoading || get().chatLoadError || !activeChatId || !activeCharacter) return null;
      const { preparation, generationId } = rt.startGeneration(activeChatId);
      try {
        const written = await rt.writeReply({
          chatId: activeChatId,
          charId: activeCharacter.id,
          history: get().storedMessages,
          speakerId: '',
          generationId,
          preparation,
          instruction,
        });
        // A stopped message stays as far as it got, but does not count as written on their own.
        return written && !written.done.aborted ? written.stored : null;
      } catch (e) {
        // Nobody asked for this message: a failure is only logged, the chat stays as it was.
        console.warn('Writing on their own failed:', e);
        return null;
      } finally {
        await rt.finishGeneration();
      }
    },

    writeOnOwnIn: async (charId, chatId, instruction) => {
      const state = get();
      const character = state.availableCharacters.find((c) => c.id === charId);
      if (hasBackgroundWrite() || state.isGenerating || chatId === state.activeChatId || !character) return null;
      return runInBackgroundWrite<StoredChatMessage | null>(
        async (signal) => {
          const [session, history] = await Promise.all([api.getChatSession(chatId), api.getChatMessages(chatId)]);
          if (!session || session.character_id !== charId) return null;
          const userName = state.activePersona.name;
          const speakers = chatSpeakers(character, session, state.availableCharacters);
          const nameOf = (id: string) =>
            presentedAs((speakers.find((s) => s.id === id) ?? speakers[0]!).character, state.replyLanguage).name;
          const cognitive = await waitWithAbort(
            () => api.getCognitiveOverview(memoryIdFor(charId, session), userName).catch(() => null),
            signal,
          );
          const group = speakers.length > 1;
          const flat = group ? groupHistory(history, '', nameOf, userName) : history.map(toFlat);
          const speaker: PromptSpeaker | undefined = group
            ? { character, cognitive, others: speakers.slice(1).map((s) => presentedAs(s.character, state.replyLanguage)) }
            : undefined;
          // The prompt as if this chat were open; the open chat's scene state stays untouched.
          const view = {
            ...get(),
            activeCharacter: character,
            activeChatId: chatId,
            chatSessions: [session],
            storedMessages: history,
            cognitiveOverview: cognitive,
            stateVariables: [],
            sceneTensionEnabled: false,
            currentTension: 0,
            setCurrentTension: () => {},
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
        },
        (e, signal) => {
          // Nobody asked for this message: a failure or a stop is only logged.
          if (!signal.aborted) console.warn('Writing on their own in another chat failed:', e);
          return null;
        },
      );
    },
  };
}
