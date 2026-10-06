/** Uses of avatar motions (same list as `avatar_motions::ROLES` in the backend). */
export const MOTION_ROLES = ['idle', 'greeting', 'nod', 'happy', 'sad', 'angry', 'surprised', 'thinking'] as const;
export type MotionRole = (typeof MOTION_ROLES)[number];

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
