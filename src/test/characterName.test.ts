import { describe, expect, it } from 'vitest';
import { findCharacterByName } from '../utils/characterName';
import type { CharacterProfile } from '../types';

const card = (name: string) => ({ id: name, card: { data: { name } } }) as unknown as CharacterProfile;

describe('findCharacterByName', () => {
  it('finds a card by its short name and prefers the exact one', () => {
    const cards = [card('Klein (Ryoutarou Tsuboi)'), card('Kirito'), card('Kirito (Kazuto Kirigaya)')];
    expect(findCharacterByName(cards, 'klein')?.id).toBe('Klein (Ryoutarou Tsuboi)');
    expect(findCharacterByName(cards, 'Kirito')?.id).toBe('Kirito');
    expect(findCharacterByName(cards, 'Asuna')).toBeUndefined();
  });
});
