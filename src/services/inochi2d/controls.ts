/*
 * Brings an Inochi2D puppet to life: finds the parameters for head, eyes, mouth and breath by name
 * (Inochi2D style "Head:: Yaw-Pitch", "Mouth:: Shape" as well as Live2D style "ParamMouthOpenY")
 * and drives them from the voice level, the current emotion, idle motion and the pointer.
 * Inochi2D has no expression files: emotions become a small pose (smile, open mouth, narrowed
 * eyes, head tilt) that is blended in smoothly.
 */
import { applyAnimation, findEmotionClip, findGestureClip, findIdle, findLoopClip, type PuppetAnimation } from './animation';
import type { LoopRole } from '../../utils/avatarGestures';
import type { Param, Puppet } from './puppet';
import type { Visemes } from '../lipSync';
import type { Inochi2dMapping } from '../../types/generated/Inochi2dMapping';

/** One controllable value on one axis of a parameter. */
interface Axis {
  param: Param;
  axis: 0 | 1;
  /** The raw parameter means the opposite (e.g. "eye open" where we steer "blink"). */
  inverted: boolean;
}

export interface PuppetChannels {
  headYaw?: Axis;
  headPitch?: Axis;
  headRoll?: Axis;
  bodyYaw?: Axis;
  bodyPitch?: Axis;
  bodyRoll?: Axis;
  eyeX?: Axis[];
  eyeY?: Axis[];
  blinkLeft?: Axis;
  blinkRight?: Axis;
  mouthOpen?: Axis;
  smile?: Axis;
  breath?: Axis;
  cheek?: Axis;
  brows?: Axis;
  /** Own vowel shapes (A, I, U, E, O), when the puppet has them. */
  vowels?: Partial<Record<keyof Visemes, Axis>>;
}

/** "ParamAngleX" → "param angle x", "Head:: Yaw-Pitch" → "head yaw pitch". */
const norm = (name: string) =>
  name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Channels a puppet setting may name by hand (as in `CHANNEL_KEYS` of `inochi2d.rs`). */
export const CHANNEL_KEYS = [
  'headYaw', 'headPitch', 'headRoll', 'bodyYaw', 'bodyPitch', 'bodyRoll', 'eyeX', 'eyeY',
  'blinkLeft', 'blinkRight', 'mouthOpen', 'smile', 'breath', 'cheek', 'brows',
] as const;
export type ChannelKey = (typeof CHANNEL_KEYS)[number];

/**
 * Finds channels of a puppet by the names of its parameters; `mapping` (set by hand in the avatar
 * library) wins: a parameter axis, or `null` for "none".
 */
export function findChannels(puppet: Puppet, mapping?: Inochi2dMapping | null): PuppetChannels {
  const found = detectChannels(puppet);
  for (const [key, chosen] of Object.entries(mapping?.channels ?? {})) {
    if (!(CHANNEL_KEYS as readonly string[]).includes(key)) continue;
    const param = chosen ? puppet.params.get(chosen.param) : undefined;
    const a: Axis | undefined = param ? { param, axis: chosen!.axis === 1 ? 1 : 0, inverted: chosen!.inverted } : undefined;
    if (key === 'eyeX' || key === 'eyeY') found[key] = a ? [a] : [];
    else if (chosen === null || a) found[key as Exclude<ChannelKey, 'eyeX' | 'eyeY'>] = a;
  }
  return found;
}

/** What a puppet offers for the settings editor: its parameters, animations and the automatic picks. */
export interface PuppetInfo {
  params: { name: string; isVec2: boolean }[];
  animations: string[];
  /** Automatically found channel per key, as "Name" or "Name (y)", null if none. */
  detected: Record<ChannelKey, string | null>;
  /** Automatically chosen own clip per emotion (null = pose only). */
  emotionClips: Record<string, string | null>;
  /** Automatically chosen loop for walking and sitting in the desktop pet (null = none). */
  loopClips: Record<LoopRole, string | null>;
}

const LOOP_ROLES: LoopRole[] = ['walk', 'sit'];

const describeAxis = (a: Axis | undefined) => (a ? `${a.param.name}${a.param.isVec2 ? (a.axis ? ' (y)' : ' (x)') : ''}` : null);

export function puppetInfo(puppet: Puppet, animations: PuppetAnimation[], emotions: readonly string[]): PuppetInfo {
  const ch = detectChannels(puppet);
  const detected = Object.fromEntries(
    CHANNEL_KEYS.map((key) => {
      const value = ch[key];
      return [key, Array.isArray(value) ? (value.map(describeAxis).join(', ') || null) : describeAxis(value)];
    }),
  ) as Record<ChannelKey, string | null>;
  return {
    params: [...puppet.params.values()].filter((p) => !p.driven).map((p) => ({ name: p.name, isVec2: p.isVec2 })),
    animations: animations.map((a) => a.name),
    detected,
    emotionClips: Object.fromEntries(emotions.map((e) => [e, findEmotionClip(animations, e)?.name ?? null])),
    loopClips: { walk: findLoopClip(animations, 'walk')?.name ?? null, sit: findLoopClip(animations, 'sit')?.name ?? null },
  };
}

function detectChannels(puppet: Puppet): PuppetChannels {
  const params = [...puppet.params.values()].filter((p) => !p.driven);
  const find = (re: RegExp, exclude?: RegExp) => params.find((p) => re.test(norm(p.name)) && !(exclude && exclude.test(norm(p.name))));
  const axis = (param: Param | undefined, a: 0 | 1 = 0, inverted = false): Axis | undefined =>
    param ? { param, axis: a, inverted } : undefined;
  const ch: PuppetChannels = {};

  // Head and body: a 2D "yaw pitch" parameter or separate ones.
  for (const [part, yawKey, pitchKey, rollKey] of [
    ['head', 'headYaw', 'headPitch', 'headRoll'],
    ['body', 'bodyYaw', 'bodyPitch', 'bodyRoll'],
  ] as const) {
    const live2d = part === 'head' ? 'param angle' : 'param body angle';
    const both = find(new RegExp(`${part}.*yaw.*pitch|${part}.*pitch.*yaw`));
    if (both?.isVec2) {
      const yawFirst = /yaw.*pitch/.test(norm(both.name));
      ch[yawKey] = axis(both, yawFirst ? 0 : 1);
      ch[pitchKey] = axis(both, yawFirst ? 1 : 0);
    } else {
      ch[yawKey] = axis(find(new RegExp(`${part}.*(yaw|turn)|${live2d} ?x$`)));
      ch[pitchKey] = axis(find(new RegExp(`${part}.*(pitch|nod)|${live2d} ?y$`)));
    }
    ch[rollKey] = axis(find(new RegExp(`${part}.*(roll|tilt|sway)|${live2d} ?z$`)));
  }

  // Eyes: "Eye:: Left:: Blink" (1 = closed) or "ParamEyeLOpen" (1 = open).
  const side = (s: 'left' | 'right') => (s === 'left' ? '(left|\\bl\\b|eye ?l\\b|eyel)' : '(right|\\br\\b|eye ?r\\b|eyer)');
  for (const s of ['left', 'right'] as const) {
    const key = s === 'left' ? 'blinkLeft' : 'blinkRight';
    const blink = find(new RegExp(`eye.*${side(s)}.*blink|${side(s)}.*eye.*blink|blink.*${side(s)}`));
    const open = find(new RegExp(`eye.*${side(s)}.*open|param eye ?${s[0]} ?open|${side(s)}.*eye.*open`));
    ch[key] = blink ? axis(blink) : axis(open, 0, true);
  }
  if (!ch.blinkLeft && !ch.blinkRight) {
    const both = find(/\bblink\b|eyes? close/);
    ch.blinkLeft = axis(both);
  }
  // Eye movement: 2D, or one parameter per direction ("Eyes:: LookX", "ParamEyeBallY").
  const moves = params.filter((p) => /eye.*(move|look)|eye ?ball/.test(norm(p.name)));
  const vertical = (p: Param) => !p.isVec2 && /(y|vertical|up|down)$/.test(norm(p.name).replace(/ /g, ''));
  ch.eyeX = moves.filter((p) => !vertical(p)).map((p) => ({ param: p, axis: 0 as const, inverted: false }));
  ch.eyeY = moves
    .filter((p) => p.isVec2 || vertical(p))
    .map((p) => ({ param: p, axis: (p.isVec2 ? 1 : 0) as 0 | 1, inverted: false }));

  // Mouth: "Mouth:: Shape" (x smile, y open) or separate ones.
  const shape = find(/mouth.*shape/);
  if (shape?.isVec2) {
    ch.smile = axis(shape, 0);
    ch.mouthOpen = axis(shape, 1);
  }
  ch.mouthOpen ??= axis(find(/mouth.*open|param mouth open|\bjaw\b/));
  ch.smile ??= axis(find(/mouth.*(smile|form)|param mouth form|\bsmile\b/));
  ch.breath = axis(find(/breath/));
  ch.brows = axis(find(/brow/));
  // Vowel shapes: "Mouth:: A", "Mouth_E", "ParamA" (VBridge/Live2D style) …
  const vowels: Partial<Record<keyof Visemes, Axis>> = {};
  for (const [viseme, letter] of [['aa', 'a'], ['ih', 'i'], ['ou', 'u'], ['ee', 'e'], ['oh', 'o']] as const) {
    const found = axis(find(new RegExp(`^(mouth|param|vowel|lip)s? (shape )?${letter}$`)));
    if (found) vowels[viseme] = found;
  }
  if (Object.keys(vowels).length >= 2) ch.vowels = vowels;
  ch.cheek = axis(find(/cheek|blush/));
  return ch;
}

/** Writes `value` in the channel's own range: 0…1 (`unit`) or -1…1 (`signed`). */
function put(a: Axis | undefined, value: number, range: 'unit' | 'signed', values: Map<Param, [number, number]>) {
  if (!a) return;
  const { param } = a;
  const min = param.min[a.axis];
  const max = param.max[a.axis];
  let t = range === 'signed' ? (value + 1) / 2 : value;
  if (a.inverted) t = 1 - t;
  t = Math.min(Math.max(t, 0), 1);
  // A range that starts at 0 (e.g. smile 0…1) takes signed values around its middle.
  const v = min + (max - min) * t;
  const current = values.get(param) ?? [...param.defaults] as [number, number];
  current[a.axis] = v;
  values.set(param, current);
}

/** The face an emotion shows: values from -1 to 1 (open, squint and blush 0 to 1). */
export interface EmotionPose {
  smile: number;
  open: number;
  squint: number;
  pitch: number;
  roll: number;
  blush: number;
  /** Brows: 1 raised (surprise, worry), -1 drawn down (anger). */
  brow: number;
}

const NEUTRAL: EmotionPose = { smile: 0.15, open: 0, squint: 0, pitch: 0, roll: 0, blush: 0, brow: 0 };
const pose = (p: Partial<EmotionPose>): EmotionPose => ({ ...NEUTRAL, ...p });

/** The 28 GoEmotions and the extra (romance) moods as poses. */
export const EMOTION_POSES: Record<string, EmotionPose> = {
  neutral: NEUTRAL,
  joy: pose({ smile: 1, open: 0.25, squint: 0.15 }),
  amusement: pose({ smile: 1, open: 0.35, squint: 0.3, roll: 0.15 }),
  excitement: pose({ smile: 1, open: 0.5, pitch: 0.2, brow: 0.4 }),
  love: pose({ smile: 0.85, squint: 0.25, roll: 0.2, blush: 0.6 }),
  optimism: pose({ smile: 0.8, pitch: 0.15 }),
  gratitude: pose({ smile: 0.8, squint: 0.2, pitch: -0.15 }),
  pride: pose({ smile: 0.6, pitch: 0.3 }),
  admiration: pose({ smile: 0.7, open: 0.15, pitch: 0.1, brow: 0.3 }),
  approval: pose({ smile: 0.6, pitch: -0.1 }),
  relief: pose({ smile: 0.5, squint: 0.3 }),
  caring: pose({ smile: 0.55, roll: 0.2, squint: 0.15 }),
  sadness: pose({ smile: -0.9, squint: 0.3, pitch: -0.35, brow: 0.6 }),
  grief: pose({ smile: -1, squint: 0.45, pitch: -0.5, brow: 0.8 }),
  disappointment: pose({ smile: -0.6, squint: 0.2, pitch: -0.25, brow: 0.4 }),
  remorse: pose({ smile: -0.7, squint: 0.3, pitch: -0.4, roll: -0.1, brow: 0.5 }),
  anger: pose({ smile: -0.8, squint: 0.4, pitch: -0.1, brow: -1 }),
  annoyance: pose({ smile: -0.5, squint: 0.3, roll: -0.15, brow: -0.6 }),
  disapproval: pose({ smile: -0.5, squint: 0.2, roll: -0.2, brow: -0.5 }),
  disgust: pose({ smile: -0.9, squint: 0.35, open: 0.1, roll: -0.25, brow: -0.6 }),
  surprise: pose({ smile: 0, open: 0.7, pitch: 0.2, brow: 0.9 }),
  realization: pose({ smile: 0.2, open: 0.45, pitch: 0.15, brow: 0.6 }),
  fear: pose({ smile: -0.6, open: 0.5, pitch: -0.15, brow: 0.8 }),
  nervousness: pose({ smile: -0.3, open: 0.15, pitch: -0.2, roll: 0.1, brow: 0.5 }),
  confusion: pose({ smile: -0.2, open: 0.1, roll: 0.45, brow: 0.3 }),
  curiosity: pose({ smile: 0.25, open: 0.15, roll: 0.35, pitch: 0.1, brow: 0.4 }),
  desire: pose({ smile: 0.5, squint: 0.4, blush: 0.6, pitch: -0.1 }),
  embarrassment: pose({ smile: 0.3, squint: 0.2, pitch: -0.3, roll: 0.15, blush: 1, brow: 0.3 }),
  // Extra portrait moods (romance, crying …).
  blush: pose({ smile: 0.4, squint: 0.2, pitch: -0.25, roll: 0.15, blush: 1 }),
  teasing: pose({ smile: 0.8, squint: 0.35, roll: 0.3, brow: -0.2 }),
  seductive: pose({ smile: 0.5, squint: 0.45, roll: 0.2, blush: 0.5, brow: -0.15 }),
  aroused: pose({ smile: 0.4, open: 0.3, squint: 0.4, blush: 0.9 }),
  ecstasy: pose({ smile: 0.7, open: 0.5, squint: 0.55, pitch: 0.2, blush: 1 }),
  afterglow: pose({ smile: 0.6, squint: 0.5, roll: 0.2, blush: 0.6 }),
  crying: pose({ smile: -1, squint: 0.6, pitch: -0.4, open: 0.15, brow: 0.8 }),
};

export const poseFor = (emotion: string): EmotionPose => EMOTION_POSES[emotion] ?? NEUTRAL;

const approach = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt));

/** Share of an axis' range (0…1) a parameter value stands at, from the channel's point of view. */
function share(a: Axis, value: number): number {
  const min = a.param.min[a.axis];
  const max = a.param.max[a.axis];
  const t = max === min ? 0 : (value - min) / (max - min);
  return Math.min(Math.max(a.inverted ? 1 - t : t, 0), 1);
}

const fromShare = (a: Axis, t: number) => {
  const v = a.inverted ? 1 - t : t;
  return a.param.min[a.axis] + (a.param.max[a.axis] - a.param.min[a.axis]) * v;
};

/** A clip being played: one-shot gestures, or emotion clips that hold their middle while the mood lasts. */
interface ClipState {
  animation: PuppetAnimation;
  time: number;
  weight: number;
  /** Emotion clips loop their middle part; gestures play once. */
  hold: boolean;
  fadingOut: boolean;
}

/** A state loop of the desktop pet (walking, sitting) blending in or out over the idle loop. */
interface LoopLayer {
  animation: PuppetAnimation;
  axes: Set<string>;
  time: number;
  weight: number;
  fadingOut: boolean;
}

const axisKey = (param: Param, axis: 0 | 1) => `${param.uuid}:${axis}`;
const lanesOf = (animation: PuppetAnimation | undefined) => new Set((animation?.lanes ?? []).map((l) => axisKey(l.param, l.axis)));

/** Seconds to blend clips in and out. */
const FADE_IN = 0.2;
const FADE_OUT = 0.35;

/**
 * Per-frame driver in three layers: the puppet's own idle loop (if it has one), the procedural
 * life (blink, breath, sway, pointer, voice, emotion pose) and the puppet's own clips (an emotion
 * held while it lasts, gestures played once). `update` sets the parameters (before `puppet.update`).
 */
export class PuppetAnimator {
  readonly channels: PuppetChannels;
  readonly animations: PuppetAnimation[];
  private readonly puppet: Puppet;
  private readonly idle: PuppetAnimation | undefined;
  /** Axes the idle loop moves for breath and sway: the procedural ones leave them to it. */
  private readonly idleAxes: Set<string>;
  private time = 0;
  private nextBlink = 2 + Math.random() * 3;
  private blinkPhase = -1;
  private current: EmotionPose = { ...NEUTRAL };
  private mouth = 0;
  private look: [number, number] = [0, 0];
  private lookTarget: [number, number] = [0, 0];
  private clips: ClipState[] = [];
  private clipEmotion = '';
  /** Voice level 0…1 (set from the audio player). */
  level = 0;
  /** Vowel weights of the voice right now (from `lipSync`), or null while silent. */
  visemes: Visemes | null = null;
  private vowelForm = 0;
  emotion = 'neutral';
  /** Pointer over the viewer, -1…1 each way (null: look ahead). */
  pointer: [number, number] | null = null;
  /** Until this time a tap shows a happy little nod (when the puppet has no gesture of its own). */
  private pokeUntil = -1;

  /** Emotion → own animation chosen by hand ("" = none, missing = found by name). */
  private readonly emotionClips: Record<string, string>;
  /** The puppet's loops for walking and sitting (by hand or by name). */
  private readonly loopClips: Partial<Record<LoopRole, PuppetAnimation>> = {};
  private loopLayers: LoopLayer[] = [];
  /** Desktop pet state: walking or sitting plays the puppet's loop for it instead of the idle loop. */
  loop: LoopRole | null = null;

  constructor(puppet: Puppet, animations: PuppetAnimation[] = [], mapping?: Inochi2dMapping | null) {
    this.puppet = puppet;
    this.channels = findChannels(puppet, mapping);
    this.emotionClips = mapping?.emotions ?? {};
    this.animations = animations;
    this.idle = findIdle(animations);
    this.idleAxes = lanesOf(this.idle);
    for (const role of LOOP_ROLES) {
      const chosen = mapping?.loops?.[role];
      const clip = chosen !== undefined ? animations.find((a) => a.name === chosen) : findLoopClip(animations, role);
      if (clip && clip !== this.idle) this.loopClips[role] = clip;
    }
  }

  /** Whether the puppet has its own loop for walking or sitting. */
  hasLoop(role: LoopRole): boolean {
    return !!this.loopClips[role];
  }

  /** Name of the state loop shown now (for tests and the viewer), if any. */
  get looping(): string | null {
    return this.loopLayers.find((l) => !l.fadingOut)?.animation.name ?? null;
  }

  /** Whether the puppet has a mouth the voice can move. */
  get canSpeak() {
    return !!this.channels.mouthOpen;
  }

  /** Name of the clip playing now (for tests and the viewer), if any. */
  get playing(): string | null {
    return this.clips.find((c) => !c.fadingOut)?.animation.name ?? null;
  }

  /** Reaction to a tap: the puppet's own gesture (wink, laugh …) or a smile and a little nod. */
  poke() {
    if (!this.playGesture('tap')) this.pokeUntil = this.time + 1.2;
  }

  /** Plays the puppet's clip for a chat gesture (`MotionRole`); false if it has none. */
  playGesture(role: string): boolean {
    const clip = findGestureClip(this.animations, role);
    if (clip) this.start(clip, false);
    return !!clip;
  }

  /** Plays one of the puppet's animations by name, once. */
  playAnimation(name: string): boolean {
    const clip = this.animations.find((a) => a.name === name);
    if (clip) this.start(clip, false);
    return !!clip;
  }

  private start(animation: PuppetAnimation, hold: boolean) {
    for (const c of this.clips) c.fadingOut = true;
    this.clips.push({ animation, time: 0, weight: 0, hold, fadingOut: false });
  }

  private covered(a: Axis | undefined) {
    if (!a) return false;
    const key = axisKey(a.param, a.axis);
    return this.idleAxes.has(key) || this.loopLayers.some((l) => l.weight > 0.5 && l.axes.has(key));
  }

  update(dt: number) {
    const ch = this.channels;
    this.time += dt;
    const values = new Map<Param, [number, number]>();

    // 1. The puppet's own idle loop underneath everything.
    if (this.idle) {
      const frame = (this.time / this.idle.timestep) % this.idle.length;
      applyAnimation(this.idle, frame, 1, values);
    }
    // The pet's walking or sitting loop over it, blended in and out.
    const wanted = this.loop ? this.loopClips[this.loop] : undefined;
    if (wanted !== this.loopLayers.find((l) => !l.fadingOut)?.animation) {
      for (const l of this.loopLayers) l.fadingOut = true;
      if (wanted) this.loopLayers.push({ animation: wanted, axes: lanesOf(wanted), time: 0, weight: 0, fadingOut: false });
    }
    for (const layer of this.loopLayers) {
      layer.time += dt;
      layer.weight = Math.min(1, Math.max(0, layer.weight + (layer.fadingOut ? -dt / FADE_OUT : dt / FADE_IN)));
      const { animation } = layer;
      applyAnimation(animation, (layer.time / animation.timestep) % animation.length, layer.weight, values);
    }
    this.loopLayers = this.loopLayers.filter((l) => l.weight > 0 || !l.fadingOut);

    // An own clip for the mood replaces the generic pose's part it covers.
    if (this.emotion !== this.clipEmotion) {
      this.clipEmotion = this.emotion;
      const chosen = this.emotionClips[this.emotion];
      const clip =
        chosen !== undefined
          ? this.animations.find((a) => a.name === chosen)
          : this.emotion === 'neutral'
            ? undefined
            : findEmotionClip(this.animations, this.emotion);
      const running = this.clips.find((c) => c.hold && !c.fadingOut);
      if (clip && running?.animation === clip) {
        // The same clip fits the new mood too: keep holding it.
      } else if (clip) {
        this.start(clip, true);
      } else {
        for (const c of this.clips) if (c.hold) c.fadingOut = true;
      }
    }

    const poked = this.time < this.pokeUntil;
    const target = poked ? poseFor('amusement') : poseFor(this.emotion);
    for (const key of Object.keys(this.current) as (keyof EmotionPose)[]) {
      this.current[key] = approach(this.current[key], target[key], 4, dt);
    }
    const face = this.current;

    // 2. Procedural life. Blink every few seconds (quick close and open).
    if (this.blinkPhase < 0 && this.time >= this.nextBlink) this.blinkPhase = 0;
    let blink = 0;
    if (this.blinkPhase >= 0) {
      this.blinkPhase += dt / 0.16;
      blink = this.blinkPhase < 1 ? Math.sin(this.blinkPhase * Math.PI) : 0;
      if (this.blinkPhase >= 1) {
        this.blinkPhase = -1;
        this.nextBlink = this.time + 2 + Math.random() * 4 + (Math.random() < 0.15 ? -1.7 : 0);
      }
    }
    const eyesClosed = Math.max(blink, face.squint * 0.6);
    put(ch.blinkLeft, eyesClosed, 'unit', values);
    put(ch.blinkRight, eyesClosed, 'unit', values);

    // Mouth: voice level opens it, emotions keep it a little open.
    const voice = Math.min(1, this.level * 2.2);
    this.mouth = approach(this.mouth, Math.max(voice, face.open), voice > this.mouth ? 30 : 14, dt);
    put(ch.mouthOpen, this.mouth, 'unit', values);
    // Vowels while speaking: own A/I/U/E/O shapes, else the mouth form (E wide, O round).
    const v = voice > 0.05 ? this.visemes : null;
    const total = v ? v.aa + v.ih + v.ou + v.ee + v.oh : 0;
    if (ch.vowels) {
      for (const [viseme, a] of Object.entries(ch.vowels) as [keyof Visemes, Axis][]) {
        put(a, v && total > 0 ? Math.min(1, (v[viseme] / total) * voice * 1.6) : 0, 'unit', values);
      }
    }
    const form = v && total > 0 ? (v.ee + 0.6 * v.ih - v.ou - 0.8 * v.oh) / total : 0;
    this.vowelForm = approach(this.vowelForm, form, 18, dt);
    const speakingWeight = ch.vowels || !v || total <= 0 ? 0 : Math.min(1, voice * 2) * 0.7;
    put(ch.smile, face.smile + (this.vowelForm - face.smile) * speakingWeight, 'signed', values);
    put(ch.cheek, face.blush, 'unit', values);
    put(ch.brows, face.brow, 'signed', values);

    // Breath and a slow sway, so the figure never stands frozen (the idle loop's own win).
    const breath = (Math.sin(this.time * ((2 * Math.PI) / 3.6)) + 1) / 2;
    if (!this.covered(ch.breath)) put(ch.breath, breath, 'unit', values);
    const swayX = Math.sin(this.time * 0.53) * 0.12 + Math.sin(this.time * 0.21) * 0.08;
    const swayY = Math.sin(this.time * 0.37 + 1.3) * 0.06;

    // Looking at the pointer (eyes faster than the head).
    this.lookTarget = this.pointer ?? [0, 0];
    this.look[0] = approach(this.look[0], this.lookTarget[0], 5, dt);
    this.look[1] = approach(this.look[1], this.lookTarget[1], 5, dt);
    const speaking = voice > 0.05 ? Math.sin(this.time * 7.3) * 0.05 * voice : 0;
    const nod = poked ? Math.sin((this.pokeUntil - this.time) * Math.PI * 2.5) * 0.25 : 0;
    put(ch.headYaw, this.look[0] * 0.6 + swayX, 'signed', values);
    put(ch.headPitch, -this.look[1] * 0.5 + face.pitch + swayY + speaking + nod, 'signed', values);
    put(ch.headRoll, face.roll + swayX * 0.4, 'signed', values);
    if (!this.covered(ch.bodyYaw)) put(ch.bodyYaw, this.look[0] * 0.2 + swayX * 0.5, 'signed', values);
    if (!this.covered(ch.bodyRoll)) put(ch.bodyRoll, swayX * 0.3, 'signed', values);
    for (const eye of ch.eyeX ?? []) put(eye, this.look[0] * 0.9, 'signed', values);
    for (const eye of ch.eyeY ?? []) put(eye, -this.look[1] * 0.9, 'signed', values);

    // 3. The puppet's own clips on top; blinking and the voice still get through.
    const blinkAxes = [ch.blinkLeft, ch.blinkRight].filter((a): a is Axis => !!a);
    const mouthAxis = ch.mouthOpen;
    const keep = (param: Param, axisIndex: 0 | 1, animated: number) => {
      const eye = blinkAxes.find((a) => a.param === param && a.axis === axisIndex);
      if (eye) return fromShare(eye, Math.max(share(eye, animated), blink));
      if (mouthAxis && mouthAxis.param === param && mouthAxis.axis === axisIndex && voice > 0.05) {
        return fromShare(mouthAxis, Math.max(share(mouthAxis, animated), this.mouth));
      }
      return animated;
    };
    for (const clip of this.clips) {
      const { animation } = clip;
      clip.time += dt;
      let frame = clip.time / animation.timestep;
      if (clip.hold) {
        // Into the expression, then loop its middle part while the mood lasts.
        const from = animation.length * 0.3;
        const to = animation.length * 0.7;
        if (frame > to) frame = from + ((frame - from) % Math.max(to - from, 1));
      } else if (frame >= animation.length) {
        clip.fadingOut = true;
        frame = animation.length;
      }
      if (clip.fadingOut) {
        clip.weight -= dt / FADE_OUT;
      } else {
        clip.weight = Math.min(1, clip.weight + dt / FADE_IN);
        // A gesture blends back out over its last frames.
        if (!clip.hold) clip.weight = Math.min(clip.weight, ((animation.length - frame) * animation.timestep) / FADE_OUT);
      }
      applyAnimation(animation, frame, clip.weight, values, keep);
    }
    this.clips = this.clips.filter((c) => c.weight > 0 || !c.fadingOut);

    this.puppet.resetParams();
    for (const [param, value] of values) this.puppet.setParam(param.name, value[0], value[1]);
  }
}
