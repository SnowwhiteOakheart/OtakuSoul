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

/** Is this webview the pet window (`index.html?pet=true`)? */
export const isPetWindow = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('pet') === 'true';

/** Moods offered in the pet's menu (GoEmotions names). */
export const PET_MOODS = ['joy', 'love', 'amusement', 'surprise', 'curiosity', 'embarrassment', 'sadness', 'anger', 'neutral'] as const;
