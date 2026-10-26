import type { AvatarMotion } from '../types';
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

/** Backend → pet: a fullscreen window or the lock screen is in front (Windows only). */
export const PET_SCREEN_EVENT = 'pet:screen';

export interface PetScreen {
  fullscreen: boolean;
  locked: boolean;
}

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
}

export interface PetState {
  characterName: string;
  modelPath: string;
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
  /** Left mouse button held (Windows; null elsewhere): its release ends a drag at once. */
  button: boolean | null;
  /** Global pointer position (physical px) and the backend's time of reading it (ms). */
  gx: number;
  gy: number;
  t: number;
}

export type PetSize = 'small' | 'medium' | 'large';

/** Logical window sizes; tall, since the pet shows the whole figure. */
export const PET_SIZES: Record<PetSize, { width: number; height: number }> = {
  small: { width: 220, height: 320 },
  medium: { width: 300, height: 440 },
  large: { width: 400, height: 580 },
};

/** Where the pet stood (physical screen pixels) and how large it is, shared by both windows. */
export interface PetPlacement {
  x?: number;
  y?: number;
  size: PetSize;
}

const PLACEMENT_KEY = 'otakusoul.desktopPet';

export function loadPetPlacement(): PetPlacement {
  try {
    const stored = JSON.parse(localStorage.getItem(PLACEMENT_KEY) ?? 'null') as Partial<PetPlacement> | null;
    const size = stored?.size && stored.size in PET_SIZES ? stored.size : 'medium';
    const x = typeof stored?.x === 'number' ? stored.x : undefined;
    const y = typeof stored?.y === 'number' ? stored.y : undefined;
    return { x, y, size };
  } catch {
    return { size: 'medium' };
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
}

const PREFS_KEY = 'otakusoul.desktopPetPrefs';
const DEFAULT_PREFS: PetPrefs = {
  idleActions: true,
  chatBubbles: true,
  physics: true,
  rideWindows: false,
  hideInFullscreen: true,
};

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

/** Is this webview the pet window (`index.html?pet=true`)? */
export const isPetWindow = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('pet') === 'true';

/** Moods offered in the pet's menu (GoEmotions names). */
export const PET_MOODS = ['joy', 'love', 'amusement', 'surprise', 'curiosity', 'embarrassment', 'sadness', 'anger', 'neutral'] as const;
