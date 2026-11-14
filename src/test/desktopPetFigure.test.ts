// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  isPet3dModel,
  loadPetFraming,
  loadPetModelHeight,
  loadPetPlacement,
  PET_HEIGHT_MAX,
  PET_HEIGHT_MIN,
  PET_PRESETS,
  petWindowSize,
  savePetFraming,
  savePetModelHeight,
  savePetPlacement,
} from '../services/desktopPet';
import { petModels } from '../hooks/useDesktopPetBridge';

describe('desktop pet figure', () => {
  it('takes only real 3D models', () => {
    for (const path of ['C:/m/Girl.vrm', 'C:/m/Boy.glb', 'C:/m/Rig.gltf', 'C:/m/Miku.pmx', 'C:/m/Old.pmd', 'vroid:123']) {
      expect(isPet3dModel(path)).toBe(true);
    }
    for (const path of ['C:/m/Aka.inx', 'C:/m/Aka.inp', 'C:/m/Hiyori.model3.json', 'portrait:abc', '']) {
      expect(isPet3dModel(path)).toBe(false);
    }
  });

  it('shows the 3D model whatever the chat shows, and nothing without one', () => {
    const store = { activeCharacter: null, scannedVrms: [], activeVrmPath: 'C:/m/Girl.vrm' };
    expect(petModels(store).modelPath).toBe('C:/m/Girl.vrm');
    expect(petModels({ ...store, activeVrmPath: '' }).modelPath).toBe('');
    expect(petModels({ ...store, activeVrmPath: 'C:/m/Aka.inx' }).modelPath).toBe('');
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

  it('remembers a model’s framing, clamps it and drops the default', () => {
    expect(loadPetFraming('C:/m/Chibi.vrm')).toEqual({ zoom: 1, lift: 0 });
    savePetFraming('C:/m/Chibi.vrm', { zoom: 1.4, lift: 0.05 });
    expect(loadPetFraming('C:/m/Chibi.vrm')).toEqual({ zoom: 1.4, lift: 0.05 });
    localStorage.setItem('otakusoul.desktopPetFraming', JSON.stringify({ 'C:/m/Chibi.vrm': { zoom: 9, lift: 'x' } }));
    expect(loadPetFraming('C:/m/Chibi.vrm')).toEqual({ zoom: 2, lift: 0 });
    savePetFraming('C:/m/Chibi.vrm', { zoom: 1, lift: 0 });
    expect(localStorage.getItem('otakusoul.desktopPetFraming')).toBe('{}');
  });

  it('forgets the longest unused models first', () => {
    for (let i = 0; i < 101; i += 1) savePetModelHeight(`m${i}.vrm`, 400);
    expect(loadPetModelHeight('m0.vrm')).toBeUndefined();
    expect(loadPetModelHeight('m100.vrm')).toBe(400);
  });
});
