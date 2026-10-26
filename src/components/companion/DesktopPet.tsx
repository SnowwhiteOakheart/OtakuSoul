import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { emitTo, listen } from '@tauri-apps/api/event';
import { getCurrentWindow, LogicalSize, PhysicalPosition } from '@tauri-apps/api/window';
import { Menu } from '@tauri-apps/api/menu';
import { Brain, Camera, Clipboard, Flame, Heart, Moon, Smile, X, Zap } from 'lucide-react';
import { VrmViewer } from '../avatar/VrmViewer';
import type { AvatarStage } from '../avatar/avatarStage';
import { useAppStore, useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { api } from '../../services/api';
import { audioPlayer } from '../../services/audioPlayer';
import type { GestureRequest } from '../../utils/avatarGestures';
import {
  loadPetPlacement,
  PET_AUDIO_EVENT,
  PET_CURSOR_EVENT,
  PET_HELLO_EVENT,
  PET_MOODS,
  PET_PICK_EMOTION_EVENT,
  PET_READY_EVENT,
  PET_SIZES,
  PET_STATE_EVENT,
  savePetPlacement,
  type PetAudioFrame,
  type PetCursor,
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

const clamp = (value: number) => Math.max(-1, Math.min(1, value));

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

  const say = useCallback((text: string) => {
    setBubble(text);
    if (bubbleTimer.current !== null) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), BUBBLE_MS);
  }, []);

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
        audioPlayer.feedRemoteFrame(payload.amplitude, payload.visemes);
        setIsSpeaking(payload.visemes !== null);
      }),
      listen(PET_HELLO_EVENT, () => {
        void emitTo('main', PET_READY_EVENT).catch(() => {});
      }),
      listen<PetCursor>(PET_CURSOR_EVENT, ({ payload: { x, y, inside } }) => {
        const stage = stageRef.current;
        const { innerWidth: w, innerHeight: h } = window;
        // The figure looks after the pointer, also elsewhere on the desktop.
        if (stage) {
          stage.mouse.x = clamp((x - w / 2) / (w / 2));
          stage.mouse.y = clamp(-(y - h * 0.27) / (h / 2));
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
      savePetPlacement({ x: payload.x, y: payload.y });
    });
    return () => {
      isSubscribed = false;
      for (const unlisten of unlisteners) void unlisten.then((stop) => stop());
      void stopMoved.then((stop) => stop());
      if (bubbleTimer.current !== null) window.clearTimeout(bubbleTimer.current);
    };
  }, [setIgnore]);

  useEffect(() => {
    if (!statusOpen) return undefined;
    void fetchCompanionState();
    const timer = window.setInterval(() => void fetchCompanionState(), STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [statusOpen, fetchCompanionState]);

  const playLocalGesture = (role: GestureRequest['role']) => {
    // Negative ids never meet the main window's counter.
    localGestureId.current -= 1;
    setGesture({ role, id: localGestureId.current });
  };

  const pat = async () => {
    playLocalGesture('happy');
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
    // The system moves the window from here and keeps the button release.
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
  }, []);
  const petLink = useMemo(() => ({ onStage }), [onStage]);

  const modelPath = pet?.modelPath ?? '';
  const viewerProps = {
    modelPath,
    emotion: pet?.expression ?? 'neutral',
    isSpeaking,
    motions: pet?.motions ?? [],
    gesture,
    pet: petLink,
  };
  const hormones = companionState?.hormones;
  const thought = companionState?.scratchpad?.[0]?.thought;

  return (
    <div
      className="relative w-screen h-screen overflow-hidden select-none font-sans text-slate-100"
      data-desktop-pet
      onContextMenu={(e) => {
        e.preventDefault();
        void openMenu();
      }}
    >
      <div
        className="absolute inset-0"
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
