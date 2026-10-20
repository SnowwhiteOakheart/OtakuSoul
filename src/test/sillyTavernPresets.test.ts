import { describe, expect, it } from 'vitest';
import { importSillyTavernPreset } from '../utils/sillyTavernPresets';

describe('SillyTavern presets', () => {
  it('reads a chat completion preset with its main and post-history prompt', () => {
    const preset = importSillyTavernPreset({
      temperature: 1.1, frequency_penalty: 0.2, presence_penalty: 0, top_p: 0.95, top_k: 0, min_p: 0.05,
      repetition_penalty: 1, openai_max_tokens: 600,
      prompts: [
        { identifier: 'main', name: 'Main Prompt', content: "Write {{char}}'s next reply in a fictional chat between {{char}} and {{user}}." },
        { identifier: 'jailbreak', name: 'Post-History Instructions', content: '' },
        { identifier: 'nsfw', name: 'Auxiliary Prompt', content: 'Be vivid.' },
      ],
    });
    expect(preset.sampling).toEqual({
      temperature: 1.1, frequency_penalty: 0.2, presence_penalty: 0, top_p: 0.95, top_k: 0, min_p: 0.05,
      repeat_penalty: 1, max_tokens: 600,
    });
    expect(preset.main).toBe("Write {{char}}'s next reply in a fictional chat between {{char}} and {{user}}.");
    expect(preset.postHistory).toBeUndefined();
    expect(preset.ignored).toEqual(['prompts']);
  });

  it('reads a text completion preset with dynamic temperature, DRY and XTC', () => {
    const preset = importSillyTavernPreset({
      temp: 1, top_p: 1, top_k: 40, min_p: 0.02, rep_pen: 1.07, freq_pen: 0, presence_pen: 0,
      dynatemp: true, min_temp: 0.6, max_temp: 1.4, dynatemp_exponent: 1,
      dry_multiplier: 0.8, dry_base: 1.75, dry_allowed_length: 2, dry_penalty_last_n: 0,
      xtc_threshold: 0.1, xtc_probability: 0,
    });
    expect(preset.sampling.temperature).toBeCloseTo(1);
    expect(preset.sampling.dynatemp_range).toBeCloseTo(0.4);
    expect(preset.sampling).toMatchObject({ repeat_penalty: 1.07, dry_multiplier: 0.8, dry_base: 1.75, dry_allowed_length: 2, top_k: 40 });
    // XTC with probability 0 is off in SillyTavern.
    expect(preset.sampling.xtc_threshold).toBeUndefined();
  });

  it('takes the system prompt and names what it leaves out', () => {
    expect(importSillyTavernPreset({ name: 'Roleplay - Immersive', content: 'You are {{char}}.' }))
      .toMatchObject({ main: 'You are {{char}}.', ignored: [] });
    const master = importSillyTavernPreset({
      instruct: { name: 'ChatML', input_sequence: '<|im_start|>user', output_sequence: '<|im_start|>assistant', system_prompt: '' },
      context: { name: 'ChatML', story_string: '{{#if description}}{{description}}{{/if}}' },
      sysprompt: { name: 'Neutral', content: 'Stay in character.' },
    });
    expect(master.main).toBe('Stay in character.');
    expect(master.ignored).toEqual(['instruct', 'context']);
    expect(() => importSillyTavernPreset({ foo: 1 })).toThrow();
    expect(() => importSillyTavernPreset([1, 2])).toThrow();
  });
});
