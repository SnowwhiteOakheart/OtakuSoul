import type { LoopRole, MotionRole } from '../../utils/avatarGestures';
import { withoutEmotionTag } from '../../utils/replyTags';

/**
 * What the desktop pet does on its own: a small state machine driven by time and by what
 * happens to it (pointer, dragging, pats, chat replies). It only decides; `DesktopPet` turns
 * the frames into gaze, face, mouth and hops, which every model format can show. Gestures are
 * extra: they play only when the figure has a motion for that use.
 *
 * With desktop physics on (`petPhysics.ts`) the figure also walks along the floor and falls
 * when let go in the air; `DesktopPet` reports the floor contact and walls back.
 */
export type PetMode = 'idle' | 'walking' | 'sitting' | 'falling' | 'dozing' | 'reacting' | 'dragged' | 'talking';

export type PetAction = 'lookAround' | 'yawn' | 'hop' | 'wave' | 'think' | 'nod' | 'walk' | 'sit';

export interface Gaze {
  x: number;
  y: number;
}

export interface PetFrame {
  mode: PetMode;
  /** Face for the moment (VRM expression); null = the mood from the chat. */
  expression: string | null;
  /** Where the figure looks (-1…1); null = after the pointer. */
  gaze: Gaze | null;
  /** Extra mouth opening (yawn), 0…1. */
  mouth: number;
  /** A small jump is running. */
  hop: boolean;
  /** Walking direction on the floor: -1 left, 1 right, 0 standing. */
  walk: -1 | 0 | 1;
  /** Turn of the figure (radians, positive = towards the right of the screen). */
  turn: number;
  /** Motion loop instead of the idle loop (only plays when the avatar has such a motion). */
  loop: LoopRole | null;
}

/** Where the figure was touched: a stroke on the head or a poke elsewhere. */
export type TouchZone = 'head' | 'body';

/**
 * Upper end of the head in the pet window (share of its height, from the top). The pet's
 * framing is fixed (`frameFullBody`: top fifth free, figure below), so the head lies there.
 */
export const HEAD_ZONE_END = 0.34;

/** One-time things to do this tick. */
export type PetCue = { kind: 'gesture'; role: MotionRole } | { kind: 'bubble'; text: 'doze' | 'wake' };

/** Without pointer movement this long, the figure dozes off. */
export const DOZE_AFTER_MS = 3 * 60_000;
/** Without pointer movement this long, the figure looks around on its own. */
const LOOK_AROUND_AFTER_MS = 4000;
/** Pause between two actions. */
const ACTION_GAP_MS: [number, number] = [8000, 20_000];
const REACT_MS = 1400;
const HOP_MS = 600;
/** A walk lasts this long (random within). */
const WALK_MS: [number, number] = [3000, 7000];
/** Sitting on a window's edge lasts this long (random within). */
const SIT_MS: [number, number] = [12_000, 30_000];
/** How far the figure turns into its walking direction (about 50°, the face stays visible). */
export const WALK_TURN = 0.9;
/** "Komm her" gives up after this long (target out of reach, e.g. on another floor). */
const COME_MS = 30_000;

const DURATION: Record<PetAction, number> = {
  lookAround: 3600,
  yawn: 2200,
  hop: HOP_MS,
  wave: 2500,
  think: 2800,
  nod: 1500,
  walk: WALK_MS[0],
  sit: SIT_MS[0],
};

interface RunningAction {
  kind: PetAction;
  start: number;
  end: number;
  /** Look targets of `lookAround`, one per third. */
  gazes?: Gaze[];
  /** Direction of `walk`. */
  direction?: -1 | 1;
  /** A walk to the pointer ("Komm her"), ended by `arrived`. */
  come?: boolean;
}

export class PetBehavior {
  private mode: PetMode = 'idle';
  private modeUntil = 0;
  private reactExpression: string | null = null;
  private reactGaze: Gaze | null = null;
  private lastPointer: number;
  private nextActionAt: number;
  private action: RunningAction | null = null;
  private hopUntil = 0;
  private talkUntil = 0;
  private speaking = false;
  private cues: PetCue[] = [];
  private idleActions = true;
  private physics = true;
  private grounded = true;
  /** Standing on another window's edge (sitting is only done there, legs over the edge). */
  private onWindow = false;
  private sitMotion = false;

  constructor(
    now: number,
    private readonly random: () => number = Math.random,
  ) {
    this.lastPointer = now;
    this.nextActionAt = now + this.gap();
  }

  private gap() {
    const [min, max] = ACTION_GAP_MS;
    return min + this.random() * (max - min);
  }

  private react(now: number, expression: string | null, ms = REACT_MS, gaze: Gaze | null = null) {
    this.mode = 'reacting';
    this.modeUntil = now + ms;
    this.reactExpression = expression;
    this.reactGaze = gaze;
    this.action = null;
    this.nextActionAt = Math.max(this.nextActionAt, now + ms + this.gap());
  }

  /** The pointer moved somewhere on the desktop. */
  pointer(now: number) {
    this.lastPointer = now;
    if (this.mode === 'dozing') {
      this.react(now, 'surprised');
      this.hopUntil = now + HOP_MS;
      this.cues.push({ kind: 'bubble', text: 'wake' });
    }
  }

  dragStart(now: number) {
    this.lastPointer = now;
    this.mode = 'dragged';
    this.action = null;
  }

  dragEnd(now: number) {
    this.lastPointer = now;
    if (this.mode === 'dragged') this.react(now, 'relaxed', 900);
  }

  /**
   * Touched by the user: on the head it blushes and lowers its eyes, elsewhere it startles
   * with a little jump.
   */
  pat(now: number, zone: TouchZone = 'head') {
    this.lastPointer = now;
    if (zone === 'head') {
      this.react(now, 'blush', 2200, { x: 0, y: -0.35 });
      this.cues.push({ kind: 'gesture', role: 'happy' });
    } else {
      this.react(now, 'surprised', 900);
      this.hopUntil = now + HOP_MS;
    }
  }

  /** A chat reply is shown for `ms`; the figure attends to it meanwhile. */
  say(now: number, ms: number) {
    this.talkUntil = Math.max(this.talkUntil, now + ms);
    if (this.mode === 'dozing') this.mode = 'idle';
  }

  setSpeaking(speaking: boolean) {
    this.speaking = speaking;
  }

  /** Random actions on or off (pet menu). */
  setIdleActions(on: boolean) {
    this.idleActions = on;
    if (!on) this.action = null;
  }

  /** Gravity and walking on or off (pet menu); without them the figure stays where it is put. */
  setPhysics(on: boolean) {
    this.physics = on;
    if (!on) {
      this.grounded = true;
      if (this.action?.kind === 'walk') this.action = null;
      if (this.mode === 'falling') this.mode = 'idle';
    }
  }

  /** Floor contact from the physics: leaving it starts a fall, touching it again is a landing. */
  setGrounded(grounded: boolean, now: number) {
    if (!this.physics) return;
    const was = this.grounded;
    this.grounded = grounded;
    if (!grounded && this.mode !== 'dragged' && this.mode !== 'falling') {
      this.mode = 'falling';
      this.action = null;
    } else if (grounded && !was && this.mode === 'falling') {
      this.react(now, 'surprised', 700);
      this.hopUntil = now + HOP_MS;
    }
  }

  /** Whether it stands on another window's edge (from the physics). */
  setOnWindow(onWindow: boolean) {
    this.onWindow = onWindow;
    if (!onWindow && this.action?.kind === 'sit') this.action = null;
  }

  /** Whether the avatar has a sitting motion; without one it never sits. */
  setSitMotion(available: boolean) {
    this.sitMotion = available;
    if (!available && this.action?.kind === 'sit') this.action = null;
  }

  /** The figure ran into a side wall (-1 left, 1 right): a walk that way turns around. */
  bumped(wall: -1 | 1, now = 0) {
    const action = this.action;
    if (action?.kind !== 'walk' || action.direction !== wall) return;
    // Called over but blocked: it stops at the wall and greets from there.
    if (action.come) this.arrived(now);
    else action.direction = wall === 1 ? -1 : 1;
  }

  /**
   * "Komm her": walks that way until `arrived` (with physics, standing). Returns false when it
   * cannot walk now (dragged, falling, physics off); the caller then moves it otherwise.
   */
  come(now: number, direction: -1 | 1): boolean {
    this.lastPointer = now;
    if (!this.physics || !this.grounded || this.mode === 'dragged' || this.mode === 'falling') return false;
    this.mode = 'idle';
    this.talkUntil = 0;
    this.action = { kind: 'walk', start: now, end: now + COME_MS, direction, come: true };
    return true;
  }

  /** Walking to the pointer right now. */
  get coming(): boolean {
    return !!this.action?.come;
  }

  /** At the pointer (or there by a jump): ends the walk with a hop and a wave. */
  arrived(now: number) {
    this.lastPointer = now;
    if (this.action?.come) this.action = null;
    if (this.mode === 'dozing') this.mode = 'idle';
    this.nextActionAt = now + this.gap();
    this.hopUntil = now + HOP_MS;
    this.cues.push({ kind: 'gesture', role: 'greeting' });
  }

  private startAction(now: number) {
    const pointerIdle = now - this.lastPointer > LOOK_AROUND_AFTER_MS;
    // Looking around only when the pointer rests; otherwise the figure looks after it.
    const weights: [PetAction, number][] = [
      ['lookAround', pointerIdle ? 35 : 0],
      ['yawn', now - this.lastPointer > 60_000 ? 25 : 10],
      ['hop', 15],
      ['wave', 10],
      ['think', 15],
      ['nod', 10],
      ['walk', this.physics && this.grounded ? 30 : 0],
      ['sit', this.physics && this.onWindow && this.sitMotion ? 25 : 0],
    ];
    const total = weights.reduce((sum, [, w]) => sum + w, 0);
    let pick = this.random() * total;
    const kind = weights.find(([, w]) => (pick -= w) < 0)?.[0] ?? 'hop';
    const action: RunningAction = { kind, start: now, end: now + DURATION[kind] };
    if (kind === 'walk') {
      action.direction = this.random() < 0.5 ? -1 : 1;
      action.end = now + WALK_MS[0] + this.random() * (WALK_MS[1] - WALK_MS[0]);
    }
    if (kind === 'sit') action.end = now + SIT_MS[0] + this.random() * (SIT_MS[1] - SIT_MS[0]);
    if (kind === 'lookAround') {
      const side = this.random() < 0.5 ? -1 : 1;
      action.gazes = [
        { x: side * (0.5 + this.random() * 0.4), y: this.random() * 0.4 - 0.1 },
        { x: -side * (0.4 + this.random() * 0.4), y: this.random() * 0.3 },
        { x: 0, y: 0 },
      ];
    }
    if (kind === 'hop' || kind === 'wave') this.hopUntil = now + HOP_MS;
    const gesture: Partial<Record<PetAction, MotionRole>> = { wave: 'greeting', think: 'thinking', nod: 'nod' };
    if (gesture[kind]) this.cues.push({ kind: 'gesture', role: gesture[kind] });
    this.action = action;
  }

  private actionFrame(now: number): Pick<PetFrame, 'expression' | 'gaze' | 'mouth'> {
    const action = this.action;
    if (!action) return { expression: null, gaze: null, mouth: 0 };
    if (action.kind === 'walk') return { expression: null, gaze: { x: action.direction! * 0.5, y: -0.1 }, mouth: 0 };
    const t = Math.min(1, (now - action.start) / (action.end - action.start));
    switch (action.kind) {
      case 'lookAround':
        return { expression: null, gaze: action.gazes![Math.min(2, Math.floor(t * 3))]!, mouth: 0 };
      case 'yawn':
        return { expression: 'relaxed', gaze: { x: 0, y: 0.35 }, mouth: Math.sin(Math.PI * t) * 0.9 };
      case 'think':
        return { expression: 'neutral', gaze: { x: 0.45, y: 0.55 }, mouth: 0 };
      case 'wave':
        return { expression: 'happy', gaze: null, mouth: 0 };
      default:
        return { expression: null, gaze: null, mouth: 0 };
    }
  }

  /** Advances to `now` and returns the frame plus the one-time cues since the last tick. */
  tick(now: number): { frame: PetFrame; cues: PetCue[] } {
    if (this.mode === 'reacting' && now >= this.modeUntil) this.mode = 'idle';
    const talking = this.speaking || now < this.talkUntil;
    if (this.mode === 'idle' || this.mode === 'talking') this.mode = talking ? 'talking' : 'idle';
    if (this.mode === 'idle' && now - this.lastPointer > DOZE_AFTER_MS) {
      this.mode = 'dozing';
      this.action = null;
      this.cues.push({ kind: 'bubble', text: 'doze' });
    }

    if (this.action && now >= this.action.end) {
      this.action = null;
      this.nextActionAt = now + this.gap();
    }
    if (this.mode !== 'idle') {
      this.action = null;
    } else if (!this.action && this.idleActions && now >= this.nextActionAt) {
      this.startAction(now);
    }

    const still = { mouth: 0, hop: false, walk: 0 as const, turn: 0, loop: null };
    let frame: PetFrame;
    switch (this.mode) {
      case 'dozing':
        frame = { ...still, mode: 'dozing', expression: 'relaxed', gaze: { x: 0, y: -0.8 } };
        break;
      case 'dragged':
        frame = { ...still, mode: 'dragged', expression: 'surprised', gaze: { x: 0, y: -0.6 } };
        break;
      case 'falling':
        frame = { ...still, mode: 'falling', expression: 'surprised', gaze: { x: 0, y: -0.7 } };
        break;
      case 'reacting':
        frame = { ...still, mode: 'reacting', expression: this.reactExpression, gaze: this.reactGaze };
        break;
      case 'talking':
        frame = { ...still, mode: 'talking', expression: null, gaze: null };
        break;
      default: {
        const direction = this.action?.kind === 'walk' ? this.action.direction! : 0;
        const sitting = this.action?.kind === 'sit';
        frame = {
          ...still,
          ...this.actionFrame(now),
          mode: direction ? 'walking' : sitting ? 'sitting' : 'idle',
          walk: direction,
          turn: direction * WALK_TURN,
          loop: direction ? 'walk' : sitting ? 'sit' : null,
        };
      }
    }
    frame.hop = now < this.hopUntil && this.mode !== 'dragged';
    const cues = this.cues;
    this.cues = [];
    return { frame, cues };
  }
}

/** Longest speech bubble text; the rest is in the chat. */
const BUBBLE_CHARS = 180;

/**
 * A chat reply as speech bubble text: without emotion tag and markdown marks, cut at a word
 * boundary.
 */
export function bubbleText(content: string): string {
  const plain = withoutEmotionTag(content)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/[*_~`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= BUBBLE_CHARS) return plain;
  const cut = plain.slice(0, BUBBLE_CHARS);
  const space = cut.lastIndexOf(' ');
  return `${(space > BUBBLE_CHARS * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.!?-]+$/, '')}…`;
}

/** How long a reply stays in the bubble: long enough to read, 4–12 s. */
export const bubbleMs = (text: string) => Math.min(12_000, Math.max(4000, 800 + text.length * 55));
