import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { emitTo, listen } from '@tauri-apps/api/event';
import { currentMonitor, getCurrentWindow, LogicalSize, PhysicalPosition } from '@tauri-apps/api/window';
import type { PetFigure } from '../avatar/avatarStage';
import { StrokeDetector } from './petStroke';
import { openGuestMenu } from './pet/PetMenu';
import { atMouth, EAT_DWELL_MS, FEED_TIMEOUT_MS, type PetFood } from './petFood';
import { advance, loadTimer, saveTimer, startPomodoro, startTimer, type PetTimerState } from './petTimer';
import type { PetEvent } from '../../types/generated/PetEvent';
import { useAppStore, useStoreFields } from '../../store/useAppStore';
import { useTranslation, type TranslationKey } from '../../i18n';
import { api } from '../../services/api';
import { errorMessage } from '../../utils/errors';
import { NOTIFICATION_OPEN_CHAT_EVENT } from '../../services/notifications';
import { audioPlayer } from '../../services/audioPlayer';
import {
  clearActiveSpeechTimeline,
  setActiveSpeechTimeline,
  SILENT_VISEMES,
  visemesFromDesktopLevel,
} from '../../services/lipSync';
import { PetBubble } from './PetBubble';
import {
  bubbleMs,
  eyeLine,
  gripAt,
  hangAnchor,
  headZoneEnd,
  HOLD_HAND_MS,
  isNightHour,
  NEUTRAL_DRIVE,
  PetBehavior,
  touchZoneAt,
  type BubbleSide,
  type Gaze,
  type PetDrive,
  type PetHang,
  type PetMode,
  type PetRecover,
  type PetSeat,
  type SeatPose,
  type TouchZone,
} from './petBehavior';
import type { GestureRequest, LoopRole } from '../../utils/avatarGestures';
import type { MotionPackItem } from '../../types/generated/MotionPackItem';
import { DEFAULT_PET_FRAMING, PET_FEET_SHARE, petFigureTop, type PetFraming } from '../../services/avatarViewState';
import {
  loadPetFraming,
  loadPetModelHeight,
  loadPetPrefs,
  PET_AUDIO_EVENT,
  PET_BEAT_EVENT,
  PET_COME_EVENT,
  PET_CURSOR_EVENT,
  PET_DESKTOP_AUDIO_EVENT,
  PET_LABEL,
  GUEST_LABEL,
  PET_TEST_HANG_EVENT,
  PET_FRAMING_EVENT,
  PET_HELLO_EVENT,
  PET_MOTIONS_EVENT,
  PET_MUSIC_EVENT,
  PET_PLATFORMS_EVENT,
  PET_PREFS_EVENT,
  PET_GUEST_READY_EVENT,
  PET_READY_EVENT,
  IS_GUEST_PET,
  PET_RESIZE_EVENT,
  PET_SAY_EVENT,
  PET_REMARK_EVENT,
  PET_SCREEN_EVENT,
  PET_SEND_EVENT,
  PET_SENTENCE_EVENT,
  PET_STATE_EVENT,
  petModelPath,
  listenOwn,
  loadHiddenParts,
  saveHiddenParts,
  savePetPrefs,
  smoothColor,
  toggledPart,
  watchOnBattery,
  type PetAmbient,
  type PetAudioFrame,
  type PetCursor,
  type PetFramingChange,
  type PetPrefs,
  type PetSay,
  type PetRemark,
  type PetScreen,
  type PetSentence,
  type PetState,
  type PetTestHang,
} from '../../services/desktopPet';
import { type Platform } from './petPhysics';
import {
  BEHAVIOR_TICK_MS,
  BUBBLE_AFTER_VOICE_MS,
  BUBBLE_MS,
  DRAG_THRESHOLD,
  PROACTIVE_BUBBLE_MS,
  REMARK_GAP_MS,
  AMBIENT_POLL_MS,
  PEEK_MS,
  GUEST_ASK_MS,
  PROGRAM_DWELL_MS,
  PROGRAM_GAP_MS,
  HANG_ASPECT,
  SIT_DROP,
  STATUS_POLL_MS,
  clamp,
  seatDrop,
  within,
} from './pet/petConstants';
import { PetComposeForm } from './pet/PetComposeForm';
import { PetStatusCard } from './pet/PetStatusCard';
import { openPetContextMenu } from './pet/PetMenu';
import { buildPetMenu, type PetMenuArgs, type PetMenuItem } from './pet/petMenuModel';
import { PetRadialMenu } from './pet/PetRadialMenu';
import { PetSettingsCard } from './pet/PetSettingsCard';
import { MIN_OPEN_SPAN, openArc, radialRings, radialWidth, type VisibleBox } from './pet/radialLayout';
import { lacksPetMotions, recommendedMotionPack } from '../../utils/motionPacks';
import { PetFigureCanvas } from './pet/PetFigureCanvas';
import { usePetWindowPhysics } from './pet/usePetWindowPhysics';

/** The grip at a press (logical px in the window) and where the grabbed part then hangs (see `HangPoint`). */
function grabbedAt(press: { cx: number; cy: number }, framing: PetFraming, drop: number): PetHang {
  const { innerWidth: width, innerHeight: height } = window;
  const at = { x: (press.cx - width / 2) / height, y: press.cy / height };
  const top = petFigureTop(framing);
  // Seated, the figure is drawn lower (and squatter): the grip is read as if it stood.
  const grip = gripAt(at.y - drop, top, 1 - PET_FEET_SHARE - framing.lift - drop);
  return { grip, at, anchor: hangAnchor(grip, at, top) };
}

/**
 * Makes room for the hanging figure and puts the grabbed part under the pointer: the window
 * widens to `HANG_ASPECT` (same height, so the figure keeps its size and stays in the middle;
 * it swings and turns over sideways) and moves by the way from the grip to where that part is
 * drawn. Returns the width it had (logical px) when it widened, to go back to it later.
 */
async function openForHang(held: PetHang | null): Promise<number | null> {
  if (!held) return null;
  const { innerWidth: width, innerHeight: height } = window;
  const wide = Math.max(width, Math.round(height * HANG_ASPECT));
  const win = getCurrentWindow();
  const [position, factor, monitor] = await within(
    Promise.all([win.outerPosition(), win.scaleFactor(), currentMonitor().catch(() => null)]),
  );
  if (wide > width) await within(win.setSize(new LogicalSize(wide, height)));
  const dx = width / 2 + held.at.x * height - (wide / 2 + held.anchor.x * height);
  const dy = (held.at.y - held.anchor.y) * height;
  let nextX = Math.round(position.x + dx * factor);
  let nextY = Math.round(position.y + dy * factor);
  if (monitor) {
    const { position: at, size: extent } = monitor.workArea;
    const maxX = Math.max(at.x, at.x + extent.width - wide * factor);
    const maxY = Math.max(at.y, at.y + extent.height - height * factor);
    nextX = Math.round(Math.max(at.x, Math.min(maxX, nextX)));
    nextY = Math.round(Math.max(at.y, Math.min(maxY, nextY)));
  }
  await within(win.setPosition(new PhysicalPosition(nextX, nextY)));
  return wide > width ? width : null;
}

/** Back to the width before hanging, keeping the middle where it is. */
async function closeAfterHang(width: number) {
  const win = getCurrentWindow();
  const [position, size, factor] = await within(Promise.all([win.outerPosition(), win.innerSize(), win.scaleFactor()]));
  await within(win.setSize(new LogicalSize(width, size.height / factor)));
  await within(win.setPosition(new PhysicalPosition(Math.round(position.x + (size.width - width * factor) / 2), position.y)));
}

/** The settings card wants at least this much window width (logical px). */
const SETTINGS_WIDTH = 300;
/** The settings card is at most this wide (logical px). */
const SETTINGS_CARD_MAX = 284;

/** The window as the menu widened it: its width and height and the part on the screen (logical px). */
interface MenuSpread {
  /** The pet's own width before; the figure keeps it, centred. */
  baseWidth: number;
  width: number;
  height: number;
  visible: VisibleBox;
}

/**
 * Widens (or narrows) the window to `target` around its middle, keeping its height, so the
 * figure stays where it is on the screen. Not kept inside the work area (like peeking): the part
 * off the screen is reported instead, and the ring opens towards the rest.
 */
async function spreadWindow(target: number): Promise<Omit<MenuSpread, 'baseWidth'>> {
  const win = getCurrentWindow();
  const [position, size, factor, monitor] = await within(
    Promise.all([win.outerPosition(), win.innerSize(), win.scaleFactor(), currentMonitor().catch(() => null)]),
  );
  const width = size.width / factor;
  const height = size.height / factor;
  const shift = Math.round(((target - width) / 2) * factor);
  if (Math.abs(target - width) >= 1) {
    await within(win.setSize(new LogicalSize(target, height)));
    await within(win.setPosition(new PhysicalPosition(position.x - shift, position.y)));
  }
  const x = position.x - shift;
  let visible: VisibleBox = { left: 0, top: 0, right: target, bottom: height };
  if (monitor) {
    const { position: at, size: extent } = monitor.workArea;
    visible = {
      left: Math.max(0, (at.x - x) / factor),
      top: Math.max(0, (at.y - position.y) / factor),
      right: Math.min(target, (at.x + extent.width - x) / factor),
      bottom: Math.min(height, (at.y + extent.height - position.y) / factor),
    };
  }
  return { width: target, height, visible };
}

/**
 * The desktop pet window (`index.html?pet=true`): the active avatar on a transparent window.
 * Clicks go through everywhere except on the figure and the pet's own panels; pressing and
 * moving drags the window, a click pats, right click opens the menu.
 */
export const DesktopPet: React.FC = () => {
  const { t, tEmotion, tOptional, currentLanguage } = useTranslation();
  const { companionState, fetchCompanionState, applyHormoneInteraction: storeHormone, requestToolCall, toggleDesktopPet } =
    useStoreFields('companionState', 'fetchCompanionState', 'applyHormoneInteraction', 'requestToolCall', 'toggleDesktopPet');
  /** The guest is only decoration: touching it changes nothing about the companion. */
  const applyHormoneInteraction = useCallback(
    async (type: string) => {
      if (!IS_GUEST_PET) await storeHormone(type);
    },
    [storeHormone],
  );
  const [pet, setPet] = useState<PetState | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [gesture, setGesture] = useState<GestureRequest | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  /** Quick chat: a small input on the pet that writes into the active chat. */
  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [bubble, setBubble] = useState<{ text: string; ms: number; chat: PetSay['chat'] | null } | null>(null);
  /** Where the bubble leans (towards the screen's middle near an edge). */
  const [bubbleSideNow, setBubbleSideNow] = useState<BubbleSide>('center');
  const [prefs, setPrefs] = useState<PetPrefs>(loadPetPrefs);
  const [behavior] = useState(() => new PetBehavior(performance.now()));
  const [mode, setMode] = useState<PetMode>('idle');
  const [faceOverride, setFaceOverride] = useState<string | null>(null);
  /** Face of the sentence the voice is reading right now. */
  const [sentenceFace, setSentenceFace] = useState<string | null>(null);
  const sentenceTimer = useRef<number | null>(null);
  const [hop, setHop] = useState(false);
  const [walking, setWalking] = useState(false);
  const [loop, setLoop] = useState<LoopRole | null>(null);
  /** Sitting on the ground (VRM pose of its own). */
  const [seat, setSeat] = useState<PetSeat | null>(null);
  const [seatPose, setSeatPose] = useState<SeatPose | null>(null);
  const seatRef = useRef<PetSeat | null>(null);
  const sittingRef = useRef(false);
  /** Held up from where it was grabbed, and getting up after a hard landing (VRM poses). */
  const [hang, setHang] = useState<PetHang | null>(null);
  const [recover, setRecover] = useState<PetRecover | null>(null);
  /** The window's width before it widened for hanging (logical px); null when it has its own width. */
  const widenedFrom = useRef<number | null>(null);
  const modelPath = pet ? petModelPath(pet, prefs.figure) : '';
  /** The shown model, whose size a resize remembers. */
  const modelRef = useRef(modelPath);
  /** Live framing overrides broadcast by the avatar manager while the model stays shown. */
  const [framingOverride, setFramingOverride] = useState<{ modelPath: string; framing: PetFraming } | null>(null);
  const framing = useMemo(
    () =>
      framingOverride?.modelPath === modelPath
        ? framingOverride.framing
        : modelPath
          ? loadPetFraming(modelPath)
          : DEFAULT_PET_FRAMING,
    [framingOverride, modelPath],
  );
  /** The shown model's framing synced for imperative callbacks (`onStage`). */
  const framingRef = useRef<PetFraming>(framing);
  const figureRef = useRef<HTMLDivElement>(null);
  /** Where the pointer would have the figure look; the behaviour may look elsewhere. */
  const pointerGaze = useRef<Gaze>({ x: 0, y: 0 });
  const gazeOverride = useRef<Gaze | null>(null);
  const speakingRef = useRef(false);
  const mouthOpen = useRef(false);
  const desktopLipActive = useRef(false);
  const prefsRef = useRef(prefs);
  /** Fullscreen window or lock screen in front: the pet steps back (not drawn, no clicks, no moves). */
  const [screen, setScreen] = useState<PetScreen>({ fullscreen: false, locked: false, focus: 0, ignored: false });
  const away = screen.locked || screen.ignored || (screen.fullscreen && prefs.hideInFullscreen);
  const awayRef = useRef(away);
  /** Last word from the backend whether clicks may go through (false: Wayland session). */
  const throughRef = useRef(true);
  const stageRef = useRef<PetFigure | null>(null);
  const ignoreRef = useRef<boolean | null>(null);
  /** Pressed on the pet: click-through stays off until released. */
  const holdRef = useRef(false);
  /** Peeking in from a screen side (-1 left, 1 right, 0 not). */
  const peekRef = useRef<-1 | 0 | 1>(0);
  const [peeking, setPeeking] = useState(false);
  const lastRemarkAt = useRef(Number.NEGATIVE_INFINITY);
  /** Recognises stroking (pointer wiggling over the figure). */
  const strokeRef = useRef(new StrokeDetector());
  const pressRef = useRef<{
    x: number;
    y: number;
    /** Where in the window it was pressed (logical px). */
    cx: number;
    cy: number;
    dragging: boolean;
    /** Pressed on one of the figure's hands. */
    hand: boolean;
    /** Held long enough on the hand: the figure holds hands. */
    holding: boolean;
    holdTimer?: number;
  } | null>(null);
  const bubbleTimer = useRef<number | null>(null);
  const localGestureId = useRef(0);

  const {
    syncWindow,
    beginDrag,
    settleDrag,
    trackWindowMoved,
    recordCursorMove,
    setPlatforms,
    setWalkDirection,
    readBubbleSide,
    currentHeight,
    holdWindow,
    nearestWall,
    startJump,
    comeHere,
    resizeTo,
  } = usePetWindowPhysics({
    behavior,
    prefsRef,
    awayRef,
    stageRef,
    figureRef,
    seatRef,
    modelRef,
    peekRef,
  });

  // Hanging and getting up are over: the window goes back to its own width (the physics re-reads it).
  useEffect(() => {
    const width = widenedFrom.current;
    if (width === null || hang || recover || mode === 'dragged' || mode === 'falling') return;
    widenedFrom.current = null;
    void closeAfterHang(width)
      .catch(() => {})
      .finally(() => void syncWindow().catch(() => {}));
  }, [hang, recover, mode, syncWindow]);

  /** Where the head ends in the window now: from the figure, lower while it sits. */
  const headEnd = useCallback(
    () =>
      headZoneEnd(stageRef.current?.headLine() ?? null, sittingRef.current ? SIT_DROP : seatDrop(seatRef.current)),
    [],
  );

  const setIgnore = useCallback((ignore: boolean) => {
    if (ignore && holdRef.current) return;
    if (ignoreRef.current === ignore) return;
    ignoreRef.current = ignore;
    // Visible to tests: whether clicks go through to the desktop right now.
    document.documentElement.dataset.petClickThrough = String(ignore);
    void getCurrentWindow().setIgnoreCursorEvents(ignore).catch(() => {});
  }, []);

  const say = useCallback((text: string, ms = BUBBLE_MS, chat: PetSay['chat'] | null = null) => {
    setBubble({ text, ms, chat });
    if (bubbleTimer.current !== null) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
  }, []);

  const playLocalGesture = useCallback((role: GestureRequest['role']) => {
    // Negative ids never meet the main window's counter.
    localGestureId.current -= 1;
    setGesture({ role, id: localGestureId.current });
  }, []);

  // The menu around the figure (ring, then the settings card behind "More"). For it the window
  // widens around the figure and holds still; closing restores its width and lets the physics on.
  const [overlay, setOverlay] = useState<'radial' | 'settings' | null>(null);
  const overlayRef = useRef<'radial' | 'settings' | null>(null);
  const [spread, setSpread] = useState<MenuSpread | null>(null);
  /** Set from the moment the menu starts opening until the window has its own width again. */
  const spreadRef = useRef<MenuSpread | null>(null);
  /** Opening and closing run one after the other (each moves the window). */
  const menuQueue = useRef<Promise<unknown>>(Promise.resolve());
  const menuClosing = useRef(false);
  /** A resize asked for while the menu holds the window; done after it closes. */
  const pendingHeight = useRef<number | null>(null);
  /** The left button's last state, to see a new click outside the menu. */
  const lastButton = useRef<boolean | null>(null);
  const queueMenu = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const next = menuQueue.current.then(job, job);
    menuQueue.current = next.catch(() => {});
    return next;
  }, []);

  const closeMenu = useCallback(
    (): Promise<void> => {
      if (!spreadRef.current || menuClosing.current) return menuQueue.current.then(() => {});
      menuClosing.current = true;
      overlayRef.current = null;
      setOverlay(null);
      return queueMenu(async () => {
        const held = spreadRef.current;
        if (held) await spreadWindow(held.baseWidth).catch(() => {});
        spreadRef.current = null;
        setSpread(null);
        holdWindow(false);
        behavior.endAttend(performance.now());
        menuClosing.current = false;
        await syncWindow().catch(() => {});
        const height = pendingHeight.current;
        pendingHeight.current = null;
        if (height !== null) await resizeTo(height);
      });
    },
    [behavior, holdWindow, queueMenu, resizeTo, syncWindow],
  );

  /** Resizes now, or after the menu let go of the window. */
  const resizePet = useCallback(
    async (height: number) => {
      if (spreadRef.current) {
        pendingHeight.current = height;
        return;
      }
      await resizeTo(height);
    },
    [resizeTo],
  );

  useEffect(() => {
    prefsRef.current = prefs;
    behavior.setIdleActions(prefs.idleActions);
    behavior.setPose(prefs.pose);
    stageRef.current?.setFrameRate(prefs.frameRate);
    behavior.setPhysics(prefs.physics);
    if (prefs.physics) void syncWindow().catch(() => {});
    // The guest only reads the switches; saving or announcing them is the pet's job.
    if (IS_GUEST_PET) return;
    savePetPrefs(prefs);
    void api.setPetIgnoredApps(prefs.ignoredApps).catch(() => {});
    // The Desktop-Pet tab shows the same switches.
    void emitTo('main', PET_PREFS_EVENT, prefs).catch(() => {});
  }, [behavior, prefs, syncWindow]);

  // The cue texts follow the language without restarting the behaviour timer.
  /** Asks the main window for a model line about an event (switch on, not while talking, with a pause between). */
  const askRemark = useCallback((event: PetEvent, now: number) => {
    if (IS_GUEST_PET || !prefsRef.current.eventRemarks || !prefsRef.current.chatBubbles || speakingRef.current) return;
    if (now - lastRemarkAt.current < REMARK_GAP_MS) return;
    lastRemarkAt.current = now;
    void emitTo('main', PET_REMARK_EVENT, { event } satisfies PetRemark).catch(() => {});
  }, []);
  // `t` is a new function on every render; effects and callbacks that only need the current texts read it here.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  });
  /** The alarm (timer or pomodoro), kept across restarts of the pet. */
  const [alarm, setAlarm] = useState<PetTimerState | null>(loadTimer);
  const timerRef = useRef(alarm);
  const startAlarm = useCallback((kind: 'timer' | 'pomodoro', minutes = 0) => {
    const next = kind === 'pomodoro' ? startPomodoro(Date.now()) : startTimer(minutes, Date.now());
    timerRef.current = next;
    saveTimer(next);
    setAlarm(next);
  }, []);
  const stopAlarm = useCallback(() => {
    timerRef.current = null;
    saveTimer(null);
    setAlarm(null);
  }, []);
  // When a phase ends the figure wakes up, waves and says so; during fullscreen it waits.
  useEffect(() => {
    if (IS_GUEST_PET) return undefined;
    const check = window.setInterval(() => {
      if (!timerRef.current || awayRef.current) return;
      const { state, finished } = advance(timerRef.current, Date.now());
      if (!finished) return;
      timerRef.current = state;
      saveTimer(state);
      setAlarm(state);
      behavior.announce(performance.now());
      const key = finished === 'work' ? 'pet.pomodoroBreak' : finished === 'break' ? 'pet.pomodoroWork' : 'pet.timerDone';
      say(tRef.current(key), PROACTIVE_BUBBLE_MS);
    }, 2000);
    return () => window.clearInterval(check);
  }, [behavior, say]);
  // The lights take the desktop's colours (only while shown, a second apart; off: studio colours).
  useEffect(() => {
    if (!prefs.ambientLight) {
      stageRef.current?.setAmbientTint?.(null, null);
      return undefined;
    }
    let colors: PetAmbient | null = null;
    let live = true;
    const read = () => {
      if (awayRef.current) return;
      void api
        .samplePetAmbient()
        .then((next) => {
          if (!live || !next) return;
          colors = colors
            ? { left: smoothColor(colors.left, next.left, 0.5), right: smoothColor(colors.right, next.right, 0.5) }
            : next;
          stageRef.current?.setAmbientTint?.(colors.left, colors.right);
        })
        .catch(() => {});
    };
    read();
    const timer = window.setInterval(read, AMBIENT_POLL_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [prefs.ambientLight]);
  // The guest asks the main window for its figure until it has one (an answer sent while it was
  // still loading is lost; asking again is cheap, the main window sends the figure each time).
  const hasFigure = pet !== null;
  useEffect(() => {
    if (!IS_GUEST_PET || hasFigure) return undefined;
    const ask = window.setInterval(() => void emitTo('main', PET_GUEST_READY_EVENT).catch(() => {}), GUEST_ASK_MS);
    return () => window.clearInterval(ask);
  }, [hasFigure]);
  /** Peeking: walks to the nearer screen side and slides half out of view until clicked, dragged or `PEEK_MS`. */
  const endPeek = useCallback(() => {
    if (peekRef.current === 0) return;
    peekRef.current = 0;
    setPeeking(false);
    behavior.setPeeking(false);
  }, [behavior]);
  const startPeek = useCallback(() => {
    const wall = nearestWall();
    if (!wall || !prefsRef.current.physics) return;
    behavior.setPeeking(true);
    if (!behavior.come(performance.now(), wall)) {
      behavior.setPeeking(false);
      return;
    }
    peekRef.current = wall;
    setPeeking(true);
  }, [behavior, nearestWall]);
  useEffect(() => {
    if (!peeking) return undefined;
    const timer = window.setTimeout(endPeek, PEEK_MS);
    return () => window.clearTimeout(timer);
  }, [peeking, endPeek]);
  // The same program in front for a while (never its title or content): the pet may comment on it.
  const lastProgramAt = useRef(Number.NEGATIVE_INFINITY);
  const lastProgram = useRef('');
  useEffect(() => {
    if (IS_GUEST_PET || !prefs.commentPrograms || !prefs.chatBubbles || screen.ignored || screen.locked || screen.focus === 0) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      const now = performance.now();
      if (awayRef.current || speakingRef.current || now - lastProgramAt.current < PROGRAM_GAP_MS) return;
      void api
        .getPetLastApp()
        .then((app) => {
          if (!app || app === lastProgram.current || !prefsRef.current.commentPrograms) return;
          lastProgram.current = app;
          lastProgramAt.current = performance.now();
          void emitTo('main', PET_REMARK_EVENT, { event: 'program', detail: app } satisfies PetRemark).catch(() => {});
        })
        .catch(() => {});
    }, PROGRAM_DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [prefs.commentPrograms, prefs.chatBubbles, screen.focus, screen.ignored, screen.locked]);
  /** The food on the pointer (null: not feeding), when it reached the mouth, and where it is drawn. */
  const feedRef = useRef<{ food: PetFood; until: number; atMouthSince: number | null } | null>(null);
  const [feedView, setFeedView] = useState<{ emoji: string; x: number; y: number } | null>(null);
  /** Food is on the pointer (the menu offers to stop). */
  const [isFeeding, setFeeding] = useState(false);
  const stopFeeding = useCallback(() => {
    feedRef.current = null;
    setFeedView(null);
    setFeeding(false);
  }, []);
  const startFeeding = useCallback((food: PetFood) => {
    feedRef.current = { food, until: performance.now() + FEED_TIMEOUT_MS, atMouthSince: null };
    setFeeding(true);
  }, []);
  /** The figure eats what is on the pointer. */
  const eatFood = useCallback(() => {
    const feeding = feedRef.current;
    if (!feeding) return;
    stopFeeding();
    behavior.eat(performance.now());
    if (!IS_GUEST_PET) say(tRef.current(Math.random() < 0.5 ? 'pet.eatReply1' : 'pet.eatReply2'));
    void applyHormoneInteraction('feed');
  }, [behavior, say, stopFeeding, applyHormoneInteraction]);
  const cueTexts = useRef({ doze: '', wake: '' });
  useEffect(() => {
    cueTexts.current = { doze: t('pet.doze'), wake: t('pet.wake') };
  });

  /** Window in front at the last screen report (0: none), to notice a switch. */
  const focusRef = useRef(0);

  // Power-saving on battery: no random actions, and at rest only ~12 FPS.
  const [onBattery, setOnBattery] = useState(false);
  const savingRef = useRef(false);
  useEffect(() => watchOnBattery(setOnBattery), []);
  useEffect(() => {
    savingRef.current = prefs.batterySaver && onBattery;
    behavior.setSaving(savingRef.current);
  }, [behavior, prefs.batterySaver, onBattery]);
  useEffect(() => {
    if (!prefs.desktopLipSync && desktopLipActive.current) {
      desktopLipActive.current = false;
      if (!speakingRef.current && !mouthOpen.current) {
        audioPlayer.feedRemoteFrame(0, null);
      }
    }
  }, [prefs.desktopLipSync]);

  // Hormones steer the idle behaviour only while the companion simulates them.
  const driveRef = useRef<PetDrive>(NEUTRAL_DRIVE);
  const driveHormones = companionState?.settings.enable_neurohormones ? companionState.hormones : null;
  useEffect(() => {
    driveRef.current = driveHormones
      ? { ...NEUTRAL_DRIVE, fatigue: driveHormones.fatigue, dopamine: driveHormones.dopamine, cortisol: driveHormones.cortisol }
      : NEUTRAL_DRIVE;
  }, [driveHormones]);

  // Behaviour: time-driven state machine (petBehavior.ts) turned into gaze, face, mouth and hops.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = performance.now();
      settleDrag(now);
      if (awayRef.current) return;
      behavior.setDrive({ ...driveRef.current, night: isNightHour(new Date().getHours()) });
      const { frame, cues } = behavior.tick(now);
      setMode(frame.mode);
      setFaceOverride(frame.expression);
      setHop(frame.hop);
      setWalking(frame.walk !== 0);
      setLoop(frame.loop);
      setSeat(frame.seat);
      setSeatPose(frame.seatPose);
      setHang(frame.hang);
      setRecover((was) => (was?.id === frame.recover?.id ? was : frame.recover));
      seatRef.current = frame.seat;
      sittingRef.current = frame.loop === 'sit';
      setWalkDirection(frame.walk);
      gazeOverride.current = frame.gaze;
      const stage = stageRef.current;
      stage?.setTurn(frame.turn);
      stage?.setSaver(savingRef.current && (frame.mode === 'idle' || frame.mode === 'dozing'));
      stage?.setActivity?.(
        speakingRef.current ||
          frame.loop === 'dance' ||
          (frame.mode !== 'idle' && frame.mode !== 'sitting' && frame.mode !== 'dozing'),
      );
      if (stage) {
        const gaze = frame.gaze ?? pointerGaze.current;
        stage.mouse.x = gaze.x;
        stage.mouse.y = gaze.y;
      }
      // A yawn opens the mouth through the same path as a voice, but never over a real one.
      if (!speakingRef.current && (frame.mouth > 0.02 || mouthOpen.current)) {
        mouthOpen.current = frame.mouth > 0.02;
        audioPlayer.feedRemoteFrame(frame.mouth, mouthOpen.current ? { ...SILENT_VISEMES, aa: frame.mouth } : null);
      }
      for (const cue of cues) {
        if (cue.kind === 'gesture') playLocalGesture(cue.role);
        else if (cue.kind === 'jump') startJump(now);
        else if (cue.kind === 'event') askRemark(cue.event, now);
        else say(cueTexts.current[cue.text]);
      }
    }, BEHAVIOR_TICK_MS);
    return () => window.clearInterval(timer);
  }, [behavior, say, playLocalGesture, startJump, settleDrag, setWalkDirection, askRemark]);

  // State, voice and pointer from the main window and the backend.
  useEffect(() => {
    let isSubscribed = true;
    void useAppStore.getState().refreshLanguages().catch(() => {});
    const unlisteners = [
      listenOwn<PetState>(PET_STATE_EVENT, ({ payload }) => {
        if (!isSubscribed) return;
        // The portrait comes only when it changed.
        setPet((current) => (payload.portrait === undefined ? { ...payload, portrait: current?.portrait ?? '' } : payload));
        if (payload.gesture) setGesture(payload.gesture);
        const store = useAppStore.getState();
        if (payload.appLanguage && payload.appLanguage !== store.appLanguage) store.setAppLanguage(payload.appLanguage);
        if (payload.theme && payload.theme !== store.theme) store.setTheme(payload.theme);
        if (payload.colorMode !== store.colorMode) store.setColorMode(payload.colorMode);
      }),
      listenOwn<PetAudioFrame>(PET_AUDIO_EVENT, ({ payload }) => {
        const speaking = payload.visemes !== null;
        if (speaking) desktopLipActive.current = false;
        audioPlayer.feedRemoteFrame(payload.amplitude, payload.visemes);
        if (speaking !== speakingRef.current) {
          speakingRef.current = speaking;
          mouthOpen.current = false;
          behavior.setSpeaking(speaking);
          setIsSpeaking(speaking);
          // The bubble of the reply stays a moment after the voice ends.
          if (!speaking) {
            clearActiveSpeechTimeline();
            if (bubbleTimer.current !== null) {
              window.clearTimeout(bubbleTimer.current);
              bubbleTimer.current = window.setTimeout(() => setBubble(null), BUBBLE_AFTER_VOICE_MS);
            }
          }
        }
      }),
      listenOwn<PetSentence>(PET_SENTENCE_EVENT, ({ payload }) => {
        // Shown a little longer than spoken, so a short sentence can be read.
        const ms = Math.max(1500, payload.ms + 600);
        setActiveSpeechTimeline(payload.text, Math.max(400, payload.ms));
        behavior.say(performance.now(), ms);
        if (prefsRef.current.chatBubbles) say(payload.text, ms);
        setSentenceFace(payload.expression);
        if (sentenceTimer.current !== null) window.clearTimeout(sentenceTimer.current);
        sentenceTimer.current = window.setTimeout(() => setSentenceFace(null), ms);
      }),
      listenOwn<PetSay>(PET_SAY_EVENT, ({ payload }) => {
        if (!prefsRef.current.chatBubbles || !payload.text) return;
        const now = performance.now();
        const chat = payload.chat ?? null;
        if (chat) {
          // A message of their own stays longer, so the click on it can still be made.
          const ms = Math.max(bubbleMs(payload.text), PROACTIVE_BUBBLE_MS);
          setActiveSpeechTimeline(payload.text, Math.min(ms, 4500), now);
          behavior.announce(now);
          say(payload.text, ms, chat);
          return;
        }
        const ms = bubbleMs(payload.text);
        setActiveSpeechTimeline(payload.text, ms, now);
        behavior.say(now, ms);
        say(payload.text, ms);
      }),
      listenOwn<Platform[]>(PET_PLATFORMS_EVENT, ({ payload }) => {
        setPlatforms(payload);
      }),
      listenOwn(PET_HELLO_EVENT, () => {
        void emitTo('main', IS_GUEST_PET ? PET_GUEST_READY_EVENT : PET_READY_EVENT).catch(() => {});
      }),
      listenOwn<PetScreen>(PET_SCREEN_EVENT, ({ payload }) => {
        setScreen(payload);
        // Another window in front (not the pet, not the shell): glance after it.
        const switched = payload.focus !== 0 && focusRef.current !== 0 && payload.focus !== focusRef.current;
        focusRef.current = payload.focus;
        if (switched && prefsRef.current.reactToDesktop && !speakingRef.current) behavior.windowSwitched(performance.now());
      }),
      listenOwn<boolean>(PET_MUSIC_EVENT, ({ payload }) => {
        behavior.setMusic(payload && prefsRef.current.reactToDesktop);
      }),
      listenOwn(PET_BEAT_EVENT, () => {
        if (!speakingRef.current) behavior.beat(performance.now());
      }),
      listenOwn<number>(PET_DESKTOP_AUDIO_EVENT, ({ payload }) => {
        if (IS_GUEST_PET || !prefsRef.current.desktopLipSync || speakingRef.current || mouthOpen.current) return;
        if (typeof payload !== 'number' || !Number.isFinite(payload)) return;
        if (payload < 0.02) {
          if (desktopLipActive.current) {
            desktopLipActive.current = false;
            audioPlayer.feedRemoteFrame(0, null);
          }
          return;
        }
        desktopLipActive.current = true;
        audioPlayer.feedRemoteFrame(payload, visemesFromDesktopLevel(payload));
      }),
      listenOwn<PetPrefs>(PET_PREFS_EVENT, ({ payload }) => {
        setPrefs((current) => (JSON.stringify(current) === JSON.stringify(payload) ? current : payload));
      }),
      // Adjusted in the avatar manager: the shown model takes it at once.
      listenOwn<PetFramingChange>(PET_FRAMING_EVENT, ({ payload }) => {
        if (payload.modelPath !== modelRef.current) return;
        setFramingOverride({ modelPath: payload.modelPath, framing: payload.framing });
        framingRef.current = payload.framing;
        stageRef.current?.setFraming(payload.framing);
      }),
      listenOwn<number>(PET_RESIZE_EVENT, ({ payload }) => {
        if (typeof payload === 'number') void resizePet(payload);
      }),
      listenOwn(PET_COME_EVENT, () => {
        void comeHere();
      }),
      // Pose checks (`e2e/local-pet-pose.mjs`): lift by a grip or let go, without a real drag.
      // Only in the test window that shows the pet interface; the real pet windows never hear it.
      listen<PetTestHang>(PET_TEST_HANG_EVENT, ({ payload }) => {
        if (getCurrentWindow().label === PET_LABEL || getCurrentWindow().label === GUEST_LABEL) return;
        const now = performance.now();
        if (payload.move) {
          // Fed like the real drag's pointer moves (physical px), so the swing sees a moving hand.
          // By the time passed (timers run late in a headless test), so the speed is what was asked for.
          const perMs = (payload.move * window.innerHeight * (window.devicePixelRatio || 1)) / 1000;
          let last = performance.now();
          const timer = window.setInterval(() => {
            const at = performance.now();
            stageRef.current?.addWindowMove(perMs * (at - last), 0);
            last = at;
          }, 16);
          window.setTimeout(() => window.clearInterval(timer), payload.ms ?? 1000);
        } else if (payload.grip && payload.at) {
          const top = petFigureTop(framingRef.current);
          behavior.dragStart(now, { grip: payload.grip, at: payload.at, anchor: hangAnchor(payload.grip, payload.at, top) });
        } else {
          behavior.dragEnd(now);
        }
      }),
      listenOwn<PetCursor>(PET_CURSOR_EVENT, ({ payload: { x, y, inside, button, through, gx, gy, t: polledAt } }) => {
        throughRef.current = through !== false;
        recordCursorMove(gx, gy, button, polledAt);
        // A new click anywhere but on the menu closes it (clicks outside never reach this window).
        const clicked = button === true && lastButton.current !== true;
        lastButton.current = button;
        if (clicked && overlayRef.current && !(inside && document.elementFromPoint(x, y)?.closest('[data-pet-solid]'))) {
          void closeMenu();
        }
        const stage = stageRef.current;
        const { innerWidth: w, innerHeight: h } = window;
        behavior.pointer(performance.now());
        // Feeding: the food follows the pointer; at the mouth for a moment, it is eaten.
        const feeding = feedRef.current;
        if (feeding) {
          const at = performance.now();
          if (at > feeding.until || awayRef.current) {
            stopFeeding();
          } else if (inside) {
            setFeedView({ emoji: feeding.food.emoji, x, y });
            if (atMouth(x, y, w, h, headEnd())) {
              feeding.atMouthSince ??= at;
              if (at - feeding.atMouthSince >= EAT_DWELL_MS) eatFood();
            } else {
              feeding.atMouthSince = null;
            }
          } else {
            setFeedView(null);
            feeding.atMouthSince = null;
          }
        }
        // The figure looks after the pointer, also elsewhere on the desktop.
        const eyes = eyeLine(headEnd()) * h;
        pointerGaze.current = { x: clamp((x - w / 2) / (w / 2)), y: clamp(-(y - eyes) / (h / 2)) };
        if (stage && !gazeOverride.current) {
          stage.mouse.x = pointerGaze.current.x;
          stage.mouse.y = pointerGaze.current.y;
        }
        if (awayRef.current) {
          setIgnore(true);
          return;
        }
        // Without a reliable pointer the pet could not be grabbed again after letting clicks through.
        if (through === false) {
          setIgnore(false);
          return;
        }
        if (!inside) {
          setIgnore(true);
          return;
        }
        if (document.elementFromPoint(x, y)?.closest('[data-pet-solid]')) {
          setIgnore(false);
          return;
        }
        if (!stage) {
          setIgnore(true);
          return;
        }
        // Sitting draws the figure lower than the window: probe where it really is. While the
        // menu widened the window, the figure keeps its own width in the middle.
        const shift = spreadRef.current ? (w - spreadRef.current.baseWidth) / 2 : 0;
        stage.probe(x - shift, sittingRef.current ? y - h * SIT_DROP : y, (hit) => setIgnore(!hit));
      }),
    ];
    void Promise.all(unlisteners).then(() => {
      if (isSubscribed) void emitTo('main', IS_GUEST_PET ? PET_GUEST_READY_EVENT : PET_READY_EVENT).catch(() => {});
    });
    const stopMoved = getCurrentWindow().onMoved(({ payload }) => {
      trackWindowMoved(performance.now(), payload.x, payload.y);
    });
    return () => {
      isSubscribed = false;
      for (const unlisten of unlisteners) void unlisten.then((stop) => stop());
      void stopMoved.then((stop) => stop());
      if (bubbleTimer.current !== null) window.clearTimeout(bubbleTimer.current);
      if (sentenceTimer.current !== null) window.clearTimeout(sentenceTimer.current);
    };
  }, [setIgnore, behavior, say, comeHere, resizePet, headEnd, recordCursorMove, setPlatforms, trackWindowMoved, stopFeeding, eatFood, closeMenu]);

  // A new bubble leans away from the nearer screen edge (where the figure stands right now).
  useEffect(() => {
    if (!bubble) return undefined;
    let live = true;
    // Without physics the position is not followed all the time: read it once.
    void readBubbleSide().then((side) => {
      if (live && side) setBubbleSideNow(side);
    });
    return () => {
      live = false;
    };
  }, [bubble, readBubbleSide]);

  // While a reply is written in the main window, the bubble shows typing dots; the reply replaces them.
  const thinking = !!pet?.thinking;
  const shownBubble = thinking && prefs.chatBubbles ? '…' : bubble?.text ?? null;

  const openBubbleChat = () => {
    const chat = bubble?.chat;
    if (!chat) return;
    setBubble(null);
    void emitTo('main', NOTIFICATION_OPEN_CHAT_EVENT, chat).catch(() => {});
    void api.showMainWindow().catch(() => {});
  };

  const openCompose = () => {
    setStatusOpen(false);
    setComposeOpen(true);
    // The pet window opens without focus; typing needs it.
    void getCurrentWindow().setFocus().catch(() => {});
  };

  const sendDraft = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setComposeOpen(false);
    behavior.say(performance.now(), BUBBLE_MS);
    void emitTo('main', PET_SEND_EVENT, { text } satisfies PetSay).catch(() => {});
  };

  useEffect(() => {
    if (!statusOpen) return undefined;
    void fetchCompanionState();
    const timer = window.setInterval(() => void fetchCompanionState(), STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [statusOpen, fetchCompanionState]);

  const pat = async (zone: TouchZone = 'head') => {
    behavior.pat(performance.now(), zone);
    const replies =
      zone === 'head' ? [t('pet.headpatReply1'), t('pet.headpatReply2')] : [t('pet.pokeReply1'), t('pet.pokeReply2')];
    if (!IS_GUEST_PET) say(replies[Math.floor(Math.random() * replies.length)]!);
    await applyHormoneInteraction(zone === 'head' ? 'headpat' : 'poke');
  };

  // Screenshots and the clipboard need the user's yes in the main window.
  const askTool = async (tool: 'take_screenshot' | 'read_clipboard') => {
    const request = await requestToolCall(tool, {});
    if (request) {
      say(t('pet.confirmInApp'));
      await api.showMainWindow();
    }
  };

  /** Loads the motion pack offered in the menu; the main window reads the motions again. */
  const loadMotionPack = async (pack: MotionPackItem) => {
    say(t('pet.motionsLoading'));
    try {
      await api.downloadMotionPack(pack.id);
      await emitTo('main', PET_MOTIONS_EVENT);
      say(t('pet.motionsLoaded'));
    } catch (e) {
      say(t('pet.motionsFailed', { error: errorMessage(e) }));
    }
  };

  /** What the menu needs beyond the pet's state: the motion pack offer, the last program, the model's parts. */
  const [menuContext, setMenuContext] = useState<{
    motionPack: MotionPackItem | null;
    lastApp: string;
    parts: string[];
    /** The pet's height when the menu opened (marks the chosen size). */
    height: number;
  }>({ motionPack: null, lastApp: '', parts: [], height: 0 });
  /** Bumped when a part is shown or hidden, so the settings card shows it. */
  const [, setPartsVersion] = useState(0);
  const loadMenuContext = async () => {
    // A 3D figure without walking or sitting motions: the menu offers the motion pack.
    const motionPack =
      pet?.vrmPath && lacksPetMotions(pet.motions ?? [])
        ? recommendedMotionPack((await api.getMotionPacks(currentLanguage).catch(() => [])) ?? [])
        : null;
    // The program in front before the menu opened (the pet itself never counts).
    const lastApp = await api.getPetLastApp().catch(() => '');
    const next = { motionPack, lastApp, parts: stageRef.current?.listParts?.() ?? [], height: currentHeight() };
    setMenuContext(next);
    return next;
  };

  /** Runs `then` once the menu has given the window back (resizing, walking and feeding need it). */
  const afterMenu = (then: () => void) => void closeMenu().then(then);

  /** The native menu: for the guest, with Shift+right click, and where the ring has no room. */
  const openNativeMenu = async () => {
    if (IS_GUEST_PET) {
      await openGuestMenu({
        t,
        currentHeight: currentHeight(),
        resizeTo,
        startFeeding,
        stopFeeding,
        feeding: isFeeding,
        parts: stageRef.current?.listParts?.() ?? [],
        hiddenParts: modelRef.current ? loadHiddenParts(modelRef.current) : [],
        togglePart,
        dismiss: () => void api.togglePetGuest(false),
      });
      return;
    }
    await closeMenu();
    const context = await loadMenuContext();
    const model = buildPetMenu({
      ...menuArgs,
      currentHeight: context.height,
      parts: context.parts,
      motionPack: context.motionPack,
      lastApp: context.lastApp,
    });
    await openPetContextMenu(model, t);
  };

  /**
   * Opens the ring around the figure: the window widens around it (its height and the figure
   * stay), holds still, and the figure stops what it was doing. Too small a pet, or no room on
   * the screen, gets the native menu instead.
   */
  const openRadial = () =>
    queueMenu(async () => {
      if (spreadRef.current || awayRef.current) return;
      const { innerWidth: baseWidth, innerHeight: height } = window;
      const sized = radialRings(height, 0);
      if (!sized) {
        void openNativeMenu();
        return;
      }
      await loadMenuContext();
      const opening: MenuSpread = {
        baseWidth,
        width: baseWidth,
        height,
        visible: { left: 0, top: 0, right: baseWidth, bottom: height },
      };
      spreadRef.current = opening;
      setSpread(opening);
      holdWindow(true);
      behavior.attend(performance.now());
      let placed: MenuSpread | null = null;
      try {
        placed = { baseWidth, ...(await spreadWindow(Math.max(baseWidth, radialWidth(sized)))) };
      } catch {
        placed = null;
      }
      const rings = placed ? radialRings(placed.height, placed.width / 2) : null;
      const arc = placed && rings ? openArc(rings, placed.visible) : null;
      if (!placed || !arc || arc.span < MIN_OPEN_SPAN) {
        // Restored by the close below; the native menu follows it.
        overlayRef.current = 'radial';
        void closeMenu().then(() => openNativeMenu());
        return;
      }
      spreadRef.current = placed;
      setSpread(placed);
      overlayRef.current = 'radial';
      setOverlay('radial');
      // Arrow keys and Escape need the focus (the pet window opens without it).
      void getCurrentWindow().setFocus().catch(() => {});
    });

  /** "More" in the ring: the settings card, with the window wide enough for it. */
  const openSettings = () =>
    queueMenu(async () => {
      const held = spreadRef.current;
      if (!held || menuClosing.current) return;
      overlayRef.current = 'settings';
      setOverlay('settings');
      if (held.width >= SETTINGS_WIDTH) return;
      const placed = { baseWidth: held.baseWidth, ...(await spreadWindow(SETTINGS_WIDTH).catch(() => held)) };
      if (spreadRef.current !== held) return;
      spreadRef.current = placed;
      setSpread(placed);
    });

  /** A ring entry: "More" turns the ring into the card; anything else closes the ring first. */
  const runMenuItem = (item: PetMenuItem) => {
    if (item.id === 'more') item.action?.();
    else void closeMenu().then(() => item.action?.());
  };

  const onMenuRequest = (e: React.MouseEvent) => {
    e.preventDefault();
    if (IS_GUEST_PET || e.shiftKey) {
      void openNativeMenu();
    } else if (overlayRef.current) {
      void closeMenu();
    } else if (!menuClosing.current) {
      void openRadial();
    }
  };

  // Stepping back (fullscreen, lock screen) or being dragged away closes the menu.
  useEffect(() => {
    if (away) void closeMenu();
  }, [away, closeMenu]);
  // Another program in front: the menu goes (like a native one).
  useEffect(() => {
    const stop = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused && overlayRef.current) void closeMenu();
    });
    return () => void stop.then((unlisten) => unlisten());
  }, [closeMenu]);

  /** A quick click on a hand. */
  const highFive = async () => {
    behavior.highFive(performance.now());
    if (!IS_GUEST_PET) say(Math.random() < 0.5 ? t('pet.highFiveReply1') : t('pet.highFiveReply2'));
    await applyHormoneInteraction('high_five');
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    // With the menu open, a click on the figure only closes it.
    if (spreadRef.current) {
      void closeMenu();
      return;
    }
    holdRef.current = true;
    // Sitting draws the figure lower than the window: ask where it really is.
    const y = sittingRef.current ? e.clientY - window.innerHeight * SIT_DROP : e.clientY;
    const hand = !!stageRef.current?.handAt(e.clientX, y);
    const press: NonNullable<typeof pressRef.current> = {
      x: e.screenX,
      y: e.screenY,
      cx: e.clientX,
      cy: e.clientY,
      dragging: false,
      hand,
      holding: false,
    };
    // Pressed on a hand and kept there: the figure holds hands until it is let go.
    if (hand) {
      press.holdTimer = window.setTimeout(() => {
        if (pressRef.current !== press || press.dragging) return;
        press.holding = true;
        behavior.holdHand(performance.now());
        if (!IS_GUEST_PET) say(Math.random() < 0.5 ? t('pet.holdHandReply1') : t('pet.holdHandReply2'));
        void applyHormoneInteraction('hold_hand');
      }, HOLD_HAND_MS);
    }
    pressRef.current = press;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const press = pressRef.current;
    // Without a pressed button, wiggling or circling over the figure is stroking it.
    if (!press && e.buttons === 0) {
      if (strokeRef.current.move(e.clientX, e.clientY, performance.now())) {
        void pat(touchZoneAt(e.clientY / window.innerHeight, headEnd()));
      }
      return;
    }
    if (!press || press.dragging) return;
    if (Math.hypot(e.screenX - press.x, e.screenY - press.y) < DRAG_THRESHOLD) return;
    press.dragging = true;
    if (press.holdTimer !== undefined) window.clearTimeout(press.holdTimer);
    const now = performance.now();
    beginDrag(now);
    endPeek();
    // Where it was grabbed decides how it hangs (VRM pose): the window moves so the grabbed
    // part (drawn at `anchor`) is under the pointer before the system drag keeps that offset.
    const held = behavior.canHang && !sittingRef.current ? grabbedAt(press, framingRef.current, seatDrop(seatRef.current)) : null;
    behavior.dragStart(now, held);
    const win = getCurrentWindow();
    void openForHang(held)
      .then((width) => {
        if (width !== null && widenedFrom.current === null) widenedFrom.current = width;
      })
      .catch(() => {})
      // The system moves the window from here and keeps the button release (on Windows the
      // call returns at once; the drag ends when the moves stop).
      .then(() => win.startDragging())
      .catch(() => {})
      .finally(() => {
        pressRef.current = null;
        holdRef.current = false;
      });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const press = pressRef.current;
    pressRef.current = null;
    holdRef.current = false;
    if (!press || press.dragging) return;
    if (press.holdTimer !== undefined) window.clearTimeout(press.holdTimer);
    if (peekRef.current !== 0) endPeek();
    if (feedRef.current) eatFood();
    else if (press.holding) behavior.releaseHand(performance.now());
    else if (press.hand) void highFive();
    else void pat(touchZoneAt(e.clientY / window.innerHeight, headEnd()));
  };

  const onStage = useCallback((stage: PetFigure | null) => {
    stageRef.current = stage;
    stage?.setPaused(awayRef.current);
    stage?.setFraming(framingRef.current);
    stage?.setFrameRate(prefsRef.current.frameRate);
    if (modelRef.current) stage?.setHiddenParts?.(loadHiddenParts(modelRef.current));
  }, []);

  useEffect(() => {
    awayRef.current = away;
    stageRef.current?.setPaused(away);
    if (away) {
      setIgnore(true);
    } else {
      // Without a reliable pointer no cursor event may come to make it grabbable again.
      if (!throughRef.current) setIgnore(false);
      // Back from fullscreen or the lock screen: where it stands may have changed meanwhile.
      void syncWindow().catch(() => {});
    }
  }, [away, setIgnore, syncWindow]);

  const onLoops = useCallback(
    (available: Record<LoopRole, boolean>) => behavior.setSitMotion(available.sit),
    [behavior],
  );
  // Only the VRM viewer can pose the figure sitting on the ground; it reports so once loaded.
  const [sitModel, setSitModel] = useState<string | null>(null);
  const canSit = !!modelPath && sitModel === modelPath;
  const onFloorSit = useCallback(
    (available: boolean) => {
      behavior.setFloorSit(available);
      setSitModel(available ? modelRef.current : null);
    },
    [behavior, setSitModel],
  );
  const petLink = useMemo(() => ({ onStage, onLoops, onFloorSit }), [onStage, onLoops, onFloorSit]);

  // Another figure: it sits on the ground again only when its viewer says it can.
  useEffect(() => {
    behavior.setFloorSit(false);
  }, [behavior, modelPath]);
  // Each model comes back in the size it last had, with its own framing.
  useEffect(() => {
    modelRef.current = modelPath;
    framingRef.current = framing;
    stageRef.current?.setFraming(framing);
  }, [framing, modelPath]);
  // The parts hidden for this model (clothes, accessories) stay hidden.
  useEffect(() => {
    if (modelPath) stageRef.current?.setHiddenParts?.(loadHiddenParts(modelPath));
  }, [modelPath]);
  /** Shows or hides one of the model's parts (menu) and remembers it for the model. */
  const togglePart = useCallback((name: string) => {
    const model = modelRef.current;
    if (!model) return;
    const next = toggledPart(loadHiddenParts(model), name);
    saveHiddenParts(model, next);
    stageRef.current?.setHiddenParts?.(next);
    setPartsVersion((version) => version + 1);
  }, []);
  useEffect(() => {
    const remembered = modelPath ? loadPetModelHeight(modelPath) : undefined;
    if (remembered !== undefined) void resizePet(remembered);
  }, [modelPath, resizePet]);

  /** Everything the menu shows and does (the ring builds its model from it while it is open). */
  const menuArgs: PetMenuArgs = {
    pet,
    prefs,
    statusOpen,
    canSit,
    currentHeight: menuContext.height,
    t,
    tEmotion,
    openCompose: () => afterMenu(openCompose),
    pat: () => afterMenu(() => void pat()),
    parts: menuContext.parts,
    hiddenParts: modelPath ? loadHiddenParts(modelPath) : [],
    togglePart: (name) => togglePart(name),
    peeking,
    startPeek: () => afterMenu(startPeek),
    endPeek: () => afterMenu(endPeek),
    feeding: isFeeding,
    startFeeding: (food) => afterMenu(() => startFeeding(food)),
    stopFeeding: () => afterMenu(stopFeeding),
    timer: alarm,
    startAlarm: (kind, minutes) => afterMenu(() => startAlarm(kind, minutes)),
    stopAlarm: () => afterMenu(stopAlarm),
    motionPack: menuContext.motionPack,
    loadMotionPack: (pack) => afterMenu(() => void loadMotionPack(pack)),
    lastApp: menuContext.lastApp,
    setStatusOpen: (open) => afterMenu(() => setStatusOpen(open)),
    setPrefs,
    resizeTo: (height) => void resizePet(height),
    askTool: (tool) => afterMenu(() => void askTool(tool)),
    openSettings: () => void openSettings(),
    openApp: () => afterMenu(() => void api.showMainWindow().catch(() => {})),
    hide: () => void toggleDesktopPet(false),
  };

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden select-none font-sans text-slate-100 ${away ? 'invisible' : ''}`}
      data-desktop-pet
      data-pet-away={away || undefined}
      data-pet-mode={mode}
      onContextMenu={onMenuRequest}
      // Without click-through (Wayland) the empty parts get clicks too: they close the menu.
      onPointerDown={(e) => {
        if (e.button === 0 && overlayRef.current && e.target === e.currentTarget) void closeMenu();
      }}
    >
      {/* While the menu widened the window, the figure keeps its own width in the middle. */}
      <div
        className="absolute inset-y-0"
        style={spread ? { left: '50%', width: spread.baseWidth, marginLeft: -spread.baseWidth / 2 } : { left: 0, right: 0 }}
      >
      <PetFigureCanvas
        pet={pet}
        modelPath={modelPath}
        mode={mode}
        loop={loop}
        seat={seat}
        seatPose={seatPose}
        hang={hang}
        recover={recover}
        hop={hop}
        walking={walking}
        lift={framing.lift}
        isSpeaking={isSpeaking || mode === 'talking'}
        faceOverride={faceOverride}
        sentenceFace={sentenceFace}
        gesture={gesture}
        petLink={petLink}
        figureRef={figureRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        noModelLabel={t('pet.noModel')}
      />
      </div>

      {feedView && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            left: feedView.x,
            top: feedView.y,
            transform: 'translate(-50%, -50%)',
            fontSize: 28,
            pointerEvents: 'none',
            zIndex: 20,
          }}
        >
          {feedView.emoji}
        </div>
      )}

      {shownBubble && !statusOpen && !composeOpen && !overlay && (
        <PetBubble
          text={shownBubble}
          ms={bubble && shownBubble === bubble.text ? bubble.ms : 0}
          side={bubbleSideNow}
          // Sitting draws the figure lower: more room above the head.
          room={petFigureTop(framing) + (loop === 'sit' ? SIT_DROP : seatDrop(seat))}
          title={t('pet.compose')}
          onClick={bubble?.chat ? openBubbleChat : openCompose}
        />
      )}

      {composeOpen && !overlay && (
        <PetComposeForm
          characterName={pet?.characterName ?? ''}
          draft={draft}
          thinking={thinking}
          onDraftChange={setDraft}
          onSubmit={sendDraft}
          onClose={() => setComposeOpen(false)}
          t={t}
        />
      )}

      {statusOpen && !overlay && (
        <PetStatusCard
          characterName={pet?.characterName}
          emotion={pet?.emotion ?? 'neutral'}
          bubble={bubble?.text ?? null}
          thought={companionState?.scratchpad?.[0]?.thought}
          hormones={companionState?.hormones}
          onClose={() => setStatusOpen(false)}
          onCompose={openCompose}
          onPat={() => void pat()}
          onAskTool={(tool) => void askTool(tool)}
          t={t}
          tEmotion={tEmotion}
          tOptional={tOptional}
        />
      )}

      {overlay && spread && (
        <PetMenuLayer
          overlay={overlay}
          spread={spread}
          args={menuArgs}
          t={t}
          onRun={runMenuItem}
          onBack={() => {
            overlayRef.current = 'radial';
            setOverlay('radial');
          }}
          onClose={() => void closeMenu()}
        />
      )}
    </div>
  );
};

/** The ring or the settings card over the widened window (geometry from its size and the screen). */
function PetMenuLayer({
  overlay,
  spread,
  args,
  t,
  onRun,
  onBack,
  onClose,
}: {
  overlay: 'radial' | 'settings';
  spread: MenuSpread;
  args: PetMenuArgs;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  onRun: (item: PetMenuItem) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const model = buildPetMenu(args);
  const rings = useMemo(() => radialRings(spread.height, spread.width / 2), [spread.height, spread.width]);
  const arc = useMemo(() => (rings ? openArc(rings, spread.visible) : null), [rings, spread.visible]);
  if (overlay === 'settings') {
    // Centred on the figure, kept on the visible part of the window.
    const width = Math.min(SETTINGS_CARD_MAX, spread.width - 16);
    const low = Math.max(8, spread.visible.left + 8);
    const high = Math.max(low, Math.min(spread.width - width - 8, spread.visible.right - width - 8));
    const left = Math.min(high, Math.max(low, (spread.width - width) / 2));
    return <PetSettingsCard model={model} left={left} width={width} t={t} onBack={onBack} onClose={onClose} />;
  }
  if (!rings || !arc) return null;
  return (
    <PetRadialMenu
      items={model.actions}
      rings={rings}
      arc={arc}
      title={model.title}
      ariaLabel={t('pet.menuLabel')}
      onRun={onRun}
      onClose={onClose}
    />
  );
}
