const STORAGE_KEY = 'otakusoul.avatar-view-state.v1';

export interface Live2DViewState {
  xRatio: number;
  yRatio: number;
  zoom: number;
}

export interface VrmViewState {
  camera: [number, number, number];
  target: [number, number, number];
}

interface AvatarViewStateStore {
  live2d: Record<string, Live2DViewState>;
  /** Inochi2D puppets keep the same 2D view (position and zoom) as Live2D. */
  inochi2d: Record<string, Live2DViewState>;
  vrm: Record<string, VrmViewState>;
}

const EMPTY_STORE: AvatarViewStateStore = { live2d: {}, inochi2d: {}, vrm: {} };
const record = <T,>(value: unknown): Record<string, T> =>
  value && typeof value === 'object' ? (value as Record<string, T>) : {};

function readStore(): AvatarViewStateStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<AvatarViewStateStore>;
    return { live2d: record(parsed.live2d), inochi2d: record(parsed.inochi2d), vrm: record(parsed.vrm) };
  } catch {
    return { ...EMPTY_STORE, live2d: {}, inochi2d: {}, vrm: {} };
  }
}

function writeStore(store: AvatarViewStateStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.warn('Avatar-Ansicht konnte nicht gespeichert werden:', error);
  }
}

function isFiniteTuple(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => Number.isFinite(entry) && Math.abs(entry) <= 100)
  );
}

/** 2D view of a Live2D model or (with `kind` = `inochi2d`) an Inochi2D puppet. */
export function loadLive2DViewState(modelPath: string, kind: 'live2d' | 'inochi2d' = 'live2d'): Live2DViewState | null {
  const state = readStore()[kind][modelPath];
  if (
    !state ||
    !Number.isFinite(state.xRatio) ||
    !Number.isFinite(state.yRatio) ||
    !Number.isFinite(state.zoom) ||
    Math.abs(state.xRatio) > 10 ||
    Math.abs(state.yRatio) > 10 ||
    state.zoom < 0.1 ||
    state.zoom > 8
  ) {
    return null;
  }
  return state;
}

export function saveLive2DViewState(modelPath: string, state: Live2DViewState, kind: 'live2d' | 'inochi2d' = 'live2d') {
  if (!modelPath) return;
  const store = readStore();
  store[kind][modelPath] = state;
  writeStore(store);
}

export function loadVrmViewState(modelPath: string): VrmViewState | null {
  const state = readStore().vrm[modelPath];
  if (!state || !isFiniteTuple(state.camera) || !isFiniteTuple(state.target)) return null;
  const distance = Math.hypot(
    state.camera[0] - state.target[0],
    state.camera[1] - state.target[1],
    state.camera[2] - state.target[2],
  );
  if (distance < 0.1 || distance > 20) return null;
  return state;
}

export function saveVrmViewState(modelPath: string, state: VrmViewState) {
  if (!modelPath) return;
  const store = readStore();
  store.vrm[modelPath] = state;
  writeStore(store);
}

export function clearVrmViewState(modelPath: string) {
  const store = readStore();
  if (!(modelPath in store.vrm)) return;
  delete store.vrm[modelPath];
  writeStore(store);
}

/**
 * Upper-body framing from the model itself instead of fixed coordinates: the view centres a
 * little below the head and backs off far enough that the top of the model (hair, ears) and
 * the start of the shoulders fit, also in narrow portrait columns.
 */
export function frameUpperBody(headY: number, topY: number, fovDegrees: number, aspect: number): VrmViewState {
  const tan = Math.tan((fovDegrees * Math.PI) / 360);
  const centerY = headY - 0.12;
  const halfHeight = Math.max(0.3, topY - centerY + 0.06);
  // Face and the start of the shoulders; more would shrink the face in narrow columns.
  const halfWidth = 0.18;
  const distance = Math.min(2.4, Math.max(0.6, halfHeight / tan, halfWidth / (tan * Math.max(aspect, 0.1))));
  return { camera: [0, centerY + 0.03, distance], target: [0, centerY, 0] };
}

/**
 * The desktop pet's framing of one model, set in the avatar manager for figures with unusual
 * proportions (chibi, very tall hair, MMD props): `zoom` > 1 shows it larger (the top may be
 * cut), `lift` moves the feet up by that share of the window height (props under the feet).
 */
export interface PetFraming {
  zoom: number;
  lift: number;
}

export const DEFAULT_PET_FRAMING: PetFraming = { zoom: 1, lift: 0 };
export const PET_ZOOM_RANGE: [number, number] = [0.5, 2];
export const PET_LIFT_RANGE: [number, number] = [-0.3, 0.3];
/** Where the feet stand in the pet window without a lift (share of its height, from the bottom). */
export const PET_FEET_SHARE = 0.02 / 1.275;
/** Share of the pet window the whole figure fills at zoom 1 (the rest: bubble room on top). */
const PET_FIGURE_FILL = 0.8 / 1.02;
/**
 * Sitting on a window's edge with the legs hanging, the pet window sinks this share of its height
 * below the edge, so the legs have room; the seat is then this high above the window's bottom.
 */
export const PET_EDGE_SINK = 0.2;
/** Where that edge is in the figure (share of the model height above its feet), at default framing. */
export const PET_EDGE_SEAT = (PET_EDGE_SINK - PET_FEET_SHARE) / PET_FIGURE_FILL;
/**
 * How far the toes reach towards the camera, as share of the model height. Half the real reach:
 * enough that the window edge does not cut the toes from the front, small enough that the figure
 * does not float when it turns to the side (sitting) and the toes no longer point at the camera.
 */
const PET_FOOT_REACH = 0.05;

/**
 * Where the top of the pet figure shows (share of the window height from the top) with this
 * framing; 0 or less when it reaches the window's top. The same for 3D, Live2D, Inochi2D and
 * portraits (all fill the lower part of the window alike).
 */
export const petFigureTop = (framing: PetFraming = DEFAULT_PET_FRAMING): number =>
  1 - (PET_FEET_SHARE + framing.lift) - PET_FIGURE_FILL * framing.zoom;

/**
 * Whole figure from the feet (y = 0) to the top, for the desktop pet: the figure fills the
 * lower part of the window, the top fifth stays free for speech bubbles and the status panel.
 * A model's own framing zooms around the feet, which stay where they stand (plus its lift).
 */
export function frameFullBody(
  topY: number,
  fovDegrees: number,
  aspect: number,
  framing: PetFraming = DEFAULT_PET_FRAMING,
): VrmViewState {
  const tan = Math.tan((fovDegrees * Math.PI) / 360);
  const height = Math.max(0.5, topY);
  // The whole figure (2 % below the feet) fills the lower 80 % of the window at zoom 1.
  const halfHeight = (height * 1.02) / 0.8 / 2 / framing.zoom;
  const halfWidth = (height * 0.32) / framing.zoom;
  const distance = Math.max(halfHeight / tan, halfWidth / (tan * Math.max(aspect, 0.1)));
  // The toes point at the camera, which looks from about the middle of the body: in perspective
  // they show lower than the feet's plane. They (not the heels) stand at the feet's share, or the
  // window's bottom edge cuts them off.
  const reach = Math.min(PET_FOOT_REACH * height, distance * 0.5);
  const centerY = (1 - 2 * (PET_FEET_SHARE + framing.lift)) * (distance - reach) * tan;
  return { camera: [0, centerY, distance], target: [0, centerY, 0] };
}
