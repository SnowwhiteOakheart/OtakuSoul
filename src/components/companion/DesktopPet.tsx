import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { emitTo, listen } from '@tauri-apps/api/event';
import {
  availableMonitors,
  currentMonitor,
  getCurrentWindow,
  LogicalSize,
  monitorFromPoint,
  PhysicalPosition,
} from '@tauri-apps/api/window';
import { Menu } from '@tauri-apps/api/menu';
import { Brain, Camera, Clipboard, Flame, Heart, MessageCircle, Moon, Send, Smile, X, Zap } from 'lucide-react';
import { VrmViewer } from '../avatar/VrmViewer';
import type { PetFigure } from '../avatar/avatarStage';
import { useAppStore, useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { api } from '../../services/api';
import { audioPlayer } from '../../services/audioPlayer';
import { SILENT_VISEMES } from '../../services/lipSync';
import { PetBubble } from './PetBubble';
import {
  bubbleMs,
  bubbleSide,
  eyeLine,
  headZoneEnd,
  HOLD_HAND_MS,
  isNightHour,
  NEUTRAL_DRIVE,
  PetBehavior,
  touchZoneAt,
  type BubbleSide,
  type Gaze,
  type PetDrive,
  type PetMode,
  type TouchZone,
} from './petBehavior';
import { stepBody, throwVelocity, walkArea, type Body, type Platform, type Rect } from './petPhysics';
import type { GestureRequest, LoopRole } from '../../utils/avatarGestures';
import { DEFAULT_PET_FRAMING, PET_FEET_SHARE, type PetFraming } from '../../services/avatarViewState';
import {
  clampPetHeight,
  loadPetFraming,
  loadPetModelHeight,
  loadPetPlacement,
  loadPetPrefs,
  PET_AUDIO_EVENT,
  PET_COME_EVENT,
  PET_CURSOR_EVENT,
  PET_FRAMING_EVENT,
  PET_HELLO_EVENT,
  PET_MOODS,
  PET_PICK_EMOTION_EVENT,
  PET_PLATFORMS_EVENT,
  PET_PREFS_EVENT,
  PET_READY_EVENT,
  PET_RESIZE_EVENT,
  PET_SAY_EVENT,
  PET_SCREEN_EVENT,
  PET_SEND_EVENT,
  PET_SENTENCE_EVENT,
  PET_PRESETS,
  PET_STATE_EVENT,
  savePetModelHeight,
  savePetPlacement,
  savePetPrefs,
  petModelPath,
  petWindowSize,
  type PetAudioFrame,
  type PetCursor,
  type PetFramingChange,
  type PetPrefs,
  watchOnBattery,
  type PetSay,
  type PetScreen,
  type PetSentence,
  type PetSize,
  type PetState,
} from '../../services/desktopPet';

const MmdViewer = lazy(() => import('../avatar/MmdViewer'));
const GltfViewer = lazy(() => import('../avatar/GltfViewer'));
const isMmdModel = (path: string) => /\.(pmx|pmd)$/i.test(path);
/**
 * Sitting on a window's edge: the figure is drawn this share of the window lower, so its hips
 * rest on the edge and the legs hang over it (the window itself keeps standing on the edge).
 */
const SIT_DROP = 0.2;
const isGltfModel = (path: string) => /\.(glb|gltf)$/i.test(path);
// Inochi2D puppets bring their own runtime; only loaded for them.
const Inochi2dViewer = lazy(() => import('../avatar/Inochi2dViewer'));
const isInochi2dModel = (path: string) => /\.(inp|inx)$/i.test(path);
/** The pet's faces are VRM expressions; an Inochi2D puppet takes the feeling behind them. */
const EXPRESSION_EMOTIONS: Record<string, string> = {
  happy: 'joy', angry: 'anger', sad: 'sadness', surprised: 'surprise', relaxed: 'relief', blush: 'embarrassment', neutral: 'neutral',
};

/** How long a speech bubble stays. */
const BUBBLE_MS = 5000;
/** Pointer travel (px) after which pressing turns into dragging the window. */
const DRAG_THRESHOLD = 4;
const STATUS_POLL_MS = 5000;
/** The behaviour is advanced this often (gaze and faces are smoothed by the viewer). */
const BEHAVIOR_TICK_MS = 100;
/** No window move for this long: the system drag has ended (or the figure hangs still and calms down). */
const DRAG_SETTLE_MS = 1200;
/**
 * The pointer's moves in this span before its last move give a throw its speed (times from the
 * backend's pointer poll, so late events do not distort it).
 */
const THROW_WINDOW_MS = 150;
/** Released longer than this after the last move: it was held still, no throw. */
const THROW_STILL_MS = 250;
/** A bubble still showing when the voice ends stays this much longer. */
const BUBBLE_AFTER_VOICE_MS = 2500;
/** Physics steps (window moves) per second while falling or walking. */
const PHYSICS_TICK_MS = 33;
/** The monitor's work area is read again this often (taskbar moved, resolution changed). */
const AREA_REFRESH_MS = 3000;
/** The remembered position is written at most this often while the pet moves itself. */
const PLACEMENT_SAVE_MS = 500;
/** One wheel notch with Ctrl over the figure makes it this much larger or smaller. */
const WHEEL_STEP = 1.06;
/** "Komm her" counts as arrived this close to the pointer (logical px from the figure's middle). */
const COME_NEAR_PX = 40;

const clamp = (value: number) => Math.max(-1, Math.min(1, value));

/** Window calls get this long; one that never answers (e.g. after a broken system drag) must not freeze the pet. */
const WINDOW_CALL_MS = 1000;
/** A drag whose end does not settle within this long after the last move is ended anyway. */
const DRAG_GIVE_UP_MS = DRAG_SETTLE_MS + 2000;

function within<T>(promise: Promise<T>, ms = WINDOW_CALL_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error('window call timed out')), ms)),
  ]);
}

/**
 * The desktop pet window (`index.html?pet=true`): the active avatar on a transparent window.
 * Clicks go through everywhere except on the figure and the pet's own panels; pressing and
 * moving drags the window, a click pats, right click opens the menu.
 */
export const DesktopPet: React.FC = () => {
  const { t, tEmotion, tOptional } = useTranslation();
  const { companionState, fetchCompanionState, applyHormoneInteraction, requestToolCall, toggleDesktopPet } =
    useStoreFields('companionState', 'fetchCompanionState', 'applyHormoneInteraction', 'requestToolCall', 'toggleDesktopPet');
  const [pet, setPet] = useState<PetState | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [gesture, setGesture] = useState<GestureRequest | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  /** Quick chat: a small input on the pet that writes into the active chat. */
  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [bubble, setBubble] = useState<string | null>(null);
  /** How long the current bubble shows (a long sentence scrolls through in that time). */
  const bubbleShowMs = useRef(0);
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
  const sittingRef = useRef(false);
  /** Desktop physics: the window (physical px), its size, the floor's work area and the scale. */
  const body = useRef<Body | null>(null);
  const windowSize = useRef({ width: 0, height: 0 });
  const area = useRef<Rect | null>(null);
  /** Work areas of all monitors: the figure walks over to one that continues to the side. */
  const monitors = useRef<Rect[]>([]);
  const monitorScale = useRef(1);
  const walkDirection = useRef<-1 | 0 | 1>(0);
  /** Top edges of the other windows to stand on (empty outside Windows). */
  const platforms = useRef<Platform[]>([]);
  const placementSavedAt = useRef(0);
  /** Last global pointer position (physical px), for "Komm her". */
  const lastCursor = useRef<{ x: number; y: number } | null>(null);
  /** Window height (logical px) and the resize running now with the next wish waiting. */
  const heightRef = useRef(loadPetPlacement().height);
  const resizing = useRef<{ busy: boolean; next: number | null }>({ busy: false, next: null });
  /** The shown model, whose size a resize remembers. */
  const modelRef = useRef('');
  /** The shown model's framing (avatar manager); its lift also moves the shadow. */
  const framingRef = useRef<PetFraming>(DEFAULT_PET_FRAMING);
  const [lift, setLift] = useState(0);
  const figureRef = useRef<HTMLDivElement>(null);
  /** Where "Komm her" walks to (physical x of the pointer) and which way, null when not called. */
  const comeTarget = useRef<{ x: number; direction: -1 | 1 } | null>(null);
  /** Where the pointer would have the figure look; the behaviour may look elsewhere. */
  const pointerGaze = useRef<Gaze>({ x: 0, y: 0 });
  const gazeOverride = useRef<Gaze | null>(null);
  const drag = useRef<{
    startedAt: number;
    movedAt: number;
    ending?: boolean;
    /** Recent pointer positions (physical px, backend ms), for the speed of a throw. */
    samples: { t: number; x: number; y: number }[];
  } | null>(null);
  const speakingRef = useRef(false);
  const mouthOpen = useRef(false);
  const prefsRef = useRef(prefs);
  /** Fullscreen window or lock screen in front: the pet steps back (not drawn, no clicks, no moves). */
  const [screen, setScreen] = useState<PetScreen>({ fullscreen: false, locked: false });
  const away = screen.locked || (screen.fullscreen && prefs.hideInFullscreen);
  const awayRef = useRef(away);
  const stageRef = useRef<PetFigure | null>(null);
  const ignoreRef = useRef<boolean | null>(null);
  /** Pressed on the pet: click-through stays off until released. */
  const holdRef = useRef(false);
  const pressRef = useRef<{
    x: number;
    y: number;
    dragging: boolean;
    /** Pressed on one of the figure's hands. */
    hand: boolean;
    /** Held long enough on the hand: the figure holds hands. */
    holding: boolean;
    holdTimer?: number;
  } | null>(null);
  const bubbleTimer = useRef<number | null>(null);
  const localGestureId = useRef(0);

  /** Where the head ends in the window now: from the figure, lower while it sits. */
  const headEnd = useCallback(
    () => headZoneEnd(stageRef.current?.headLine() ?? null, sittingRef.current ? SIT_DROP : 0),
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

  const say = useCallback((text: string, ms = BUBBLE_MS) => {
    bubbleShowMs.current = ms;
    setBubble(text);
    if (bubbleTimer.current !== null) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
  }, []);

  const playLocalGesture = useCallback((role: GestureRequest['role']) => {
    // Negative ids never meet the main window's counter.
    localGestureId.current -= 1;
    setGesture({ role, id: localGestureId.current });
  }, []);

  /**
   * The drag is over: the physics takes over where the figure was let go. With `fling`, the
   * speed of the last moves goes along (a throw), if the mouse was still moving at release.
   */
  const finishDrag = useCallback(
    (fling: boolean) => {
      const dragging = drag.current;
      if (!dragging || dragging.ending) return;
      dragging.ending = true;
      // The last sample is the release; the last move is where the position last changed.
      const samples = dragging.samples;
      const release = samples[samples.length - 1];
      let moved = samples.length - 1;
      while (moved > 0 && samples[moved]!.x === samples[moved - 1]!.x && samples[moved]!.y === samples[moved - 1]!.y) {
        moved -= 1;
      }
      const lastMove = samples[moved];
      const recent =
        release && lastMove && release.t - lastMove.t <= THROW_STILL_MS
          ? samples.slice(0, moved + 1).filter((s) => lastMove.t - s.t <= THROW_WINDOW_MS)
          : [];
      const speed = fling ? throwVelocity(recent, monitorScale.current) : { vx: 0, vy: 0 };
      void syncWindow()
        .catch(() => {})
        .finally(() => {
          if (body.current) {
            body.current.vx = speed.vx;
            body.current.vy = speed.vy;
          }
          drag.current = null;
          behavior.dragEnd(performance.now());
        });
    },
    // `syncWindow` is declared below; it only reads refs.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [behavior],
  );

  /** Reads where the window stands and the work area of the monitor under its feet. */
  const syncWindow = useCallback(async () => {
    const win = getCurrentWindow();
    const [position, size, factor] = await within(Promise.all([win.outerPosition(), win.outerSize(), win.scaleFactor()]));
    const monitor =
      (await within(monitorFromPoint(position.x + size.width / 2, position.y + size.height - 1)).catch(() => null)) ??
      (await within(currentMonitor()).catch(() => null));
    body.current = { x: position.x, y: position.y, vy: 0, support: null, edge: null };
    windowSize.current = { width: size.width, height: size.height };
    monitorScale.current = factor;
    if (monitor) {
      const { position: at, size: extent } = monitor.workArea;
      area.current = { x: at.x, y: at.y, width: extent.width, height: extent.height };
    }
    const all = await within(availableMonitors()).catch(() => null);
    if (all) {
      monitors.current = all.map(({ workArea }) => ({
        x: workArea.position.x,
        y: workArea.position.y,
        width: workArea.size.width,
        height: workArea.size.height,
      }));
    }
  }, []);

  useEffect(() => {
    prefsRef.current = prefs;
    behavior.setIdleActions(prefs.idleActions);
    behavior.setPhysics(prefs.physics);
    if (prefs.physics) void syncWindow().catch(() => {});
    savePetPrefs(prefs);
    // The Desktop-Pet tab shows the same switches.
    void emitTo('main', PET_PREFS_EVENT, prefs).catch(() => {});
  }, [behavior, prefs, syncWindow]);

  // Desktop physics: falling to the floor above the taskbar, walking, turning at the walls.
  useEffect(() => {
    let last = performance.now();
    let moving = false;
    const step = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const current = body.current;
      if (
        !prefsRef.current.physics ||
        awayRef.current ||
        drag.current ||
        resizing.current.busy ||
        !current ||
        !area.current ||
        moving
      ) {
        return;
      }
      const result = stepBody(
        current,
        windowSize.current,
        walkArea(monitors.current, current.x + windowSize.current.width / 2, area.current),
        dt,
        walkDirection.current,
        monitorScale.current,
        platforms.current,
        prefsRef.current.rideWindows,
      );
      behavior.setGrounded(result.grounded, now);
      behavior.setOnWindow(result.body.support !== null);
      if (result.wall) behavior.bumped(result.wall, now);
      const [x, y] = [Math.round(result.body.x), Math.round(result.body.y)];
      body.current = result.body;
      // "Komm her": stops below the pointer (or once it has walked past it).
      const target = comeTarget.current;
      if (target !== null) {
        const dx = target.x - (result.body.x + windowSize.current.width / 2);
        if (!behavior.coming) comeTarget.current = null;
        else if (Math.abs(dx) < COME_NEAR_PX * monitorScale.current || Math.sign(dx) !== target.direction) {
          comeTarget.current = null;
          behavior.arrived(now);
        }
      }
      if (x === Math.round(current.x) && y === Math.round(current.y)) return;
      // One move at a time; the next step waits for it.
      moving = true;
      void within(getCurrentWindow().setPosition(new PhysicalPosition(x, y)))
        .catch(() => {})
        .finally(() => {
          moving = false;
        });
    }, PHYSICS_TICK_MS);
    const refresh = window.setInterval(() => {
      if (prefsRef.current.physics && !drag.current) {
        const kept = body.current;
        void syncWindow()
          .then(() => {
            // Keep the falling speed and the window it stands on across the re-read.
            if (kept && body.current) {
              body.current.vy = kept.vy;
              body.current.support = kept.support;
              body.current.edge = kept.edge;
            }
          })
      }
    }, AREA_REFRESH_MS);
    return () => {
      window.clearInterval(step);
      window.clearInterval(refresh);
    };
  }, [behavior, syncWindow]);

  /**
   * "Komm her" (tray menu, double click on the tray icon): with physics the figure walks along
   * its floor below the pointer; without, or when it cannot walk now, it jumps there with its
   * feet at the pointer, inside the monitor's work area.
   */
  const comeHere = useCallback(async () => {
    const cursor = lastCursor.current;
    if (!cursor || awayRef.current || drag.current) return;
    const now = performance.now();
    if (prefsRef.current.physics && body.current) {
      const dx = cursor.x - (body.current.x + windowSize.current.width / 2);
      if (Math.abs(dx) < COME_NEAR_PX * monitorScale.current) {
        behavior.arrived(now);
        return;
      }
      const direction = dx < 0 ? -1 : 1;
      if (behavior.come(now, direction)) {
        comeTarget.current = { x: cursor.x, direction };
        return;
      }
    }
    await syncWindow().catch(() => {});
    const { width, height } = windowSize.current;
    const under = monitors.current.find(
      (m) => cursor.x >= m.x && cursor.x < m.x + m.width && cursor.y >= m.y && cursor.y < m.y + m.height,
    ) ?? area.current;
    if (!under || !width) return;
    const x = Math.round(Math.min(Math.max(cursor.x - width / 2, under.x), under.x + under.width - width));
    const y = Math.round(Math.min(Math.max(cursor.y - height, under.y), under.y + under.height - height));
    await within(getCurrentWindow().setPosition(new PhysicalPosition(x, y))).catch(() => {});
    savePetPlacement({ x, y });
    // The physics (if on) goes on from the new place.
    await syncWindow().catch(() => {});
    behavior.arrived(performance.now());
  }, [behavior, syncWindow]);

  /**
   * Resizes the pet to `wanted` (logical window height) with its feet where they stood. Runs one
   * resize at a time; wishes meanwhile (wheel notches) collect and the last one wins. The size
   * is remembered for the shown model too.
   */
  const resizeTo = useCallback(
    async (wanted: number) => {
      const queue = resizing.current;
      queue.next = clampPetHeight(wanted);
      if (queue.busy) return;
      queue.busy = true;
      try {
        while (queue.next !== null) {
          const height = queue.next;
          queue.next = null;
          if (height === heightRef.current) continue;
          const win = getCurrentWindow();
          const size = petWindowSize(height);
          const [scale, position, current] = await within(
            Promise.all([win.scaleFactor(), win.outerPosition(), win.innerSize()]),
          );
          const x = Math.round(position.x + (current.width - size.width * scale) / 2);
          const y = Math.round(position.y + current.height - size.height * scale);
          await within(win.setSize(new LogicalSize(size.width, size.height)));
          await within(win.setPosition(new PhysicalPosition(x, y)));
          heightRef.current = height;
          savePetPlacement({ height, x, y });
          if (modelRef.current) savePetModelHeight(modelRef.current, height);
        }
      } catch {
        queue.next = null;
      } finally {
        queue.busy = false;
      }
      // The Desktop-Pet tab's slider follows (also after Ctrl+wheel or a model's own size).
      void emitTo('main', PET_RESIZE_EVENT, heightRef.current).catch(() => {});
      await syncWindow().catch(() => {});
    },
    [syncWindow],
  );

  // The cue texts follow the language without restarting the behaviour timer.
  const cueTexts = useRef({ doze: '', wake: '' });
  useEffect(() => {
    cueTexts.current = { doze: t('pet.doze'), wake: t('pet.wake') };
  });

  // Power-saving on battery: no random actions, and at rest only ~12 FPS.
  const [onBattery, setOnBattery] = useState(false);
  const savingRef = useRef(false);
  useEffect(() => watchOnBattery(setOnBattery), []);
  useEffect(() => {
    savingRef.current = prefs.batterySaver && onBattery;
    behavior.setSaving(savingRef.current);
  }, [behavior, prefs.batterySaver, onBattery]);

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
      const dragging = drag.current;
      const stillFor = dragging ? now - Math.max(dragging.startedAt, dragging.movedAt) : 0;
      if (dragging?.ending && stillFor > DRAG_GIVE_UP_MS) {
        // Where it stands now is unknown: the physics waits for the next read (AREA_REFRESH_MS).
        body.current = null;
        drag.current = null;
        behavior.dragEnd(now);
      } else if (dragging && !dragging.ending && stillFor > DRAG_SETTLE_MS) {
        // Without a button state (outside Windows) the drag ends when the window rests.
        finishDrag(false);
      }
      if (awayRef.current) return;
      behavior.setDrive({ ...driveRef.current, night: isNightHour(new Date().getHours()) });
      const { frame, cues } = behavior.tick(now);
      setMode(frame.mode);
      setFaceOverride(frame.expression);
      setHop(frame.hop);
      setWalking(frame.walk !== 0);
      setLoop(frame.loop);
      sittingRef.current = frame.loop === 'sit';
      walkDirection.current = frame.walk;
      gazeOverride.current = frame.gaze;
      const stage = stageRef.current;
      stage?.setTurn(frame.turn);
      stage?.setSaver(savingRef.current && (frame.mode === 'idle' || frame.mode === 'dozing'));
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
        else say(cueTexts.current[cue.text]);
      }
    }, BEHAVIOR_TICK_MS);
    return () => window.clearInterval(timer);
  }, [behavior, say, playLocalGesture, syncWindow, finishDrag]);

  // State, voice and pointer from the main window and the backend.
  useEffect(() => {
    let isSubscribed = true;
    void useAppStore.getState().refreshLanguages().catch(() => {});
    const unlisteners = [
      listen<PetState>(PET_STATE_EVENT, ({ payload }) => {
        if (!isSubscribed) return;
        setPet(payload);
        if (payload.gesture) setGesture(payload.gesture);
        const store = useAppStore.getState();
        if (payload.appLanguage && payload.appLanguage !== store.appLanguage) store.setAppLanguage(payload.appLanguage);
        if (payload.theme && payload.theme !== store.theme) store.setTheme(payload.theme);
        if (payload.colorMode !== store.colorMode) store.setColorMode(payload.colorMode);
      }),
      listen<PetAudioFrame>(PET_AUDIO_EVENT, ({ payload }) => {
        const speaking = payload.visemes !== null;
        audioPlayer.feedRemoteFrame(payload.amplitude, payload.visemes);
        if (speaking !== speakingRef.current) {
          speakingRef.current = speaking;
          mouthOpen.current = false;
          behavior.setSpeaking(speaking);
          setIsSpeaking(speaking);
          // The bubble of the reply stays a moment after the voice ends.
          if (!speaking && bubbleTimer.current !== null) {
            window.clearTimeout(bubbleTimer.current);
            bubbleTimer.current = window.setTimeout(() => setBubble(null), BUBBLE_AFTER_VOICE_MS);
          }
        }
      }),
      listen<PetSentence>(PET_SENTENCE_EVENT, ({ payload }) => {
        // Shown a little longer than spoken, so a short sentence can be read.
        const ms = Math.max(1500, payload.ms + 600);
        behavior.say(performance.now(), ms);
        if (prefsRef.current.chatBubbles) say(payload.text, ms);
        setSentenceFace(payload.expression);
        if (sentenceTimer.current !== null) window.clearTimeout(sentenceTimer.current);
        sentenceTimer.current = window.setTimeout(() => setSentenceFace(null), ms);
      }),
      listen<PetSay>(PET_SAY_EVENT, ({ payload }) => {
        if (!prefsRef.current.chatBubbles || !payload.text) return;
        const ms = bubbleMs(payload.text);
        behavior.say(performance.now(), ms);
        say(payload.text, ms);
      }),
      listen<Platform[]>(PET_PLATFORMS_EVENT, ({ payload }) => {
        platforms.current = payload;
      }),
      listen(PET_HELLO_EVENT, () => {
        void emitTo('main', PET_READY_EVENT).catch(() => {});
      }),
      listen<PetScreen>(PET_SCREEN_EVENT, ({ payload }) => {
        setScreen(payload);
      }),
      listen<PetPrefs>(PET_PREFS_EVENT, ({ payload }) => {
        setPrefs((current) => (JSON.stringify(current) === JSON.stringify(payload) ? current : payload));
      }),
      // Adjusted in the avatar manager: the shown model takes it at once.
      listen<PetFramingChange>(PET_FRAMING_EVENT, ({ payload }) => {
        if (payload.modelPath !== modelRef.current) return;
        framingRef.current = payload.framing;
        setLift(payload.framing.lift);
        stageRef.current?.setFraming(payload.framing);
      }),
      listen<number>(PET_RESIZE_EVENT, ({ payload }) => {
        if (typeof payload === 'number') void resizeTo(payload);
      }),
      listen(PET_COME_EVENT, () => {
        void comeHere();
      }),
      listen<PetCursor>(PET_CURSOR_EVENT, ({ payload: { x, y, inside, button, gx, gy, t: polledAt } }) => {
        lastCursor.current = { x: gx, y: gy };
        const dragging = drag.current;
        if (dragging && !dragging.ending) {
          dragging.samples.push({ t: polledAt, x: gx, y: gy });
          if (dragging.samples.length > 30) dragging.samples.shift();
          // Released: the drag ends now, and a release in motion throws the figure.
          if (button === false) finishDrag(true);
        }
        const stage = stageRef.current;
        const { innerWidth: w, innerHeight: h } = window;
        behavior.pointer(performance.now());
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
        // Sitting draws the figure lower than the window: probe where it really is.
        stage.probe(x, sittingRef.current ? y - h * SIT_DROP : y, (hit) => setIgnore(!hit));
      }),
    ];
    void Promise.all(unlisteners).then(() => {
      if (isSubscribed) void emitTo('main', PET_READY_EVENT).catch(() => {});
    });
    const stopMoved = getCurrentWindow().onMoved(({ payload }) => {
      const now = performance.now();
      if (drag.current) drag.current.movedAt = now;
      if (drag.current || now - placementSavedAt.current > PLACEMENT_SAVE_MS) {
        placementSavedAt.current = now;
        savePetPlacement({ x: payload.x, y: payload.y });
      }
    });
    return () => {
      isSubscribed = false;
      for (const unlisten of unlisteners) void unlisten.then((stop) => stop());
      void stopMoved.then((stop) => stop());
      if (bubbleTimer.current !== null) window.clearTimeout(bubbleTimer.current);
      if (sentenceTimer.current !== null) window.clearTimeout(sentenceTimer.current);
    };
  }, [setIgnore, behavior, say, finishDrag, comeHere, resizeTo, headEnd]);

  // A new bubble leans away from the nearer screen edge (where the figure stands right now).
  useEffect(() => {
    if (!bubble) return undefined;
    let live = true;
    // Without physics the position is not followed all the time: read it once.
    void (body.current && area.current ? Promise.resolve() : syncWindow())
      .catch(() => {})
      .then(() => {
        const current = body.current;
        const monitor = area.current;
        if (!live || !current || !monitor) return;
        setBubbleSideNow(bubbleSide(current.x + windowSize.current.width / 2, monitor.x, monitor.width));
      });
    return () => {
      live = false;
    };
  }, [bubble, syncWindow]);

  // While a reply is written in the main window, the bubble shows typing dots; the reply replaces them.
  const thinking = !!pet?.thinking;
  const shownBubble = thinking && prefs.chatBubbles ? '…' : bubble;

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
    say(replies[Math.floor(Math.random() * replies.length)]!);
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

  const openMenu = async () => {
    const sizes: { key: PetSize; label: string }[] = [
      { key: 'small', label: t('pet.sizeSmall') },
      { key: 'medium', label: t('pet.sizeMedium') },
      { key: 'large', label: t('pet.sizeLarge') },
    ];
    const menu = await Menu.new({
      items: [
        { text: pet?.characterName ?? t('pet.title'), enabled: false },
        { item: 'Separator' },
        { text: t('pet.compose'), action: openCompose },
        { text: t('pet.pat'), action: () => void pat() },
        { text: t(statusOpen ? 'pet.hideStatus' : 'pet.showStatus'), action: () => setStatusOpen((open) => !open) },
        {
          text: t('pet.mood'),
          items: PET_MOODS.map((mood) => ({
            text: tEmotion(mood),
            checked: pet?.emotion === mood,
            action: () => void emitTo('main', PET_PICK_EMOTION_EVENT, mood).catch(() => {}),
          })),
        },
        {
          text: t('pet.figure'),
          items: [
            { text: t('pet.figureChat'), checked: prefs.figure === 'chat', action: () => setPrefs((p) => ({ ...p, figure: 'chat' })) },
            {
              text: t('pet.figure3d'),
              checked: prefs.figure === '3d',
              enabled: !!pet?.vrmPath,
              action: () => setPrefs((p) => ({ ...p, figure: '3d' })),
            },
            {
              text: t('pet.figureInochi2d'),
              checked: prefs.figure === 'inochi2d',
              enabled: !!pet?.inochi2dPath,
              action: () => setPrefs((p) => ({ ...p, figure: 'inochi2d' })),
            },
          ],
        },
        {
          text: t('pet.size'),
          items: sizes.map(({ key, label }) => ({
            text: label,
            checked: heightRef.current === PET_PRESETS[key],
            action: () => void resizeTo(PET_PRESETS[key]),
          })),
        },
        {
          text: t('pet.idleActions'),
          checked: prefs.idleActions,
          action: () => setPrefs((p) => ({ ...p, idleActions: !p.idleActions })),
        },
        {
          text: t('pet.batterySaver'),
          checked: prefs.batterySaver,
          action: () => setPrefs((p) => ({ ...p, batterySaver: !p.batterySaver })),
        },
        {
          text: t('pet.chatBubbles'),
          checked: prefs.chatBubbles,
          action: () => setPrefs((p) => ({ ...p, chatBubbles: !p.chatBubbles })),
        },
        {
          text: t('pet.physics'),
          checked: prefs.physics,
          action: () => setPrefs((p) => ({ ...p, physics: !p.physics })),
        },
        {
          text: t('pet.rideWindows'),
          checked: prefs.rideWindows,
          enabled: prefs.physics,
          action: () => setPrefs((p) => ({ ...p, rideWindows: !p.rideWindows })),
        },
        {
          text: t('pet.hideInFullscreen'),
          checked: prefs.hideInFullscreen,
          action: () => setPrefs((p) => ({ ...p, hideInFullscreen: !p.hideInFullscreen })),
        },
        { item: 'Separator' },
        { text: t('pet.lookAtScreen'), action: () => void askTool('take_screenshot') },
        { text: t('pet.readClipboard'), action: () => void askTool('read_clipboard') },
        { item: 'Separator' },
        { text: t('pet.openApp'), action: () => void api.showMainWindow() },
        { text: t('pet.hide'), action: () => void toggleDesktopPet(false) },
      ],
    });
    await menu.popup();
  };

  /** A quick click on a hand. */
  const highFive = async () => {
    behavior.highFive(performance.now());
    say(Math.random() < 0.5 ? t('pet.highFiveReply1') : t('pet.highFiveReply2'));
    await applyHormoneInteraction('high_five');
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    holdRef.current = true;
    // Sitting draws the figure lower than the window: ask where it really is.
    const y = sittingRef.current ? e.clientY - window.innerHeight * SIT_DROP : e.clientY;
    const hand = !!stageRef.current?.handAt(e.clientX, y);
    const press: NonNullable<typeof pressRef.current> = { x: e.screenX, y: e.screenY, dragging: false, hand, holding: false };
    // Pressed on a hand and kept there: the figure holds hands until it is let go.
    if (hand) {
      press.holdTimer = window.setTimeout(() => {
        if (pressRef.current !== press || press.dragging) return;
        press.holding = true;
        behavior.holdHand(performance.now());
        say(Math.random() < 0.5 ? t('pet.holdHandReply1') : t('pet.holdHandReply2'));
        void applyHormoneInteraction('hold_hand');
      }, HOLD_HAND_MS);
    }
    pressRef.current = press;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const press = pressRef.current;
    if (!press || press.dragging) return;
    if (Math.hypot(e.screenX - press.x, e.screenY - press.y) < DRAG_THRESHOLD) return;
    press.dragging = true;
    if (press.holdTimer !== undefined) window.clearTimeout(press.holdTimer);
    const now = performance.now();
    drag.current = { startedAt: now, movedAt: now, samples: [] };
    behavior.dragStart(now);
    // The system moves the window from here and keeps the button release (on Windows the
    // call returns at once; the drag ends when the moves stop).
    void getCurrentWindow()
      .startDragging()
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
    if (press.holding) behavior.releaseHand(performance.now());
    else if (press.hand) void highFive();
    else void pat(touchZoneAt(e.clientY / window.innerHeight, headEnd()));
  };

  const onStage = useCallback((stage: PetFigure | null) => {
    stageRef.current = stage;
    stage?.setPaused(awayRef.current);
    stage?.setFraming(framingRef.current);
  }, []);

  useEffect(() => {
    awayRef.current = away;
    stageRef.current?.setPaused(away);
    if (away) {
      setIgnore(true);
    } else {
      // Back from fullscreen or the lock screen: where it stands may have changed meanwhile.
      void syncWindow().catch(() => {});
    }
  }, [away, setIgnore, syncWindow]);
  const onLoops = useCallback(
    (available: Record<LoopRole, boolean>) => behavior.setSitMotion(available.sit),
    [behavior],
  );
  const petLink = useMemo(() => ({ onStage, onLoops }), [onStage, onLoops]);

  const modelPath = pet ? petModelPath(pet, prefs.figure) : '';
  // Each model comes back in the size it last had, with its own framing.
  useEffect(() => {
    modelRef.current = modelPath;
    const framing = modelPath ? loadPetFraming(modelPath) : DEFAULT_PET_FRAMING;
    framingRef.current = framing;
    setLift(framing.lift);
    stageRef.current?.setFraming(framing);
    const remembered = modelPath ? loadPetModelHeight(modelPath) : undefined;
    if (remembered !== undefined) void resizeTo(remembered);
  }, [modelPath, resizeTo]);

  // Ctrl+wheel over the figure: size in small steps (the pointer is over it, so it gets the wheel).
  useEffect(() => {
    const figure = figureRef.current;
    if (!figure) return undefined;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey || !e.deltaY) return;
      e.preventDefault();
      const notches = Math.max(-3, Math.min(3, -e.deltaY / 100)) || -Math.sign(e.deltaY);
      const from = resizing.current.next ?? heightRef.current;
      void resizeTo(from * WHEEL_STEP ** notches);
    };
    figure.addEventListener('wheel', onWheel, { passive: false });
    return () => figure.removeEventListener('wheel', onWheel);
  }, [resizeTo]);
  const viewerProps = {
    modelPath,
    // Only VRM models have a blush; glTF and MMD show their relaxed face instead.
    emotion:
      (faceOverride === 'blush' && /\.(pmx|pmd|glb|gltf)$/i.test(modelPath) ? 'relaxed' : faceOverride) ??
      sentenceFace ??
      pet?.expression ??
      'neutral',
    isSpeaking,
    motions: pet?.motions ?? [],
    gesture,
    pet: petLink,
    loop,
  };
  const hormones = companionState?.hormones;
  const thought = companionState?.scratchpad?.[0]?.thought;

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden select-none font-sans text-slate-100 ${away ? 'invisible' : ''}`}
      data-desktop-pet
      data-pet-away={away || undefined}
      data-pet-mode={mode}
      onContextMenu={(e) => {
        e.preventDefault();
        void openMenu();
      }}
    >
      {pet && modelPath && (
        <div
          aria-hidden
          data-pet-shadow
          // A lifted model stands higher; sitting rests on the window's edge regardless.
          style={lift && loop !== 'sit' ? { bottom: `${(PET_FEET_SHARE + lift) * 100}%` } : undefined}
          className={`pet-shadow ${loop === 'sit' ? 'pet-shadow-sit' : ''} ${
            mode === 'dragged' || mode === 'falling' ? 'pet-shadow-off' : hop ? 'pet-shadow-hop' : ''
          }`}
        />
      )}
      <div
        ref={figureRef}
        className={`absolute inset-0 ${hop ? 'pet-hop' : walking ? 'pet-walk' : ''}`}
        style={loop === 'sit' ? { transform: `translateY(${SIT_DROP * 100}%)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {pet && modelPath ? (
          <Suspense fallback={null}>
            {isInochi2dModel(modelPath) ? (
              <Inochi2dViewer
                key={modelPath}
                modelPath={modelPath}
                emotion={
                  (faceOverride ?? sentenceFace ? EXPRESSION_EMOTIONS[(faceOverride ?? sentenceFace)!] : undefined) ?? pet.emotion ?? 'neutral'
                }
                isSpeaking={isSpeaking}
                gesture={gesture}
                pet={petLink}
                loop={loop}
              />
            ) : isMmdModel(modelPath) ? (
              <MmdViewer key={modelPath} {...viewerProps} />
            ) : isGltfModel(modelPath) ? (
              <GltfViewer key={modelPath} {...viewerProps} />
            ) : (
              <VrmViewer key={modelPath} {...viewerProps} />
            )}
          </Suspense>
        ) : pet ? (
          <div data-pet-solid className="absolute inset-x-3 bottom-3 rounded-2xl bg-app/85 border border-slate-700 p-3 text-center text-xs text-slate-300">
            <p className="font-semibold text-slate-100">{pet.characterName}</p>
            <p className="mt-1">{t('pet.noModel')}</p>
          </div>
        ) : null}
      </div>

      {shownBubble && !statusOpen && !composeOpen && (
        <PetBubble
          text={shownBubble}
          ms={shownBubble === bubble ? bubbleShowMs.current : 0}
          side={bubbleSideNow}
          title={t('pet.compose')}
          onClick={openCompose}
        />
      )}

      {composeOpen && (
        <form
          data-pet-solid
          className="absolute top-2 inset-x-2 flex items-end gap-1.5 rounded-2xl bg-app/95 border border-accent-500/40 p-2 shadow-xl"
          onPointerDown={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            sendDraft();
          }}
        >
          <textarea
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- opened on purpose to type right away
            autoFocus
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setComposeOpen(false);
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendDraft();
              }
            }}
            placeholder={t('pet.composePlaceholder', { name: pet?.characterName ?? '' })}
            aria-label={t('pet.compose')}
            className="flex-1 resize-none rounded-xl bg-slate-900/90 border border-slate-700 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-accent-500"
          />
          <div className="flex flex-col gap-1">
            <button
              type="submit"
              title={t('pet.send')}
              aria-label={t('pet.send')}
              disabled={!draft.trim() || thinking}
              className="p-1.5 rounded-lg bg-accent-600 text-white disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setComposeOpen(false)}
              title={t('common.close')}
              aria-label={t('common.close')}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      )}

      {statusOpen && (
        <div
          data-pet-solid
          className="absolute top-2 inset-x-2 rounded-2xl bg-app/90 border border-accent-500/40 p-3 space-y-2 text-xs shadow-xl"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-accent-300 truncate">{pet?.characterName}</span>
            <button
              onClick={() => setStatusOpen(false)}
              title={t('pet.hideStatus')}
              aria-label={t('pet.hideStatus')}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-slate-300">
            {t('pet.feeling')} <strong>{tEmotion(pet?.emotion ?? 'neutral')}</strong>
            {hormones?.mood_label ? ` • ${tOptional(`mood.${hormones.mood_label}`, hormones.mood_label)}` : ''}
          </p>
          {bubble && <p className="italic text-slate-200">{bubble}</p>}
          {thought && (
            <p className="flex items-start gap-1.5 text-slate-400">
              <Brain className="mt-0.5 w-3 h-3 shrink-0" aria-hidden />
              <em>{thought}</em>
            </p>
          )}
          {hormones && (
            <div className="grid grid-cols-4 gap-1 font-mono text-[11px]">
              <span className="flex flex-col items-center rounded-lg bg-slate-900/90 p-1 text-amber-300" title={t('comp.dopamine')}>
                <Zap className="w-3 h-3" aria-hidden />{Math.round(hormones.dopamine)}%
              </span>
              <span className="flex flex-col items-center rounded-lg bg-slate-900/90 p-1 text-rose-300" title={t('comp.cortisol')}>
                <Flame className="w-3 h-3" aria-hidden />{Math.round(hormones.cortisol)}%
              </span>
              <span className="flex flex-col items-center rounded-lg bg-slate-900/90 p-1 text-accent2-300" title={t('comp.oxytocin')}>
                <Heart className="w-3 h-3" aria-hidden />{Math.round(hormones.oxytocin)}%
              </span>
              <span className="flex flex-col items-center rounded-lg bg-slate-900/90 p-1 text-indigo-300" title={t('comp.fatigue')}>
                <Moon className="w-3 h-3" aria-hidden />{Math.round(hormones.fatigue)}%
              </span>
            </div>
          )}
          <div className="grid grid-cols-4 gap-1.5">
            <button onClick={openCompose} title={t('pet.compose')} aria-label={t('pet.compose')} className="flex items-center justify-center rounded-xl border border-accent-500/30 bg-accent-950/40 py-1.5 text-accent-300 hover:bg-accent-900/50">
              <MessageCircle className="w-3 h-3" aria-hidden />
            </button>
            <button onClick={() => void pat()} className="flex items-center justify-center gap-1 rounded-xl border border-accent2-500/30 bg-accent2-950/40 py-1.5 text-accent2-300 hover:bg-accent2-900/50">
              <Smile className="w-3 h-3" aria-hidden />{t('pet.pat')}
            </button>
            <button onClick={() => void askTool('take_screenshot')} title={t('pet.lookAtScreen')} aria-label={t('pet.lookAtScreen')} className="flex items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-950/40 py-1.5 text-cyan-300 hover:bg-cyan-900/50">
              <Camera className="w-3 h-3" aria-hidden />
            </button>
            <button onClick={() => void askTool('read_clipboard')} title={t('pet.readClipboard')} aria-label={t('pet.readClipboard')} className="flex items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-950/40 py-1.5 text-indigo-300 hover:bg-indigo-900/50">
              <Clipboard className="w-3 h-3" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
