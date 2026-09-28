import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { CLOUD_PROVIDER_DEFAULTS, normalizeReplyLanguage, useAppStore } from '../store/useAppStore';
import { resetApiMocks } from './mockApi';
import type { AppSettings } from '../types';

const initialState = useAppStore.getState();

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState(initialState, true);
});

const lastSavedSettings = (): AppSettings => {
  const calls = vi.mocked(api.saveSettings).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1]![0];
};

describe('store composition', () => {
  it('exposes every slice through one store', () => {
    const state = useAppStore.getState();
    // One representative member per slice.
    for (const key of [
      'setActiveTab',
      'setAvatarMode',
      'startServer',
      'selectCharacter',
      'refreshLorebooks',
      'fetchCognitiveOverview',
      'runStageTurn',
      'fetchCompanionState',
      'sendMessage',
      'fetchBackups',
    ] as const) {
      expect(typeof state[key]).toBe('function');
    }
  });
});

describe('cloud providers', () => {
  it.each(Object.entries(CLOUD_PROVIDER_DEFAULTS))('switching to %s sets its endpoint and model', (provider, defaults) => {
    useAppStore.getState().setCloudProvider(provider as keyof typeof CLOUD_PROVIDER_DEFAULTS);
    const { cloudEndpoint, cloudModel } = useAppStore.getState();
    expect(cloudEndpoint).toBe(defaults!.endpoint);
    expect(cloudModel).toBe(defaults!.model);
  });

  it('points the local provider at the configured llama-server port', () => {
    useAppStore.getState().setServerConfig({ port: 9123 });
    useAppStore.getState().setCloudProvider('local_llama');
    expect(useAppStore.getState().cloudEndpoint).toBe('http://127.0.0.1:9123/v1/chat/completions');
  });

  it('keeps the endpoint for a custom provider', () => {
    useAppStore.getState().setCloudEndpoint('https://example.invalid/v1');
    useAppStore.getState().setCloudProvider('custom');
    expect(useAppStore.getState().cloudEndpoint).toBe('https://example.invalid/v1');
  });
});

describe('settings persistence', () => {
  it('saves the current choices including the onboarding flag', async () => {
    const store = useAppStore.getState();
    store.setTheme('sakura');
    store.setColorMode('light');
    store.setReplyLanguage('English');
    store.completeOnboarding();
    await vi.waitFor(() => expect(api.saveSettings).toHaveBeenCalled());

    const saved = lastSavedSettings();
    expect(saved.theme).toBe('sakura');
    expect(saved.color_mode).toBe('light');
    expect(saved.reply_language).toBe('English');
    expect(saved.onboarding_completed).toBe(true);
  });

  it('shows the wizard only when the loaded settings say so', async () => {
    vi.mocked(api.getAppPaths).mockResolvedValue({} as never);
    vi.mocked(api.scanModels).mockResolvedValue([]);
    vi.mocked(api.scanVrmModels).mockResolvedValue([]);
    vi.mocked(api.loadSettings).mockResolvedValue({
      server_config: { model_path: '' },
      onboarding_completed: false,
    } as unknown as AppSettings);

    await useAppStore.getState().initApp();
    expect(useAppStore.getState().onboardingCompleted).toBe(false);
  });
});

describe('settings sections', () => {
  it('opens a requested section once', () => {
    const store = useAppStore.getState();
    store.openSettingsSection('hub');
    expect(useAppStore.getState().activeTab).toBe('settings');
    expect(store.consumePendingSettingsSection()).toBe('hub');
    expect(store.consumePendingSettingsSection()).toBeNull();
  });
});

describe('normalizeReplyLanguage', () => {
  it.each([
    ['en', 'English'],
    ['ru', 'Русский'],
    ['Deutsch', 'Deutsch'],
    ['Klingonisch', 'Klingonisch'],
    [null, 'Deutsch'],
    ['', 'Deutsch'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeReplyLanguage(input)).toBe(expected);
  });
});
