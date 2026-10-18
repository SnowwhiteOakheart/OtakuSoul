/**
 * Detects a reply that nearly repeats one of the last replies (local models sometimes fall into
 * loops and copy their previous answer). Compares word triples: if most triples of the new reply
 * already occurred in an earlier one, it counts as a repeat. Short replies never count.
 */

/** Replies with fewer words are too short to judge ("Ja." twice is fine). */
const MIN_WORDS = 12;
/** Share of the new reply's word triples that already occurred in one earlier reply. */
const THRESHOLD = 0.7;
/** How many earlier replies are compared. */
export const RECENT_REPLIES = 3;

const triples = (text: string): Set<string> => {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const set = new Set<string>();
  for (let i = 0; i + 2 < words.length; i++) set.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return words.length >= MIN_WORDS ? set : new Set();
};

export function isRepeat(reply: string, earlier: string[]): boolean {
  const own = triples(reply);
  if (own.size === 0) return false;
  return earlier.slice(-RECENT_REPLIES).some((text) => {
    const other = triples(text);
    if (other.size === 0) return false;
    let shared = 0;
    for (const triple of own) if (other.has(triple)) shared += 1;
    return shared / own.size >= THRESHOLD;
  });
}
