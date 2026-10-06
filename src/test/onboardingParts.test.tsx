// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { CloudConnectionTest, FirstReply, LocalModelSetup } from '../components/onboarding/OnboardingParts';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, StarterModel } from '../types';

const initial = useAppStore.getState();
const starter = (over: Partial<StarterModel>): StarterModel => ({
  id: 'qwen3-8b', name: 'Qwen3 8B', license: 'Apache-2.0', vram_mb: 6800, recommended: false, fits_gpu: true, installed: false,
  file: { filename: 'Qwen_Qwen3-8B-Q4_K_M.gguf', size_bytes: 5e9, sha256: 'x', size_formatted: '4.7 GB', download_url: 'https://huggingface.co/x', quantization: 'Q4_K_M', runtime: 'standard', recommended: false, compatibility_note: '' },
  ...over,
});
const ayu = { id: 'ayu', card: { data: { name: 'Ayu', description: 'Studentin.', personality: 'warm' } } } as CharacterProfile;

beforeEach(() => {
  resetApiMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  useAppStore.setState({ ...initial, appLanguage: 'en', settingsLoaded: true }, true);
  vi.mocked(api.getRuntime).mockResolvedValue(null);
  vi.mocked(api.listRuntimeVariants).mockResolvedValue([]);
  vi.mocked(api.onRuntimeProgress).mockResolvedValue(() => {});
});

describe('setup wizard parts', () => {
  it('tests the cloud connection with the entered key and model', async () => {
    const user = userEvent.setup();
    vi.mocked(api.quickReply).mockRejectedValueOnce(new Error('401 invalid key')).mockResolvedValueOnce('OK');
    render(<CloudConnectionTest provider="open_router" endpoint="https://openrouter.ai/api/v1/chat/completions" apiKey=" sk-1 " model="m/x" />);
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('401 invalid key');
    expect(api.quickReply).toHaveBeenCalledWith(expect.objectContaining({ api_key: 'sk-1', model: 'm/x', provider: 'open_router' }));
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Connected');
  });

  it('offers the starter model for the GPU and downloads it', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ hardware: { gpus: [{ name: 'RTX 4060', total_vram_mb: 8192 }] } as never });
    vi.mocked(api.listStarterModels).mockResolvedValue([
      starter({ id: 'qwen3-4b', name: 'Qwen3 4B' }),
      starter({ recommended: true }),
    ]);
    const download = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({ downloadGgufModel: download });
    render(<LocalModelSetup />);
    expect(screen.getByText(/RTX 4060 with 8 GB/)).toBeInTheDocument();
    const recommended = (await screen.findByText('fits your GPU')).closest('li')!;
    expect(recommended).toHaveTextContent('Qwen3 8B');
    await user.click(screen.getByRole('button', { name: 'Download Qwen3 8B' }));
    await waitFor(() => expect(download).toHaveBeenCalledWith(expect.objectContaining({ filename: 'Qwen_Qwen3-8B-Q4_K_M.gguf' })));
  });

  it('offers the PrismML runtime with a recommended Bonsai starter and keeps its runtime', async () => {
    const user = userEvent.setup();
    const bonsaiFile = { ...starter({}).file, filename: 'Ternary-Bonsai-2-27B-PQ2_0.gguf', quantization: 'PQ2_0', runtime: 'prism' };
    vi.mocked(api.listStarterModels).mockResolvedValue([
      starter({}),
      starter({ id: 'ternary-bonsai-2-27b', name: 'Ternary Bonsai 2 27B', recommended: true, file: bonsaiFile }),
    ]);
    const download = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({ downloadGgufModel: download });
    render(<LocalModelSetup />);
    expect(await screen.findByText('PrismML runtime (Ternary Bonsai)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Download Ternary Bonsai 2 27B' }));
    await waitFor(() => expect(download).toHaveBeenCalledWith(expect.objectContaining({ runtime: 'prism' })));
  });

  it('shows no PrismML runtime without a Bonsai starter', async () => {
    vi.mocked(api.listStarterModels).mockResolvedValue([starter({ recommended: true })]);
    render(<LocalModelSetup />);
    await screen.findByText('fits your GPU');
    expect(screen.queryByText('PrismML runtime (Ternary Bonsai)')).not.toBeInTheDocument();
  });

  it('ends with a real reply of the character, starting the local server first', async () => {
    const user = userEvent.setup();
    let state: 'stopped' | 'starting' | 'running' = 'stopped';
    useAppStore.setState({
      selectedBackend: 'local',
      serverStatus: { ...initial.serverStatus, state: 'stopped' },
      startServer: vi.fn(async () => { state = 'starting'; }),
      fetchServerStatus: vi.fn(async () => {
        state = state === 'starting' ? 'running' : state;
        useAppStore.setState({ serverStatus: { ...initial.serverStatus, state } });
      }),
    });
    vi.mocked(api.quickReply).mockResolvedValue('Hallo, ich bin Ayu!');
    render(<FirstReply character={ayu} />);
    await user.click(screen.getByRole('button', { name: 'Get a first reply' }));
    expect(await screen.findByText('Hallo, ich bin Ayu!')).toBeInTheDocument();
    expect(useAppStore.getState().startServer).toHaveBeenCalledOnce();
    const request = vi.mocked(api.quickReply).mock.calls[0]![0];
    expect(request.system).toContain('You are Ayu');
    expect(request.endpoint_url).toContain('127.0.0.1');
  });
});
