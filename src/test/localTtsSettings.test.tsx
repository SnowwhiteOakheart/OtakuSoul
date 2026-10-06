// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { LocalTtsSettings } from '../components/voice/LocalTtsSettings';
import { FeedbackHost } from '../components/ui/feedback';
import { resetApiMocks } from './mockApi';
import type { TtsModelInfo, VoiceConfig } from '../types';

const GB = 1024 ** 3;
const qwen: TtsModelInfo = {
  id: 'qwen3-tts-0.6b',
  name: 'Qwen3-TTS 0.6B',
  license: 'Apache-2.0',
  noncommercial: false,
  allowed: true,
  languages: ['de', 'en', 'ru'],
  cloning: true,
  needs_clone: false,
  voice_design: false,
  sound_tags: false,
  vram_mb: 2000,
  download_bytes: 1.3 * GB,
  missing_bytes: 0,
  installed: true,
  voices: [{ voice_id: 'preset:default', label: 'Standard', language: 'multi', cloned: false }],
};
const f5: TtsModelInfo = {
  ...qwen,
  id: 'f5-tts-v1',
  name: 'F5-TTS v1',
  license: 'CC-BY-NC-4.0',
  noncommercial: true,
  allowed: false,
  installed: false,
  missing_bytes: 1 * GB,
  needs_clone: true,
  voices: [],
};

const config = {
  engine: 'local',
  voice_id: 'preset:default',
  local_model_id: 'qwen3-tts-0.6b',
  stt: { engine: 'disabled', input_device_id: '' },
} as unknown as VoiceConfig;

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ appLanguage: 'en' });
  vi.mocked(api.listTtsModels).mockResolvedValue([qwen, f5]);
  vi.mocked(api.getTtsLocalSettings).mockResolvedValue({ allow_noncommercial: false, spoken_disclaimer: true });
  vi.mocked(api.listClonedVoices).mockResolvedValue([]);
  vi.mocked(api.onTtsModelProgress).mockResolvedValue(() => {});
  vi.mocked(api.onRuntimeProgress).mockResolvedValue(() => {});
  vi.mocked(api.getRuntime).mockResolvedValue(null);
  vi.mocked(api.listRuntimeVariants).mockResolvedValue([]);
});

describe('LocalTtsSettings', () => {
  it('asks for a voice description instead of a voice for VoiceDesign models', async () => {
    const design: TtsModelInfo = { ...qwen, id: 'qwen3-tts-1.7b-voicedesign', name: 'VoiceDesign', voice_design: true, cloning: false, voices: [] };
    vi.mocked(api.listTtsModels).mockResolvedValue([design]);
    const onChange = vi.fn();
    render(<LocalTtsSettings config={{ ...config, local_model_id: design.id, openai_instructions: '' } as VoiceConfig} onChange={onChange} />);
    const description = await screen.findByRole('textbox', { name: /Voice description/ });
    expect(screen.queryByRole('combobox', { name: /^Voice$/ })).not.toBeInTheDocument();
    fireEvent.change(description, { target: { value: 'A calm voice' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ openai_instructions: 'A calm voice' }));
  });
  it('keeps non-commercial models locked until the user confirms the licence', async () => {
    const user = userEvent.setup();
    render(
      <>
        <LocalTtsSettings config={config} onChange={vi.fn()} />
        <FeedbackHost />
      </>
    );

    expect(await screen.findByText('non-commercial only')).toBeInTheDocument();
    expect(screen.getByText(/Locked: enable/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download (1.00 GB)' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Allow non-commercial models' }));
    await user.click(await screen.findByRole('button', { name: 'Understood, unlock' }));
    await waitFor(() =>
      expect(api.saveTtsLocalSettings).toHaveBeenCalledWith({ allow_noncommercial: true, spoken_disclaimer: true })
    );
  });

  it('only saves a cloned voice with a transcript and confirmed consent', async () => {
    render(<LocalTtsSettings config={config} onChange={vi.fn()} />);
    const save = await screen.findByRole('button', { name: 'Save voice' });
    // No sample, no name, no consent yet.
    expect(save).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Detect automatically' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /I confirm that this is my own voice/ })).not.toBeChecked();
  });
});
