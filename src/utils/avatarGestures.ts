/** Uses of avatar motions (same list as `avatar_motions::ROLES` in the backend). */
export const MOTION_ROLES = ['idle', 'greeting', 'nod', 'happy', 'sad', 'angry', 'surprised', 'thinking'] as const;
export type MotionRole = (typeof MOTION_ROLES)[number];

/**
 * A gesture the 3D avatar should play: by use (from the chat or a preview) or a clip of the model
 * by name (played by hand). `id` makes repeats of the same one count.
 */
export interface GestureRequest {
  role?: MotionRole;
  clip?: string;
  id: number;
}

/** One language file in `presets/cues/` (emotions and portrait slots are read by the backend). */
interface CueFile { gestures?: Partial<Record<MotionRole, string[]>> }

/** All language files, bundled at build time: a new language is just a new `<lang>.json`. */
const CUE_FILES = import.meta.glob<CueFile>('../../presets/cues/*.json', { eager: true, import: 'default' });

/**
 * A cue as pattern (same rules as `emotions::Cue`): whole words, a trailing `*` for any
 * ending (кивает, кивнула), spaces for any whitespace. `\b` only knows Latin letters, so word edges
 * are checked against any letter.
 */
export function cuePattern(cue: string): RegExp | null {
  const lower = cue.trim().toLowerCase();
  const stem = lower.endsWith('*');
  const body = stem ? lower.slice(0, -1) : lower;
  if (!body.trim()) return null;
  const isLetter = (ch: string) => /\p{L}/u.test(ch);
  const escaped = body.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  const start = isLetter(body[0]!) ? '(?<!\\p{L})' : '';
  const end = stem ? '\\p{L}*' : isLetter(body.at(-1)!) ? '(?!\\p{L})' : '';
  return new RegExp(`${start}${escaped}${end}`, 'iu');
}

/** Gesture order: the first one an action names wins. */
const GESTURE_ORDER: MotionRole[] = ['greeting', 'nod', 'thinking', 'surprised', 'happy', 'sad', 'angry'];

/** Keywords in roleplay actions (`*waves*`, `*nickt*`, `*кивает*`) of all languages and the gesture they start. */
const ACTION_GESTURES: [MotionRole, RegExp[]][] = GESTURE_ORDER.map((role) => [
  role,
  Object.values(CUE_FILES).flatMap((file) => file.gestures?.[role] ?? []).map(cuePattern).filter((re): re is RegExp => !!re),
]);

/** VRM expressions from the emotion detection and the gesture that fits them. */
const EMOTION_GESTURES: Partial<Record<string, MotionRole>> = {
  happy: 'happy',
  sad: 'sad',
  angry: 'angry',
  surprised: 'surprised',
};

/**
 * The gesture for a reply: the first roleplay action that names one, otherwise the detected
 * emotion; `null` keeps the avatar in its idle motion.
 */
export function gestureForReply(text: string, vrmExpression?: string): MotionRole | null {
  for (const match of text.matchAll(/\*([^*\n]{1,200})\*/g)) {
    for (const [role, patterns] of ACTION_GESTURES) if (patterns.some((p) => p.test(match[1]!))) return role;
  }
  return (vrmExpression && EMOTION_GESTURES[vrmExpression]) || null;
}

/** Moods a motion can be meant for (same list as `avatar_motions::MOODS`); '' = any mood. */
export const MOTION_MOODS = ['happy', 'sad', 'angry', 'surprised', 'relaxed'] as const;

/** How much a motion fits the avatar's mood: made for it > for any mood > for another one. */
export function moodWeight(motionMood: string | undefined, currentMood: string): number {
  if (!motionMood) return 1;
  return motionMood === currentMood ? 4 : 0.25;
}

/** A random motion, weighted by how well its mood fits (`mood` of each item, '' = any). */
export function pickByMood<T extends { mood?: string }>(items: T[], currentMood: string, random = Math.random): T | undefined {
  const weights = items.map((item) => moodWeight(item.mood, currentMood));
  let roll = random() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < items.length; i += 1) {
    roll -= weights[i]!;
    if (roll < 0) return items[i];
  }
  return items.at(-1);
}

/** The motion that fits the mood best (the first of equals), e.g. for the idle loop. */
export function bestByMood<T extends { mood?: string }>(items: T[], currentMood: string): T | undefined {
  let best: T | undefined;
  let bestWeight = -1;
  for (const item of items) {
    const weight = moodWeight(item.mood, currentMood);
    if (weight > bestWeight) [best, bestWeight] = [item, weight];
  }
  return best;
}
