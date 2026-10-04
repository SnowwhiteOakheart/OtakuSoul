import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../services/soundFx', () => ({ soundFx: new Proxy({}, { get: () => vi.fn() }) }));
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { toast } from '../components/ui/feedback';
import { resetApiMocks } from './mockApi';
import type { SceneState } from '../types';

const initial = useAppStore.getState();
beforeEach(() => {
  resetApiMocks();
  vi.restoreAllMocks();
  vi.spyOn(toast, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  useAppStore.setState({ ...initial, appLanguage: 'en', settingsLoaded: true, stageState: { definition: { id: 'scene-1' } } as SceneState }, true);
});

describe('failed user actions', () => {
  it('buttons without own feedback show the cause', async () => {
    vi.mocked(api.restStageParty).mockRejectedValueOnce(new Error('Disk full'));
    await useAppStore.getState().restStageParty('short');
    expect(toast.error).toHaveBeenCalledWith("That didn't work: Disk full");
    expect(useAppStore.getState().isProcessingStageTurn).toBe(false);

    vi.mocked(api.switchMessageSwipe).mockRejectedValueOnce(new Error('locked'));
    await useAppStore.getState().switchMessageSwipe('m1', 1);
    expect(toast.error).toHaveBeenLastCalledWith("That didn't work: locked");
  });

  it('actions whose caller reports success throw instead of failing silently', async () => {
    vi.mocked(api.saveImageGenConfig).mockRejectedValueOnce(new Error('read-only'));
    await expect(useAppStore.getState().saveImageGenConfig({} as never)).rejects.toThrow('read-only');
    vi.mocked(api.createProfileBackup).mockRejectedValueOnce(new Error('no space'));
    await expect(useAppStore.getState().createBackup({} as never)).rejects.toThrow('no space');
    vi.mocked(api.importStageSceneJson).mockRejectedValueOnce(new Error('broken'));
    await expect(useAppStore.getState().importStageSceneJson('{}')).rejects.toThrow('broken');
    expect(toast.error).not.toHaveBeenCalled();
  });
});
