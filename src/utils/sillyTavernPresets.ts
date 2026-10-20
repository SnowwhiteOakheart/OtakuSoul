import type { SamplingParams } from '../types';

/** What a SillyTavern preset file gives OtakuSoul. */
export interface ImportedPreset {
  /** Sampler values found (only the ones OtakuSoul knows). */
  sampling: Partial<SamplingParams>;
  /** Main system prompt (chat completion `main`, system prompt or old instruct `system_prompt`). */
  main?: string;
  /** Instructions after the chat history (chat completion `jailbreak`). */
  postHistory?: string;
  /** Parts without a counterpart, for the summary: `instruct`, `context`, `prompts`. */
  ignored: ('instruct' | 'context' | 'prompts')[];
  /** Samplers switched on in the preset that OtakuSoul does not have (named in the summary). */
  unsupported: string[];
}

/** Samplers OtakuSoul lacks, and when SillyTavern counts them as on. */
const UNSUPPORTED: [key: string, on: (n: number) => boolean][] = [
  ['typical_p', (n) => n < 1],
  ['tfs', (n) => n < 1],
  ['top_a', (n) => n > 0],
  ['smoothing_factor', (n) => n > 0],
  ['mirostat_mode', (n) => n > 0],
  ['epsilon_cutoff', (n) => n > 0],
  ['eta_cutoff', (n) => n > 0],
  ['nsigma', (n) => n > 0],
];

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) ? Number(value) : undefined;

/** A sampler value, `undefined` when missing or switched off (0 means "off" for these in ST). */
const positive = (value: unknown) => {
  const n = num(value);
  return n !== undefined && n > 0 ? n : undefined;
};

/** Sampler values of a chat completion or text completion preset, in OtakuSoul's names. */
function samplerValues(preset: Record<string, unknown>): Partial<SamplingParams> {
  const out: Partial<SamplingParams> = {};
  const set = <K extends keyof SamplingParams>(key: K, value: SamplingParams[K] | undefined) => {
    if (value !== undefined) out[key] = value;
  };
  set('temperature', num(preset.temperature ?? preset.temp));
  set('top_p', num(preset.top_p));
  set('min_p', num(preset.min_p));
  const topK = num(preset.top_k);
  if (topK !== undefined) out.top_k = Math.max(0, Math.round(topK));
  set('frequency_penalty', num(preset.frequency_penalty ?? preset.freq_pen));
  set('presence_penalty', num(preset.presence_penalty ?? preset.presence_pen));
  set('repeat_penalty', positive(preset.repetition_penalty ?? preset.rep_pen));
  // Dynamic temperature: ST stores min and max, llama.cpp a middle and a range.
  const min = num(preset.min_temp);
  const max = num(preset.max_temp);
  if (preset.dynatemp === true && min !== undefined && max !== undefined && max > min) {
    out.temperature = (min + max) / 2;
    out.dynatemp_range = (max - min) / 2;
    set('dynatemp_exponent', num(preset.dynatemp_exponent));
  }
  set('dry_multiplier', positive(preset.dry_multiplier));
  if (out.dry_multiplier !== undefined) {
    set('dry_base', num(preset.dry_base));
    const allowed = num(preset.dry_allowed_length);
    if (allowed !== undefined) out.dry_allowed_length = Math.round(allowed);
    const lastN = num(preset.dry_penalty_last_n);
    if (lastN !== undefined) out.dry_penalty_last_n = Math.round(lastN);
  }
  set('xtc_probability', positive(preset.xtc_probability));
  if (out.xtc_probability !== undefined) set('xtc_threshold', num(preset.xtc_threshold));
  const maxTokens = positive(preset.openai_max_tokens ?? preset.genamt);
  if (maxTokens !== undefined) out.max_tokens = Math.round(maxTokens);
  return out;
}

/**
 * Reads a SillyTavern preset: a chat completion preset (samplers + `prompts` with `main` and
 * `jailbreak`), a text completion sampler preset, a system prompt (`name` + `content`), an
 * instruct or context template, or a master export holding several of them. Instruct sequences
 * and context templates have no counterpart (OtakuSoul uses the model's own chat template and
 * builds the character prompt itself) and are only reported. Throws without anything usable.
 */
export function importSillyTavernPreset(json: unknown): ImportedPreset {
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('no preset');
  const root = json as Record<string, unknown>;
  const result: ImportedPreset = { sampling: {}, ignored: [], unsupported: [] };
  let recognized = false;
  const read = (part: Record<string, unknown>) => {
    const sampling = samplerValues(part);
    if (Object.keys(sampling).length > 0) recognized = true;
    Object.assign(result.sampling, sampling);
    for (const [key, on] of UNSUPPORTED) {
      const value = num(part[key]);
      if (value !== undefined && on(value)) result.unsupported.push(key);
    }
    // Chat completion preset: the prompt list.
    if (Array.isArray(part.prompts)) {
      recognized = true;
      const prompt = (id: string) => (part.prompts as Record<string, unknown>[]).find((p) => p?.identifier === id)?.content;
      const main = prompt('main');
      const post = prompt('jailbreak');
      if (typeof main === 'string' && main.trim()) result.main = main.trim();
      if (typeof post === 'string' && post.trim()) result.postHistory = post.trim();
      if (part.prompts.length > 2) result.ignored.push('prompts');
    }
    // Instruct template (older ones carry the system prompt).
    if (typeof part.input_sequence === 'string' || typeof part.output_sequence === 'string') {
      if (typeof part.system_prompt === 'string' && part.system_prompt.trim()) result.main = part.system_prompt.trim();
      result.ignored.push('instruct');
    }
    if (typeof part.story_string === 'string') result.ignored.push('context');
    // System prompt file (an empty one, like "Blank", is recognized but gives nothing).
    if (typeof part.content === 'string' && typeof part.name === 'string' && !('prompts' in part)) {
      recognized = true;
      if (part.content.trim()) result.main = part.content.trim();
    }
  };
  read(root);
  // Master export: one object with the single parts inside.
  for (const key of ['instruct', 'context', 'sysprompt', 'preset', 'textgenerationwebui_preset', 'openai_preset']) {
    const part = root[key];
    if (part && typeof part === 'object' && !Array.isArray(part)) read(part as Record<string, unknown>);
  }
  result.ignored = [...new Set(result.ignored)];
  result.unsupported = [...new Set(result.unsupported)];
  if (!recognized && !result.main && !result.postHistory && result.ignored.length === 0) throw new Error('no preset');
  return result;
}
