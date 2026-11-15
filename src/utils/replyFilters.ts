import type { ReplyReplacement } from '../types';
import { runUserScript } from '../services/scriptSandbox';

/** Where a regex script acts: the stored text, only what the chat shows, or only what the model reads. */
export type ScriptStage = 'save' | 'display' | 'prompt';

/** A new rule as the old find/replace rules worked: on replies, changing the stored text. */
export const NEW_RULE: ReplyReplacement = {
  find: '', replace: '', regex: false, name: '', disabled: false, on_input: false, on_output: true, mode: 'save', code: '',
};

/** A rule with JavaScript (C9): it runs in the sandbox, asynchronously, only on `save` and `prompt`. */
export const isScriptRule = (rule: Partial<ReplyReplacement>) => !!rule.code?.trim();

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
    // JavaScript rules need the sandbox: only the async path runs them (live text skips them).
    if (isScriptRule(rule) || !applies(rule, role, stage)) continue;
    out = applyFindReplace(out, rule);
  }
  return out;
}

function applies(rule: ReplyReplacement, role: string, stage: ScriptStage): boolean {
  if (rule.disabled || (rule.mode || 'save') !== stage) return false;
  if (!isScriptRule(rule) && !rule.find) return false;
  return role === 'user' ? rule.on_input : role === 'assistant' ? rule.on_output : false;
}

function applyFindReplace(text: string, rule: ReplyReplacement): string {
  if (!rule.regex) return text.split(rule.find).join(rule.replace);
  const compiled = compileCached(rule.find);
  return typeof compiled === 'string' ? text : text.replace(compiled, rule.replace);
}

/** The last error of each script (by its code), for the settings; listeners hear about new ones. */
const scriptErrors = new Map<string, string>();
const scriptErrorListeners = new Set<() => void>();

export function scriptError(code: string): string | null {
  return scriptErrors.get(code.trim()) ?? null;
}

export function onScriptErrors(listener: () => void): () => void {
  scriptErrorListeners.add(listener);
  return () => scriptErrorListeners.delete(listener);
}

function noteScriptResult(code: string, error: string | null) {
  const key = code.trim();
  if ((scriptErrors.get(key) ?? null) === error) return;
  if (error) scriptErrors.set(key, error);
  else scriptErrors.delete(key);
  for (const listener of scriptErrorListeners) listener();
}

/**
 * Like `applyScripts`, with JavaScript rules (C9) in their place in the order. A script that fails
 * leaves the text as it was (its error shows in the settings), so a broken script never breaks the chat.
 */
export async function applyScriptsAsync(
  text: string,
  rules: ReplyReplacement[],
  role: 'user' | 'assistant',
  stage: 'save' | 'prompt',
  /** Scripts that already failed in this batch (a whole chat for the prompt): not run again. */
  failed: Set<string> = new Set(),
): Promise<string> {
  if (!text || !rules.some((r) => isScriptRule(r) && applies(withDefaults(r), role, stage))) return applyScripts(text, rules, role, stage);
  let out = text;
  for (const raw of rules) {
    const rule = withDefaults(raw);
    if (!applies(rule, role, stage)) continue;
    if (!isScriptRule(rule)) {
      out = applyFindReplace(out, rule);
      continue;
    }
    // A script that failed (e.g. its time ran out) would fail again on every message of the chat.
    if (failed.has(rule.code)) continue;
    const result = await runUserScript(rule.code, out, { role, stage });
    noteScriptResult(rule.code, result.ok ? null : result.error);
    if (result.ok) out = result.text;
    else {
      failed.add(rule.code);
      console.warn(`Script "${rule.name || '?'}" failed:`, result.error);
    }
  }
  return out;
}

/** Replies as they are saved, JavaScript rules included. */
export function applyRepliesAsync(text: string, rules: ReplyReplacement[]): Promise<string> {
  return applyScriptsAsync(text, rules, 'assistant', 'save');
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

/** `forPrompt` with JavaScript rules: each user and assistant message once through the scripts. */
export async function forPromptAsync<T extends { role: string; content: string }>(messages: T[], rules: ReplyReplacement[]): Promise<T[]> {
  if (!rules.some((r) => isScriptRule(r) && withDefaults(r).mode === 'prompt')) return forPrompt(messages, rules);
  const out: T[] = [];
  const failed = new Set<string>();
  for (const m of messages) {
    const content = m.role === 'user' || m.role === 'assistant' ? await applyScriptsAsync(m.content, rules, m.role, 'prompt', failed) : m.content;
    out.push({ ...m, content });
  }
  return out;
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
