// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResetSection } from '../components/settings/ResetSection';
import { toast } from '../components/ui/feedback';
import { EXTRA_SAMPLING_FIELDS, changedFields, samplingDefaults, serverTuningDefaults } from '../utils/settingDefaults';

describe('setting defaults', () => {
  it('counts changed and additionally set sampler values', () => {
    const defaults = samplingDefaults('/m/Mistral.gguf', true);
    const fresh = { temperature: 0.7, top_p: 0.9, min_p: 0.05, top_k: 40, repeat_penalty: 1.05, max_tokens: 2048, stop_strings: [] };
    expect(changedFields(fresh, defaults, EXTRA_SAMPLING_FIELDS)).toEqual([]);
    expect(
      changedFields({ ...fresh, temperature: 1.1, repeat_penalty: 1.1, dry_multiplier: 0.8, stop_strings: ['</s>'] }, defaults, EXTRA_SAMPLING_FIELDS),
    ).toEqual(['temperature', 'repeat_penalty', 'dry_multiplier', 'stop_strings']);
  });

  it('uses the Bonsai settings as defaults for Bonsai', () => {
    expect(samplingDefaults('/m/Ternary-Bonsai-2-27B.gguf', true)).toMatchObject({ top_p: 0.95, top_k: 20 });
    expect(samplingDefaults('/m/Ternary-Bonsai-2-27B.gguf', false)).toMatchObject({ top_p: 0.9, top_k: 40 });
    expect(serverTuningDefaults('/m/Ternary-Bonsai-2-27B.gguf')).toMatchObject({ cache_type_k: 'q4_0', reasoning_mode: true });
    expect(serverTuningDefaults('/m/Nemo.gguf')).toMatchObject({ cache_type_k: 'f16', reasoning_mode: false });
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
