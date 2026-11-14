import { lazy } from 'react';
import { loadCubismCore } from '../../../services/live2dRuntime';
import { PET_EDGE_SINK } from '../../../services/avatarViewState';
import type { PetSeat } from '../petBehavior';

export const MmdViewer = lazy(() => import('../../avatar/MmdViewer'));
export const GltfViewer = lazy(() => import('../../avatar/GltfViewer'));
export const isMmdModel = (path: string) => /\.(pmx|pmd)$/i.test(path);

/**
 * Sitting on a window's edge: the figure is drawn this share of the window lower, so its hips
 * rest on the edge and the legs hang over it (the window itself keeps standing on the edge).
 */
export const SIT_DROP = 0.2;
/** Sitting on the ground lowers the head by about this share of the window (a VRM pose). */
export const FLOOR_SIT_DROP = 0.3;
/** How much lower the head shows in the window while seated (the edge seat sinks the window). */
export const seatDrop = (seat: PetSeat | null) =>
  seat === 'floor' ? FLOOR_SIT_DROP : seat === 'edge' ? PET_EDGE_SINK : 0;
/** Share of the remaining sink the window moves per physics step (eases with the sitting pose). */
export const SINK_EASE = 0.25;
export const isGltfModel = (path: string) => /\.(glb|gltf)$/i.test(path);

// Inochi2D puppets bring their own runtime; only loaded for them.
export const Inochi2dViewer = lazy(() => import('../../avatar/Inochi2dViewer'));
// The Cubism core has to be loaded before the Live2D engine (as in the chat).
export const Live2DViewer = lazy(() =>
  loadCubismCore()
    .then(() => import('../../avatar/Live2DViewer'))
    .then((module) => ({ default: module.Live2DViewer })),
);
export const PortraitPet = lazy(() => import('../../avatar/PortraitPet'));
export const isInochi2dModel = (path: string) => /\.(inp|inx)$/i.test(path);

/** The pet's faces are VRM expressions; an Inochi2D puppet takes the feeling behind them. */
export const EXPRESSION_EMOTIONS: Record<string, string> = {
  happy: 'joy',
  angry: 'anger',
  sad: 'sadness',
  surprised: 'surprise',
  relaxed: 'relief',
  blush: 'embarrassment',
  neutral: 'neutral',
};

/** How long a speech bubble stays. */
export const BUBBLE_MS = 5000;
/** Pointer travel (px) after which pressing turns into dragging the window. */
export const DRAG_THRESHOLD = 4;
export const STATUS_POLL_MS = 5000;
/** The behaviour is advanced this often (gaze and faces are smoothed by the viewer). */
export const BEHAVIOR_TICK_MS = 100;
/** No window move for this long: the system drag has ended (or the figure hangs still and calms down). */
export const DRAG_SETTLE_MS = 1200;
/**
 * The pointer's moves in this span before its last move give a throw its speed (times from the
 * backend's pointer poll, so late events do not distort it).
 */
export const THROW_WINDOW_MS = 150;
/** Released longer than this after the last move: it was held still, no throw. */
export const THROW_STILL_MS = 250;
/** A bubble still showing when the voice ends stays this much longer. */
export const BUBBLE_AFTER_VOICE_MS = 2500;
/** Physics steps (window moves) per second while falling or walking. */
export const PHYSICS_TICK_MS = 33;
/** The monitor's work area is read again this often (taskbar moved, resolution changed). */
export const AREA_REFRESH_MS = 3000;
/** A message the character wrote on their own stays in the bubble at least this long. */
export const PROACTIVE_BUBBLE_MS = 12_000;
/** Peeking in from the side ends by itself after this long (ms). */
export const PEEK_MS = 90_000;
/** The desktop's colours beside the pet are read this often (ms) while the lights follow them. */
export const AMBIENT_POLL_MS = 1500;
/** At least this long between two model remarks about what happened to the pet (each costs a request). */
export const REMARK_GAP_MS = 120_000;
/** Physics ticks between two looks for a window to jump to (~1 s). */
export const JUMP_CHECK_TICKS = 30;
/** The remembered position is written at most this often while the pet moves itself. */
export const PLACEMENT_SAVE_MS = 500;
/** One wheel notch with Ctrl over the figure makes it this much larger or smaller. */
export const WHEEL_STEP = 1.06;
/** "Komm her" counts as arrived this close to the pointer (logical px from the figure's middle). */
export const COME_NEAR_PX = 40;

export const clamp = (value: number) => Math.max(-1, Math.min(1, value));

/** Window calls get this long; one that never answers (e.g. after a broken system drag) must not freeze the pet. */
export const WINDOW_CALL_MS = 1000;
/** A drag whose end does not settle within this long after the last move is ended anyway. */
export const DRAG_GIVE_UP_MS = DRAG_SETTLE_MS + 2000;

export function within<T>(promise: Promise<T>, ms = WINDOW_CALL_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error('window call timed out')), ms)),
  ]);
}
