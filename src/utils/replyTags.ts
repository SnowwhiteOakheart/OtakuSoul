/**
 * The expression tag a chat reply ends with (`[emotion: blush]`, asked for by the prompt): it picks
 * the portrait language independently and is never shown, read aloud or stored in the text.
 */
const EMOTION_TAG = /\[emotion:\s*([a-z_]+)\s*\]|<emotion>\s*([a-z_]+)\s*<\/emotion>/gi;
/** A tag still being streamed at the end of the text (`[emo`, `[emotion: bl`). */
const PARTIAL_TAG = /\s*(?:\[(?:e(?:m(?:o(?:t(?:i(?:o(?:n(?::[^\]\n]*)?)?)?)?)?)?)?)?|<emotion>[^<\n]*)$/i;

/** The name in the reply's last expression tag, lowercase; `undefined` without one. */
export function emotionTagOf(text: string): string | undefined {
  let name: string | undefined;
  for (const match of text.matchAll(EMOTION_TAG)) name = (match[1] ?? match[2])?.toLowerCase();
  return name;
}

/** The text without expression tags (also an unfinished one at the end while streaming). */
export function withoutEmotionTag(text: string): string {
  return text.replace(EMOTION_TAG, '').replace(PARTIAL_TAG, '').trim();
}
