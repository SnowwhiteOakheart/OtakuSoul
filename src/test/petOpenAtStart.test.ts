// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../services/soundFx', () => ({ soundFx: new Proxy({}, { get: () => vi.fn() }) }));
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { loadPetOpen } from '../services/desktopPet';
import { resetApiMocks } from './mockApi';

beforeEach(() => {
  resetApiMocks();
  localStorage.clear();
});

describe('desktop pet at start', () => {
  it('hidden from its own menu, the pet stays closed at the next start', async () => {
    vi.mocked(api.toggleDesktopPet).mockResolvedValueOnce(true);
    await useAppStore.getState().toggleDesktopPet(true);
    expect(loadPetOpen()).toBe(true);
    // The pet window is destroyed by the call itself: it never returns there.
    vi.mocked(api.toggleDesktopPet).mockReturnValueOnce(new Promise(() => {}));
    void useAppStore.getState().toggleDesktopPet(false);
    expect(loadPetOpen()).toBe(false);
  });

  it('a pet that failed to open is not opened at start', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(api.toggleDesktopPet).mockRejectedValueOnce(new Error('no window'));
    await useAppStore.getState().toggleDesktopPet(true);
    expect(loadPetOpen()).toBe(false);
  });
});
