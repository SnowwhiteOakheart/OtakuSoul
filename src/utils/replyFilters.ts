import type { ReplyReplacement } from '../types';

/** Where a regex script acts: the stored text, only what the chat shows, or only what the model reads. */
export type ScriptStage = 'save' | 'display' | 'prompt';

/** A new rule as the old find/replace rules worked: on replies, changing the stored text. */
export const NEW_RULE: ReplyReplacement = {
  find: '', replace: '', regex: false, name: '', disabled: false, on_input: false, on_output: true, mode: 'save',
};

/** Fills fields a rule from an older settings file or a test lacks. */
export function withDefaults(rule: Partial<ReplyReplacement>): ReplyReplacement {
  return { ...NEW_RULE, ...rule };
}

const regexCache = new Map<string, RegExp | string>();

/** `/pattern/flags` (SillyTavern style) or a bare pattern, which replaces every match. */
function compileCached(find: string): RegExp | string {
  let cached = regexCache.get(find);
  if (cached === undefined) {
    try {
      const literal = /^\/([\s\S]+)\/([dgimsuvy]*)$/.exec(find);
      cached = literal ? new RegExp(literal[1]!, literal[2]) : new RegExp(find, 'gu');
    } catch (e) {
      cached = e instanceof Error ? e.message : String(e);
    }
    regexCache.set(find, cached);
  }
  if (typeof cached !== 'string') cached.lastIndex = 0;
  return cached;
}

/** Why a rule can't run (an invalid regular expression), or null. */
export function ruleError(rule: Pick<ReplyReplacement, 'find' | 'regex'>): string | null {
  if (!rule.regex || !rule.find) return null;
  const compiled = compileCached(rule.find);
  return typeof compiled === 'string' ? compiled : null;
}

/**
 * Applies the user's regex scripts for messages of `role` at `stage`, in order. Plain rules
 * replace every exact occurrence; regex rules use JavaScript syntax (`$1` for groups). Empty,
 * switched off and invalid rules are skipped, so a typo never breaks the chat.
 */
export function applyScripts(text: string, rules: ReplyReplacement[], role: string, stage: ScriptStage): string {
  if (!text || rules.length === 0) return text;
  let out = text;
  for (const raw of rules) {
    const rule = withDefaults(raw);
    if (rule.disabled || !rule.find || (rule.mode || 'save') !== stage) continue;
    if (role === 'user' ? !rule.on_input : role === 'assistant' ? !rule.on_output : true) continue;
    if (rule.regex) {
      const compiled = compileCached(rule.find);
      if (typeof compiled === 'string') continue;
      out = out.replace(compiled, rule.replace);
    } else {
      out = out.split(rule.find).join(rule.replace);
    }
  }
  return out;
}

/** Replies as they are saved: the rules that change the stored text (kept for older callers). */
export function applyReplacements(text: string, rules: ReplyReplacement[]): string {
  return applyScripts(text, rules, 'assistant', 'save');
}

/** The chat as the model reads it: prompt-only scripts on user and assistant messages. */
export function forPrompt<T extends { role: string; content: string }>(messages: T[], rules: ReplyReplacement[]): T[] {
  if (!rules.some((r) => withDefaults(r).mode === 'prompt')) return messages;
  return messages.map((m) => ({ ...m, content: applyScripts(m.content, rules, m.role, 'prompt') }));
}

/** What a SillyTavern regex script file gave: rules, and how many parts could not be taken over. */
export interface ImportedScripts {
  rules: ReplyReplacement[];
  /** Placements OtakuSoul has no counterpart for (slash commands, world info, reasoning). */
  skipped: number;
}

/**
 * Reads SillyTavern regex scripts (one script or a list): placement 1 = user input, 2 = AI
 * output; `markdownOnly` → display, `promptOnly` → prompt (both: one rule each). SillyTavern
 * reads `{{match}}` (any case) and `$0` as the whole match, JavaScript `$&`. Trim strings, depth
 * limits and macros in the pattern have no counterpart and are left out.
 */
export function importSillyTavernScripts(json: unknown): ImportedScripts {
  const list = Array.isArray(json) ? json : [json];
  const rules: ReplyReplacement[] = [];
  let skipped = 0;
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const script = item as Record<string, unknown>;
    if (typeof script.findRegex !== 'string' || !script.findRegex) continue;
    const placement = Array.isArray(script.placement) ? script.placement.map(Number) : [2];
    const onInput = placement.includes(1);
    const onOutput = placement.includes(2);
    if (!onInput && !onOutput) {
      skipped += 1;
      continue;
    }
    const replace = (typeof script.replaceString === 'string' ? script.replaceString : '')
      .replace(/\{\{match\}\}|\$0(?!\d)/gi, () => '$&');
    const modes = [...(script.markdownOnly === true ? ['display'] : []), ...(script.promptOnly === true ? ['prompt'] : [])];
    for (const mode of modes.length > 0 ? modes : ['save']) {
      rules.push({
        ...NEW_RULE,
        name: typeof script.scriptName === 'string' ? script.scriptName : '',
        find: script.findRegex,
        replace,
        regex: true,
        disabled: script.disabled === true,
        on_input: onInput,
        on_output: onOutput,
        mode,
      });
    }
  }
  if (rules.length === 0 && skipped === 0) throw new Error('no regex scripts');
  return { rules, skipped };
}
