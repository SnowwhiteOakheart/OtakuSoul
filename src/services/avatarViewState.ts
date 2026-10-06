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
  vrm: Record<string, VrmViewState>;
}

const EMPTY_STORE: AvatarViewStateStore = { live2d: {}, vrm: {} };

function readStore(): AvatarViewStateStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<AvatarViewStateStore>;
    return {
      live2d: parsed.live2d && typeof parsed.live2d === 'object' ? parsed.live2d : {},
      vrm: parsed.vrm && typeof parsed.vrm === 'object' ? parsed.vrm : {},
    };
  } catch {
    return { ...EMPTY_STORE, live2d: {}, vrm: {} };
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

export function loadLive2DViewState(modelPath: string): Live2DViewState | null {
  const state = readStore().live2d[modelPath];
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

export function saveLive2DViewState(modelPath: string, state: Live2DViewState) {
  if (!modelPath) return;
  const store = readStore();
  store.live2d[modelPath] = state;
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
