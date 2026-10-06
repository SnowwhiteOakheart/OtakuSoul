import { api } from '../../services/api';
import type {
  ScannedVrm,
  AvatarMotion,
  ScannedLive2d,
  EmotionResult,
} from '../../types';
import type { SliceCreator } from '../storeTypes';
import type { MotionRole } from '../../utils/avatarGestures';

/** 3D/Live2D avatar models, avatar mode and the current emotion. */
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
  currentEmotion: EmotionResult;
  setCurrentEmotion: (em: EmotionResult) => void;
  /** Imported body motions (VRMA) with their use. */
  avatarMotions: AvatarMotion[];
  refreshAvatarMotions: () => Promise<void>;
  /** The gesture the 3D avatar should play next; `id` makes repeats of the same one count. */
  avatarGesture: { role: MotionRole; id: number } | null;
  playAvatarGesture: (role: MotionRole) => void;
}

export const createAvatarSlice: SliceCreator<AvatarSlice> = (set, get) => ({
  scannedVrms: [],

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

  avatarMode: '3d',

  setAvatarMode: (mode) => {
    set({ avatarMode: mode });
    get().saveCurrentSettings();
  },

  currentEmotion: {
    emotion: 'neutral',
    vrm_expression: 'relaxed',
    live2d_expression: 'neutral_animation',
    confidence: 1.0,
    intensity: 0.5,
  },

  setCurrentEmotion: (currentEmotion) => set({ currentEmotion }),

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
});
