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

/** Keywords in roleplay actions (`*waves*`, `*nickt*`) and the gesture they start. */
const ACTION_GESTURES: [MotionRole, RegExp][] = [
  ['greeting', /\b(wave[sd]?|waving|greets?|winkt|winkend|gr(ü|ue)(ß|ss)t)\b/i],
  ['nod', /\b(nods?|nodding|nickt|nickend)\b/i],
  ['thinking', /\b(thinks?|ponders?|thoughtful|tilts (her|his|their) head|(ü|ue)berlegt|denkt nach|nachdenklich|gr(ü|ue)belt)\b/i],
  ['surprised', /\b(gasps?|startled|jumps|blinks in surprise|zuckt zusammen|erschrickt|staunt|keucht)\b/i],
  ['happy', /\b(laughs?|giggles?|grins|cheers?|beams|lacht|kichert|strahlt|grinst|jubelt)\b/i],
  ['sad', /\b(sighs? sadly|cries|sobs|tears up|weint|schluchzt|seufzt traurig)\b/i],
  ['angry', /\b(glares|scowls|huffs|stomps|funkelt|schnaubt|stampft|ballt die f(ä|ae)uste)\b/i],
];

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
    for (const [role, pattern] of ACTION_GESTURES) if (pattern.test(match[1]!)) return role;
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
