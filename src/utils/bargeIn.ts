/** A sentence of a reply as it was played (times on the Web Audio clock, seconds). */
export interface SpokenSentence {
  text: string;
  /** Start of its first clip; null while it is not scheduled yet. */
  start: number | null;
  /** End of its last clip. */
  end: number | null;
}

/** Marks a reply the user interrupted (a dash, as in dialogue cut off mid-sentence). */
export const INTERRUPTION_MARK = '—';

/**
 * What the user heard of a reply up to `now`: whole sentences that ended, and of the sentence
 * playing the share of its words that matches the elapsed time. Sentences not played yet are left out.
 */
export function heardText(sentences: SpokenSentence[], now: number): string {
  const heard: string[] = [];
  for (const sentence of sentences) {
    if (sentence.start === null || sentence.end === null || now <= sentence.start) break;
    if (now >= sentence.end) {
      heard.push(sentence.text);
      continue;
    }
    const words = sentence.text.split(/\s+/).filter(Boolean);
    const share = (now - sentence.start) / Math.max(0.001, sentence.end - sentence.start);
    const count = Math.floor(words.length * share);
    if (count > 0) heard.push(words.slice(0, count).join(' '));
    break;
  }
  return heard.join(' ').trim();
}

/**
 * The stored reply cut after what was heard and marked as interrupted, or null when it should
 * stay as it is (nothing heard, all of it heard, or the heard words cannot be found in it,
 * e.g. after a regex script changed the saved text).
 */
export function cutAtHeard(content: string, heard: string): string | null {
  const words = heard.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  // Word by word, so different spacing or line breaks between sentences do not matter.
  // Words the stream had but the saved text lacks (tags removed on saving) are skipped.
  let cursor = 0;
  let missing = 0;
  for (const word of words) {
    const found = content.indexOf(word, cursor);
    if (found < 0) {
      missing += 1;
      continue;
    }
    cursor = found + word.length;
  }
  if (cursor === 0 || missing * 2 > words.length) return null;
  const rest = content.slice(cursor);
  // Only punctuation, closing marks or spaces left: the user heard all of it.
  if (!/[\p{L}\p{N}]/u.test(rest)) return null;
  return `${content.slice(0, cursor).trimEnd()} ${INTERRUPTION_MARK}`;
}
