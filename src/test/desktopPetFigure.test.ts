// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { loadPetPrefs, petModelPath, savePetPrefs } from '../services/desktopPet';

const state = { modelPath: 'C:/m/Aka.inx', vrmPath: 'C:/m/Girl.vrm', inochi2dPath: 'C:/m/Aka.inx' };

describe('desktop pet figure choice', () => {
  beforeEach(() => localStorage.clear());

  it('shows the chat’s model, or the one picked in the menu', () => {
    expect(petModelPath(state, 'chat')).toBe('C:/m/Aka.inx');
    expect(petModelPath(state, '3d')).toBe('C:/m/Girl.vrm');
    expect(petModelPath({ ...state, modelPath: 'C:/m/Girl.vrm' }, 'inochi2d')).toBe('C:/m/Aka.inx');
  });

  it('falls back to the chat’s model when the figure lacks the picked kind', () => {
    expect(petModelPath({ ...state, inochi2dPath: '' }, 'inochi2d')).toBe('C:/m/Aka.inx');
    expect(petModelPath({ ...state, vrmPath: '' }, '3d')).toBe('C:/m/Aka.inx');
  });

  it('remembers the choice and ignores unknown values', () => {
    expect(loadPetPrefs().figure).toBe('chat');
    savePetPrefs({ ...loadPetPrefs(), figure: '3d' });
    expect(loadPetPrefs().figure).toBe('3d');
    localStorage.setItem('otakusoul.desktopPetPrefs', JSON.stringify({ figure: 'live2d' }));
    expect(loadPetPrefs().figure).toBe('chat');
  });
});
