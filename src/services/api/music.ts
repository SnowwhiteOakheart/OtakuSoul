import { invoke } from '@tauri-apps/api/core';
import type { SongEntry, SongFolder, SongRequest } from '../../types';

/** Song Studio: own songs with ACE-Step (models and progress live in `stage.ts`). */
export const musicApi = {
  /** Generates `request.versions` songs into the song folder; returns the saved file names. */
  generateSong: async (request: SongRequest): Promise<string[]> => {
    return await invoke<string[]>('generate_song', { request });
  },

  getSongFolder: async (): Promise<SongFolder> => {
    return await invoke<SongFolder>('get_song_folder');
  },

  /** `null` goes back to the default folder (system music folder + `OtakuSoul`). */
  setSongFolder: async (path: string | null): Promise<SongFolder> => {
    return await invoke<SongFolder>('set_song_folder', { path });
  },

  listSongs: async (): Promise<SongEntry[]> => {
    return await invoke<SongEntry[]>('list_songs');
  },

  deleteSong: async (fileName: string): Promise<void> => {
    return await invoke<void>('delete_song', { fileName });
  },

  openSongFolder: async (): Promise<void> => {
    return await invoke<void>('open_song_folder');
  },
};
