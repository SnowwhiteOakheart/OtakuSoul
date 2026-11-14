import { create } from 'zustand';
import { api } from '../../services/api';
import { errorCode, errorMessage } from '../../utils/errors';
import { toast } from '../ui/feedback';
import { translate } from '../../i18n';
import type { ImageStudioProgress, ImageStudioRequest } from '../../types';

interface ImageJobState {
  running: boolean;
  progress: ImageStudioProgress | null;
  /** Bumped for every saved image and finished run, so the gallery reloads. */
  savedCount: number;
  start: (request: ImageStudioRequest) => Promise<void>;
}

let listening = false;

/** The running Image Studio batch outside of the view (it survives a tab change). */
export const useImageJob = create<ImageJobState>((set, get) => ({
  running: false,
  progress: null,
  savedCount: 0,
  start: async (request) => {
    if (get().running) return;
    if (!listening) {
      listening = true;
      void api.onImageStudioProgress((progress) => {
        set((state) => ({ progress, savedCount: progress.phase === 'saved' ? state.savedCount + 1 : state.savedCount }));
      });
    }
    set({ running: true, progress: null });
    try {
      const files = await api.generateStudioImages(request);
      toast.success(translate('imageStudio.done', { count: files.length }));
    } catch (error) {
      if (errorCode(error)?.code !== 'backend.localImage.cancelled') {
        toast.error(translate('imageStudio.failed', { error: errorMessage(error) }));
      }
    } finally {
      set((state) => ({ running: false, savedCount: state.savedCount + 1 }));
    }
  },
}));
