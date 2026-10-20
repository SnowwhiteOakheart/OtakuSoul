// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../components/ui/feedback', async (original) => ({
  ...await original<object>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { OpenRouterLoginButton } from '../components/settings/OpenRouterLoginButton';
import { toast } from '../components/ui/feedback';
import { resetApiMocks } from './mockApi';

const initial = useAppStore.getState();
beforeEach(() => {
  resetApiMocks();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  useAppStore.setState({ ...initial, appLanguage: 'en', cloudProvider: 'anthropic', cloudApiKey: '', saveCurrentSettings: vi.fn() }, true);
});

describe('Sign in with OpenRouter', () => {
  it('takes over the key and a free model for an account without credit', async () => {
    const user = userEvent.setup();
    vi.mocked(api.openRouterLogin).mockResolvedValue({ key: 'sk-or-v1-abc', free_tier: true, model: 'google/gemma-4-31b-it:free' });
    const onDone = vi.fn();
    render(<OpenRouterLoginButton onDone={onDone} />);
    await user.click(screen.getByRole('button', { name: 'Sign in with OpenRouter' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.openRouterLogin).toHaveBeenCalledWith('en');
    const state = useAppStore.getState();
    expect([state.cloudProvider, state.cloudApiKey, state.cloudModel]).toEqual(['open_router', 'sk-or-v1-abc', 'google/gemma-4-31b-it:free']);
    expect(vi.mocked(toast.success).mock.calls[0]![0]).toContain('google/gemma-4-31b-it:free');
  });

  it('waits with a cancel button and says nothing when cancelled', async () => {
    const user = userEvent.setup();
    let fail: (reason: unknown) => void = () => {};
    vi.mocked(api.openRouterLogin).mockReturnValue(new Promise((_, reject) => { fail = reject; }));
    render(<OpenRouterLoginButton />);
    await user.click(screen.getByRole('button', { name: 'Sign in with OpenRouter' }));
    expect(screen.getByRole('status').textContent).toContain('Waiting for the sign-in');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.openRouterLoginCancel).toHaveBeenCalled();
    fail('{"code":"backend.openrouter.cancelled","params":{}}');
    await screen.findByRole('button', { name: 'Sign in with OpenRouter' });
    expect(toast.error).not.toHaveBeenCalled();
    expect(useAppStore.getState().cloudApiKey).toBe('');
  });
});
