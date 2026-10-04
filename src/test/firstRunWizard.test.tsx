// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { FirstRunWizard } from '../components/onboarding/FirstRunWizard';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, ScannedModel } from '../types';

const initialState = useAppStore.getState();

const model: ScannedModel = {
  name: 'Qwen3-8B-Q4_K_M',
  path: '/models/qwen.gguf',
  size_mb: 5000,
  runtime: 'standard',
  recommended_context: 8192,
  compatibility_note: '',
};
const character = { id: 'ayu', card: { data: { name: 'Ayu Ikue' } } } as CharacterProfile;

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ ...initialState, settingsLoaded: true }, true);
  useAppStore.setState({
    onboardingCompleted: false,
    appLanguage: 'en',
    scannedModels: [model],
    availableCharacters: [character],
  });
});

const next = () => screen.getByRole('button', { name: /Next/ });

describe('FirstRunWizard', () => {
  it('waits for a previous local server to stop before continuing', async () => {
    let finishStop!: () => void;
    vi.mocked(api.stopLlamaServer).mockImplementation(() => new Promise<void>((resolve) => {
      finishStop = resolve;
    }));
    const user = userEvent.setup();
    render(<FirstRunWizard />);
    await user.click(next());

    await user.click(screen.getByRole('radio', { name: /Qwen3-8B/ }));
    expect(next()).toBeDisabled();
    finishStop();
    await vi.waitFor(() => expect(next()).toBeEnabled());
  });

  it('walks through a local setup and finishes on the chat', async () => {
    const user = userEvent.setup();
    render(<FirstRunWizard />);

    expect(screen.getByRole('heading', { name: 'Welcome to OtakuSoul' })).toBeInTheDocument();
    await user.click(next());

    await user.click(screen.getByRole('radio', { name: /Qwen3-8B/ }));
    await vi.waitFor(() => expect(useAppStore.getState().serverConfig.model_path).toBe(model.path));
    await user.click(next());

    await user.click(screen.getByRole('button', { name: /Ayu Ikue/ }));
    await vi.waitFor(() => expect(useAppStore.getState().activeCharacter?.id).toBe('ayu'));
    await user.click(next());

    expect(screen.getByText('Qwen3-8B-Q4_K_M')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /local server/ }));
    await user.click(screen.getByRole('button', { name: /Let's go/ }));

    const state = useAppStore.getState();
    expect(state.onboardingCompleted).toBe(true);
    expect(state.activeTab).toBe('chat');
    expect(api.startLlamaServer).not.toHaveBeenCalled();
  });

  it('requires an API key for a cloud provider and stores it on the way', async () => {
    const user = userEvent.setup();
    render(<FirstRunWizard />);
    await user.click(next());

    await user.click(screen.getByRole('button', { name: /Cloud/ }));
    expect(next()).toBeDisabled();

    await user.type(screen.getByLabelText('API key'), '  sk-test  ');
    expect(next()).toBeEnabled();
    await user.click(next());

    expect(useAppStore.getState().selectedBackend).toBe('cloud');
    expect(useAppStore.getState().cloudApiKey).toBe('sk-test');
  });

  it('can be skipped at any point', async () => {
    const user = userEvent.setup();
    render(<FirstRunWizard />);
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(useAppStore.getState().onboardingCompleted).toBe(true);
    expect(api.saveSettings).toHaveBeenCalled();
  });
});
