// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { useCloseToTray } from '../hooks/useCloseToTray';
import { FeedbackHost } from '../components/ui/feedback';
import { resetApiMocks } from './mockApi';

const initial = useAppStore.getState();
let fireHint: () => void = () => {};
const Host = () => {
  useCloseToTray();
  return <FeedbackHost />;
};

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ ...initial, appLanguage: 'en', settingsLoaded: true }, true);
  vi.mocked(api.onCloseToTrayHint).mockImplementation(async (callback) => {
    fireHint = callback;
    return () => {};
  });
});

describe('closing into the tray', () => {
  it('explains the tray on the first close and hides only after confirming', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await waitFor(() => expect(api.onCloseToTrayHint).toHaveBeenCalled());

    fireHint();
    await user.click(await screen.findByRole('button', { name: 'Keep running in the tray' }));
    await waitFor(() => expect(api.hideMainWindow).toHaveBeenCalledOnce());
    expect(useAppStore.getState().trayHintShown).toBe(true);
    // Saved before hiding, so the backend hides directly next time.
    const saved = vi.mocked(api.saveSettings).mock.calls.at(-1)![0];
    expect(saved).toMatchObject({ close_to_tray: true, tray_hint_shown: true });
    expect(vi.mocked(api.saveSettings).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.hideMainWindow).mock.invocationCallOrder[0]!);
  });

  it('keeps the window open when the hint is cancelled', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await waitFor(() => expect(api.onCloseToTrayHint).toHaveBeenCalled());
    fireHint();
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(api.hideMainWindow).not.toHaveBeenCalled();
    expect(useAppStore.getState().trayHintShown).toBe(false);
  });

  it('saves the choice to quit on close', () => {
    useAppStore.getState().setCloseToTray(false);
    expect(vi.mocked(api.saveSettings).mock.calls.at(-1)![0]).toMatchObject({ close_to_tray: false });
  });
});
