import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { isAdultMarked } from '../utils/adultContent';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, Lorebook, SceneState } from '../types';

const card = (id: string, adult = false) =>
  ({ id, card: { data: { name: id, extensions: adult ? { otakusoul_nsfw: true } : {} } }, bound_lorebooks: [] }) as unknown as CharacterProfile;
const initial = useAppStore.getState();
beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ ...initial, settingsLoaded: true, saveCurrentSettings: vi.fn().mockResolvedValue(undefined) }, true);
});

describe('hiding adult content', () => {
  it('recognizes the mark', () => {
    expect(isAdultMarked({ otakusoul_nsfw: true })).toBe(true);
    expect(isAdultMarked({ otakusoul_nsfw: 'yes' })).toBe(false);
    expect(isAdultMarked(undefined)).toBe(false);
  });

  it('closes an open adult character that the list now hides', async () => {
    const selectCharacter = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({ activeCharacter: card('mint', true), selectCharacter });
    vi.mocked(api.scanCharacters).mockResolvedValue([card('ayu')]);
    await useAppStore.getState().refreshCharacters('mint');
    expect(selectCharacter).toHaveBeenCalledWith(expect.objectContaining({ id: 'ayu' }));
  });

  it('keeps an open character that is merely missing from a scan (not adult)', async () => {
    const selectCharacter = vi.fn();
    useAppStore.setState({ activeCharacter: card('neu'), selectCharacter });
    vi.mocked(api.scanCharacters).mockResolvedValue([card('ayu')]);
    await useAppStore.getState().refreshCharacters();
    expect(selectCharacter).not.toHaveBeenCalled();
  });

  it('closes an open adult story and forgets it as the last scene', async () => {
    const open = { definition: { id: 'nacht', extensions: { otakusoul_nsfw: true } } } as unknown as SceneState;
    useAppStore.setState({ stageState: open, stageLastScene: 'nacht' });
    vi.mocked(api.listStageScenes).mockResolvedValue([]);
    await useAppStore.getState().fetchStageScenes();
    expect(useAppStore.getState().stageState).toBeNull();
    expect(useAppStore.getState().stageLastScene).toBe('');
    expect(useAppStore.getState().saveCurrentSettings).toHaveBeenCalled();
  });

  it('closes an open adult lorebook in the editor', async () => {
    const world = { id: 'welt', name: 'Welt', entries: [] } as unknown as Lorebook;
    useAppStore.setState({ activeLorebook: { id: 'erotik', name: 'E', entries: [], extensions: { otakusoul_nsfw: true } } as unknown as Lorebook });
    vi.mocked(api.listAllLorebooks).mockResolvedValue([world]);
    await useAppStore.getState().refreshLorebooks();
    expect(useAppStore.getState().activeLorebook).toBe(world);
  });
});
