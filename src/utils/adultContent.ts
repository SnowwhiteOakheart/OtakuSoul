/** Key in `extensions` that marks content for adults (as `MARK` in `modules/nsfw.rs`). */
export const ADULT_MARK = 'otakusoul_nsfw';

/** Whether `extensions` mark a card, story or lorebook as adult content. */
export const isAdultMarked = (extensions: unknown): boolean =>
  !!extensions && typeof extensions === 'object' && (extensions as Record<string, unknown>)[ADULT_MARK] === true;
