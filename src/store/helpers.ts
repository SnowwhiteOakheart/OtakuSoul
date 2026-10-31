import { api } from '../services/api';
import { soundFx } from '../services/soundFx';
import { waitWithAbort } from '../utils/cancellation';
import { chatLorebooks } from '../utils/lorebookUsage';
import { resolveInochi2dPath, resolveLive2dPath } from '../components/avatars/avatarMatch';
import type { AssembledPrompt, CharacterProfile, ChatMessage, CognitiveOverview, GroupMember, LorebookEntry, LlmProviderType, SamplingParams } from '../types';
import type { AppStoreState } from './storeTypes';

/** What a reply could draw on beyond the chat: lorebook entries, memories, the summary. */
export interface PromptHits {
  lore: { name: string; book: string; directive: boolean }[];
  memories: { id: number; category: string; content: string }[];
  /** The summary of earlier messages was in the prompt. */
  summary: boolean;
}

export const NO_PROMPT_HITS: PromptHits = { lore: [], memories: [], summary: false };

/** The assembled prompt plus what went into it (shown at the reply). */
export type ResolvedPrompt = AssembledPrompt & { hits: PromptHits };

/**
 * The character who writes a reply in a group chat, with their own memory, and who else is
 * present. Without it the prompt is the open chat's character, as in a normal chat.
 */
export interface PromptSpeaker {
  character: CharacterProfile;
  cognitive: CognitiveOverview | null;
  others: GroupMember[];
}

export async function resolvePromptWithLore(
  state: AppStoreState,
  recentMessages: ChatMessage[],
  latestUserText?: string,
  signal?: AbortSignal,
  speaker?: PromptSpeaker,
): Promise<ResolvedPrompt> {
  signal?.throwIfAborted();
  const {
    activeCharacter: chatCharacter,
    promptTemplate,
    activePersona,
    stateVariables,
    cognitiveOverview: chatCognitive,
    replyLanguage,
    serverConfig,
    chatSessions,
    activeChatId,
    storedMessages,
    lorebookScanDepth,
    allLorebooks,
    globalLorebookIds,
    currentTension,
    sceneTensionEnabled,
  } = state;

  if (!chatCharacter) return { system: '', post_history: null, hits: NO_PROMPT_HITS };
  // In a group chat the speaker writes with their own card and memory.
  const activeCharacter = speaker?.character ?? chatCharacter;
  const cognitiveOverview = speaker ? speaker.cognitive : chatCognitive;

  const activeSession = chatSessions.find((s) => s.id === activeChatId);
  const scanDepth = Math.max(1, lorebookScanDepth || 5);
  const recentContext = recentMessages
    .slice(-scanDepth)
    .map((m) => m.content)
    .join(' ');

  // 1. The lorebooks of this chat: global ones and those bound to the speaker. A guest also knows
  // the lorebooks of the chat's own character (the shared world).
  const candidateLorebooks = chatLorebooks(allLorebooks, globalLorebookIds || [], [activeCharacter, chatCharacter]);

  // 2. Scene Tension Accumulator
  let effectiveTension = currentTension;
  if (sceneTensionEnabled) {
    let tensionDelta = 2; // base increment per turn
    if (latestUserText) {
      const dangerRegex =
        /\b(gefahr|kampf|angriff|monster|schrei|wache|feind|dunkelheit|schwert|blut|waffe|flucht|falle|bedrohung|boss|attack|danger|enemy|fight|threat|kill|trap)\b/i;
      if (dangerRegex.test(latestUserText)) {
        tensionDelta += 10;
      }
    }
    effectiveTension = Math.min(100, Math.max(0, currentTension + tensionDelta));
  }

  // 3. Evaluate lorebooks
  let passiveEntries: LorebookEntry[] = [];
  let activeDirectives: LorebookEntry[] = [];

  if (candidateLorebooks.length > 0) {
    try {
      const evalRes = await waitWithAbort(() => api.evaluateMultiLorebooks(
        candidateLorebooks,
        recentContext,
        effectiveTension
      ), signal);
      signal?.throwIfAborted();
      passiveEntries = evalRes.passive_entries;
      activeDirectives = evalRes.active_entries;

      if (evalRes.triggered_tension_events.length > 0) {
        soundFx.playWarning();
        state.setCurrentTension(evalRes.new_tension);
      } else if (sceneTensionEnabled) {
        state.setCurrentTension(effectiveTension);
      }
    } catch (e) {
      signal?.throwIfAborted();
      console.warn('Failed evaluateMultiLorebooks, falling back:', e);
      for (const lb of candidateLorebooks) {
        const entries = await waitWithAbort(() => api.evaluateLorebookContext(lb, recentContext), signal);
        passiveEntries.push(...entries);
      }
    }
  }

  // 4. Memories for this reply: a stable core plus what fits the recent messages, and open
  // intentions. Without
  // them (old backend, error) the overview's memories are used.
  // Also with nothing to search for: the core and the open plans and promises still count.
  const memories = await waitWithAbort(() => api.getPromptMemories(activeCharacter.id, activePersona.name, recentMemoryQuery(recentMessages)).catch((e) => {
    console.warn('Failed getPromptMemories, using the overview:', e);
    return null;
  }), signal);
  signal?.throwIfAborted();
  const promptMemories = memories ? [...memories.core, ...memories.relevant] : cognitiveOverview?.recent_memories ?? [];

  // 5. Assemble system prompt
  const bookOf = (entry: LorebookEntry) =>
    candidateLorebooks.find((book) => book.entries.some((e) => e.name === entry.name && e.content === entry.content))?.name ?? '';
  const isDirective = (entry: LorebookEntry) => ['active', 'directive'].includes((entry.injection_behavior ?? '').toLowerCase());
  const hits: PromptHits = {
    lore: [
      ...activeDirectives.map((entry) => ({ name: entry.name, book: bookOf(entry), directive: true })),
      ...passiveEntries.map((entry) => ({ name: entry.name, book: bookOf(entry), directive: isDirective(entry) })),
    ],
    memories: promptMemories.map(({ id, category, content }) => ({ id, category, content })),
    summary: !!activeSession?.summary?.trim(),
  };
  const assembled = await waitWithAbort(() => api.assemblePrompt({
    char_name: activeCharacter.card.data.name,
    user_name: activePersona.name,
    character: activeCharacter.card.data,
    active_lore: passiveEntries,
    active_directives: activeDirectives,
    state_variables: stateVariables,
    cognitive: cognitiveOverview || undefined,
    memories: memories ?? undefined,
    reply_language: replyLanguage || 'Deutsch',
    allow_reasoning: serverConfig.reasoning_mode,
    author_note: activeSession?.author_note,
    author_note_depth: activeSession?.author_note_depth,
    chat_summary: activeSession?.summary || undefined,
    template: promptTemplate ?? undefined,
    macro_seed: activeChatId ?? undefined,
    idle_seconds: idleSeconds(storedMessages),
    reply_length: activeSession?.style?.reply_length || undefined,
    avoid_phrases: state.avoidPhrases.length > 0 ? state.avoidPhrases : undefined,
    group: speaker && speaker.others.length > 0 ? speaker.others : undefined,
    emotion_tags: true,
    avatar_moods: avatarShowsMoods(state, activeCharacter) || undefined,
  }), signal);
  return { ...assembled, hits };
}

/** Search text for recalling memories: the last two user messages and the last reply. */
export function recentMemoryQuery(messages: ChatMessage[]): string {
  const userTexts = messages.filter((m) => m.role === 'user').slice(-2).map((m) => m.content);
  const lastReply = [...messages].reverse().find((m) => m.role === 'assistant')?.content ?? '';
  return [...userTexts, lastReply].join('\n').trim();
}

/**
 * Whether the avatar on screen shows the six moods itself (3D, or Live2D/Inochi2D with a model): then the
 * expression tag offers them even without portrait pictures. "Show everyone" in a group chat
 * shows portraits instead.
 */
export function avatarShowsMoods(state: AppStoreState, character: CharacterProfile): boolean {
  const session = state.chatSessions.find((s) => s.id === state.activeChatId);
  let everyone = false;
  try {
    everyone = (session?.members.length ?? 0) > 0 && localStorage.getItem('otakusoul.chat.groupEveryone') === 'true';
  } catch {
    // no storage: the default view (one avatar)
  }
  if (everyone) return false;
  if (state.avatarMode === '3d') return true;
  if (state.avatarMode === 'inochi2d') {
    return !!resolveInochi2dPath(character, state.scannedInochi2ds, state.activeInochi2dPath);
  }
  return state.avatarMode === 'live2d' && !!resolveLive2dPath(character, state.scannedLive2ds, state.activeLive2dPath);
}

/** Key of a reply variant in `promptHits` (each swipe was written with its own prompt). */
export const hitKey = (messageId: string, swipeIndex: number) => `${messageId}:${swipeIndex}`;

/** Hits of a continued reply: what the first part and the continuation drew on. */
export function mergeHits(a: PromptHits | undefined, b: PromptHits): PromptHits {
  if (!a) return b;
  const lore = [...a.lore, ...b.lore.filter((x) => !a.lore.some((y) => y.name === x.name && y.book === x.book))];
  const memories = [...a.memories, ...b.memories.filter((x) => !a.memories.some((y) => y.id === x.id))];
  return { lore, memories, summary: a.summary || b.summary };
}

/** Reply lengths a chat can choose; empty = as the prompt template says. */
export const REPLY_LENGTHS = ['', 'short', 'medium', 'long'] as const;
export type ReplyLength = (typeof REPLY_LENGTHS)[number];

/** Token room per reply length: short replies don't run on, long ones aren't cut off. */
const REPLY_LENGTH_TOKENS: Record<Exclude<ReplyLength, ''>, number> = { short: 400, medium: 900, long: 2048 };

/**
 * The sampler for a reply in the open chat: its reply length bounds `max_tokens` (a long one
 * raises it). With thinking on, the thoughts count against the limit too, so it stays untouched.
 */
export function chatSampling(state: AppStoreState): SamplingParams {
  const session = state.chatSessions.find((s) => s.id === state.activeChatId);
  const length = session?.style?.reply_length as ReplyLength | undefined;
  if (!length || state.serverConfig.reasoning_mode) return { ...state.sampling };
  const current = state.sampling.max_tokens ?? 2048;
  const room = REPLY_LENGTH_TOKENS[length];
  return { ...state.sampling, max_tokens: length === 'long' ? Math.max(current, room) : Math.min(current, room) };
}

/**
 * `{{idle_duration}}`: how long the user was away before their latest message (seconds since the
 * message before it). Swipes and continuing count from the last user message.
 */
export function idleSeconds(messages: { role: string; created_at: number }[], now = Date.now() / 1000): number | undefined {
  const userTimes = messages.filter((m) => m.role === 'user').map((m) => m.created_at);
  const lastIsUser = messages.at(-1)?.role === 'user';
  const previous = lastIsUser ? messages.at(-2)?.created_at : userTimes.at(-1);
  if (previous === undefined) return undefined;
  const until = lastIsUser ? messages.at(-1)!.created_at : now;
  return Math.max(0, Math.round(until - previous));
}

/** Endpoint, key, model and provider of the chat model the user selected (local or cloud). */
export function llmTarget(state: AppStoreState) {
  const cloud = state.selectedBackend === 'cloud';
  return {
    endpoint_url: cloud
      ? state.cloudEndpoint
      : `http://127.0.0.1:${state.serverConfig.port}/v1/chat/completions`,
    api_key: cloud ? state.cloudApiKey : null,
    model: cloud ? state.cloudModel : null,
    provider: cloud ? state.cloudProvider : ('local_llama' as const),
  };
}

/**
 * The reply language is written verbatim into the system prompt, so it must be a language
 * name. Older settings UI versions stored ISO codes ("en"), which the model then saw as-is.
 */
const REPLY_LANGUAGE_BY_CODE: Record<string, string> = {
  de: 'Deutsch',
  en: 'English',
  ru: 'Русский',
  ja: '日本語',
  fr: 'Français',
  es: 'Español',
};
export const normalizeReplyLanguage = (value: string | null | undefined): string =>
  (value && (REPLY_LANGUAGE_BY_CODE[value] ?? value)) || 'Deutsch';

/** Default endpoint and model per cloud provider. Keep in sync with `providers.rs`. */
export const CLOUD_PROVIDER_DEFAULTS: Partial<Record<LlmProviderType, { endpoint: string; model: string }>> = {
  open_router: { endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'anthropic/claude-sonnet-5' },
  anthropic: { endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-5' },
  open_ai: { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o' },
  deep_seek: { endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-pro-latest',
  },
  mistral: { endpoint: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-large-latest' },
};

export type SettingsSection = 'general' | 'server' | 'providers' | 'sampler' | 'prompt' | 'image' | 'voice' | 'hub';

export type IntegrationsTab = 'web' | 'discord' | 'image' | 'backup';

export type AppTab = 'home' | 'chat' | 'characters' | 'avatars' | 'lorebooks' | 'stage' | 'companion' | 'settings' | 'hub' | 'integrations';
