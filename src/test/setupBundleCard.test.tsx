// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../components/onboarding/setupBundleStore', async (original) => ({
  ...(await original<object>()),
  runBundle: vi.fn().mockResolvedValue(undefined),
}));
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { resetApiMocks } from './mockApi';
import { SetupBundle } from '../components/onboarding/SetupBundle';
import { runBundle, useSetupBundle } from '../components/onboarding/setupBundleStore';
import type { ImageModelInfo, StarterModel, TtsModelInfo } from '../types';

const GB = 1024 ** 3;
const starter = (id: string, recommended: boolean, size: number): StarterModel => ({
  id, name: id, license: 'Apache-2.0', vram_mb: 7000, recommended, fits_gpu: true, installed: false, description: { en: `${id} text` },
  license_kind: 'open', license_note: {}, license_url: 'https://huggingface.co/x', mmproj: null, mmproj_installed: false,
  file: { filename: `${id}.gguf`, size_bytes: size, size_formatted: `${size / GB} GB`, runtime: 'standard' } as never,
});
const image = (id: string, recommended: boolean): ImageModelInfo => ({
  id, name: id, family: 'sdxl', vram_mb: 7500, download_bytes: 6 * GB, missing_bytes: 6 * GB, installed: false,
  extras_missing_bytes: 0, license: 'CreativeML Open RAIL++-M', recommended, fits_gpu: recommended,
});
const tts: TtsModelInfo = {
  id: 'qwen3-tts-customvoice-1.7b', name: 'Qwen3-TTS 1.7B', license: 'Apache-2.0', noncommercial: false, allowed: true,
  languages: ['de', 'en'], cloning: false, needs_clone: false, clone_experimental: false, voice_design: false, style_control: true,
  sound_tags: false, vram_mb: 3600, download_bytes: 2 * GB, missing_bytes: 2 * GB, installed: false,
  voices: [{ voice_id: 'preset:ryan', label: 'Ryan', language: 'en', cloned: false }],
};

beforeEach(() => {
  resetApiMocks();
  vi.mocked(runBundle).mockClear();
  useSetupBundle.getState().reset();
  useAppStore.setState({
    appLanguage: 'en',
    hardware: { gpus: [{ name: 'RTX 4070 Ti SUPER', total_vram_mb: 16_384, free_vram_mb: 15_000 }], total_ram_mb: 65_536 } as never,
  });
  vi.mocked(api.listStarterModels).mockResolvedValue([starter('gemma-4-e4b', false, 5 * GB), starter('gemma-4-12b', true, 7 * GB)]);
  vi.mocked(api.listImageModels).mockResolvedValue([image('animagine-xl-4', true), image('flux-dev', false)]);
  vi.mocked(api.listTtsModels).mockResolvedValue([tts]);
  vi.mocked(api.diskSpace).mockResolvedValue({ models_mb: 200 * 1024, data_mb: 200 * 1024 });
});

describe('SetupBundle', () => {
  it('preselects the recommendation for chat, pictures and voice and loads them on yes', async () => {
    const user = userEvent.setup();
    render(<SetupBundle />);
    expect(await screen.findByText('Recommended for your PC')).toBeInTheDocument();
    expect(screen.getByText(/RTX 4070 Ti SUPER · 16 GB graphics memory · 64 GB RAM/)).toBeInTheDocument();
    expect(screen.getByLabelText('Chat')).toHaveValue('gemma-4-12b');
    expect(screen.getByLabelText('Pictures')).toHaveValue('animagine-xl-4');
    expect(screen.getByLabelText('Voice')).toHaveValue('qwen3-tts-customvoice-1.7b');
    expect(within(screen.getByLabelText('Pictures')).getByRole('option', { name: /flux-dev.*too big for your card/ })).toBeInTheDocument();
    expect(screen.getByText(/To download: 15 GB \(plus runtimes\) · free: 200 GB/)).toBeInTheDocument();
    expect(screen.getByText(/your character gets the voice “Ryan”/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, download everything now' }));
    expect(runBundle).toHaveBeenCalledWith({
      chat: expect.objectContaining({ id: 'gemma-4-12b' }),
      image: expect.objectContaining({ id: 'animagine-xl-4' }),
      tts: { model: expect.objectContaining({ id: 'qwen3-tts-customvoice-1.7b' }), voiceId: 'preset:ryan' },
    });
  });

  it('suggests VoiceDesign so every character speaks with its card voice', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listTtsModels).mockResolvedValue([tts, { ...tts, id: 'qwen3-tts-1.7b-voicedesign', name: 'VoiceDesign', voice_design: true, voices: [] }]);
    render(<SetupBundle />);
    expect(await screen.findByLabelText('Voice')).toHaveValue('qwen3-tts-1.7b-voicedesign');
    expect(screen.getByText(/Every character speaks with the voice described in its card/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, download everything now' }));
    expect(runBundle).toHaveBeenCalledWith(expect.objectContaining({
      tts: { model: expect.objectContaining({ id: 'qwen3-tts-1.7b-voicedesign' }), voiceId: '' },
    }));
  });

  it('leaves a part out and counts only the rest', async () => {
    const user = userEvent.setup();
    render(<SetupBundle />);
    await user.selectOptions(await screen.findByLabelText('Pictures'), 'Leave out');
    expect(screen.getByText(/To download: 9 GB/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, download everything now' }));
    expect(runBundle).toHaveBeenCalledWith(expect.objectContaining({ image: null }));
  });

  it('warns and holds back when the disk is too full', async () => {
    vi.mocked(api.diskSpace).mockResolvedValue({ models_mb: 8 * 1024, data_mb: 8 * 1024 });
    render(<SetupBundle />);
    expect(await screen.findByText(/not enough disk space/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, download everything now' })).toBeDisabled();
  });

  it('shows progress and the finished state of each part', async () => {
    useSetupBundle.setState({
      status: { chat: { phase: 'done' }, image: { phase: 'download', percent: 42 }, tts: { phase: 'failed', error: 'Netz weg' } },
      running: true,
    });
    render(<SetupBundle />);
    expect(await screen.findByText('Downloading … 42 %')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Failed: Netz weg');
    expect(screen.getByLabelText('Chat')).toBeDisabled();
  });
});
