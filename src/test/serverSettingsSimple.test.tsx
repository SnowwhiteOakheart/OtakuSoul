// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { ServerSettings } from '../components/settings/sections/ServerSettings';
import { resetApiMocks } from './mockApi';
import type { StarterModel } from '../types';

const initial = useAppStore.getState();
const gemma: StarterModel = {
  id: 'gemma', name: 'Gemma 4 12B', license: 'Gemma', vram_mb: 8192, recommended: true, fits_gpu: true, installed: true,
  file: {
    filename: 'Gemma-4-12B-Q4_K_M.gguf', size_bytes: 7e9, sha256: 'x', size_formatted: '7.0 GB', download_url: 'https://huggingface.co/x',
    quantization: 'Q4_K_M', runtime: 'standard', recommended: true, compatibility_note: '', parts: [],
  },
  description: { en: 'Warm, lively roleplay partner.' },
  license_kind: 'open', license_note: {}, license_url: 'https://huggingface.co/x', mmproj: null, mmproj_installed: false,
};
const path = '/models/Gemma-4-12B-Q4_K_M.gguf';

beforeEach(() => {
  resetApiMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(api.getRuntime).mockResolvedValue({ build: 'b1', backend: 'cuda-12.8' } as never);
  vi.mocked(api.listRuntimeVariants).mockResolvedValue([]);
  vi.mocked(api.onRuntimeProgress).mockResolvedValue(() => {});
  vi.mocked(api.listStarterModels).mockResolvedValue([gemma]);
  vi.mocked(api.scanVisionProjectors).mockResolvedValue([]);
  useAppStore.setState({
    ...initial,
    appLanguage: 'en',
    settingsLoaded: true,
    scannedModels: [{ name: 'Gemma-4-12B-Q4_K_M', path, size_mb: 7000, runtime: 'standard', compatibility_note: '' } as never],
    serverConfig: { ...initial.serverConfig, model_path: path },
  }, true);
});

describe('local chat AI settings', () => {
  it('shows the catalogue description and hides the technical controls without expert mode', async () => {
    useAppStore.setState({ expertMode: false });
    render(<ServerSettings />);
    expect(await screen.findByText('Warm, lively roleplay partner.')).toBeInTheDocument();
    expect(document.querySelector('#settings-ctx')).not.toBeNull();
    for (const id of ['#settings-ngl', '#settings-port', '#settings-mmproj']) expect(document.querySelector(id)).toBeNull();
    expect(document.querySelector('[data-server-expert-hint]')).not.toBeNull();
    // The installed runtime needs no card in the simple view.
    await waitFor(() => expect(api.getRuntime).toHaveBeenCalled());
    expect(screen.queryByText(/llama\.cpp runtime/i)).toBeNull();
  });

  it('shows every control in expert mode', async () => {
    useAppStore.setState({ expertMode: true });
    render(<ServerSettings />);
    expect(await screen.findByText('Warm, lively roleplay partner.')).toBeInTheDocument();
    for (const id of ['#settings-ngl', '#settings-port', '#settings-mmproj']) expect(document.querySelector(id)).not.toBeNull();
    expect(document.querySelector('[data-server-expert-hint]')).toBeNull();
  });
});
