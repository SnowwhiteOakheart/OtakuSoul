// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { useAppStore } from '../store/useAppStore';
import { NsfwSettings } from '../components/settings/NsfwSettings';
import { resetApiMocks } from './mockApi';

const initial = useAppStore.getState();
beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ ...initial, appLanguage: 'en', saveCurrentSettings: vi.fn().mockResolvedValue(undefined),
    refreshCharacters: vi.fn().mockResolvedValue(undefined), refreshLorebooks: vi.fn().mockResolvedValue(undefined),
    fetchStageScenes: vi.fn().mockResolvedValue(undefined) }, true);
});

describe('adult content setting', () => {
  it('turns on only after the age confirmation, asked once', async () => {
    const user = userEvent.setup();
    render(<NsfwSettings />);
    const toggle = screen.getByRole('switch', { name: /Show 18\+ content/ });
    await user.click(toggle);
    const activate = screen.getByRole('button', { name: 'Turn on' });
    expect(activate).toBeDisabled();
    // Cancelling keeps it off.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useAppStore.getState().nsfwEnabled).toBe(false);

    await user.click(toggle);
    await user.click(screen.getByRole('checkbox', { name: /at least 18 years old/ }));
    await user.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(useAppStore.getState()).toMatchObject({ nsfwEnabled: true, adultConfirmed: true });
    expect(useAppStore.getState().saveCurrentSettings).toHaveBeenCalled();
    // Installed adult content shows: the lists reload.
    await vi.waitFor(() => expect(useAppStore.getState().refreshCharacters).toHaveBeenCalled());
    expect(useAppStore.getState().refreshLorebooks).toHaveBeenCalled();
    expect(useAppStore.getState().fetchStageScenes).toHaveBeenCalled();

    // Off and on again: no second question.
    await user.click(toggle);
    expect(useAppStore.getState().nsfwEnabled).toBe(false);
    await user.click(toggle);
    expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull();
    expect(useAppStore.getState().nsfwEnabled).toBe(true);
  });

  it('never turns on without a confirmed age', async () => {
    await useAppStore.getState().setNsfwEnabled(true);
    expect(useAppStore.getState().nsfwEnabled).toBe(false);
  });
});
