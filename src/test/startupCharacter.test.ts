import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile } from '../types';

const character = (id: string) => ({ id, card: { data: { name: id } } }) as unknown as CharacterProfile;

describe('refreshCharacters at startup', () => {
  beforeEach(() => {
    resetApiMocks();
    useAppStore.setState({ activeCharacter: null, settingsLoaded: false });
  });

  it('does not pick a character from a scan that started before the settings were loaded', async () => {
    let finish: (chars: CharacterProfile[]) => void = () => undefined;
    vi.mocked(api.scanCharacters).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const early = useAppStore.getState().refreshCharacters();

    // The settings arrive while the early scan is still running …
    useAppStore.setState({ settingsLoaded: true });
    finish([character('akane'), character('yue')]);
    await early;
    expect(useAppStore.getState().activeCharacter).toBeNull();

    // … and the scan with the stored choice opens that one.
    vi.mocked(api.scanCharacters).mockResolvedValueOnce([character('akane'), character('yue')]);
    vi.mocked(api.listChatSessions).mockResolvedValue([]);
    await useAppStore.getState().refreshCharacters('yue');
    expect(useAppStore.getState().activeCharacter?.id).toBe('yue');
  });
});
