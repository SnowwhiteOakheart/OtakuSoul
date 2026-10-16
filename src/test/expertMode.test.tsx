// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { SamplerSettings } from '../components/settings/sections/SamplerSettings';
import { resetApiMocks } from './mockApi';

const initial = useAppStore.getState();

beforeEach(() => {
  resetApiMocks();
  vi.mocked(api.loadLlmPresets).mockResolvedValue([]);
  useAppStore.setState({ ...initial, appLanguage: 'en', settingsLoaded: true }, true);
});

describe('expert mode', () => {
  it('shows only the reply styles until expert mode is on', async () => {
    useAppStore.setState({
      llmPresets: [{ id: 'roleplay_balanced', name: 'x', description: 'y', is_builtin: true, sampling: useAppStore.getState().sampling } as never],
    });
    const { rerender } = render(<SamplerSettings />);
    expect(screen.getByRole('heading', { name: 'How should the AI reply?' })).toBeInTheDocument();
    expect(screen.getByText(/Lively, varied replies/)).toBeInTheDocument();
    expect(screen.queryByText('Save as preset')).not.toBeInTheDocument();
    expect(screen.getByText(/individual sliders/)).toBeInTheDocument();

    useAppStore.setState({ expertMode: true });
    rerender(<SamplerSettings />);
    expect(screen.queryByText(/individual sliders/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('slider').length).toBeGreaterThan(0);
  });

  it('is saved with the settings', async () => {
    const user = userEvent.setup();
    const { SettingsView } = await import('../components/settings/SettingsView');
    render(<SettingsView />);
    expect(screen.queryByRole('tab', { name: /Prompt/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Expert mode' }));
    expect(screen.getByRole('tab', { name: /Prompt \(experts\)/ })).toBeInTheDocument();
    expect(api.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ expert_mode: true }));
  });
});
