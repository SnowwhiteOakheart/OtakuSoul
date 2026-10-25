// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { LlmBenchmarkCard, benchmarkSettings } from '../components/settings/sections/LlmBenchmarkCard';
import { resetApiMocks } from './mockApi';
import type { BenchmarkResult } from '../types';

const result = (over: Partial<BenchmarkResult>): BenchmarkResult => ({
  id: '1',
  created_at: '2026-10-25T18:00:00+00:00',
  model_name: 'gemma-4-12b-it-Q4_K_M',
  model_path: '/m/gemma-4-12b-it-Q4_K_M.gguf',
  context_size: 32_768,
  gpu_layers: 99,
  cache_type: 'q8_0',
  flash_attn: true,
  lora: null,
  prompt_tokens: 681,
  prompt_tps: 2838.1,
  gen_tokens: 128,
  gen_tps: 85.3,
  first_token_ms: 240,
  vram_mb: 9318,
  rating: 'smooth',
  ...over,
});
const initial = useAppStore.getState();

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState(initial, true);
  useAppStore.setState({
    appLanguage: 'en',
    serverConfig: { ...initial.serverConfig, model_path: '/m/gemma-4-12b-it-Q4_K_M.gguf' },
    serverStatus: { ...initial.serverStatus, state: 'running' },
  });
  vi.mocked(api.listLlmBenchmarks).mockResolvedValue([]);
});

describe('LlmBenchmarkCard', () => {
  it('measures the running model and shows speed, rating and details', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getLlamaServerStatus).mockResolvedValue({ ...initial.serverStatus, state: 'running' });
    vi.mocked(api.runLlmBenchmark).mockResolvedValue(result({}));
    render(<LlmBenchmarkCard />);
    await user.click(screen.getByRole('button', { name: 'Start test' }));
    expect(await screen.findByText('85.3')).toBeInTheDocument();
    expect(screen.getByText('smooth')).toBeInTheDocument();
    expect(screen.getByText(/Reading: 2,838 tokens\/s · first words after 0.2 s · graphics memory 9.1 GB/)).toBeInTheDocument();
    expect(api.startLlamaServer).not.toHaveBeenCalled();
  });

  it('loads the model first when it is not running', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getLlamaServerStatus).mockResolvedValue({ ...initial.serverStatus, state: 'stopped' });
    vi.mocked(api.runLlmBenchmark).mockResolvedValue(result({ gen_tps: 4.2, rating: 'slow' }));
    render(<LlmBenchmarkCard />);
    await user.click(screen.getByRole('button', { name: 'Start test' }));
    expect(await screen.findByText('too slow')).toBeInTheDocument();
    expect(api.startLlamaServer).toHaveBeenCalled();
    expect(screen.getByText(/Pick a smaller model/)).toBeInTheDocument();
  });

  it('lists earlier results and clears them', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listLlmBenchmarks).mockResolvedValue([
      result({ id: '2' }),
      result({ id: '1', model_name: 'gemma-4-E4B-it-Q4_K_M', gen_tps: 120.4, lora: 'gemma-4-e4b-heretic.gguf' }),
    ]);
    render(<LlmBenchmarkCard />);
    const table = await screen.findByRole('table');
    expect(table).toHaveTextContent('gemma-4-E4B-it-Q4_K_M');
    expect(table).toHaveTextContent('LoRA gemma-4-e4b-heretic');
    await user.click(screen.getByRole('button', { name: 'Clear history' }));
    expect(api.clearLlmBenchmarks).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument());
  });

  it('shows the error of a failed run', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getLlamaServerStatus).mockResolvedValue({ ...initial.serverStatus, state: 'running' });
    vi.mocked(api.runLlmBenchmark).mockRejectedValue(new Error('kaputt'));
    render(<LlmBenchmarkCard />);
    await user.click(screen.getByRole('button', { name: 'Start test' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Test failed: kaputt');
  });

  it('describes the settings of a result', () => {
    const t = (key: string, vars?: Record<string, string | number>) => `${key}:${JSON.stringify(vars ?? {})}`;
    expect(benchmarkSettings(result({ cache_type: null }), t as never)).toBe('bench.context:{"k":32} · bench.layers:{"layers":99}');
  });
});
