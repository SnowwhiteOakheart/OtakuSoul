/**
 * Unsent texts kept per device across restarts (composer of each chat). localStorage only:
 * a convenience, so every access tolerates a missing or full storage.
 */
const PREFIX = 'otakusoul.draft.';

export const readDraft = (key: string): string | null => {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
};

/** Stores `text`; an empty text removes the draft. */
export const writeDraft = (key: string, text: string) => {
  try {
    if (text) localStorage.setItem(PREFIX + key, text);
    else localStorage.removeItem(PREFIX + key);
  } catch (error) {
    console.warn('Entwurf konnte nicht gesichert werden:', error);
  }
};
