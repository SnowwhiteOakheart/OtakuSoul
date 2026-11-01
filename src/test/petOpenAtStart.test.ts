// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../services/soundFx', () => ({ soundFx: new Proxy({}, { get: () => vi.fn() }) }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emitTo: vi.fn(() => Promise.resolve()),
}));
import { renderHook } from '@testing-library/react';
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { useDesktopPetBridge } from '../hooks/useDesktopPetBridge';
import { loadPetPrefs, savePetPrefs } from '../services/desktopPet';
import { resetApiMocks } from './mockApi';

const initial = useAppStore.getState();
const start = () => {
  useAppStore.setState({ ...initial, settingsLoaded: true }, true);
  return renderHook(() => useDesktopPetBridge());
};

beforeEach(() => {
  resetApiMocks();
  localStorage.clear();
});

describe('desktop pet at start', () => {
  it('stays closed by default, also when it was open before (earlier versions)', () => {
    localStorage.setItem('otakusoul.desktopPetOpen', 'true');
    expect(loadPetPrefs().openAtStart).toBe(false);
    start().unmount();
    expect(api.toggleDesktopPet).not.toHaveBeenCalled();
    expect(localStorage.getItem('otakusoul.desktopPetOpen')).toBeNull();
  });

  it('opens at start with the switch on', () => {
    savePetPrefs({ ...loadPetPrefs(), openAtStart: true });
    start().unmount();
    expect(api.toggleDesktopPet).toHaveBeenCalledWith(true, expect.anything());
  });
});
