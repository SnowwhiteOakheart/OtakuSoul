import { create } from 'zustand';
import { api } from '../../services/api';
import { errorCode, errorMessage } from '../../utils/errors';
import { toast } from '../ui/feedback';
import { translate } from '../../i18n';
import type { MusicGenProgress, SongRequest } from '../../types';

/** `set` of the Song Studio's `music-gen-progress` events (`music_gen::SONG_SET`). */
export const SONG_SET = '@song';

interface SongJobState {
  running: boolean;
  progress: MusicGenProgress | null;
  /** Bumped after every finished run, so the song list reloads. */
  finishedRuns: number;
  start: (request: SongRequest) => Promise<void>;
}

let listening = false;

/**
 * The running Song Studio job outside of the view: a song takes minutes, and the view is
 * unmounted on every tab change while the backend keeps going.
 */
export const useSongJob = create<SongJobState>((set, get) => ({
  running: false,
  progress: null,
  finishedRuns: 0,
  start: async (request) => {
    if (get().running) return;
    if (!listening) {
      listening = true;
      void api.onMusicGenProgress((progress) => {
        if (progress.set === SONG_SET) set({ progress });
      });
    }
    set({ running: true, progress: null });
    try {
      const files = await api.generateSong(request);
      toast.success(translate('songStudio.done', { count: files.length }));
    } catch (error) {
      // A cancel is the user's own choice, not an error.
      if (errorCode(error)?.code !== 'backend.music.cancelled') {
        toast.error(translate('musicGen.failed', { error: errorMessage(error) }));
      }
    } finally {
      set((state) => ({ running: false, finishedRuns: state.finishedRuns + 1 }));
    }
  },
}));
