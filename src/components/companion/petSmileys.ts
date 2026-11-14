/**
 * Smileys in what the pet says: emoji (💕 ✨), kaomoji ((>_<), (ﾉ´ヮ`)ﾉ) and short text faces
 * (@_@, ^^, :D) are taken out of the speech bubble and shown beside the head instead, like the
 * emotes of a manga. Pure: text in, text and smileys out.
 */

/** At most this many smileys show at once (the first ones). */
export const MAX_SMILEYS = 3;

/** One emoji with its variation selector, skin tone and zero-width-joined parts. */
const EMOJI = String.raw`\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic}️?)*`;
/** Arms or hands right beside a kaomoji's parentheses: (ﾉ◕ヮ◕)ﾉ, ヽ(°〇°)ﾉ, (ง •̀_•́)ง. */
const ARMS = String.raw`[ﾉノヽ\\/งو٩۶〜~ฅ*]`;
/** A kaomoji: a short parenthesised face (ASCII or full-width brackets). */
const KAOMOJI = String.raw`${ARMS}?[(（][^()（）\n]{1,16}[)）]${ARMS}?`;
/** Text faces standing on their own. */
const TEXT_FACES = String.raw`(?<![\p{L}\p{N}])(?:@_@|\^_\^|\^\^|>_<|>\.<|o_O|O_o|-_-|T_T|;_;|xD|XD|:-?\)|:-?D|;-?\)|:-?\(|:-?P|<3)(?![\p{L}\p{N}])`;

const PATTERN = new RegExp(`${EMOJI}|${KAOMOJI}|${TEXT_FACES}`, 'gu');

/**
 * Whether a bracketed piece is a face rather than words: no run of three letters (a note like
 * "(level 2)" or "(大好物)" stays text) and at least one symbol that is no letter or digit.
 */
function isFace(piece: string): boolean {
  const inner = piece.replace(/^[^(（]*[(（]|[)）][^)）]*$/gu, '');
  if (/\p{L}{3,}/u.test(inner.replace(/ω/gu, '_'))) return false;
  return /[^\p{L}\p{N}\s]/u.test(inner);
}

export interface SplitSpeech {
  /** The words left for the bubble (spaces tidied). */
  text: string;
  /** The smileys found, in order (at most `MAX_SMILEYS`). */
  smileys: string[];
}

export function splitSmileys(text: string): SplitSpeech {
  const smileys: string[] = [];
  const words = text.replace(PATTERN, (match) => {
    const bracketed = /[(（]/u.test(match);
    if (bracketed && !isFace(match)) return match;
    if (smileys.length < MAX_SMILEYS) smileys.push(match);
    return ' ';
  });
  return {
    text: words
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ +([,.!?…~、。！？])/gu, '$1')
      .trim(),
    smileys,
  };
}
