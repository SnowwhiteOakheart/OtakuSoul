import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { emitTo, listen } from '@tauri-apps/api/event';
import { currentMonitor, getCurrentWindow, LogicalSize, monitorFromPoint, PhysicalPosition } from '@tauri-apps/api/window';
import { Menu } from '@tauri-apps/api/menu';
import { Brain, Camera, Clipboard, Flame, Heart, Moon, Smile, X, Zap } from 'lucide-react';
import { VrmViewer } from '../avatar/VrmViewer';
import type { AvatarStage } from '../avatar/avatarStage';
import { useAppStore, useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { api } from '../../services/api';
import { audioPlayer } from '../../services/audioPlayer';
import { SILENT_VISEMES } from '../../services/lipSync';
import { bubbleMs, PetBehavior, type Gaze, type PetMode } from './petBehavior';
import { stepBody, type Body, type Platform, type Rect } from './petPhysics';
import type { GestureRequest } from '../../utils/avatarGestures';
import {
  loadPetPlacement,
  loadPetPrefs,
  PET_AUDIO_EVENT,
  PET_CURSOR_EVENT,
  PET_HELLO_EVENT,
  PET_MOODS,
  PET_PICK_EMOTION_EVENT,
  PET_PLATFORMS_EVENT,
  PET_READY_EVENT,
  PET_SAY_EVENT,
  PET_SCREEN_EVENT,
  PET_SIZES,
  PET_STATE_EVENT,
  savePetPlacement,
  savePetPrefs,
  type PetAudioFrame,
  type PetCursor,
  type PetPrefs,
  type PetSay,
  type PetScreen,
  type PetSize,
  type PetState,
} from '../../services/desktopPet';

const MmdViewer = lazy(() => import('../avatar/MmdViewer'));
const GltfViewer = lazy(() => import('../avatar/GltfViewer'));
const isMmdModel = (path: string) => /\.(pmx|pmd)$/i.test(path);
const isGltfModel = (path: string) => /\.(glb|gltf)$/i.test(path);

/** How long a speech bubble stays. */
const BUBBLE_MS = 5000;
/** Pointer travel (px) after which pressing turns into dragging the window. */
const DRAG_THRESHOLD = 4;
const STATUS_POLL_MS = 5000;
/** The behaviour is advanced this often (gaze and faces are smoothed by the viewer). */
const BEHAVIOR_TICK_MS = 100;
/** No window move for this long: the system drag has ended (or the figure hangs still and calms down). */
const DRAG_SETTLE_MS = 1200;
/** A bubble still showing when the voice ends stays this much longer. */
const BUBBLE_AFTER_VOICE_MS = 2500;
/** Physics steps (window moves) per second while falling or walking. */
const PHYSICS_TICK_MS = 33;
/** The monitor's work area is read again this often (taskbar moved, resolution changed). */
const AREA_REFRESH_MS = 3000;
/** The remembered position is written at most this often while the pet moves itself. */
const PLACEMENT_SAVE_MS = 500;

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
  const [bubble, setBubble] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<PetPrefs>(loadPetPrefs);
  const [behavior] = useState(() => new PetBehavior(performance.now()));
  const [mode, setMode] = useState<PetMode>('idle');
  const [faceOverride, setFaceOverride] = useState<string | null>(null);
  const [hop, setHop] = useState(false);
  const [walking, setWalking] = useState(false);
  /** Desktop physics: the window (physical px), its size, the floor's work area and the scale. */
  const body = useRef<Body | null>(null);
  const windowSize = useRef({ width: 0, height: 0 });
  const area = useRef<Rect | null>(null);
  const monitorScale = useRef(1);
  const walkDirection = useRef<-1 | 0 | 1>(0);
  /** Top edges of the other windows to stand on (empty outside Windows). */
  const platforms = useRef<Platform[]>([]);
  const placementSavedAt = useRef(0);
  /** Where the pointer would have the figure look; the behaviour may look elsewhere. */
  const pointerGaze = useRef<Gaze>({ x: 0, y: 0 });
  const gazeOverride = useRef<Gaze | null>(null);
  const drag = useRef<{ startedAt: number; movedAt: number; ending?: boolean } | null>(null);
  const speakingRef = useRef(false);
  const mouthOpen = useRef(false);
  const prefsRef = useRef(prefs);
  /** Fullscreen window or lock screen in front: the pet steps back (not drawn, no clicks, no moves). */
  const [screen, setScreen] = useState<PetScreen>({ fullscreen: false, locked: false });
  const away = screen.locked || (screen.fullscreen && prefs.hideInFullscreen);
  const awayRef = useRef(away);
  const stageRef = useRef<AvatarStage | null>(null);
  const ignoreRef = useRef<boolean | null>(null);
  /** Pressed on the pet: click-through stays off until released. */
  const holdRef = useRef(false);
  const pressRef = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const bubbleTimer = useRef<number | null>(null);
  const localGestureId = useRef(0);

  const setIgnore = useCallback((ignore: boolean) => {
    if (ignore && holdRef.current) return;
    if (ignoreRef.current === ignore) return;
    ignoreRef.current = ignore;
    void getCurrentWindow().setIgnoreCursorEvents(ignore).catch(() => {});
  }, []);

  const say = useCallback((text: string, ms = BUBBLE_MS) => {
    setBubble(text);
    if (bubbleTimer.current !== null) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
  }, []);

  const playLocalGesture = useCallback((role: GestureRequest['role']) => {
    // Negative ids never meet the main window's counter.
    localGestureId.current -= 1;
    setGesture({ role, id: localGestureId.current });
  }, []);

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
  }, []);

  useEffect(() => {
    prefsRef.current = prefs;
    behavior.setIdleActions(prefs.idleActions);
    behavior.setPhysics(prefs.physics);
    if (prefs.physics) void syncWindow().catch(() => {});
    savePetPrefs(prefs);
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
      if (!prefsRef.current.physics || awayRef.current || drag.current || !current || !area.current || moving) return;
      const result = stepBody(
        current,
        windowSize.current,
        area.current,
        dt,
        walkDirection.current,
        monitorScale.current,
        platforms.current,
        prefsRef.current.rideWindows,
      );
      behavior.setGrounded(result.grounded, now);
      if (result.wall) behavior.bumped(result.wall);
      const [x, y] = [Math.round(result.body.x), Math.round(result.body.y)];
      body.current = result.body;
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

  // The cue texts follow the language without restarting the behaviour timer.
  const cueTexts = useRef({ doze: '', wake: '' });
  useEffect(() => {
    cueTexts.current = { doze: t('pet.doze'), wake: t('pet.wake') };
  });

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
        // Where it was let go, the physics takes over (and lets it fall).
        dragging.ending = true;
        void syncWindow()
          .catch(() => {})
          .finally(() => {
            drag.current = null;
            behavior.dragEnd(performance.now());
          });
      }
      if (awayRef.current) return;
      const { frame, cues } = behavior.tick(now);
      setMode(frame.mode);
      setFaceOverride(frame.expression);
      setHop(frame.hop);
      setWalking(frame.walk !== 0);
      walkDirection.current = frame.walk;
      gazeOverride.current = frame.gaze;
      const stage = stageRef.current;
      stage?.setTurn(frame.turn);
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
  }, [behavior, say, playLocalGesture, syncWindow]);

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
      listen<PetCursor>(PET_CURSOR_EVENT, ({ payload: { x, y, inside } }) => {
        const stage = stageRef.current;
        const { innerWidth: w, innerHeight: h } = window;
        behavior.pointer(performance.now());
        // The figure looks after the pointer, also elsewhere on the desktop.
        pointerGaze.current = { x: clamp((x - w / 2) / (w / 2)), y: clamp(-(y - h * 0.27) / (h / 2)) };
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
        stage.probe(x, y, (hit) => setIgnore(!hit));
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
    };
  }, [setIgnore, behavior, say]);

  useEffect(() => {
    if (!statusOpen) return undefined;
    void fetchCompanionState();
    const timer = window.setInterval(() => void fetchCompanionState(), STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [statusOpen, fetchCompanionState]);

  const pat = async () => {
    behavior.pat(performance.now());
    say(t('pet.patReply'));
    await applyHormoneInteraction('compliment');
  };

  // Screenshots and the clipboard need the user's yes in the main window.
  const askTool = async (tool: 'take_screenshot' | 'read_clipboard') => {
    const request = await requestToolCall(tool, {});
    if (request) {
      say(t('pet.confirmInApp'));
      await api.showMainWindow();
    }
  };

  const resize = async (size: PetSize) => {
    const win = getCurrentWindow();
    const { width, height } = PET_SIZES[size];
    const [scale, position, current] = await Promise.all([win.scaleFactor(), win.outerPosition(), win.innerSize()]);
    // The feet stay where they stood.
    const x = Math.round(position.x + (current.width - width * scale) / 2);
    const y = Math.round(position.y + current.height - height * scale);
    await win.setSize(new LogicalSize(width, height));
    await win.setPosition(new PhysicalPosition(x, y));
    savePetPlacement({ size, x, y });
    await syncWindow();
  };

  const openMenu = async () => {
    const size = loadPetPlacement().size;
    const sizes: { key: PetSize; label: string }[] = [
      { key: 'small', label: t('pet.sizeSmall') },
      { key: 'medium', label: t('pet.sizeMedium') },
      { key: 'large', label: t('pet.sizeLarge') },
    ];
    const menu = await Menu.new({
      items: [
        { text: pet?.characterName ?? t('pet.title'), enabled: false },
        { item: 'Separator' },
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
          text: t('pet.size'),
          items: sizes.map(({ key, label }) => ({ text: label, checked: size === key, action: () => void resize(key) })),
        },
        {
          text: t('pet.idleActions'),
          checked: prefs.idleActions,
          action: () => setPrefs((p) => ({ ...p, idleActions: !p.idleActions })),
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

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    holdRef.current = true;
    pressRef.current = { x: e.screenX, y: e.screenY, dragging: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const press = pressRef.current;
    if (!press || press.dragging) return;
    if (Math.hypot(e.screenX - press.x, e.screenY - press.y) < DRAG_THRESHOLD) return;
    press.dragging = true;
    const now = performance.now();
    drag.current = { startedAt: now, movedAt: now };
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
  const onPointerUp = () => {
    const press = pressRef.current;
    pressRef.current = null;
    holdRef.current = false;
    if (press && !press.dragging) void pat();
  };

  const onStage = useCallback((stage: AvatarStage | null) => {
    stageRef.current = stage;
    stage?.setPaused(awayRef.current);
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
  const petLink = useMemo(() => ({ onStage }), [onStage]);

  const modelPath = pet?.modelPath ?? '';
  const viewerProps = {
    modelPath,
    emotion: faceOverride ?? pet?.expression ?? 'neutral',
    isSpeaking,
    motions: pet?.motions ?? [],
    gesture,
    pet: petLink,
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
      <div
        className={`absolute inset-0 ${hop ? 'pet-hop' : walking ? 'pet-walk' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {pet && modelPath ? (
          <Suspense fallback={null}>
            {isMmdModel(modelPath) ? (
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

      {bubble && !statusOpen && (
        <button
          type="button"
          data-pet-solid
          aria-live="polite"
          className="absolute top-2 inset-x-3 rounded-2xl bg-app/90 border border-accent-500/40 px-3 py-2 text-left text-xs text-slate-100 shadow-lg"
          onClick={() => setBubble(null)}
        >
          {bubble}
        </button>
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
          <div className="grid grid-cols-3 gap-1.5">
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
