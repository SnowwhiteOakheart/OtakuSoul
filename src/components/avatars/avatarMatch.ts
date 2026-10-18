import type { CharacterProfile, ScannedLive2d, ScannedVrm } from '../../types';

const normalize = (path: string) => path.replace(/\\/g, '/').toLowerCase();

/** The 3D model a character card names (empty = the default avatar). */
export const characterVrm = (character: CharacterProfile): string =>
  (character.card.data.extensions?.custom_vrm as string) || (character.card.data.extensions?.sow_vrm as string) || '';

/** The Live2D model a character card names (id or part of the path; empty = the default). */
export const characterLive2d = (character: CharacterProfile): string =>
  (character.card.data.extensions?.custom_live2d as string) || (character.card.data.extensions?.sow_live2d as string) || '';

/** Same rule as the avatar viewer: the card may hold a full path or its end. */
export const usesVrm = (character: CharacterProfile, vrm: Pick<ScannedVrm, 'path'>): boolean => {
  const own = characterVrm(character);
  return !!own && normalize(vrm.path).endsWith(normalize(own));
};

export const usesLive2d = (character: CharacterProfile, model: Pick<ScannedLive2d, 'id' | 'model_path'>): boolean => {
  const own = characterLive2d(character).toLowerCase();
  return !!own && (model.id.toLowerCase() === own || model.model_path.toLowerCase().includes(own));
};

/**
 * The Live2D model the viewer shows for a character: the card's own (by id or part of the path),
 * else the chosen default, else the first one; empty = none to show.
 */
export const resolveLive2dPath = (
  character: CharacterProfile | null,
  scanned: Pick<ScannedLive2d, 'id' | 'model_path'>[],
  activeLive2dPath: string | null,
): string => {
  const own = character ? characterLive2d(character) : '';
  const matched = own
    ? scanned.find((m) => usesLive2d(character!, m))
    : scanned.find((m) => m.model_path === activeLive2dPath) || scanned[0];
  return matched?.model_path || activeLive2dPath || '';
};
