// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResetSection } from '../components/settings/ResetSection';
import { toast } from '../components/ui/feedback';
import { EXTRA_SAMPLING_FIELDS, changedFields, kvCacheTypes, samplingDefaults, serverTuningDefaults, settingsForNewModel } from '../utils/settingDefaults';
import type { LlamaServerConfig, ModelDefaults, SamplingParams } from '../types';

describe('setting defaults', () => {
  it('counts changed and additionally set sampler values', () => {
    const defaults = samplingDefaults('/m/Mistral.gguf', true);
    const fresh = { temperature: 0.7, top_p: 0.9, min_p: 0.05, top_k: 40, repeat_penalty: 1.05, max_tokens: 2048, stop_strings: [] };
    expect(changedFields(fresh, defaults, EXTRA_SAMPLING_FIELDS)).toEqual([]);
    expect(
      changedFields({ ...fresh, temperature: 1.1, repeat_penalty: 1.1, dry_multiplier: 0.8, stop_strings: ['</s>'] }, defaults, EXTRA_SAMPLING_FIELDS),
    ).toEqual(['temperature', 'repeat_penalty', 'dry_multiplier', 'stop_strings']);
  });

  const rules: ModelDefaults[] = [{
    match: ['bonsai'],
    server: { cache_type_k: 'q4_0', cache_type_v: 'q4_0', reasoning_mode: true },
    sampling: { top_p: 0.95, top_k: 20 },
  }];

  it("uses the catalog's values as defaults for the model's family", () => {
    expect(samplingDefaults('/m/Ternary-Bonsai-2-27B.gguf', true, rules)).toMatchObject({ top_p: 0.95, top_k: 20 });
    expect(samplingDefaults('/m/Ternary-Bonsai-2-27B.gguf', false, rules)).toMatchObject({ top_p: 0.9, top_k: 40 });
    expect(serverTuningDefaults('/m/Ternary-Bonsai-2-27B.gguf', rules)).toMatchObject({ cache_type_k: 'q4_0', reasoning_mode: true });
    expect(serverTuningDefaults('/m/Nemo.gguf', rules)).toMatchObject({ cache_type_k: 'q8_0', reasoning_mode: false });
    // Only the file name counts, not a folder named after a family.
    expect(serverTuningDefaults('/bonsai/Nemo.gguf', rules)).toMatchObject({ cache_type_k: 'q8_0' });
  });

  it('estimates the KV cache as llama-server runs it', () => {
    expect(kvCacheTypes({ flash_attn: true })).toEqual(['q8_0', 'q8_0']);
    expect(kvCacheTypes({ flash_attn: false, cache_type_k: 'q4_0', cache_type_v: 'q4_0' })).toEqual(['q4_0', 'f16']);
    expect(kvCacheTypes({ flash_attn: false, cache_type_k: 'f16', cache_type_v: 'bf16' })).toEqual(['f16', 'bf16']);
  });

  it("keeps the user's settings for a new model and swaps only the family values", () => {
    const server = { model_path: '/m/Ternary-Bonsai-2-27B.gguf', port: 1, context_size: 8192, gpu_layers: 99, flash_attn: true,
      reasoning_mode: true, cache_type_k: 'q4_0', cache_type_v: 'q4_0', threads: 6 } as LlamaServerConfig;
    const sampling = { temperature: 1.1, top_p: 0.95, top_k: 20, min_p: 0.05, max_tokens: 2048 } as SamplingParams;
    const fromBonsai = settingsForNewModel(server.model_path, '/m/Nemo.gguf', server, sampling, rules);
    expect(fromBonsai.server).toMatchObject({ cache_type_k: 'q8_0', reasoning_mode: false, threads: 6 });
    expect(fromBonsai.sampling).toMatchObject({ temperature: 1.1, top_p: 0.9, top_k: 40 });
    const toBonsai = settingsForNewModel('/m/Nemo.gguf', server.model_path, fromBonsai.server, fromBonsai.sampling, rules);
    expect(toBonsai.server).toMatchObject({ cache_type_k: 'q4_0', reasoning_mode: true });
    expect(toBonsai.sampling).toMatchObject({ temperature: 1.1, top_k: 20 });
  });
});

describe('ResetSection', () => {
  it('says when nothing differs', () => {
    render(<ResetSection area="Antwortstil" changed={0} reset={vi.fn()} />);
    expect(screen.getByText('Alle Werte entsprechen dem Standard.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('resets and offers undo', async () => {
    const undo = vi.fn();
    const reset = vi.fn().mockResolvedValue(undo);
    const info = vi.spyOn(toast, 'info').mockImplementation(() => {});
    const { rerender } = render(<ResetSection area="Antwortstil" changed={1} reset={reset} />);
    expect(screen.getByText('1 Wert weicht vom Standard ab')).toBeInTheDocument();
    rerender(<ResetSection area="Antwortstil" changed={3} reset={reset} />);
    expect(screen.getByText('3 Werte weichen vom Standard ab')).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Auf Standard zurücksetzen' })));
    expect(reset).toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('„Antwortstil“ auf Standard zurückgesetzt.', expect.objectContaining({ label: 'Rückgängig' }));
    info.mock.calls[0]![1]!.onClick();
    expect(undo).toHaveBeenCalled();
  });
});
