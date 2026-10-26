import type { CharacterProfile, EmotionResult, ScannedInochi2d, ScannedLive2d, ScannedVrm } from '../../types';

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

/** The Inochi2D puppet a character card names (file name or path; empty = the default). */
export const characterInochi2d = (character: CharacterProfile): string =>
  (character.card.data.extensions?.custom_inochi2d as string) || '';

/** The card may hold the file name ("Aka.inx") or a path ending in it. */
export const usesInochi2d = (character: CharacterProfile, model: Pick<ScannedInochi2d, 'id' | 'model_path'>): boolean => {
  const own = normalize(characterInochi2d(character));
  return !!own && (model.id.toLowerCase() === own || normalize(model.model_path).endsWith(own));
};

/**
 * The Inochi2D puppet shown for a character: its own (while it is still there), else the chosen
 * default, else the first one; empty = none to show.
 */
export const resolveInochi2dPath = (
  character: CharacterProfile | null,
  scanned: Pick<ScannedInochi2d, 'id' | 'model_path'>[],
  activeInochi2dPath: string | null,
): string => {
  const own = character && characterInochi2d(character) ? scanned.find((m) => usesInochi2d(character, m)) : undefined;
  const fallback = scanned.find((m) => m.model_path === activeInochi2dPath) ?? scanned[0];
  return own?.model_path || fallback?.model_path || '';
};

/**
 * The 3D model shown for a character: its own (while it is still among the scanned models)
 * or else the default avatar.
 */
export const resolveVrmPath = (
  character: CharacterProfile | null,
  scanned: Pick<ScannedVrm, 'path'>[],
  activeVrmPath: string | null,
): string => {
  const own = character ? characterVrm(character) : '';
  const known = !!own && (scanned.length === 0 || scanned.some((vrm) => normalize(vrm.path).endsWith(normalize(own))));
  return (known ? own : '') || activeVrmPath || '';
};

/** A GoEmotions name picked by hand, with the 3D expression and Live2D motion behind it. */
export const manualEmotion = (em: string): EmotionResult => {
  const vrm = ['joy', 'amusement', 'excitement', 'love', 'optimism', 'pride', 'gratitude', 'admiration'].includes(em)
    ? 'happy'
    : ['anger', 'annoyance', 'disapproval', 'disgust'].includes(em)
    ? 'angry'
    : ['sadness', 'grief', 'disappointment', 'remorse'].includes(em)
    ? 'sad'
    : ['surprise', 'confusion', 'curiosity'].includes(em)
    ? 'surprised'
    : em === 'neutral'
    ? 'neutral'
    : 'relaxed';
  return {
    emotion: em,
    vrm_expression: vrm,
    live2d_expression: `${em}_animation`,
    confidence: 1.0,
    intensity: 0.8,
  };
};
