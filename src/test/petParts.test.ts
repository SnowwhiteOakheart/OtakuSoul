import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { meshNames } from '../components/avatar/avatarStage';
import { toggledPart } from '../services/desktopPet';

describe('pet parts', () => {
  it('lists each named mesh once, in scene order', () => {
    const root = new THREE.Group();
    const make = (name: string) => Object.assign(new THREE.Mesh(), { name });
    const hat = make('Hat');
    const body = make('Body');
    root.add(body, make('Hair'), make('Body'), make(''));
    body.add(hat);
    expect(meshNames(root)).toEqual(['Body', 'Hat', 'Hair']);
  });

  it('toggles a name in the hidden list', () => {
    expect(toggledPart([], 'Hat')).toEqual(['Hat']);
    expect(toggledPart(['Hat', 'Bag'], 'Hat')).toEqual(['Bag']);
  });
});
