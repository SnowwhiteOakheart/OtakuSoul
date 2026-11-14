import type { LoopRole, MotionRole } from '../../utils/avatarGestures';
import type { PetPose } from '../../services/desktopPet';
import { withoutEmotionTag } from '../../utils/replyTags';
import type { PetEvent } from '../../types/generated/PetEvent';
import { EAT_TOTAL_S, eatMouth, type PetEat } from '../avatar/eatTimeline';
import { HAND_POSE_S, type HandPoseKind, type PetHands } from '../avatar/handTimeline';
import {
  EDGE_SEAT_POSES,
  FLOOR_SEAT_POSES,
  type EdgeSeatPose,
  type FloorSeatPose,
  type SeatPose,
} from '../avatar/proceduralBody';
import {
  gripAt,
  hangAnchor,
  landingFor,
  RECOVER_PHASES,
  type Hang,
  type HangGrip,
  type Landing,
  type Recover,
} from '../avatar/hangTimeline';

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

export type PetAction =
  | 'lookAround'
  | 'yawn'
  | 'hop'
  | 'wave'
  | 'think'
  | 'nod'
  | 'walk'
  | 'sit'
  | 'sitFloor'
  | 'jump'
  | 'visit'
  | 'kick';

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
  /**
   * Sitting with a pose of its own (VRM, no motion needed): on the ground, knees drawn up, or on a
   * window's edge with the legs hanging down; null when not (or when a sitting motion plays).
   */
  seat: PetSeat | null;
  /** Konkrete zufällig gewählte Sitzvariante (Boden oder Fensterkante); null wenn nicht sitzend. */
  seatPose: SeatPose | null;
  /** Held up by the user (VRM pose: hangs from where it was grabbed); also while it falls after that. */
  hang: PetHang | null;
  /** Getting up after a hard landing (VRM pose); a new `id` starts it again. */
  recover: PetRecover | null;
  /** Eating what it was fed (see `eatTimeline.ts`); a new `id` starts it again. */
  eat: PetEat | null;
  /** What the hands do (VRM; see `handTimeline.ts`); the pet window draws what they hold. */
  hands: PetHands | null;
  /** A small effect around the figure (hearts, stars, a thought …); a new `id` starts it again. */
  fx: PetFx | null;
  /** Building a sandcastle beside itself while it sits on the ground; a new `id` starts one. */
  build: PetBuild | null;
}

/** Effects drawn around the figure by the pet window (every model format). */
export type PetFxKind = 'hearts' | 'dizzy' | 'sparkle' | 'confetti' | 'thinkFood' | 'thinkPlay';
export interface PetFx {
  kind: PetFxKind;
  id: number;
}
export interface PetBuild {
  id: number;
  /** Which side of the figure (-1 left, 1 right on screen). */
  side: -1 | 1;
}

export type PetSeat = 'floor' | 'edge';
export { EDGE_SEAT_POSES, FLOOR_SEAT_POSES, type EdgeSeatPose, type FloorSeatPose, type SeatPose };

export type PetGrip = HangGrip;
export type PetHang = Hang;
export type PetLanding = Landing;
export type PetRecover = Recover;
export { gripAt, hangAnchor };

/** How long getting up takes after landing on this (the viewer's pose follows the same timeline). */
export const RECOVER_MS = (kind: Landing) => RECOVER_PHASES[kind].total * 1000;

/** A drop shorter than this (ms in the air) from the shoulders is landed on the feet without a stumble. */
const SOFT_FALL_MS = 450;
/** Released without falling: the hanging pose still turns into the landing after this long. */
const HANG_RELEASE_MS = 250;
/** Folded over the hand, the figure is seen from the side. */
const HANG_HIP_TURN = 1.2;

/** Where the figure was touched: a stroke on the head or a poke elsewhere. */
export type TouchZone = 'head' | 'body';

/**
 * Lower end of the head in the pet window (share of its height, from the top) with the default
 * framing (`frameFullBody`: top fifth free, figure below); used until the figure reports its own.
 */
export const HEAD_ZONE_END = 0.34;
/** The eyes lie this share of the head line's height (counted from the window top). */
const EYES_IN_HEAD = 0.8;

/**
 * Where the head ends in the pet window: the figure's own head line (projected from the model,
 * so zoom, lift, turning and chibi heads count), else the default; `drop` when it is drawn lower
 * (sitting).
 */
export const headZoneEnd = (headLine: number | null, drop = 0) => (headLine ?? HEAD_ZONE_END) + drop;

/** A touch at this height (share of the window, from the top) strokes the head or pokes the body. */
export const touchZoneAt = (yShare: number, headEnd: number): TouchZone => (yShare < headEnd ? 'head' : 'body');

/** Height of the eyes (share of the window from the top), where the gaze to the pointer starts. */
export const eyeLine = (headEnd: number) => headEnd * EYES_IN_HEAD;

/** How long a press on a hand lasts before it counts as holding it (shorter is a high five). */
export const HOLD_HAND_MS = 450;

/** One-time things to do this tick. */
/**
 * Lines the behaviour asks for (the caller picks the words): dozing off, waking up, being dragged
 * over the floor by a foot, hanging head down for a while.
 */
export type PetBubbleCue =
  | 'doze'
  | 'wake'
  | 'scrape'
  | 'upsideDown'
  | 'hungry'
  | 'bored'
  | 'stretch'
  | 'dizzy'
  | 'splat'
  | 'elegant'
  | 'dangle'
  | 'caught'
  | 'climbed'
  | 'kick';

/** Dragged over the floor it complains again after this long (ms, random within). */
export const SCRAPE_GAP_MS: [number, number] = [3500, 6500];
/** Held head down this long (ms) without touching the floor, it says so (once per grab). */
export const UPSIDE_DOWN_MS = 2200;

export type PetCue =
  | { kind: 'gesture'; role: MotionRole }
  | { kind: 'bubble'; text: PetBubbleCue }
  /** Jump to a nearby window's edge; the caller plans it and reports back with `jumped`. */
  | { kind: 'jump' }
  /** Something happened to the figure that it may comment on (the caller decides whether and how often). */
  | { kind: 'event'; event: PetEvent }
  /** Fond of the user: it walks over to the pointer by itself (the caller walks it, see `come`). */
  | { kind: 'visit' }
  /** Standing on a window it gives it a little kick (the caller moves that window, if allowed). */
  | { kind: 'kick'; direction: -1 | 1 }
  /** It played with the user (caught the pointer): counts for the bond. */
  | { kind: 'play' };

/** Landing this fast (logical px/s, down) it is dazed: stars over the head, sitting a while. */
export const HARD_LANDING = 1700;
/** Hitting a screen side this fast in the air (logical px/s) it squashes against it. */
export const WALL_SPLAT = 1300;
/** Thrown sideways at least this fast and landing softly, it lands with a flourish. */
export const ELEGANT_SIDE = 350;
/** How long the stars circle after a hard hit (ms). */
const DIZZY_MS = 3200;
/** Held by the collar or a hand this long, it says something about it (once per grab). */
export const DANGLE_SAY_MS = 2000;
/** Chasing the pointer gives up after this long. */
const CHASE_MS = 4500;
/** How a meal went down (see `petBond.ts`): its favourite, not its thing, the same again, fine. */
export type MealTaste = 'favorite' | 'disliked' | 'again' | 'fine';
/** A sandcastle takes this long (it sits at least this long when it builds one). */
export const BUILD_MS = 14_000;

/** Without pointer movement this long, the figure dozes off (shorter when tired or at night). */
export const DOZE_AFTER_MS = 3 * 60_000;

/**
 * What the inner state does to the idle behaviour: hormones (0…100, 50 = neutral, so without
 * the companion's hormones nothing changes) and the time of day.
 */
export interface PetDrive {
  fatigue: number;
  dopamine: number;
  cortisol: number;
  night: boolean;
}

export const NEUTRAL_DRIVE: PetDrive = { fatigue: 50, dopamine: 50, cortisol: 50, night: false };

export { isNightHour } from '../../utils/dayTime';

/** 0 at neutral or below, 1 at the top of the scale. */
const above = (value: number) => Math.min(1, Math.max(0, (value - 50) / 50));
/** 0.2 at the bottom of the scale, 1 at neutral, 1.8 at the top. */
const lift = (value: number) => Math.min(1.8, Math.max(0.2, 1 + ((value - 50) / 50) * 0.8));
/** From this bond level on it comes over by itself now and then (see `petBond.ts`). */
const VISIT_AFFECTION = 3;
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
/** Seated, the figure turns to the side (about 75°): seen in profile, the face still a little. */
export const SIT_TURN = 1.3;
/** A glance after a window switch lasts this long; the next one waits this long. */
const GLANCE_MS = 900;
const GLANCE_GAP_MS = 8000;
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
  sitFloor: SIT_MS[0],
  jump: 400,
  visit: 400,
  kick: 900,
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
  /** That walk is chasing the pointer (a game): caught at the end. */
  chase?: boolean;
  /** Sitting on the ground it builds a sandcastle. */
  build?: PetBuild;
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
  private saving = false;
  private music = false;
  private beatUntil = 0;
  private lastGlance = Number.NEGATIVE_INFINITY;
  private physics = true;
  private grounded = true;
  /** Standing on another window's edge (sitting is only done there, legs over the edge). */
  private onWindow = false;
  private sitMotion = false;
  /** The figure can sit down on the ground by itself (VRM: a pose of its own). */
  private floorSit = false;
  /** Posture chosen in the menu: `auto` decides itself, `stand` never walks or sits, `sit` stays seated. */
  private pose: PetPose = 'auto';
  /** Which way it turns while seated (chosen anew each time it sits down). */
  private sitSide: -1 | 1 = 1;
  /** Zufällig gewählte Boden- und Kanten-Sitzhaltung beim Hinsetzen. */
  private floorPose: FloorSeatPose = 'hugKnees';
  private edgePose: EdgeSeatPose = 'dangle';
  private nextPoseShiftAt = Number.POSITIVE_INFINITY;
  /** A window's edge is within jumping reach. */
  private canJump = false;
  /** In the air by its own jump (a happy leap, not a startled fall). */
  private leaping = false;
  private drive: PetDrive = NEUTRAL_DRIVE;
  private dancingNow = false;
  /** Peeking in from a screen side: stays there, no walking off by itself. */
  private peeking = false;
  /** The menu is open around the figure: no new idle actions (see `attend`). */
  private attending = false;
  /** Held up (and falling afterwards) by this grip. */
  private hang: PetHang | null = null;
  /** Let go at this time (still hanging until it falls or lands). */
  private releasedAt: number | null = null;
  private fallStart = 0;
  private recovering: (PetRecover & { start: number }) | null = null;
  /** Eating right now (since `start`), and the last meal's number. */
  private eating: (PetEat & { start: number; taste: MealTaste }) | null = null;
  private eatId = 0;
  /** Held by a foot near the floor (lying or at an angle) and when it last moved along it. */
  private groundDrag = false;
  private groundMovedAt = Number.NEGATIVE_INFINITY;
  private nextScrapeAt = 0;
  /** Since when it hangs head down off the floor, and whether it said so in this grab. */
  private upsideSince: number | null = null;
  private upsideSaid = false;
  private recoverId = 0;
  /** Since when it is held up (for saying something while dangling), and whether it said it. */
  private dragSince = 0;
  private dangleSaid = false;
  /** A timed hand pose (stretch, belly, ledge) and the held ones (letter, book) with their ids. */
  private handPose: (PetHands & { start: number }) | null = null;
  private handId = 0;
  private carryId: number | null = null;
  private readId: number | null = null;
  /** The effect showing, until when. */
  private fx: (PetFx & { until: number }) | null = null;
  private fxId = 0;
  private buildId = 0;
  /** Bond level with the user (0…5, see `petBond.ts`): fonder figures wave, visit and glow more. */
  private affection = 0;
  /** Pomodoro focus: it sits down with a book, no other idle actions, no dozing. */
  private focus = false;
  /** May kick the window it stands on (the user allowed moving windows). */
  private kicks = false;
  /** Sandcastles allowed, and how bored it is (0…1): bored, it builds more often. */
  private builds = true;
  private boredom = 0;
  /** Hit hard: the stars circle until then. */
  private dizzyUntil = 0;
  /** Hanging from a window's edge it caught (then pulling itself up). */
  private onLedge = false;

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

  /** Wählt zufällig eine Boden- und eine Kanten-Sitzhaltung und plant den nächsten Haltungswechsel. */
  private pickSeatPose(now?: number) {
    this.floorPose = FLOOR_SEAT_POSES[Math.min(FLOOR_SEAT_POSES.length - 1, Math.floor(this.random() * FLOOR_SEAT_POSES.length))]!;
    this.edgePose = EDGE_SEAT_POSES[Math.min(EDGE_SEAT_POSES.length - 1, Math.floor(this.random() * EDGE_SEAT_POSES.length))]!;
    this.nextPoseShiftAt = now !== undefined ? now + 45_000 + this.random() * 25_000 : 0;
  }

  private react(now: number, expression: string | null, ms = REACT_MS, gaze: Gaze | null = null) {
    this.mode = 'reacting';
    this.modeUntil = now + ms;
    this.reactExpression = expression;
    this.reactGaze = gaze;
    this.action = null;
    this.nextActionAt = Math.max(this.nextActionAt, now + ms + this.gap());
  }

  /** Starts a hand pose with an end (stretching, the belly, the ledge). */
  private startHands(now: number, kind: HandPoseKind) {
    this.handId += 1;
    this.handPose = { kind, id: this.handId, start: now };
  }

  /** Shows an effect for `ms`. */
  private showFx(now: number, kind: PetFxKind, ms: number) {
    this.fxId += 1;
    this.fx = { kind, id: this.fxId, until: now + ms };
  }

  /** Bond level with the user (see `petBond.ts`). */
  setAffection(level: number) {
    this.affection = Math.max(0, Math.min(5, level));
  }

  /** The bond grew a level: delighted, a hop, hearts. */
  levelUp(now: number) {
    if (this.mode === 'dozing') this.mode = 'idle';
    if (this.mode === 'dragged' || this.mode === 'falling') return;
    this.react(now, 'happy', 1800, { x: 0, y: 0.1 });
    this.hopUntil = now + HOP_MS;
    this.showFx(now, 'hearts', 2600);
    this.cues.push({ kind: 'gesture', role: 'happy' });
  }

  /**
   * The user is (back) here: it wakes, waves and hops; fond of the user (`warm`) hearts go up.
   * The caller says the words (morning, back after a while …).
   */
  greet(now: number, warm: boolean) {
    this.lastPointer = now;
    if (this.mode === 'dozing') this.mode = 'idle';
    if (this.mode === 'dragged' || this.mode === 'falling' || this.onLedge) return;
    this.react(now, 'happy', 1800, { x: 0, y: 0.1 });
    this.hopUntil = now + HOP_MS;
    this.cues.push({ kind: 'gesture', role: 'greeting' });
    if (warm) this.showFx(now, 'hearts', 2400);
  }

  /** Going away (the pet is hidden): a wave goodbye. */
  farewell(now: number) {
    if (this.mode === 'dozing') this.mode = 'idle';
    this.react(now, 'happy', 1500, { x: 0, y: 0.1 });
    this.cues.push({ kind: 'gesture', role: 'greeting' });
  }

  /** A pomodoro phase or timer is done: delighted, a hop and confetti. */
  celebrate(now: number) {
    this.lastPointer = now;
    if (this.mode === 'dozing') this.mode = 'idle';
    if (this.mode === 'dragged' || this.mode === 'falling' || this.onLedge) return;
    this.react(now, 'happy', 1800, { x: 0, y: 0.1 });
    this.hopUntil = now + HOP_MS;
    this.showFx(now, 'confetti', 2400);
    this.cues.push({ kind: 'gesture', role: 'happy' });
  }

  /**
   * Hungry or bored: a hint now and then – it looks over, rubs its belly or thinks of playing
   * (never sad, nothing is taken away). Only when it is idle; false when it could not now.
   */
  hint(now: number, need: 'hunger' | 'boredom'): boolean {
    if (this.mode !== 'idle' || this.attending || this.focus || this.peeking || this.action?.come) return false;
    this.react(now, need === 'hunger' ? 'relaxed' : 'neutral', 3200, { x: 0, y: 0.15 });
    if (need === 'hunger') this.startHands(now, 'belly');
    else this.hopUntil = now + HOP_MS;
    this.showFx(now, need === 'hunger' ? 'thinkFood' : 'thinkPlay', 3600);
    this.cues.push({ kind: 'bubble', text: need === 'hunger' ? 'hungry' : 'bored' });
    return true;
  }

  /** Long at the computer: it stretches demonstratively (the caller suggests a break). */
  stretch(now: number): boolean {
    if ((this.mode !== 'idle' && this.mode !== 'dozing') || this.attending || this.focus) return false;
    this.mode = 'idle';
    this.lastPointer = now;
    this.react(now, 'relaxed', HAND_POSE_S.stretch * 1000, { x: 0, y: 0.45 });
    this.startHands(now, 'stretch');
    this.cues.push({ kind: 'bubble', text: 'stretch' });
    return true;
  }

  /**
   * Pomodoro focus on or off: it sits down (on the ground or an edge, when it can) and reads,
   * starts nothing else and does not doze off; standing figures just hold the book.
   */
  setFocus(on: boolean, now = 0) {
    if (on === this.focus) return;
    this.focus = on;
    if (on) {
      this.handId += 1;
      this.readId = this.handId;
      if (!this.action?.come) this.action = null;
      this.nextActionAt = now;
    } else {
      this.readId = null;
      if (this.action?.kind === 'sitFloor' || this.action?.kind === 'sit') this.action = null;
      this.nextActionAt = Math.max(this.nextActionAt, now + this.gap());
    }
  }

  /** In focus right now (the caller keeps quiet then). */
  get focused() {
    return this.focus;
  }

  /** Carrying a letter (a message from the character): holds it out until the caller is done. */
  setCarry(on: boolean) {
    if (on && this.carryId === null) {
      this.handId += 1;
      this.carryId = this.handId;
    } else if (!on) {
      this.carryId = null;
    }
  }

  /** Whether it may kick the window it stands on (the user allowed moving windows). */
  setKicks(on: boolean) {
    this.kicks = on;
  }

  /** Traces on (sandcastles), and how bored it is (0…1): bored, it builds more often. */
  setTraces(on: boolean, boredom = 0) {
    this.builds = on;
    this.boredom = boredom;
  }

  /**
   * Hit a screen side flying (thrown): squashed, stars circle. `speed`: logical px/s sideways.
   * Still in the air afterwards, it lands dazed.
   */
  wallHit(now: number, speed: number) {
    if (speed < WALL_SPLAT || this.mode !== 'falling' || this.leaping) return;
    this.dizzyUntil = now + DIZZY_MS;
    this.showFx(now, 'dizzy', DIZZY_MS);
    this.cues.push({ kind: 'bubble', text: 'splat' });
  }

  /**
   * Caught a window's edge in the air: it hangs by its hands, then pulls itself up (the physics
   * moves the window, see `petPhysics.ts`); `false` once it stands on the edge.
   */
  setLedge(on: boolean, now: number) {
    if (on === this.onLedge) return;
    this.onLedge = on;
    if (on) {
      this.leaping = false;
      this.mode = 'reacting';
      this.modeUntil = Number.POSITIVE_INFINITY;
      this.reactExpression = 'surprised';
      this.reactGaze = { x: 0, y: 0.5 };
      this.action = null;
      this.startHands(now, 'ledge');
    } else {
      this.handPose = null;
      this.react(now, 'happy', 1200, { x: 0, y: 0.1 });
      this.cues.push({ kind: 'bubble', text: 'climbed' });
      this.cues.push({ kind: 'gesture', role: 'happy' });
    }
  }

  /** On a window's edge it caught right now. */
  get ledge() {
    return this.onLedge;
  }

  /** The pointer moved somewhere on the desktop. */
  pointer(now: number) {
    this.lastPointer = now;
    if (this.mode === 'dozing') {
      this.react(now, 'surprised');
      this.hopUntil = now + HOP_MS;
      this.cues.push({ kind: 'bubble', text: 'wake' });
      this.cues.push({ kind: 'event', event: 'woke' });
    }
  }

  /** Lifted up; `hang` says where (only for figures with the hanging pose, see `canHang`). */
  dragStart(now: number, hang: PetHang | null = null) {
    this.lastPointer = now;
    this.leaping = false;
    this.mode = 'dragged';
    this.action = null;
    this.recovering = null;
    this.hang = hang;
    this.releasedAt = null;
    // Lifted while eating: the meal is over (the food is gone with it).
    this.eating = null;
    this.groundDrag = false;
    this.groundMovedAt = Number.NEGATIVE_INFINITY;
    this.nextScrapeAt = 0;
    this.upsideSince = null;
    this.upsideSaid = false;
    this.dragSince = now;
    this.dangleSaid = false;
    this.onLedge = false;
    this.handPose = null;
  }

  /**
   * Held by a foot while the user drags it (from the caller's window moves): `grounded` when the
   * body lies on or leans against the floor, `moving` when it is pulled along it right now. Being
   * scraped over the floor it gets cross and complains now and then; hanging head down a while
   * it says that once.
   */
  dragAlong(now: number, grounded: boolean, moving: boolean) {
    if (this.mode !== 'dragged' || this.hang?.grip !== 'feet') return;
    this.lastPointer = now;
    this.groundDrag = grounded;
    if (grounded) {
      this.upsideSince = null;
      if (!moving) return;
      this.groundMovedAt = now;
      if (now >= this.nextScrapeAt) {
        const [min, max] = SCRAPE_GAP_MS;
        this.nextScrapeAt = now + min + this.random() * (max - min);
        this.cues.push({ kind: 'bubble', text: 'scrape' });
      }
      return;
    }
    this.upsideSince ??= now;
    if (!this.upsideSaid && now - this.upsideSince >= UPSIDE_DOWN_MS) {
      this.upsideSaid = true;
      this.cues.push({ kind: 'bubble', text: 'upsideDown' });
    }
  }

  dragEnd(now: number) {
    this.lastPointer = now;
    if (this.mode === 'dragged') {
      this.react(now, 'relaxed', 900);
      this.cues.push({ kind: 'event', event: 'thrown' });
      if (this.hang) this.releasedAt = now;
    }
  }

  /** Whether the figure can hang from where it is grabbed (VRM: the same pose support as sitting). */
  get canHang() {
    return this.floorSit;
  }

  /** Lands after hanging: what it hits depends on how it hung; a short drop from the shoulders is nothing. */
  private landFromHang(now: number, airborne: number) {
    const grip = this.hang?.grip;
    this.hang = null;
    this.releasedAt = null;
    if (!grip || !this.floorSit) return false;
    const kind = landingFor(grip);
    if (kind === 'feet' && airborne < SOFT_FALL_MS) return false;
    this.recoverId += 1;
    this.recovering = { kind, id: this.recoverId, start: now };
    this.sitSide = this.random() < 0.5 ? -1 : 1;
    this.pickSeatPose(now);
    this.react(now, 'surprised', RECOVER_MS(kind));
    return true;
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
      // Fond of the user, little hearts go up.
      if (this.affection >= 4) this.showFx(now, 'hearts', 2000);
    } else {
      this.react(now, 'surprised', 900);
      this.hopUntil = now + HOP_MS;
    }
  }

  /** A quick click on a hand: a high five – delight, a little jump and a wave. */
  highFive(now: number) {
    this.lastPointer = now;
    this.react(now, 'happy', 1500, { x: 0, y: 0.1 });
    this.hopUntil = now + HOP_MS;
    this.cues.push({ kind: 'gesture', role: 'greeting' });
  }

  /** The character wrote on their own: wakes up, brightens and waves for attention. */
  announce(now: number) {
    this.lastPointer = now;
    if (this.mode === 'dozing') this.mode = 'idle';
    this.react(now, 'happy', 1600, { x: 0, y: 0.1 });
    this.hopUntil = now + HOP_MS;
    this.cues.push({ kind: 'gesture', role: 'greeting' });
  }

  /** Fed something: delighted for a moment, a little hop and a happy gesture. */
  /**
   * Fed something: it brings it to its mouth, takes three bites and chews (`eatTimeline.ts`),
   * looking at it contentedly; when it is finished it is delighted (a hop and a happy gesture).
   */
  eat(now: number, taste: MealTaste = 'fine') {
    this.lastPointer = now;
    if (this.mode === 'dozing') this.mode = 'idle';
    this.eatId += 1;
    this.eating = { id: this.eatId, start: now, taste };
    this.react(now, 'relaxed', EAT_TOTAL_S * 1000, { x: 0, y: -0.25 });
  }

  /** A hand is held (pressed without dragging): it blushes and looks at it until let go. */
  holdHand(now: number) {
    this.lastPointer = now;
    this.mode = 'reacting';
    // Until `releaseHand` (or a drag) ends it; idle actions wait as after any reaction.
    this.modeUntil = Number.POSITIVE_INFINITY;
    this.reactExpression = 'blush';
    this.reactGaze = { x: 0, y: -0.45 };
    this.action = null;
  }

  /** The held hand is let go: a happy moment, then back to normal. */
  releaseHand(now: number) {
    this.lastPointer = now;
    if (this.mode === 'reacting' && this.modeUntil === Number.POSITIVE_INFINITY) this.react(now, 'happy', 1200);
  }

  /** A chat reply is shown for `ms`; the figure attends to it meanwhile. */
  say(now: number, ms: number) {
    this.talkUntil = Math.max(this.talkUntil, now + ms);
    if (this.mode === 'dozing') this.mode = 'idle';
  }

  setSpeaking(speaking: boolean) {
    this.speaking = speaking;
  }

  /** Hormones and time of day: tired figures yawn and doze sooner, lively ones hop and walk more. */
  setDrive(drive: PetDrive) {
    this.drive = drive;
  }

  /** Pointer-free time after which it dozes off. */
  private dozeAfter() {
    const { fatigue, night } = this.drive;
    return DOZE_AFTER_MS * (1 - 0.6 * above(fatigue)) * (night ? 0.5 : 1);
  }

  /** Music plays on the computer: the figure looks relaxed and nods on the beats. */
  setMusic(playing: boolean) {
    this.music = playing;
  }

  /** A beat of that music. */
  beat(now: number) {
    if (this.music && this.mode === 'idle' && !this.saving) this.beatUntil = now + 200;
  }

  /** Another window came to the front: a quick glance after it (not more often than every 8 s). */
  windowSwitched(now: number) {
    if (this.mode !== 'idle' || this.saving || now - this.lastGlance < GLANCE_GAP_MS) return;
    this.lastGlance = now;
    const side = this.random() < 0.5 ? -1 : 1;
    this.react(now, null, GLANCE_MS, { x: side * 0.7, y: 0.05 });
  }

  /** Power-saving: no random actions (dozing and reactions to the user stay). */
  setSaving(on: boolean) {
    this.saving = on;
    if (on && !this.action?.come) this.action = null;
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
      this.leaping = false;
    }
  }

  /**
   * Floor contact from the physics: leaving it starts a fall, touching it again is a landing.
   * `impact`: the speeds it came down with (logical px/s; `down` falling, `side` sideways): hard
   * it is dazed, thrown sideways and soft it lands with a flourish.
   */
  setGrounded(grounded: boolean, now: number, impact: { down: number; side: number } | null = null) {
    if (!this.physics) return;
    const was = this.grounded;
    this.grounded = grounded;
    if (!grounded && this.mode !== 'dragged' && this.mode !== 'falling') {
      this.mode = 'falling';
      this.action = null;
      this.fallStart = now;
    } else if (grounded && !was && this.mode === 'falling') {
      if (this.leaping) {
        this.leaping = false;
        this.react(now, 'happy', 700);
      } else if (this.landFromHang(now, now - this.fallStart)) {
        // The landing is the pose's (no hop, no landing motion over it).
        this.cues.push({ kind: 'event', event: 'landed' });
        if ((impact && impact.down >= HARD_LANDING) || now < this.dizzyUntil) this.showFx(now, 'dizzy', DIZZY_MS);
        return;
      } else if ((impact && impact.down >= HARD_LANDING) || now < this.dizzyUntil) {
        // Dazed: it sits where it landed rubbing its head (VRM), stars circling.
        this.landDazed(now);
        this.cues.push({ kind: 'event', event: 'landed' });
        return;
      } else if (impact && impact.side >= ELEGANT_SIDE) {
        // Thrown and landed softly: a little flourish, as if it meant to.
        this.react(now, 'happy', 1100, { x: 0, y: 0.1 });
        this.showFx(now, 'sparkle', 1400);
        if (this.random() < 0.5) this.cues.push({ kind: 'bubble', text: 'elegant' });
      } else {
        this.react(now, 'surprised', 700);
        this.hopUntil = now + HOP_MS;
        this.cues.push({ kind: 'event', event: 'landed' });
      }
      this.cues.push({ kind: 'gesture', role: 'land' });
    }
  }

  /** A hard landing: stars, and (VRM) sitting up rubbing its head; others look miserable a moment. */
  private landDazed(now: number) {
    this.hang = null;
    this.releasedAt = null;
    this.dizzyUntil = Math.max(this.dizzyUntil, now + DIZZY_MS);
    this.showFx(now, 'dizzy', DIZZY_MS);
    this.cues.push({ kind: 'bubble', text: 'dizzy' });
    if (this.floorSit) {
      this.recoverId += 1;
      this.recovering = { kind: 'back', id: this.recoverId, start: now };
      this.sitSide = this.random() < 0.5 ? -1 : 1;
      this.pickSeatPose(now);
      this.react(now, 'sad', RECOVER_MS('back'));
    } else {
      this.react(now, 'sad', DIZZY_MS);
    }
  }

  /** Whether it stands on another window's edge (from the physics). */
  setOnWindow(onWindow: boolean) {
    this.onWindow = onWindow;
    if (!onWindow && this.action?.kind === 'sit') this.action = null;
    // From the ground onto a window (or back): a seat of the other kind starts over.
    if (onWindow && this.action?.kind === 'sitFloor') this.action = null;
  }

  /** Whether a window's edge is within jumping reach (from the physics). */
  setCanJump(canJump: boolean) {
    this.canJump = canJump;
  }

  /** The caller started the planned jump: a hop to take off, then a happy leap until it lands. */
  jumped(now: number) {
    this.lastPointer = now;
    this.leaping = true;
    this.hopUntil = now + HOP_MS;
    this.nextActionAt = now + this.gap();
  }

  /** Whether the avatar has a sitting motion; without one it never sits. */
  setSitMotion(available: boolean) {
    this.sitMotion = available;
    if (!available && !this.floorSit && this.action?.kind === 'sit') this.action = null;
  }

  /** Posture from the menu; a chosen one ends what the figure was doing by itself. */
  setPose(pose: PetPose) {
    if (pose === 'sit' && this.pose !== 'sit') {
      this.sitSide = this.random() < 0.5 ? -1 : 1;
      this.pickSeatPose();
    }
    this.pose = pose;
    const own = this.action?.kind;
    if (pose !== 'auto' && (own === 'walk' || own === 'sit' || own === 'sitFloor') && !this.action?.come) this.action = null;
  }

  /** Seated because the menu says so (and the figure can): on a window's edge or the ground. */
  private get keptSeat(): PetSeat | null {
    if (this.pose !== 'sit' || !this.floorSit || !this.grounded || this.action?.kind === 'walk') return null;
    return this.onWindow ? 'edge' : 'floor';
  }

  /** Turn of a seated figure: to its side. */
  private seatTurn(seat: PetSeat | null): number {
    return seat ? this.sitSide * SIT_TURN : 0;
  }

  /** Whether the figure can sit on the ground (a VRM pose); without it, it only sits on edges. */
  setFloorSit(available: boolean) {
    this.floorSit = available;
    if (!available && this.action?.kind === 'sitFloor') this.action = null;
    if (!available && !this.sitMotion && this.action?.kind === 'sit') this.action = null;
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
  come(now: number, direction: -1 | 1, chase = false): boolean {
    if (!this.physics || !this.grounded || this.mode === 'dragged' || this.mode === 'falling' || this.onLedge) return false;
    // A game needs a free figure: not while it eats, gets up, reads or is busy otherwise.
    if (chase && (this.mode !== 'idle' || this.focus || this.peeking || this.attending || this.action?.come)) return false;
    this.lastPointer = now;
    this.mode = 'idle';
    this.talkUntil = 0;
    this.action = { kind: 'walk', start: now, end: now + (chase ? CHASE_MS : COME_MS), direction, come: true, chase };
    return true;
  }

  /** Walking to the pointer right now. */
  get coming(): boolean {
    return !!this.action?.come;
  }

  /** At the pointer (or there by a jump): ends the walk with a hop and a wave (caught it, in a chase). */
  arrived(now: number) {
    this.lastPointer = now;
    if (this.action?.chase) {
      this.action = null;
      this.react(now, 'happy', 1300, { x: 0, y: 0.2 });
      this.hopUntil = now + HOP_MS;
      this.cues.push({ kind: 'bubble', text: 'caught' });
      this.cues.push({ kind: 'gesture', role: 'happy' });
      this.cues.push({ kind: 'play' });
      this.nextActionAt = now + this.gap();
      return;
    }
    if (this.action?.come) this.action = null;
    if (this.mode === 'dozing') this.mode = 'idle';
    this.nextActionAt = now + this.gap();
    this.hopUntil = now + HOP_MS;
    this.cues.push({ kind: 'gesture', role: 'greeting' });
  }

  private startAction(now: number) {
    const pointerIdle = now - this.lastPointer > LOOK_AROUND_AFTER_MS;
    // Looking around only when the pointer rests; otherwise the figure looks after it.
    // Tiredness yawns more, dopamine hops and walks more, cortisol looks around restlessly; at
    // night the figure yawns more and stays calm (few hops, waves and walks).
    const { fatigue, dopamine, cortisol, night } = this.drive;
    // Fond of the user it is livelier and waves more.
    const lively = lift(dopamine) * (night ? 0.4 : 1) * (1 + this.affection * 0.08);
    // A posture chosen in the menu: no walking or sitting by itself.
    const free = this.pose === 'auto' && !this.peeking;
    const weights: [PetAction, number][] = [
      ['lookAround', pointerIdle ? 35 * (1 + above(cortisol) * 1.5) : 0],
      ['yawn', (now - this.lastPointer > 60_000 ? 25 : 10) * (1 + above(fatigue) * 2 + (night ? 1 : 0))],
      ['hop', 15 * lively],
      ['wave', 10 * (night ? 0.4 : 1) * (1 + this.affection * 0.15)],
      ['think', 15],
      ['nod', 10],
      ['walk', free && this.physics && this.grounded ? 30 * lively : 0],
      // On a window's edge it sits with the legs hanging (own pose, or a sitting motion) …
      ['sit', free && this.physics && this.onWindow && (this.sitMotion || this.floorSit) ? 25 : 0],
      // … on the ground with the knees drawn up (own pose), more often when tired.
      ['sitFloor', free && this.grounded && this.floorSit && !this.onWindow ? 14 * (1 + above(fatigue)) : 0],
      ['jump', free && this.physics && this.grounded && this.canJump ? 18 : 0],
      // Fond of the user, it now and then comes over by itself.
      ['visit', free && this.physics && this.grounded && this.affection >= VISIT_AFFECTION ? 4 + (this.affection - VISIT_AFFECTION) * 3 : 0],
      ['kick', free && this.physics && this.onWindow && this.kicks ? 6 : 0],
    ];
    const total = weights.reduce((sum, [, w]) => sum + w, 0);
    let pick = this.random() * total;
    const kind = weights.find(([, w]) => (pick -= w) < 0)?.[0] ?? 'hop';
    const action: RunningAction = { kind, start: now, end: now + DURATION[kind] };
    if (kind === 'walk') {
      action.direction = this.random() < 0.5 ? -1 : 1;
      action.end = now + WALK_MS[0] + this.random() * (WALK_MS[1] - WALK_MS[0]);
    }
    if (kind === 'sit' || kind === 'sitFloor') {
      action.end = now + SIT_MS[0] + this.random() * (SIT_MS[1] - SIT_MS[0]);
      this.sitSide = this.random() < 0.5 ? -1 : 1;
      this.pickSeatPose(now);
    }
    // Sitting on the ground it sometimes builds a sandcastle (more often when it is bored).
    if (kind === 'sitFloor' && this.builds && this.random() < 0.35 + this.boredom * 0.4) {
      this.buildId += 1;
      action.build = { id: this.buildId, side: this.sitSide === 1 ? -1 : 1 };
      action.end = Math.max(action.end, now + BUILD_MS + 6000);
    }
    if (kind === 'visit') this.cues.push({ kind: 'visit' });
    if (kind === 'kick') {
      this.hopUntil = now + HOP_MS;
      this.cues.push({ kind: 'kick', direction: this.random() < 0.5 ? -1 : 1 });
      this.cues.push({ kind: 'bubble', text: 'kick' });
    }
    if (kind === 'lookAround') {
      const side = this.random() < 0.5 ? -1 : 1;
      action.gazes = [
        { x: side * (0.5 + this.random() * 0.4), y: this.random() * 0.4 - 0.1 },
        { x: -side * (0.4 + this.random() * 0.4), y: this.random() * 0.3 },
        { x: 0, y: 0 },
      ];
    }
    if (kind === 'hop' || kind === 'wave') this.hopUntil = now + HOP_MS;
    if (kind === 'jump') this.cues.push({ kind: 'jump' });
    if (kind === 'sit') this.cues.push({ kind: 'event', event: 'sat' });
    const gesture: Partial<Record<PetAction, MotionRole>> = { wave: 'greeting', think: 'thinking', nod: 'nod', yawn: 'yawn' };
    if (gesture[kind]) this.cues.push({ kind: 'gesture', role: gesture[kind] });
    this.action = action;
  }

  private actionFrame(now: number): Pick<PetFrame, 'expression' | 'gaze' | 'mouth'> {
    const action = this.action;
    if (!action) return { expression: null, gaze: null, mouth: 0 };
    if (action.kind === 'walk') {
      // Chasing the pointer it is having fun.
      return { expression: action.chase ? 'happy' : null, gaze: { x: action.direction! * 0.5, y: -0.1 }, mouth: 0 };
    }
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
      case 'kick':
        return { expression: 'happy', gaze: { x: 0, y: -0.5 }, mouth: 0 };
      default:
        return { expression: null, gaze: null, mouth: 0 };
    }
  }

  /**
   * The pet's menu is open around the figure: it stops what it was doing (walking, sitting by
   * itself) and starts nothing new until `endAttend`; it keeps looking after the pointer.
   */
  attend(now: number) {
    this.lastPointer = now;
    this.attending = true;
    if (this.mode === 'dozing') this.mode = 'idle';
    if (!this.action?.come) this.action = null;
  }

  /** The menu is closed: idle actions may come again after the usual pause. */
  endAttend(now: number) {
    if (!this.attending) return;
    this.attending = false;
    this.lastPointer = now;
    this.nextActionAt = Math.max(this.nextActionAt, now + this.gap());
  }

  /** Peeking in from the side (the caller walks it there with `come`): no random walks or sitting meanwhile. */
  setPeeking(on: boolean) {
    this.peeking = on;
    if (!on && this.action?.come) this.action = null;
  }

  /** The figure dances to music right now (the window then keeps inside the screen). */
  get dancing() {
    return this.dancingNow;
  }

  /** Hanging: the grip, and folded over the hand it turns sideways (seen in profile). */
  private hangFrame(): Pick<PetFrame, 'hang' | 'turn'> {
    const hang = this.hang;
    return { hang, turn: hang?.grip === 'hip' ? (hang.at.x < 0 ? -HANG_HIP_TURN : HANG_HIP_TURN) : 0 };
  }

  /**
   * Getting up: startled at the impact, then it sits rubbing its head or back (sad, looking
   * down), relieved at the end. Landing on the feet is only a startled crouch.
   */
  private recoverFrame(now: number, recovering: PetRecover & { start: number }): Pick<PetFrame, 'expression' | 'gaze' | 'recover' | 'turn'> {
    const elapsed = now - recovering.start;
    const recover = { kind: recovering.kind, id: recovering.id };
    if (recovering.kind === 'feet') return { expression: elapsed < 500 ? 'surprised' : 'relaxed', gaze: null, recover, turn: 0 };
    const phases = RECOVER_PHASES[recovering.kind];
    // Seated it turns to the side like any floor seat (the knees do not point at the camera).
    const turn = elapsed >= phases.impact * 1000 && elapsed < phases.rub * 1000 ? this.sitSide * SIT_TURN : 0;
    if (elapsed < phases.settle * 1000) return { expression: 'surprised', gaze: { x: 0, y: -0.2 }, recover, turn };
    if (elapsed < phases.rub * 1000) return { expression: 'sad', gaze: { x: 0, y: -0.45 }, recover, turn };
    return { expression: 'relaxed', gaze: null, recover, turn };
  }

  /** Focus started (or it got up): sit down where it stands to read, if it can sit there. */
  private sitToRead(now: number) {
    const canEdge = this.physics && this.onWindow && (this.sitMotion || this.floorSit);
    const canFloor = this.grounded && this.floorSit && !this.onWindow;
    if (!canEdge && !canFloor) return;
    this.sitSide = this.random() < 0.5 ? -1 : 1;
    this.pickSeatPose(now);
    this.action = { kind: canEdge ? 'sit' : 'sitFloor', start: now, end: Number.POSITIVE_INFINITY };
  }

  /** The hands: a timed pose first, else a letter held out, else the book in focus. */
  private handsFrame(frame: PetFrame): PetHands | null {
    if (frame.hang || frame.recover || frame.eat) return null;
    if (this.handPose) return { kind: this.handPose.kind, id: this.handPose.id };
    if (this.carryId !== null && frame.mode !== 'dragged' && frame.mode !== 'falling') return { kind: 'carry', id: this.carryId };
    if (this.readId !== null && frame.mode !== 'dragged' && frame.mode !== 'falling' && frame.mode !== 'walking') {
      return { kind: 'read', id: this.readId };
    }
    return null;
  }

  /** Advances to `now` and returns the frame plus the one-time cues since the last tick. */
  tick(now: number): { frame: PetFrame; cues: PetCue[] } {
    // Let go near the ground (no fall): it still drops out of the hanging pose.
    if (this.hang && this.releasedAt !== null && this.mode !== 'falling' && now - this.releasedAt > HANG_RELEASE_MS) {
      this.landFromHang(now, 0);
    }
    if (this.recovering && now >= this.recovering.start + RECOVER_MS(this.recovering.kind)) this.recovering = null;
    // The meal is over: delighted, a hop and a happy gesture.
    const eating = this.eating;
    if (eating && now >= eating.start + EAT_TOTAL_S * 1000) {
      this.eating = null;
      if (this.mode === 'reacting') {
        if (eating.taste === 'disliked') {
          // Not its thing: a pulled face, no hop.
          this.react(now, 'sad', 1300, { x: 0, y: -0.1 });
        } else if (eating.taste === 'again') {
          this.react(now, 'relaxed', 1000, { x: 0, y: 0.1 });
        } else {
          this.react(now, 'happy', eating.taste === 'favorite' ? 1800 : 1200, { x: 0, y: 0.1 });
          this.hopUntil = now + HOP_MS;
          this.cues.push({ kind: 'gesture', role: 'happy' });
          if (eating.taste === 'favorite') this.showFx(now, 'hearts', 2400);
        }
      }
    }
    if (this.mode === 'reacting' && now >= this.modeUntil) this.mode = 'idle';
    const talking = this.speaking || now < this.talkUntil;
    if (this.mode === 'idle' || this.mode === 'talking') this.mode = talking ? 'talking' : 'idle';
    if (this.mode === 'idle' && !this.focus && now - this.lastPointer > this.dozeAfter()) {
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
    } else if (this.focus) {
      // Focus: it sits down to read (where it can) and starts nothing else.
      if (!this.action && !this.attending) this.sitToRead(now);
    } else if (!this.action && this.idleActions && !this.saving && !this.attending && now >= this.nextActionAt) {
      this.startAction(now);
    }
    // Held by the collar or a hand a while: it says so (once per grab).
    if (this.mode === 'dragged' && !this.dangleSaid && (this.hang?.grip === 'shoulder' || this.hang?.grip === 'hand')) {
      if (now - this.dragSince >= DANGLE_SAY_MS) {
        this.dangleSaid = true;
        this.cues.push({ kind: 'bubble', text: 'dangle' });
      }
    }
    if (this.handPose && now >= this.handPose.start + HAND_POSE_S[this.handPose.kind] * 1000) this.handPose = null;
    if (this.fx && now >= this.fx.until) this.fx = null;

    const still = {
      mouth: 0,
      hop: false,
      walk: 0 as const,
      turn: 0,
      loop: null,
      seat: null,
      seatPose: null as SeatPose | null,
      hang: null,
      recover: null,
      eat: null,
      hands: null,
      fx: null,
      build: null,
    };
    const kept = this.keptSeat;
    let frame: PetFrame;
    switch (this.mode) {
      case 'dozing':
        frame = { ...still, mode: 'dozing', expression: 'relaxed', gaze: { x: 0, y: -0.8 }, loop: 'sleep', seat: kept, turn: this.seatTurn(kept) };
        break;
      case 'dragged': {
        // Scraped over the floor: cross while pulled, sulking while it lies still; head down a
        // while it gets unhappy; otherwise startled.
        const scraped = this.groundDrag && now - this.groundMovedAt < 600;
        const expression = this.groundDrag
          ? scraped
            ? 'angry'
            : 'sad'
          : this.upsideSince !== null && now - this.upsideSince > UPSIDE_DOWN_MS
            ? 'sad'
            : 'surprised';
        // Lying, it looks up at the hand holding its foot.
        const gaze = this.groundDrag ? { x: 0, y: 0.45 } : { x: 0, y: -0.6 };
        frame = { ...still, mode: 'dragged', expression, gaze, loop: 'fall', ...this.hangFrame() };
        break;
      }
      case 'falling':
        frame = this.leaping
          ? { ...still, mode: 'falling', expression: 'happy', gaze: null, loop: 'fall' }
          : { ...still, mode: 'falling', expression: 'surprised', gaze: { x: 0, y: -0.7 }, loop: 'fall', ...this.hangFrame() };
        break;
      case 'reacting':
        frame = this.recovering
          ? { ...still, mode: 'reacting', ...this.recoverFrame(now, this.recovering) }
          : this.hang
            ? { ...still, mode: 'reacting', expression: 'surprised', gaze: { x: 0, y: -0.6 }, ...this.hangFrame() }
            : { ...still, mode: 'reacting', expression: this.reactExpression, gaze: this.reactGaze, seat: kept, turn: this.seatTurn(kept) };
        break;
      case 'talking':
        frame = { ...still, mode: 'talking', expression: null, gaze: null, loop: 'talk', seat: kept, turn: this.seatTurn(kept) };
        break;
      default: {
        const direction = this.action?.kind === 'walk' ? this.action.direction! : 0;
        // On an edge a VRM figure sits with its own pose; others play their sitting motion.
        const edge = this.action?.kind === 'sit';
        const sitting = edge && !this.floorSit;
        const seat: PetSeat | null = this.action?.kind === 'sitFloor' ? 'floor' : edge && this.floorSit ? 'edge' : kept;
        const swaying = this.music && !this.action && !this.saving;
        frame = {
          ...still,
          ...this.actionFrame(now),
          // Listening to music: relaxed, the head dips on each beat.
          ...(swaying ? { expression: 'relaxed', gaze: now < this.beatUntil ? { x: 0, y: -0.55 } : null } : {}),
          mode: direction ? 'walking' : sitting || seat ? 'sitting' : 'idle',
          seat,
          walk: direction,
          turn: direction ? direction * WALK_TURN : this.seatTurn(seat),
          // Music without anything else to do: it dances (with a dance motion; otherwise it nods along).
          loop: direction ? 'walk' : sitting ? 'sit' : swaying ? 'dance' : null,
        };
      }
    }
    this.dancingNow = frame.loop === 'dance';
    // Hanging from a ledge the legs dangle (the falling loop, where the figure has one).
    if (this.onLedge) frame.loop = 'fall';
    frame.hands = this.handsFrame(frame);
    frame.fx = this.fx ? { kind: this.fx.kind, id: this.fx.id } : null;
    frame.build = this.mode === 'idle' && this.action?.kind === 'sitFloor' ? (this.action.build ?? null) : null;
    // Dazed in the air (squashed against a side): it looks miserable while it falls.
    if (this.mode === 'falling' && now < this.dizzyUntil) frame.expression = 'sad';
    // Eating: the same mouth path as a yawn chews; the viewer brings the food to the mouth.
    if (this.eating && this.mode === 'reacting') {
      frame.eat = this.eating;
      frame.mouth = eatMouth((now - this.eating.start) / 1000);
    }
    frame.hop = now < this.hopUntil && this.mode !== 'dragged';
    if (frame.seat !== null) {
      if (this.nextPoseShiftAt === 0 || !Number.isFinite(this.nextPoseShiftAt)) {
        this.nextPoseShiftAt = now + 45_000 + this.random() * 25_000;
      } else if (now >= this.nextPoseShiftAt) {
        this.pickSeatPose(now);
      }
      frame.seatPose = frame.seat === 'edge' ? this.edgePose : this.floorPose;
    } else {
      this.nextPoseShiftAt = Number.POSITIVE_INFINITY;
      frame.seatPose = null;
    }
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

/** Where the speech bubble leans: towards the screen's middle when the figure stands near an edge. */
export type BubbleSide = 'left' | 'center' | 'right';
/** Outer share of the monitor's width on each side in which the bubble leans inwards. */
const BUBBLE_EDGE_SHARE = 0.3;

/** The bubble's side for a figure whose middle is at `x` on a monitor area starting at `left`. */
export function bubbleSide(x: number, left: number, width: number): BubbleSide {
  if (width <= 0) return 'center';
  const share = (x - left) / width;
  if (share < BUBBLE_EDGE_SHARE) return 'right';
  if (share > 1 - BUBBLE_EDGE_SHARE) return 'left';
  return 'center';
}

/** How long a reply stays in the bubble: long enough to read, 4–12 s. */
export const bubbleMs = (text: string) => Math.min(12_000, Math.max(4000, 800 + text.length * 55));
