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
});
