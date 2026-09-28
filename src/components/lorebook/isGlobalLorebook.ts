import type { Lorebook } from '../../types';

/** A lorebook counts as global if it says so itself or is listed in the global ids (by id or path). */
export const isGlobalLorebook = (lb: Lorebook, globalIds: string[]) =>
  lb.is_global ||
  Boolean(lb.id && globalIds.includes(lb.id)) ||
  Boolean(lb.file_path && globalIds.includes(lb.file_path));
