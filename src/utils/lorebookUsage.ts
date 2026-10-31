import type { CharacterProfile, Lorebook, ScenePreview } from '../types';

/**
 * Whether a reference names this lorebook. Characters bind by id or path, scenes and stage NPCs
 * by name (in the source language) or id, so all three count, without regard to case.
 */
export const refersToLorebook = (lb: Lorebook, ref: string) => {
  const r = ref.trim().toLowerCase();
  return !!r && [lb.id, lb.file_path, lb.name].some((v) => !!v && v.toLowerCase() === r);
};

/** A lorebook counts as global if it says so itself or is listed in the global ids (by id or path). */
export const isGlobalLorebook = (lb: Lorebook, globalIds: string[]) =>
  lb.is_global || globalIds.some((id) => (!!lb.id && id === lb.id) || (!!lb.file_path && id === lb.file_path));

export const isBoundTo = (lb: Lorebook, character: CharacterProfile) =>
  (character.bound_lorebooks || []).some((ref) => refersToLorebook(lb, ref));

/**
 * The lorebooks a chat reads: the global ones and those bound to its characters. With none of
 * them every lorebook is read (`fallback`), as chats did before lorebooks could be assigned.
 */
export const chatLorebooks = (
  all: Lorebook[],
  globalIds: string[],
  characters: CharacterProfile[]
): { books: Lorebook[]; fallback: boolean } => {
  const books = all.filter((lb) => isGlobalLorebook(lb, globalIds) || characters.some((c) => isBoundTo(lb, c)));
  return books.length > 0 ? { books, fallback: false } : { books: all, fallback: all.length > 0 };
};

export const charactersBoundTo = (lb: Lorebook, characters: CharacterProfile[]) =>
  characters.filter((c) => isBoundTo(lb, c));

export const scenesUsing = (lb: Lorebook, scenes: ScenePreview[]) =>
  scenes.filter((s) => (s.lorebook || []).some((ref) => refersToLorebook(lb, ref)));
