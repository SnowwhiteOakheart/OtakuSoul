import { readPortraitMotion, storePortraitMotion } from '../../utils/portraitMotion';
import { api } from '../../services/api';
import type {
  ScannedVrm,
  AvatarMotion,
  ScannedLive2d,
  EmotionResult,
} from '../../types';
import type { SliceCreator } from '../storeTypes';
import type { GestureRequest, MotionRole } from '../../utils/avatarGestures';

/** 3D/Live2D avatar models, avatar mode and the current emotion. */
/** A calm face: the start and what a character shows before their first reply. */
export const NEUTRAL_EMOTION: EmotionResult = {
  emotion: 'neutral',
  vrm_expression: 'relaxed',
  live2d_expression: 'neutral_animation',
  confidence: 1.0,
  intensity: 0.5,
};

export interface AvatarSlice {
  scannedVrms: ScannedVrm[];
  activeVrmPath: string | null;
  setActiveVrmPath: (path: string | null) => void;
  refreshVrmModels: () => Promise<void>;
  scannedLive2ds: ScannedLive2d[];
  activeLive2dPath: string | null;
  setActiveLive2dPath: (path: string | null) => void;
  refreshLive2dModels: () => Promise<void>;
  avatarMode: '3d' | 'live2d' | '2d';
  setAvatarMode: (mode: '3d' | 'live2d' | '2d') => void;
  /** 2D portraits breathe, sway and move with the voice (per device). */
  portraitMotion: boolean;
  setPortraitMotion: (on: boolean) => void;
  /** The expression of the avatar on screen (in a group chat: the speaker shown). */
  currentEmotion: EmotionResult;
  setCurrentEmotion: (em: EmotionResult) => void;
  /** Group chat: each character's last expression by speaker ID ('' = the chat's own character). */
  speakerEmotions: Record<string, EmotionResult>;
  setSpeakerEmotion: (speakerId: string, em: EmotionResult) => void;
  /** Imported body motions (VRMA) with their use. */
  avatarMotions: AvatarMotion[];
  refreshAvatarMotions: () => Promise<void>;
  /** The gesture the 3D avatar should play next; `id` makes repeats of the same one count. */
  avatarGesture: GestureRequest | null;
  playAvatarGesture: (role: MotionRole) => void;
  /** Plays a clip of the glTF model by name (gestures picked by hand). */
  playAvatarClip: (clip: string) => void;
  /** Counts changes to the uses of animations inside glTF models; viewers reload on it. */
  modelClipRevision: number;
  bumpModelClipRevision: () => void;
  /** Per glTF model: its own clips made for another skeleton, which the viewer leaves out. */
  clipMisfits: Record<string, string[]>;
  setClipMisfits: (modelPath: string, clips: string[]) => void;
  /** A face key (blink, aa, happy …) the 3D avatar shows for a moment, from the face editor. */
  avatarFacePreview: { key: string; id: number } | null;
  previewAvatarFace: (key: string) => void;
}

export const createAvatarSlice: SliceCreator<AvatarSlice> = (set, get) => ({
  scannedVrms: [],

  clipMisfits: {},

  setClipMisfits: (modelPath, clips) => set((state) => ({ clipMisfits: { ...state.clipMisfits, [modelPath]: clips } })),

  activeVrmPath: null,

  setActiveVrmPath: (activeVrmPath) => {
    set({ activeVrmPath });
    get().saveCurrentSettings();
  },

  refreshVrmModels: async () => {
    try {
      set({ scannedVrms: await api.scanVrmModels() });
    } catch (e) {
      console.error('Failed to scan VRM models:', e);
    }
  },

  scannedLive2ds: [],

  activeLive2dPath: null,

  setActiveLive2dPath: (activeLive2dPath) => {
    set({ activeLive2dPath });
    get().saveCurrentSettings();
  },

  refreshLive2dModels: async () => {
    try {
      const models = await api.scanLive2dModels();
      set({ scannedLive2ds: models });
      const firstModel = models[0];
      if (!get().activeLive2dPath && firstModel) {
        set({ activeLive2dPath: firstModel.model_path });
      }
    } catch (e) {
      console.error('Failed to scan Live2D models:', e);
    }
  },

  // Picture by default; a saved choice (3D, Live2D) wins once settings are loaded.
  avatarMode: '2d',

  setAvatarMode: (mode) => {
    set({ avatarMode: mode });
    get().saveCurrentSettings();
  },

  portraitMotion: readPortraitMotion(),

  setPortraitMotion: (on) => {
    storePortraitMotion(on);
    set({ portraitMotion: on });
  },

  currentEmotion: NEUTRAL_EMOTION,

  setCurrentEmotion: (currentEmotion) => set({ currentEmotion }),

  speakerEmotions: {},

  setSpeakerEmotion: (speakerId, em) => set((st) => ({ speakerEmotions: { ...st.speakerEmotions, [speakerId]: em } })),

  avatarMotions: [],

  refreshAvatarMotions: async () => {
    try {
      set({ avatarMotions: (await api.scanAvatarMotions()) ?? [] });
    } catch (e) {
      console.error('Failed to scan avatar motions:', e);
    }
  },

  avatarGesture: null,

  playAvatarGesture: (role) => set((state) => ({ avatarGesture: { role, id: (state.avatarGesture?.id ?? 0) + 1 } })),

  playAvatarClip: (clip) => set((state) => ({ avatarGesture: { clip, id: (state.avatarGesture?.id ?? 0) + 1 } })),

  modelClipRevision: 0,

  bumpModelClipRevision: () => set((state) => ({ modelClipRevision: state.modelClipRevision + 1 })),

  avatarFacePreview: null,

  previewAvatarFace: (key) => set((state) => ({ avatarFacePreview: { key, id: (state.avatarFacePreview?.id ?? 0) + 1 } })),
});
