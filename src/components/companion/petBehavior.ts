import type { MotionRole } from '../../utils/avatarGestures';
import { withoutEmotionTag } from '../../utils/replyTags';

/**
 * What the desktop pet does on its own: a small state machine driven by time and by what
 * happens to it (pointer, dragging, pats, chat replies). It only decides; `DesktopPet` turns
 * the frames into gaze, face, mouth and hops, which every model format can show. Gestures are
 * extra: they play only when the figure has a motion for that use.
 *
 * Walking and falling come with the desktop physics (screen edges, gravity).
 */
export type PetMode = 'idle' | 'dozing' | 'reacting' | 'dragged' | 'talking';

export type PetAction = 'lookAround' | 'yawn' | 'hop' | 'wave' | 'think' | 'nod';

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
}

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

const DURATION: Record<PetAction, number> = {
  lookAround: 3600,
  yawn: 2200,
  hop: HOP_MS,
  wave: 2500,
  think: 2800,
  nod: 1500,
};

interface RunningAction {
  kind: PetAction;
  start: number;
  end: number;
  /** Look targets of `lookAround`, one per third. */
  gazes?: Gaze[];
}

export class PetBehavior {
  private mode: PetMode = 'idle';
  private modeUntil = 0;
  private reactExpression: string | null = null;
  private lastPointer: number;
  private nextActionAt: number;
  private action: RunningAction | null = null;
  private hopUntil = 0;
  private talkUntil = 0;
  private speaking = false;
  private cues: PetCue[] = [];
  private idleActions = true;

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

  private react(now: number, expression: string | null, ms = REACT_MS) {
    this.mode = 'reacting';
    this.modeUntil = now + ms;
    this.reactExpression = expression;
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

  pat(now: number) {
    this.lastPointer = now;
    this.react(now, 'happy', 1800);
    this.hopUntil = now + HOP_MS;
    this.cues.push({ kind: 'gesture', role: 'happy' });
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
    ];
    const total = weights.reduce((sum, [, w]) => sum + w, 0);
    let pick = this.random() * total;
    const kind = weights.find(([, w]) => (pick -= w) < 0)?.[0] ?? 'hop';
    const action: RunningAction = { kind, start: now, end: now + DURATION[kind] };
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

    let frame: PetFrame;
    switch (this.mode) {
      case 'dozing':
        frame = { mode: 'dozing', expression: 'relaxed', gaze: { x: 0, y: -0.8 }, mouth: 0, hop: false };
        break;
      case 'dragged':
        frame = { mode: 'dragged', expression: 'surprised', gaze: { x: 0, y: -0.6 }, mouth: 0, hop: false };
        break;
      case 'reacting':
        frame = { mode: 'reacting', expression: this.reactExpression, gaze: null, mouth: 0, hop: false };
        break;
      case 'talking':
        frame = { mode: 'talking', expression: null, gaze: null, mouth: 0, hop: false };
        break;
      default:
        frame = { mode: 'idle', ...this.actionFrame(now), hop: false };
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
