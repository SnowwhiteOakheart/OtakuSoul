// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadPetModelHeight,
  loadPetPlacement,
  loadPetPrefs,
  PET_HEIGHT_MAX,
  PET_HEIGHT_MIN,
  PET_PRESETS,
  petModelPath,
  petWindowSize,
  savePetModelHeight,
  savePetPlacement,
  savePetPrefs,
} from '../services/desktopPet';

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

describe('desktop pet size', () => {
  beforeEach(() => localStorage.clear());

  it('takes over the old size steps and clamps free heights', () => {
    expect(loadPetPlacement().height).toBe(PET_PRESETS.medium);
    localStorage.setItem('otakusoul.desktopPet', JSON.stringify({ size: 'large', x: 10, y: 20 }));
    expect(loadPetPlacement()).toEqual({ x: 10, y: 20, height: PET_PRESETS.large });
    savePetPlacement({ height: 5000 });
    expect(loadPetPlacement().height).toBe(PET_HEIGHT_MAX);
  });

  it('keeps the window proportions for every height', () => {
    expect(petWindowSize(440)).toEqual({ width: 300, height: 440 });
    expect(petWindowSize(10)).toEqual({ width: Math.round((PET_HEIGHT_MIN * 300) / 440), height: PET_HEIGHT_MIN });
  });

  it('remembers the size per model', () => {
    expect(loadPetModelHeight('C:/m/Girl.vrm')).toBeUndefined();
    savePetModelHeight('C:/m/Girl.vrm', 600);
    savePetModelHeight('C:/m/Aka.inx', 300);
    expect(loadPetModelHeight('C:/m/Girl.vrm')).toBe(600);
    expect(loadPetModelHeight('C:/m/Aka.inx')).toBe(300);
  });

  it('forgets the longest unused models first', () => {
    for (let i = 0; i < 101; i += 1) savePetModelHeight(`m${i}.vrm`, 400);
    expect(loadPetModelHeight('m0.vrm')).toBeUndefined();
    expect(loadPetModelHeight('m100.vrm')).toBe(400);
  });
});
