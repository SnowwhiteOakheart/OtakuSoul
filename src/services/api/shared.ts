import { withAvatarUrl, bumpAvatarRevision } from '../../utils/characterAvatar';
import type { CharacterImportResult } from '../../types';

/** An imported card shows its picture like a scanned one (see `withAvatarUrl`). */
export const importResult = (result: CharacterImportResult): CharacterImportResult => {
  bumpAvatarRevision();
  return { ...result, profile: withAvatarUrl(result.profile) };
};
