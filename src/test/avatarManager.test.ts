import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../services/soundFx', () => ({ soundFx: new Proxy({}, { get: () => vi.fn() }) }));
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { resetApiMocks } from './mockApi';
import { usesLive2d, usesVrm } from '../components/avatars/avatarMatch';
import type { CharacterProfile } from '../types';

const character = (extensions: Record<string, unknown>): CharacterProfile =>
  ({ id: 'mika', card: { spec: 'chara_card_v2', spec_version: '2.0', data: { name: 'Mika', extensions } } }) as unknown as CharacterProfile;

const initial = useAppStore.getState();
beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ ...initial, settingsLoaded: true }, true);
});

describe('avatar manager', () => {
  it('knows which character uses a model, like the avatar viewer', () => {
    const vrm = { path: 'C:\\Users\\me\\avatars\\Mika.vrm' };
    expect(usesVrm(character({ custom_vrm: 'avatars/mika.vrm' }), vrm)).toBe(true);
    expect(usesVrm(character({ sow_vrm: 'C:\\Users\\me\\avatars\\Mika.vrm' }), vrm)).toBe(true);
    expect(usesVrm(character({}), vrm)).toBe(false);
    const l2d = { id: 'hiyori', model_path: '/data/live2d/hiyori/hiyori.model3.json' };
    expect(usesLive2d(character({ custom_live2d: 'Hiyori' }), l2d)).toBe(true);
    expect(usesLive2d(character({ custom_live2d: 'haru' }), l2d)).toBe(false);
  });

  it('saves the model in the card and takes it back out', async () => {
    const mika = character({ sow_vrm: 'old.vrm', custom_title: 'Gast' });
    useAppStore.setState({ availableCharacters: [mika], activeCharacter: mika });
    vi.mocked(api.saveCharacterCard).mockImplementation(async (profile) => profile);
    vi.mocked(api.scanCharacters).mockResolvedValue([mika]);

    await useAppStore.getState().assignCharacterAvatar('mika', 'vrm', '/data/avatars/Neu.glb');
    const saved = vi.mocked(api.saveCharacterCard).mock.calls[0]![0];
    expect(saved.card.data.extensions).toEqual({ custom_vrm: '/data/avatars/Neu.glb', custom_title: 'Gast' });
    expect(useAppStore.getState().activeCharacter?.card.data.extensions?.custom_vrm).toBe('/data/avatars/Neu.glb');

    await useAppStore.getState().assignCharacterAvatar('mika', 'vrm', null);
    const cleared = vi.mocked(api.saveCharacterCard).mock.calls[1]![0];
    expect(cleared.card.data.extensions).toEqual({ custom_title: 'Gast' });
  });

  it('passes a failed save to the caller', async () => {
    useAppStore.setState({ availableCharacters: [character({})] });
    vi.mocked(api.saveCharacterCard).mockRejectedValueOnce(new Error('Disk full'));
    await expect(useAppStore.getState().assignCharacterAvatar('mika', 'live2d', 'hiyori')).rejects.toThrow('Disk full');
  });
});
