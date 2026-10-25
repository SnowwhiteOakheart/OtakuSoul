// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { HomeView } from '../components/HomeView';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, ScenePreview } from '../types';

const appInitial = useAppStore.getState();

beforeEach(() => {
  resetApiMocks();
  vi.mocked(api.listStageScenes).mockResolvedValue([]);
  useAppStore.setState(appInitial, true);
  useAppStore.setState({ appLanguage: 'en', activePersona: { id: 'p', name: 'Kai', description: '', avatar_data_url: null } });
});

describe('HomeView', () => {
  it('offers the setup when no AI is configured', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ selectedBackend: 'local', serverConfig: { ...useAppStore.getState().serverConfig, model_path: '' } });
    render(<HomeView />);
    expect(screen.getByRole('heading', { name: 'Good to see you, Kai!' })).toBeInTheDocument();
    expect(screen.getByText('No AI set up yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Set up now/ }));
    expect(useAppStore.getState().onboardingCompleted).toBe(false);
  });

  it('names the local model and leads into the last chat and story', async () => {
    const user = userEvent.setup();
    useAppStore.setState({
      selectedBackend: 'local',
      serverConfig: { ...useAppStore.getState().serverConfig, model_path: '/models/Bonsai-27B-Q4.gguf' },
      activeCharacter: { id: 'ayu', card: { data: { name: 'Ayu' } }, avatar_data_url: null } as unknown as CharacterProfile,
      stageLastScene: 'story_frozen_bells',
    });
    vi.mocked(api.listStageScenes).mockResolvedValue([{ id: 'story_frozen_bells', title: 'The Bells of Frostweiler', has_progress: true } as ScenePreview]);
    render(<HomeView />);
    expect(screen.getByText(/Bonsai-27B-Q4 – locally on your PC/)).toBeInTheDocument();
    expect(await screen.findByText('The Bells of Frostweiler')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Continue with Ayu/ }));
    expect(useAppStore.getState().activeTab).toBe('chat');
  });

  it('names the LoRA adapter next to the local model, but not one hidden while 18+ is off', async () => {
    const adapter = '/data/chat-loras/gemma-4-e4b-heretic.gguf';
    vi.mocked(api.listChatLoras).mockResolvedValue([{ id: 'gemma-4-e4b-heretic', name: 'Heretic', path: adapter,
      base_files: ['gemma-4-E4B-it-Q4_K_M.gguf'] } as never]);
    vi.mocked(api.chatLoraHidden).mockResolvedValue(false);
    useAppStore.setState({
      selectedBackend: 'local',
      serverConfig: { ...useAppStore.getState().serverConfig, model_path: '/m/gemma-4-E4B-it-Q4_K_M.gguf', lora_path: adapter },
    });
    const { unmount } = render(<HomeView />);
    expect(await screen.findByText(/gemma-4-E4B-it-Q4_K_M \+ Heretic – locally/)).toBeInTheDocument();
    unmount();
    // 18+ off: the backend lists it no more and reports it hidden.
    vi.mocked(api.listChatLoras).mockResolvedValue([]);
    vi.mocked(api.chatLoraHidden).mockResolvedValue(true);
    render(<HomeView />);
    expect(await screen.findByText(/gemma-4-E4B-it-Q4_K_M – locally/)).toBeInTheDocument();
  });
});
