import { api } from '../services/api';
import { soundFx } from '../services/soundFx';
import type { AssembledPrompt, ChatMessage, LorebookEntry, LlmProviderType } from '../types';
import type { AppStoreState } from './storeTypes';

export async function resolvePromptWithLore(
  state: AppStoreState,
  recentMessages: ChatMessage[],
  latestUserText?: string,
): Promise<AssembledPrompt> {
  const {
    activeCharacter,
    promptTemplate,
    activePersona,
    stateVariables,
    cognitiveOverview,
    replyLanguage,
    serverConfig,
    chatSessions,
    activeChatId,
    lorebookScanDepth,
    allLorebooks,
    activeLorebooks,
    globalLorebookIds,
    currentTension,
    sceneTensionEnabled,
  } = state;

  if (!activeCharacter) return { system: '', post_history: null };

  const activeSession = chatSessions.find((s) => s.id === activeChatId);
  const scanDepth = Math.max(1, lorebookScanDepth || 5);
  const recentContext = recentMessages
    .slice(-scanDepth)
    .map((m) => m.content)
    .join(' ');

  // 1. Gather all candidate lorebooks (bound to character or global)
  const boundSet = new Set(activeCharacter.bound_lorebooks || []);
  const globalSet = new Set(globalLorebookIds || []);

  let candidateLorebooks = allLorebooks.filter(
    (lb) =>
      (lb.id && boundSet.has(lb.id)) ||
      (lb.file_path && boundSet.has(lb.file_path)) ||
      lb.is_global ||
      (lb.id && globalSet.has(lb.id)) ||
      (lb.file_path && globalSet.has(lb.file_path))
  );

  if (candidateLorebooks.length === 0) {
    candidateLorebooks = activeLorebooks.length > 0 ? activeLorebooks : allLorebooks;
  }

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
      const evalRes = await api.evaluateMultiLorebooks(
        candidateLorebooks,
        recentContext,
        effectiveTension
      );
      passiveEntries = evalRes.passive_entries;
      activeDirectives = evalRes.active_entries;

      if (evalRes.triggered_tension_events.length > 0) {
        soundFx.playWarning();
        state.setCurrentTension(evalRes.new_tension);
      } else if (sceneTensionEnabled) {
        state.setCurrentTension(effectiveTension);
      }
    } catch (e) {
      console.warn('Failed evaluateMultiLorebooks, falling back:', e);
      for (const lb of candidateLorebooks) {
        const entries = await api.evaluateLorebookContext(lb, recentContext);
        passiveEntries.push(...entries);
      }
    }
  }

  // 4. Assemble system prompt
  return await api.assemblePrompt({
    char_name: activeCharacter.card.data.name,
    user_name: activePersona.name,
    character: activeCharacter.card.data,
    active_lore: passiveEntries,
    active_directives: activeDirectives,
    state_variables: stateVariables,
    cognitive: cognitiveOverview || undefined,
    reply_language: replyLanguage || 'Deutsch',
    allow_reasoning: serverConfig.reasoning_mode,
    author_note: activeSession?.author_note,
    author_note_depth: activeSession?.author_note_depth,
    chat_summary: activeSession?.summary || undefined,
    template: promptTemplate ?? undefined,
  });
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

export type SettingsSection = 'general' | 'server' | 'providers' | 'sampler' | 'prompt' | 'hub';

export type AppTab = 'chat' | 'characters' | 'lorebooks' | 'stage' | 'companion' | 'settings' | 'hub' | 'integrations';
