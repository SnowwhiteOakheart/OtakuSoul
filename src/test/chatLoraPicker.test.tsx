// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { ChatLoraPicker, lorasForModel } from '../components/settings/sections/ChatLoraPicker';
import { resetApiMocks } from './mockApi';
import type { ChatLora } from '../types';

const lora = (over: Partial<ChatLora>): ChatLora => ({
  id: 'gemma-4-e4b-heretic',
  name: 'Heretic',
  base_files: ['gemma-4-E4B-it-Q4_K_M.gguf'],
  kind: 'uncensor',
  nsfw: true,
  scale: 1,
  description: { en: 'Lifts the built-in refusals.' },
  license: 'unspecified',
  license_kind: 'restricted',
  license_note: { en: 'No licence stated.' },
  license_url: 'https://huggingface.co/x',
  size_bytes: 213_248,
  size_formatted: '209 KB',
  path: '/m/chat-loras/gemma-4-e4b-heretic.gguf',
  installed: false,
  ...over,
});
const gutenberg = lora({
  id: 'gemma-4-26b-a4b-gutenberg', name: 'Gutenberg', base_files: ['gemma-4-26B-A4B-it-UD-Q4_K_M.gguf'], kind: 'style', nsfw: false,
  path: '/m/chat-loras/gemma-4-26b-a4b-gutenberg.gguf', installed: true, license_kind: 'open',
});
const e4b = '/m/gemma-4-E4B-it-Q4_K_M.gguf';
const config = (over: object) => ({ ...useAppStore.getState().serverConfig, model_path: e4b, lora_path: null, lora_scale: 1, ...over });

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ appLanguage: 'en', expertMode: false, activeDownloads: {}, downloadProgress: {} });
  vi.mocked(api.listChatLoras).mockResolvedValue([lora({}), gutenberg]);
});

describe('lorasForModel', () => {
  it('matches the catalog file name on any platform', () => {
    expect(lorasForModel([lora({}), gutenberg], 'C:\\models\\gemma-4-E4B-it-Q4_K_M.gguf').map((l) => l.id)).toEqual(['gemma-4-e4b-heretic']);
    expect(lorasForModel([lora({}), gutenberg], '/m/nemo.gguf')).toEqual([]);
    expect(lorasForModel([lora({})], '')).toEqual([]);
  });
});

describe('ChatLoraPicker', () => {
  it('offers only the adapters of the chosen model and downloads on choice', async () => {
    useAppStore.setState({ serverConfig: config({}) });
    const download = vi.spyOn(useAppStore.getState(), 'downloadChatLora').mockResolvedValue();
    render(<ChatLoraPicker />);
    const select = await screen.findByRole('combobox', { name: /Adapter \(LoRA\)/ });
    await screen.findByRole('option', { name: /Heretic: without refusals \(18\+\) – download \(209 KB\)/ });
    expect(screen.queryByRole('option', { name: /Gutenberg/ })).not.toBeInTheDocument();
    // Simple mode: no own files, no strength.
    expect(screen.queryByText('Choose file …')).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'gemma-4-e4b-heretic' } });
    expect(download).toHaveBeenCalledWith(expect.objectContaining({ id: 'gemma-4-e4b-heretic' }), e4b);
  });

  it('hides itself for models without adapters outside expert mode', async () => {
    useAppStore.setState({ serverConfig: config({ model_path: '/m/nemo.gguf' }) });
    const { container } = render(<ChatLoraPicker />);
    await waitFor(() => expect(api.listChatLoras).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows description, licence and strength of the chosen adapter in expert mode', async () => {
    useAppStore.setState({ expertMode: true, serverConfig: config({ lora_path: '/m/chat-loras/gemma-4-e4b-heretic.gguf', lora_scale: 0.5 }) });
    vi.mocked(api.listChatLoras).mockResolvedValue([lora({ installed: true })]);
    const setLora = vi.spyOn(useAppStore.getState(), 'setChatLora').mockResolvedValue();
    render(<ChatLoraPicker />);
    expect(await screen.findByText('Lifts the built-in refusals.')).toBeInTheDocument();
    expect(screen.getByText(/No licence stated\./)).toBeInTheDocument();
    const slider = screen.getByRole('slider', { name: 'Adapter strength' });
    expect(screen.getByText('0.50')).toBeInTheDocument();
    fireEvent.change(slider, { target: { value: '0.8' } });
    expect(setLora).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider);
    expect(setLora).toHaveBeenCalledWith('/m/chat-loras/gemma-4-e4b-heretic.gguf', 0.8);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    expect(setLora).toHaveBeenLastCalledWith(null, 1);
  });

  it('lists an own adapter file as its own entry', async () => {
    useAppStore.setState({ expertMode: true, serverConfig: config({ lora_path: '/x/my-style.gguf' }) });
    render(<ChatLoraPicker />);
    expect(await screen.findByRole('option', { name: 'my-style.gguf' })).toBeInTheDocument();
    expect(screen.getByText('Choose file …')).toBeInTheDocument();
  });
});
