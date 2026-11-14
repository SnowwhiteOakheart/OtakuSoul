import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  ImageStudioModel,
  ImageStudioProgress,
  ImageStudioRequest,
  SongEntry,
  SongRequest,
  StudioFolder,
  StudioImage,
  StudioKind,
} from '../../types';

/** Creative studios: own songs (ACE-Step) and images (local image engine), with their folders. */
export const musicApi = {
  /** Generates `request.versions` songs into the song folder; returns the saved file names. */
  generateSong: async (request: SongRequest): Promise<string[]> => {
    return await invoke<string[]>('generate_song', { request });
  },

  listSongs: async (): Promise<SongEntry[]> => {
    return await invoke<SongEntry[]>('list_songs');
  },

  getStudioFolder: async (kind: StudioKind): Promise<StudioFolder> => {
    return await invoke<StudioFolder>('get_studio_folder', { kind });
  },

  /** `null` goes back to the default folder (system music/pictures folder + `OtakuSoul`). */
  setStudioFolder: async (kind: StudioKind, path: string | null): Promise<StudioFolder> => {
    return await invoke<StudioFolder>('set_studio_folder', { kind, path });
  },

  openStudioFolder: async (kind: StudioKind): Promise<void> => {
    return await invoke<void>('open_studio_folder', { kind });
  },

  deleteStudioFile: async (kind: StudioKind, fileName: string): Promise<void> => {
    return await invoke<void>('delete_studio_file', { kind, fileName });
  },

  /** Installed local image models with their own size, steps and CFG. */
  listImageStudioModels: async (): Promise<ImageStudioModel[]> => {
    return await invoke<ImageStudioModel[]>('list_image_studio_models');
  },

  listStudioImages: async (): Promise<StudioImage[]> => {
    return await invoke<StudioImage[]>('list_studio_images');
  },

  /** Generates `request.count` images into the image folder; returns the saved file names. */
  generateStudioImages: async (request: ImageStudioRequest): Promise<string[]> => {
    return await invoke<string[]>('generate_studio_images', { request });
  },

  cancelStudioImages: async (): Promise<void> => {
    return await invoke<void>('cancel_studio_images');
  },

  onImageStudioProgress: async (callback: (data: ImageStudioProgress) => void): Promise<UnlistenFn> => {
    return await listen<ImageStudioProgress>('image-studio-progress', (event) => callback(event.payload));
  },
};
