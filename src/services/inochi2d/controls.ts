/*
 * Brings an Inochi2D puppet to life: finds the parameters for head, eyes, mouth and breath by name
 * (Inochi2D style "Head:: Yaw-Pitch", "Mouth:: Shape" as well as Live2D style "ParamMouthOpenY")
 * and drives them from the voice level, the current emotion, idle motion and the pointer.
 * Inochi2D has no expression files: emotions become a small pose (smile, open mouth, narrowed
 * eyes, head tilt) that is blended in smoothly.
 */
import type { Param, Puppet } from './puppet';

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
}

/** "ParamAngleX" → "param angle x", "Head:: Yaw-Pitch" → "head yaw pitch". */
const norm = (name: string) =>
  name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Finds channels of a puppet by the names of its parameters. */
export function findChannels(puppet: Puppet): PuppetChannels {
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

/**
 * Per-frame driver: blink, breath, gentle sway, the pointer, the voice and the emotion pose.
 * `update` sets the parameters on the puppet (before `puppet.update`).
 */
export class PuppetAnimator {
  readonly channels: PuppetChannels;
  private readonly puppet: Puppet;
  private time = 0;
  private nextBlink = 2 + Math.random() * 3;
  private blinkPhase = -1;
  private current: EmotionPose = { ...NEUTRAL };
  private mouth = 0;
  private look: [number, number] = [0, 0];
  private lookTarget: [number, number] = [0, 0];
  /** Voice level 0…1 (set from the audio player). */
  level = 0;
  emotion = 'neutral';
  /** Pointer over the viewer, -1…1 each way (null: look ahead). */
  pointer: [number, number] | null = null;
  /** Until this time a tap shows a happy little nod (Inochi2D has no motion files). */
  private pokeUntil = -1;

  constructor(puppet: Puppet) {
    this.puppet = puppet;
    this.channels = findChannels(puppet);
  }

  /** Whether the puppet has a mouth the voice can move. */
  get canSpeak() {
    return !!this.channels.mouthOpen;
  }

  /** Reaction to a tap: smile and a little nod for a moment. */
  poke() {
    this.pokeUntil = this.time + 1.2;
  }

  update(dt: number) {
    const ch = this.channels;
    this.time += dt;
    const values = new Map<Param, [number, number]>();
    const poked = this.time < this.pokeUntil;
    const target = poked ? poseFor('amusement') : poseFor(this.emotion);
    for (const key of Object.keys(this.current) as (keyof EmotionPose)[]) {
      this.current[key] = approach(this.current[key], target[key], 4, dt);
    }
    const face = this.current;

    // Blink every few seconds (quick close and open), less while squinting.
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
    put(ch.smile, face.smile, 'signed', values);
    put(ch.cheek, face.blush, 'unit', values);
    put(ch.brows, face.brow, 'signed', values);

    // Breath and a slow sway, so the figure never stands frozen.
    const breath = (Math.sin(this.time * ((2 * Math.PI) / 3.6)) + 1) / 2;
    put(ch.breath, breath, 'unit', values);
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
    put(ch.bodyYaw, this.look[0] * 0.2 + swayX * 0.5, 'signed', values);
    put(ch.bodyRoll, swayX * 0.3, 'signed', values);
    for (const eye of ch.eyeX ?? []) put(eye, this.look[0] * 0.9, 'signed', values);
    for (const eye of ch.eyeY ?? []) put(eye, -this.look[1] * 0.9, 'signed', values);

    this.puppet.resetParams();
    for (const [param, value] of values) this.puppet.setParam(param.name, value[0], value[1]);
  }
}
