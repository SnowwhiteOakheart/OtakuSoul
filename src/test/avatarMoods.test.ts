// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { avatarShowsMoods } from '../store/helpers';
import type { AppStoreState } from '../store/storeTypes';
import type { CharacterProfile } from '../types';

const card = (extensions: Record<string, unknown> = {}) =>
  ({ id: 'ayu', card: { data: { name: 'Ayu', extensions } } }) as unknown as CharacterProfile;
const live2d = { id: 'hiyori', model_path: '/live2d/hiyori/hiyori.model3.json' } as AppStoreState['scannedLive2ds'][number];
const state = (patch: Partial<AppStoreState>) =>
  ({ chatSessions: [{ id: 'chat', members: [] }], activeChatId: 'chat', avatarMode: '2d', scannedLive2ds: [], activeLive2dPath: null, ...patch }) as unknown as AppStoreState;

beforeEach(() => localStorage.clear());

describe('avatar shows the six moods (expression tag without portraits)', () => {
  it('in 3D, and in Live2D only with a model to show', () => {
    expect(avatarShowsMoods(state({ avatarMode: '2d' }), card())).toBe(false);
    expect(avatarShowsMoods(state({ avatarMode: '3d' }), card())).toBe(true);
    expect(avatarShowsMoods(state({ avatarMode: 'live2d' }), card())).toBe(false);
    expect(avatarShowsMoods(state({ avatarMode: 'live2d', scannedLive2ds: [live2d] }), card())).toBe(true);
    // The card names a model that is gone: nothing to show.
    expect(avatarShowsMoods(state({ avatarMode: 'live2d', scannedLive2ds: [live2d] }), card({ custom_live2d: 'weg' }))).toBe(false);
  });

  it('not when a group chat shows everyone as portraits', () => {
    localStorage.setItem('otakusoul.chat.groupEveryone', 'true');
    const group = state({ avatarMode: '3d', chatSessions: [{ id: 'chat', members: ['sora'] }] as AppStoreState['chatSessions'] });
    expect(avatarShowsMoods(group, card())).toBe(false);
    expect(avatarShowsMoods(state({ avatarMode: '3d' }), card())).toBe(true);
  });
});
