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
 * Whole figure from the feet (y = 0) to the top, for the desktop pet: the figure fills the
 * lower part of the window, the top fifth stays free for speech bubbles and the status panel.
 */
export function frameFullBody(topY: number, fovDegrees: number, aspect: number): VrmViewState {
  const tan = Math.tan((fovDegrees * Math.PI) / 360);
  const height = Math.max(0.5, topY);
  const bottom = -height * 0.02;
  const halfHeight = (height - bottom) / 0.8 / 2;
  const centerY = bottom + halfHeight;
  const halfWidth = height * 0.24;
  const distance = Math.max(halfHeight / tan, halfWidth / (tan * Math.max(aspect, 0.1)));
  return { camera: [0, centerY, distance], target: [0, centerY, 0] };
}
