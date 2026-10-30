import { emitTo } from '@tauri-apps/api/event';
import type { AvatarMotion } from '../types';
import { bubbleText } from '../components/companion/petBehavior';
import { DEFAULT_PET_FRAMING, PET_LIFT_RANGE, PET_ZOOM_RANGE, type PetFraming } from './avatarViewState';
import type { GestureRequest } from '../utils/avatarGestures';
import type { Visemes } from './lipSync';
import type { ColorModePreference } from './theme';

/**
 * Desktop pet: the active avatar in its own transparent window (`desktop_pet.rs`). The window
 * has its own JavaScript and store, so the main window sends it what to show.
 */
export const PET_LABEL = 'desktop_pet';

/** Main → pet: figure, model, mood and the interface settings the pet's texts follow. */
export const PET_STATE_EVENT = 'pet:state';
/** Main → pet: voice level and mouth shapes while the main window plays a voice. */
export const PET_AUDIO_EVENT = 'pet:audio';
/** Main → pet: the main window (re)started and asks the pet to report. */
export const PET_HELLO_EVENT = 'pet:hello';
/** Pet → main: the pet is there and wants the current state. */
export const PET_READY_EVENT = 'pet:ready';
/** Pet → main: a mood was picked in the pet's menu. */
export const PET_PICK_EMOTION_EVENT = 'pet:pick-emotion';
/** Backend → main: the pet window was opened, hidden or closed. */
export const PET_VISIBILITY_EVENT = 'pet:visibility';
/** Backend → pet: global pointer position relative to the pet window. */
export const PET_CURSOR_EVENT = 'pet:cursor';
/** Backend → main: tray menu or global shortcut asks to show or hide the pet. */
export const PET_TOGGLE_EVENT = 'pet:toggle';
/** Backend → pet: "Komm her" from the tray (menu or double click); the figure comes to the pointer. */
export const PET_COME_EVENT = 'pet:come';

/** Backend → pet: a fullscreen window or the lock screen is in front (Windows only). */
export const PET_SCREEN_EVENT = 'pet:screen';

export interface PetScreen {
  fullscreen: boolean;
  locked: boolean;
  /** Handle of the window in front (0: none or the pet itself); only a change counts. */
  focus: number;
}

/** Backend → pet: music starts or stops playing on the computer (payload boolean; Windows only). */
export const PET_MUSIC_EVENT = 'pet:music';
/** Backend → pet: a beat of that music. */
export const PET_BEAT_EVENT = 'pet:beat';

/** Backend → pet: walkable top edges of the other windows (Windows only). */
export const PET_PLATFORMS_EVENT = 'pet:platforms';
/** Main → pet: a sentence of the reply starts playing (bubble and face in time with the voice). */
export const PET_SENTENCE_EVENT = 'pet:sentence';

export interface PetSentence {
  text: string;
  /** How long it plays (ms). */
  ms: number;
  /** VRM expression of this sentence; null when unknown. */
  expression: string | null;
}

/** Pet → main: the user wrote something in the pet's quick chat (sent to the active chat). */
export const PET_SEND_EVENT = 'pet:send';

/** Main → pet: a new chat reply of the figure, for the speech bubble. */
export const PET_SAY_EVENT = 'pet:say';

export interface PetSay {
  text: string;
  /**
   * A message the character wrote on their own: the pet greets, keeps the bubble longer and a
   * click on it opens that chat.
   */
  chat?: { charId: string; chatId: string };
}

/** Both ways: the pet's switches changed (its menu or the Desktop-Pet tab); payload `PetPrefs`. */
export const PET_PREFS_EVENT = 'pet:prefs';
/** Main → pet: a model's framing changed in the avatar manager; payload `PetFramingChange`. */
export const PET_FRAMING_EVENT = 'pet:framing';

export interface PetFramingChange {
  modelPath: string;
  framing: PetFraming;
}
/**
 * Main → pet: the Desktop-Pet tab picked a size; pet → main: the pet's size changed. Payload
 * the window height (logical px).
 */
export const PET_RESIZE_EVENT = 'pet:resize';

export interface PetState {
  characterName: string;
  /** The figure's id (its speaking portrait, if set up). */
  characterId: string;
  /** The model the chat shows (Inochi2D puppet in that view, otherwise the 3D model). */
  modelPath: string;
  /** The figure's 3D model and Inochi2D puppet ("" if none), for the pet's own choice. */
  vrmPath: string;
  inochi2dPath: string;
  /** The Live2D model ("" if none) and the portrait: a marker path (`portrait:<id>`, "" without picture) and its picture. */
  live2dPath: string;
  portraitPath: string;
  /** Left out when unchanged since the last state (it is large); the pet keeps the one it has. */
  portrait?: string;
  /** GoEmotions name (shown in the status panel). */
  emotion: string;
  /** VRM expression behind it (drives the face). */
  expression: string;
  motions: AvatarMotion[];
  gesture: GestureRequest | null;
  appLanguage: string;
  theme: string;
  colorMode: ColorModePreference;
  /** A reply is being written in the main window. */
  thinking: boolean;
}

export interface PetAudioFrame {
  amplitude: number;
  /** Null once the voice stopped. */
  visemes: Visemes | null;
}

export interface PetCursor {
  x: number;
  y: number;
  inside: boolean;
  /** Left mouse button held (Windows, Linux over X11; null elsewhere): its release ends a drag at once. */
  button: boolean | null;
  /**
   * Clicks may go through the window's empty parts. False in a Wayland session: the global
   * position stands still over other programs there, so the window stays clickable as a whole.
   */
  through: boolean;
  /** Global pointer position (physical px) and the backend's time of reading it (ms). */
  gx: number;
  gy: number;
  t: number;
}

/** Quick picks of the pet's size (menu); in between, Ctrl+wheel and the tab's slider. */
export type PetSize = 'small' | 'medium' | 'large';

/**
 * The pet's size is its window height (logical px); the width follows, tall since the pet
 * shows the whole figure.
 */
export const PET_PRESETS: Record<PetSize, number> = { small: 320, medium: 440, large: 580 };
export const PET_HEIGHT_MIN = 220;
export const PET_HEIGHT_MAX = 900;
const PET_ASPECT = 300 / 440;

export const clampPetHeight = (height: number) =>
  Math.round(Math.min(PET_HEIGHT_MAX, Math.max(PET_HEIGHT_MIN, height)));

/** Logical window size for a pet height. */
export const petWindowSize = (height: number) => {
  const clamped = clampPetHeight(height);
  return { width: Math.round(clamped * PET_ASPECT), height: clamped };
};

/** Where the pet stood (physical screen pixels) and how tall it is, shared by both windows. */
export interface PetPlacement {
  x?: number;
  y?: number;
  height: number;
}

const PLACEMENT_KEY = 'otakusoul.desktopPet';

export function loadPetPlacement(): PetPlacement {
  try {
    const stored = JSON.parse(localStorage.getItem(PLACEMENT_KEY) ?? 'null') as
      | (Partial<PetPlacement> & { size?: string })
      | null;
    // Before the free size: one of three steps.
    const legacy = stored?.size && stored.size in PET_PRESETS ? PET_PRESETS[stored.size as PetSize] : undefined;
    const height = typeof stored?.height === 'number' ? clampPetHeight(stored.height) : (legacy ?? PET_PRESETS.medium);
    const x = typeof stored?.x === 'number' ? stored.x : undefined;
    const y = typeof stored?.y === 'number' ? stored.y : undefined;
    return { x, y, height };
  } catch {
    return { height: PET_PRESETS.medium };
  }
}

const MODEL_HEIGHTS_KEY = 'otakusoul.desktopPetModelHeights';
/** Remembered heights per model; the oldest go beyond this many. */
const MODEL_HEIGHTS_MAX = 100;

function loadModelHeights(): Record<string, number> {
  try {
    const stored = JSON.parse(localStorage.getItem(MODEL_HEIGHTS_KEY) ?? 'null') as unknown;
    return stored && typeof stored === 'object' ? (stored as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** The height the pet last had with this model, if any. */
export function loadPetModelHeight(modelPath: string): number | undefined {
  const height = loadModelHeights()[modelPath];
  return typeof height === 'number' ? clampPetHeight(height) : undefined;
}

export function savePetModelHeight(modelPath: string, height: number) {
  if (!modelPath) return;
  try {
    const heights = loadModelHeights();
    delete heights[modelPath];
    heights[modelPath] = clampPetHeight(height);
    // Insertion order: the first keys are the longest unused.
    const keys = Object.keys(heights);
    for (const key of keys.slice(0, Math.max(0, keys.length - MODEL_HEIGHTS_MAX))) delete heights[key];
    localStorage.setItem(MODEL_HEIGHTS_KEY, JSON.stringify(heights));
  } catch {
    // Only a convenience: the pet then keeps its current size for this model.
  }
}

export function savePetPlacement(change: Partial<PetPlacement>) {
  try {
    localStorage.setItem(PLACEMENT_KEY, JSON.stringify({ ...loadPetPlacement(), ...change }));
  } catch {
    // Only a convenience: the pet then opens at its default place.
  }
}

const OPEN_KEY = 'otakusoul.desktopPetOpen';

/** The pet was open when last switched (not when the app quit): it opens again at start. */
export function loadPetOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function savePetOpen(open: boolean) {
  try {
    localStorage.setItem(OPEN_KEY, String(open));
  } catch {
    // Only a convenience: the pet then stays closed at the next start.
  }
}

/** The pet's own switches (its menu), kept in the shared webview storage. */
export interface PetPrefs {
  /** Random idle actions (look around, yawn, hop …). */
  idleActions: boolean;
  /** New chat replies as speech bubble. */
  chatBubbles: boolean;
  /** Gravity, screen edges and walking along the floor. */
  physics: boolean;
  /** On a window that gets moved, move along instead of falling off (off by default). */
  rideWindows: boolean;
  /** Step back while a game, video or presentation fills the screen. */
  hideInFullscreen: boolean;
  /** On battery the figure rests: no random actions, ~12 FPS while it stands still. */
  batterySaver: boolean;
  /** The voice is quieter at night (23–6 h) while the pet is open. */
  quietAtNight: boolean;
  /** Glances at a window switch and nods along to music (local signals only, nothing read). */
  reactToDesktop: boolean;
  /** Frames per second the figure is drawn with: smoother at 60, lighter on the GPU at 20. */
  frameRate: PetFrameRate;
  /** Which of the figure's models the pet shows: as in the chat, or always 3D / Inochi2D. */
  figure: PetFigureChoice;
}

export type PetFrameRate = 20 | 30 | 60;
export const FRAME_RATES: PetFrameRate[] = [20, 30, 60];

export type PetFigureChoice = 'chat' | '3d' | 'inochi2d' | 'live2d' | 'portrait';
const FIGURE_CHOICES: PetFigureChoice[] = ['chat', '3d', 'inochi2d', 'live2d', 'portrait'];

/** The portrait has no file: its "model path" is a marker that still keys size and framing. */
export const PORTRAIT_PREFIX = 'portrait:';
export const isPortraitPath = (path: string) => path.startsWith(PORTRAIT_PREFIX);
export const isLive2dPath = (path: string) => /\.model3?\.json$/i.test(path);

/** The model the pet shows for its choice; one the figure lacks falls back to the chat's. */
export function petModelPath(
  state: Pick<PetState, 'modelPath' | 'vrmPath' | 'inochi2dPath' | 'live2dPath' | 'portraitPath'>,
  figure: PetFigureChoice,
): string {
  if (figure === '3d' && state.vrmPath) return state.vrmPath;
  if (figure === 'inochi2d' && state.inochi2dPath) return state.inochi2dPath;
  if (figure === 'live2d' && state.live2dPath) return state.live2dPath;
  if (figure === 'portrait' && state.portraitPath) return state.portraitPath;
  return state.modelPath;
}

const PREFS_KEY = 'otakusoul.desktopPetPrefs';
const DEFAULT_PREFS: PetPrefs = {
  idleActions: true,
  chatBubbles: true,
  physics: true,
  rideWindows: false,
  hideInFullscreen: true,
  batterySaver: true,
  quietAtNight: true,
  reactToDesktop: true,
  frameRate: 30,
  figure: 'chat',
};

interface BatteryManagerLike extends EventTarget {
  charging: boolean;
}

/**
 * Calls `onChange(true)` while the device runs on battery (and `false` on mains power); stays
 * silent where the browser has no battery API (desktops, Firefox, Safari). Returns the stop function.
 */
export function watchOnBattery(onChange: (onBattery: boolean) => void): () => void {
  let stopped = false;
  let battery: BatteryManagerLike | null = null;
  const report = () => battery && !stopped && onChange(!battery.charging);
  void (navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> })
    .getBattery?.()
    .then((manager) => {
      battery = manager;
      manager.addEventListener('chargingchange', report);
      report();
    })
    .catch(() => {});
  return () => {
    stopped = true;
    battery?.removeEventListener('chargingchange', report);
  };
}

export function loadPetPrefs(): PetPrefs {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<PetPrefs> | null;
    return {
      idleActions: typeof stored?.idleActions === 'boolean' ? stored.idleActions : DEFAULT_PREFS.idleActions,
      chatBubbles: typeof stored?.chatBubbles === 'boolean' ? stored.chatBubbles : DEFAULT_PREFS.chatBubbles,
      physics: typeof stored?.physics === 'boolean' ? stored.physics : DEFAULT_PREFS.physics,
      rideWindows: typeof stored?.rideWindows === 'boolean' ? stored.rideWindows : DEFAULT_PREFS.rideWindows,
      hideInFullscreen:
        typeof stored?.hideInFullscreen === 'boolean' ? stored.hideInFullscreen : DEFAULT_PREFS.hideInFullscreen,
      batterySaver: typeof stored?.batterySaver === 'boolean' ? stored.batterySaver : DEFAULT_PREFS.batterySaver,
      quietAtNight: typeof stored?.quietAtNight === 'boolean' ? stored.quietAtNight : DEFAULT_PREFS.quietAtNight,
      reactToDesktop: typeof stored?.reactToDesktop === 'boolean' ? stored.reactToDesktop : DEFAULT_PREFS.reactToDesktop,
      frameRate: FRAME_RATES.includes(stored?.frameRate as PetFrameRate) ? stored!.frameRate! : DEFAULT_PREFS.frameRate,
      figure: FIGURE_CHOICES.includes(stored?.figure as PetFigureChoice) ? stored!.figure! : DEFAULT_PREFS.figure,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePetPrefs(prefs: PetPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Only a convenience: the defaults apply next time.
  }
}

const FRAMING_KEY = 'otakusoul.desktopPetFraming';

function loadFramings(): Record<string, PetFraming> {
  try {
    const stored = JSON.parse(localStorage.getItem(FRAMING_KEY) ?? 'null') as unknown;
    return stored && typeof stored === 'object' ? (stored as Record<string, PetFraming>) : {};
  } catch {
    return {};
  }
}

const clampTo = ([min, max]: [number, number], value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** The pet's framing of this model (avatar manager), or the default one. */
export function loadPetFraming(modelPath: string): PetFraming {
  const stored = loadFramings()[modelPath];
  return {
    zoom: clampTo(PET_ZOOM_RANGE, stored?.zoom, DEFAULT_PET_FRAMING.zoom),
    lift: clampTo(PET_LIFT_RANGE, stored?.lift, DEFAULT_PET_FRAMING.lift),
  };
}

/** Saves a model's framing; the default one is not kept. */
export function savePetFraming(modelPath: string, framing: PetFraming) {
  if (!modelPath) return;
  try {
    const framings = loadFramings();
    if (framing.zoom === DEFAULT_PET_FRAMING.zoom && framing.lift === DEFAULT_PET_FRAMING.lift) delete framings[modelPath];
    else framings[modelPath] = framing;
    localStorage.setItem(FRAMING_KEY, JSON.stringify(framings));
  } catch {
    // Only a convenience: the pet then shows the model with the default framing.
  }
}

/** Is this webview the pet window (`index.html?pet=true`)? */
export const isPetWindow = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('pet') === 'true';

/** Moods offered in the pet's menu (GoEmotions names). */
export const PET_MOODS = ['joy', 'love', 'amusement', 'surprise', 'curiosity', 'embarrassment', 'sadness', 'anger', 'neutral'] as const;

/** The pet's global shortcut as the backend reports it. */
export interface PetShortcut {
  shortcut: string;
  default: string;
  /** False when another program holds the combination. */
  registered: boolean;
}

type KeyLike = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>;

const MODIFIER_CODES = /^(Control|Shift|Alt|Meta|OS)(Left|Right)$/;
const NAMED_KEYS = /^(Space|Arrow(Up|Down|Left|Right)|Home|End|PageUp|PageDown|Insert|Delete|F([1-9]|1\d|2[0-4]))$/;

/**
 * The key combination of a key press as a shortcut string (`Control+Alt+KeyP` style as the
 * global-shortcut plugin reads it). Null while only modifiers are held, no modifier besides
 * Shift is held (that would swallow normal typing) or the key cannot be a shortcut.
 */
export function acceleratorFromKey(event: KeyLike): string | null {
  if (MODIFIER_CODES.test(event.code)) return null;
  if (!event.ctrlKey && !event.altKey && !event.metaKey) return null;
  const letter = /^Key([A-Z])$/.exec(event.code)?.[1] ?? /^Digit(\d)$/.exec(event.code)?.[1];
  const key = letter ?? (NAMED_KEYS.test(event.code) ? event.code : null);
  if (!key) return null;
  const parts = [event.ctrlKey && 'Control', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Super'];
  return [...parts.filter(Boolean), key].join('+');
}

/** A shortcut string for display ("Ctrl+Alt+Shift+P"). */
export function formatAccelerator(accelerator: string, mac = /Mac/i.test(navigator.platform)): string {
  return accelerator
    .replace(/CommandOrControl|CmdOrCtrl/gi, mac ? 'Cmd' : 'Ctrl')
    .replace(/Control/g, 'Ctrl')
    .replace(/(Super|Meta)/g, mac ? 'Cmd' : 'Win')
    .replace(/Alt/g, mac ? 'Option' : 'Alt');
}

/**
 * A message the character wrote on their own, announced by the open desktop pet: it greets and
 * shows the text in its bubble (a click opens the chat). False when no pet is open or it has
 * its bubbles off, so the caller knows only a notification reaches the user.
 */
export async function announceOnPet(content: string, chat: NonNullable<PetSay['chat']>): Promise<boolean> {
  const { useAppStore } = await import('../store/useAppStore');
  if (!useAppStore.getState().companionState?.overlay_active || !loadPetPrefs().chatBubbles) return false;
  const text = bubbleText(content);
  if (!text) return false;
  return emitTo(PET_LABEL, PET_SAY_EVENT, { text, chat } satisfies PetSay).then(
    () => true,
    () => false,
  );
}
