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
  clone_experimental: false,
  voice_design: false,
  style_control: false,
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
  clone_experimental: false,
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
  vi.mocked(api.getTtsLocalSettings).mockResolvedValue({ allow_noncommercial: false, spoken_disclaimer: true, designed_voices: [] });
  vi.mocked(api.listClonedVoices).mockResolvedValue([]);
  vi.mocked(api.onTtsModelProgress).mockResolvedValue(() => {});
  vi.mocked(api.onRuntimeProgress).mockResolvedValue(() => {});
  vi.mocked(api.getRuntime).mockResolvedValue(null);
  vi.mocked(api.listRuntimeVariants).mockResolvedValue([]);
});

describe('LocalTtsSettings', () => {
  it('gives a style voice a speaking style and its feelings', async () => {
    const styled: TtsModelInfo = { ...qwen, id: 'qwen3-tts-customvoice-1.7b', name: 'CustomVoice 1.7B', cloning: false, style_control: true };
    vi.mocked(api.listTtsModels).mockResolvedValue([styled]);
    const onChange = vi.fn();
    const base = { ...config, local_model_id: styled.id, local_style: '', local_emotion: true } as VoiceConfig;
    render(<LocalTtsSettings config={base} onChange={onChange} />);
    // The preset voice stays selectable next to the style.
    expect(await screen.findByRole('combobox', { name: /^Voice$/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: /Speaking style/ }), { target: { value: 'Speak softly.' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ local_style: 'Speak softly.' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /feeling of the reply/ }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ local_emotion: false }));
  });

  it('shows no style fields for voices without style control', async () => {
    render(<LocalTtsSettings config={config} onChange={vi.fn()} />);
    await screen.findByRole('combobox', { name: /^Voice$/ });
    expect(screen.queryByRole('textbox', { name: /Speaking style/ })).not.toBeInTheDocument();
  });

  it('lets a VoiceDesign character use its own description', async () => {
    const design: TtsModelInfo = { ...qwen, id: 'qwen3-tts-1.7b-voicedesign', name: 'VoiceDesign', voice_design: true, cloning: false, voices: [] };
    vi.mocked(api.listTtsModels).mockResolvedValue([design]);
    const onChange = vi.fn();
    render(<LocalTtsSettings config={{ ...config, local_model_id: design.id, voice_id: '', openai_instructions: '' } as VoiceConfig} onChange={onChange} />);
    const description = await screen.findByRole('textbox', { name: /Voice description/ });
    expect(screen.getByRole('combobox', { name: /^Voice$/ })).toHaveValue('');
    fireEvent.change(description, { target: { value: 'A calm voice' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ openai_instructions: 'A calm voice' }));
  });

  it('designs named voices once and assigns them to characters', async () => {
    const design: TtsModelInfo = { ...qwen, id: 'qwen3-tts-1.7b-voicedesign', name: 'VoiceDesign', voice_design: true, cloning: false, voices: [] };
    vi.mocked(api.listTtsModels).mockResolvedValue([design]);
    vi.mocked(api.getTtsLocalSettings).mockResolvedValue({
      allow_noncommercial: false,
      spoken_disclaimer: true,
      designed_voices: [{ id: 'hero', name: 'Young heroine', description: 'A bright, young female voice' }],
    });
    const user = userEvent.setup();
    const onChange = vi.fn();
    const base = { ...config, local_model_id: design.id, voice_id: 'design:hero', openai_instructions: '' } as VoiceConfig;
    render(<LocalTtsSettings config={base} onChange={onChange} />);

    // The chosen designed voice brings its description; no own description field.
    expect(await screen.findByText('A bright, young female voice', { selector: 'span.text-slate-300' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Voice description/ })).not.toBeInTheDocument();

    // A second voice is saved to the shared list and assigned to this character.
    await user.type(screen.getByRole('textbox', { name: 'Name of the designed voice' }), 'Old wizard');
    await user.type(screen.getByRole('textbox', { name: 'Description of the voice' }), 'A deep, raspy old male voice');
    await user.click(screen.getByRole('button', { name: 'Add voice' }));
    await waitFor(() =>
      expect(api.saveTtsLocalSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          designed_voices: [
            { id: 'hero', name: 'Young heroine', description: 'A bright, young female voice' },
            expect.objectContaining({ name: 'Old wizard', description: 'A deep, raspy old male voice' }),
          ],
        }),
      ),
    );
    const saved = vi.mocked(api.saveTtsLocalSettings).mock.calls.at(-1)![0].designed_voices[1]!;
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ voice_id: `design:${saved.id}` }));
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
      expect(api.saveTtsLocalSettings).toHaveBeenCalledWith({ allow_noncommercial: true, spoken_disclaimer: true, designed_voices: [] })
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

  it('cuts the reference out of a longer file and saves only that part', async () => {
    // 40 s at 24 kHz: silence with speech-like noise from 20 s to 34 s.
    const rate = 24_000;
    const audio = new Float32Array(40 * rate);
    for (let i = 20 * rate; i < 34 * rate; i += 1) audio[i] = Math.sin(i / 7) * 0.5;
    class FakeAudioContext {
      decodeAudioData = async () => ({ length: audio.length, numberOfChannels: 1, sampleRate: rate, getChannelData: () => audio });
      close = async () => {};
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const user = userEvent.setup();
    const { container } = render(<LocalTtsSettings config={config} onChange={vi.fn()} />);
    const file = new File([new Uint8Array(8)], 'long.wav', { type: 'audio/wav' });
    await user.upload(await screen.findByLabelText('Choose audio file'), file);

    // The suggestion covers the speech, not the silence before it.
    const trim = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('[data-clone-trim]');
      expect(element).not.toBeNull();
      return element!;
    });
    const [start = 0, end = 0] = trim.dataset.cloneTrim!.split('-').map(Number);
    expect(start).toBeGreaterThan(18);
    expect(start).toBeLessThan(23);
    expect(end - start).toBeGreaterThan(10);
    expect(end - start).toBeLessThan(16);

    fireEvent.change(screen.getByRole('slider', { name: /^Start/ }), { target: { value: '21' } });
    fireEvent.change(screen.getByRole('slider', { name: /^End/ }), { target: { value: '31' } });
    expect(container.querySelector('[data-clone-seconds]')?.getAttribute('data-clone-seconds')).toBe('10.0');

    await user.type(screen.getByRole('textbox', { name: 'Voice name' }), 'Probe');
    await user.type(screen.getByRole('textbox', { name: /What is said in the recording/ }), 'Hallo');
    await user.click(screen.getByRole('checkbox', { name: /I confirm that this is my own voice/ }));
    await user.click(screen.getByRole('button', { name: 'Save voice' }));
    await waitFor(() => expect(api.createClonedVoice).toHaveBeenCalled());
    const saved = vi.mocked(api.createClonedVoice).mock.calls[0]![0];
    expect(atob(saved.samplesBase64).length / 4).toBe(10 * rate);
    vi.unstubAllGlobals();
  });
});
