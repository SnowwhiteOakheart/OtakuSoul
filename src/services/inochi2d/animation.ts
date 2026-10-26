/*
 * Inochi2D puppet animations (`animations` in .inp/.inx, Inochi Creator 0.8): lanes of keyframes
 * per parameter axis. Here they are read, sampled and picked by name: an idle loop, clips that
 * match an emotion ("Expr_Verlegen", "Laugh") and gestures ("Wink_L", "Nod").
 */
import type { Param, Puppet } from './puppet';

type Json = Record<string, unknown>;

export type Interpolation = 'linear' | 'stepped' | 'nearest' | 'cubic';
export type MergeMode = 'forced' | 'additive' | 'multiplicative';

export interface Keyframe {
  frame: number;
  value: number;
}

export interface AnimationLane {
  param: Param;
  axis: 0 | 1;
  interpolation: Interpolation;
  merge: MergeMode;
  keyframes: Keyframe[];
}

export interface PuppetAnimation {
  name: string;
  /** Seconds per frame. */
  timestep: number;
  /** Frames. */
  length: number;
  lanes: AnimationLane[];
}

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function interpolation(value: unknown): Interpolation {
  const v = String(value ?? '').toLowerCase();
  if (v === 'stepped') return 'stepped';
  if (v === 'nearest') return 'nearest';
  if (v === 'cubic' || v === 'bezier') return 'cubic';
  return 'linear';
}

function merge(value: unknown): MergeMode {
  const v = String(value ?? '').toLowerCase();
  if (v === 'additive') return 'additive';
  if (v === 'multiplicative') return 'multiplicative';
  return 'forced';
}

/** Reads the animations of a puppet description; lanes for unknown parameters are left out. */
export function readAnimations(puppetJson: Json, puppet: Puppet): PuppetAnimation[] {
  const raw = puppetJson.animations;
  if (!raw || typeof raw !== 'object') return [];
  const byUuid = new Map([...puppet.params.values()].map((p) => [p.uuid, p]));
  const out: PuppetAnimation[] = [];
  for (const [name, value] of Object.entries(raw as Record<string, Json>)) {
    if (!value || typeof value !== 'object') continue;
    const lanes: AnimationLane[] = [];
    for (const lane of Array.isArray(value.lanes) ? (value.lanes as Json[]) : []) {
      const param = byUuid.get(num(lane.uuid, -1));
      const keyframes = (Array.isArray(lane.keyframes) ? (lane.keyframes as Json[]) : [])
        .map((k) => ({ frame: num(k.frame), value: num(k.value) }))
        .sort((a, b) => a.frame - b.frame);
      if (!param || keyframes.length === 0) continue;
      lanes.push({
        param,
        axis: num(lane.target) === 1 ? 1 : 0,
        interpolation: interpolation(lane.interpolation),
        merge: merge(lane.merge_mode),
        keyframes,
      });
    }
    const timestep = num(value.timestep, 1 / 30);
    const lastKey = Math.max(0, ...lanes.flatMap((l) => l.keyframes.map((k) => k.frame)));
    if (lanes.length === 0) continue;
    out.push({
      name: name.replace(/\0/g, '').trim(),
      timestep: timestep > 0 ? timestep : 1 / 30,
      length: Math.max(1, num(value.length, lastKey + 1)),
      lanes,
    });
  }
  return out;
}

/** Value of a lane at `frame` (between keyframes as the lane says, held before the first/after the last). */
export function sampleLane(lane: AnimationLane, frame: number): number {
  const keys = lane.keyframes;
  if (frame <= keys[0]!.frame) return keys[0]!.value;
  const last = keys[keys.length - 1]!;
  if (frame >= last.frame) return last.value;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1]!.frame <= frame) i += 1;
  const a = keys[i]!;
  const b = keys[i + 1]!;
  const t = b.frame === a.frame ? 1 : (frame - a.frame) / (b.frame - a.frame);
  switch (lane.interpolation) {
    case 'stepped':
      return a.value;
    case 'nearest':
      return t < 0.5 ? a.value : b.value;
    case 'cubic': {
      // Catmull-Rom through the neighbouring keys.
      const p0 = (keys[i - 1] ?? a).value;
      const p3 = (keys[i + 2] ?? b).value;
      const t2 = t * t;
      const t3 = t2 * t;
      return 0.5 * (2 * a.value + (-p0 + b.value) * t + (2 * p0 - 5 * a.value + 4 * b.value - p3) * t2 + (-p0 + 3 * a.value - 3 * b.value + p3) * t3);
    }
    default:
      return a.value + (b.value - a.value) * t;
  }
}

/**
 * Writes the animation at `frame` into `values`, blended with what is there by `weight` (0…1).
 * `keep` may protect single axes (e.g. the mouth while speaking) by returning the value to use.
 */
export function applyAnimation(
  animation: PuppetAnimation,
  frame: number,
  weight: number,
  values: Map<Param, [number, number]>,
  keep?: (param: Param, axis: 0 | 1, animated: number, current: number) => number,
) {
  if (weight <= 0) return;
  for (const lane of animation.lanes) {
    const current = values.get(lane.param) ?? ([...lane.param.defaults] as [number, number]);
    const before = current[lane.axis];
    const sampled = sampleLane(lane, frame);
    const target =
      lane.merge === 'additive' ? before + sampled : lane.merge === 'multiplicative' ? before * sampled : sampled;
    let next = before + (target - before) * Math.min(weight, 1);
    if (keep) next = keep(lane.param, lane.axis, next, before);
    current[lane.axis] = next;
    values.set(lane.param, current);
  }
}

const words = (name: string) =>
  name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');

/** Animations that are tools or loops, never an emotion or a gesture. */
const NOT_A_CLIP = /idle|ruhe|loop|blink|blinzel|speak|sprech|talk|aeo|rig|check|test|walk|geh|sit/;

/** Name parts per emotion, best first (English and German, as riggers name them). */
const EMOTION_WORDS: Record<string, string[]> = {
  teasing: ['frech', 'cheek', 'teas', 'smug', 'grins', 'tease'],
  amusement: ['laugh', 'lach', 'giggle', 'kicher', 'frech', 'smile', 'laechel'],
  // Joy is the most common mood: a held laugh (eyes shut) would be too much for it.
  joy: ['happy', 'joy', 'freud', 'froh', 'smile', 'laechel'],
  excitement: ['excit', 'aufgeregt', 'happy', 'freud'],
  optimism: ['happy', 'smile', 'laechel', 'freud'],
  gratitude: ['smile', 'laechel', 'happy', 'thank', 'dank'],
  admiration: ['admir', 'bewunder', 'happy', 'smile'],
  pride: ['proud', 'stolz', 'smug'],
  love: ['love', 'lieb', 'verliebt', 'heart', 'herz'],
  caring: ['care', 'sanft', 'gentle', 'smile', 'laechel'],
  relief: ['relie', 'erleichter', 'smile'],
  embarrassment: ['verlegen', 'embarrass', 'shy', 'schuecht', 'blush'],
  blush: ['blush', 'verlegen', 'embarrass', 'shy', 'schuecht'],
  surprise: ['ueberrasch', 'surpris', 'shock', 'schreck', 'staun'],
  realization: ['ueberrasch', 'surpris', 'realiz', 'aha'],
  fear: ['fear', 'angst', 'scare', 'furcht'],
  nervousness: ['nerv', 'unsicher', 'anxious', 'fear', 'angst'],
  confusion: ['confus', 'verwirr', 'skept', 'doubt', 'zweifel'],
  curiosity: ['curio', 'neugier', 'skept', 'interest'],
  disapproval: ['skept', 'doubt', 'zweifel', 'disapprov', 'schmoll', 'pout'],
  annoyance: ['schmoll', 'pout', 'annoy', 'genervt', 'grumpy', 'beleidigt', 'angry', 'wut'],
  disappointment: ['disappoint', 'enttaeusch', 'schmoll', 'pout', 'sad', 'traurig'],
  anger: ['angry', 'anger', 'wut', 'wuetend', 'aerger', 'mad', 'schmoll', 'pout'],
  disgust: ['disgust', 'ekel', 'skept'],
  sadness: ['sad', 'traurig', 'cry', 'wein'],
  grief: ['cry', 'wein', 'sad', 'traurig'],
  remorse: ['sorry', 'reue', 'sad', 'traurig'],
  crying: ['cry', 'wein', 'traen', 'sad', 'traurig'],
  desire: ['flirt', 'seduc', 'verfuehr', 'love', 'verliebt'],
  seductive: ['seduc', 'verfuehr', 'flirt', 'wink', 'zwinker'],
  aroused: ['flirt', 'seduc', 'blush', 'verlegen'],
  ecstasy: ['laugh', 'lach', 'happy'],
  afterglow: ['smile', 'laechel', 'relie', 'happy'],
};

/** Name parts per chat gesture (`MotionRole`) and for a tap on the puppet. */
const GESTURE_WORDS: Record<string, string[]> = {
  greeting: ['wave', 'wink', 'greet', 'hello', 'hallo', 'gruess', 'zwinker'],
  nod: ['nod', 'nick'],
  happy: ['laugh', 'lach', 'happy', 'freud', 'smile'],
  sad: ['sad', 'traurig', 'cry', 'wein'],
  angry: ['angry', 'wut', 'schmoll', 'pout'],
  surprised: ['ueberrasch', 'surpris', 'shock'],
  thinking: ['think', 'denk', 'skept', 'hmm'],
  tap: ['wink', 'zwinker', 'laugh', 'lach', 'happy', 'nod', 'nick'],
};

function pick(animations: PuppetAnimation[], wanted: string[] | undefined): PuppetAnimation | undefined {
  if (!wanted) return undefined;
  const clips = animations.filter((a) => !NOT_A_CLIP.test(words(a.name)));
  for (const word of wanted) {
    const found = clips.find((a) => words(a.name).includes(word));
    if (found) return found;
  }
  return undefined;
}

/** The puppet's loop to stand in (named "Idle", "Ruhe" …). */
export const findIdle = (animations: PuppetAnimation[]) => animations.find((a) => /idle|ruhe/.test(words(a.name)));

/** The puppet's own clip for an emotion, if it has one. */
export const findEmotionClip = (animations: PuppetAnimation[], emotion: string) => pick(animations, EMOTION_WORDS[emotion]);

/** The puppet's own clip for a chat gesture or a tap. */
export const findGestureClip = (animations: PuppetAnimation[], gesture: string) => pick(animations, GESTURE_WORDS[gesture]);

/** Animations a user may try by hand (everything except the idle loop). */
export const playableAnimations = (animations: PuppetAnimation[]) => animations.filter((a) => a !== findIdle(animations));
