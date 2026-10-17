import type { CharacterProfile } from '../types';

/** "Klein (Ryoutarou Tsuboi)" → "klein": the name before a bracket, lower case. */
const shortName = (name: string) => name.split(' (')[0]!.trim().toLowerCase();

/**
 * The card a scene or story names: the exact name first, otherwise the name before a bracket, so a
 * party entry "Klein" finds "Klein (Ryoutarou Tsuboi)". Same rule as `characters::find_by_name`.
 */
export function findCharacterByName(characters: CharacterProfile[], name: string): CharacterProfile | undefined {
  const wanted = name.trim().toLowerCase();
  return (
    characters.find((c) => c.card.data.name.trim().toLowerCase() === wanted) ??
    characters.find((c) => shortName(c.card.data.name) === wanted)
  );
}
