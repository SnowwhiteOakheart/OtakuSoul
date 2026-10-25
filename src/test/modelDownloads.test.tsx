// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { LocalModelSetup } from '../components/onboarding/OnboardingParts';
import { ModelHubSettings } from '../components/settings/sections/ModelHubSettings';
import { resetApiMocks } from './mockApi';
import type { StarterModel } from '../types';

const initial = useAppStore.getState();
const file = (filename: string, runtime: 'standard' | 'prism' = 'standard'): StarterModel['file'] & { runtime: 'standard' | 'prism' } => ({
  filename, size_bytes: 5e9, sha256: 'x', size_formatted: '4.7 GB', download_url: 'https://huggingface.co/x',
  quantization: 'Q4_K_M', runtime, recommended: false, compatibility_note: '', parts: [],
});
const starter = (id: string, name: string, over: Partial<StarterModel> = {}): StarterModel => ({
  id, name, license: 'Apache-2.0', vram_mb: 6800, recommended: false, fits_gpu: true, installed: false,
  file: file(`${name.replace(/ /g, '-')}-Q4_K_M.gguf`), description: { en: `${name} text.` },
  license_kind: 'open', license_note: {}, license_url: 'https://huggingface.co/x', mmproj: null, mmproj_installed: false,
  ...over,
});

beforeEach(() => {
  resetApiMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  useAppStore.setState({ ...initial, appLanguage: 'en', settingsLoaded: true }, true);
  vi.mocked(api.getRuntime).mockResolvedValue(null);
  vi.mocked(api.listRuntimeVariants).mockResolvedValue([]);
  vi.mocked(api.onRuntimeProgress).mockResolvedValue(() => {});
  vi.mocked(api.getHfModelFiles).mockResolvedValue([]);
  vi.mocked(api.scanModels).mockResolvedValue([]);
});

describe('model downloads', () => {
  it('never starts the same download twice', async () => {
    let finish!: (path: string) => void;
    vi.mocked(api.downloadGgufModel).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const model = file('org/Gemma-Q4_K_M.gguf');
    const first = useAppStore.getState().downloadGgufModel(model);
    expect(useAppStore.getState().activeDownloads).toEqual({ 'Gemma-Q4_K_M.gguf': true });
    await useAppStore.getState().downloadGgufModel(model);
    expect(api.downloadGgufModel).toHaveBeenCalledTimes(1);
    finish('/models/Gemma-Q4_K_M.gguf');
    await first;
    expect(useAppStore.getState().activeDownloads).toEqual({});
  });

  it('still shows a running download after the page was left and opened again', async () => {
    const gemma = starter('gemma', 'Gemma 12B');
    vi.mocked(api.listStarterModels).mockResolvedValue([gemma]);
    // What the store still knows after the view was unmounted while downloading.
    useAppStore.setState({
      activeDownloads: { [gemma.file.filename]: true },
      downloadProgress: {
        [gemma.file.filename]: { filename: gemma.file.filename, downloaded_bytes: 2e9, total_bytes: 5e9, percent: 42, speed_mbps: 30, eta_seconds: 90, finished: false, error: null },
      },
    });
    render(<LocalModelSetup />);
    const item = (await screen.findByText('Gemma 12B')).closest('li')!;
    expect(within(item).getByRole('button', { name: 'Download Gemma 12B' })).toBeDisabled();
    expect(within(item).getByRole('status')).toHaveTextContent('42');
  });

  it('recommends only the catalog models in the hub, no Bonsai card', async () => {
    vi.mocked(api.listStarterModels).mockResolvedValue([
      starter('gemma-4-12b', 'Gemma 4 12B'),
      starter('qwen3.5-9b', 'Qwen3.5 9B'),
    ]);
    render(<ModelHubSettings onNavigate={vi.fn()} />);
    const list = await screen.findByRole('list', { name: 'Recommended models to start with' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
    expect(list).toHaveTextContent('Gemma 4 12B');
    expect(list).toHaveTextContent('Qwen3.5 9B');
    expect(screen.queryByText(/Bonsai/)).toBeNull();
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });
});
