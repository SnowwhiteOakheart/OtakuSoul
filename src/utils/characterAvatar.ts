import { convertFileSrc } from '@tauri-apps/api/core';
import type { CharacterProfile } from '../types';

/**
 * Cards from disk name their picture's file (`avatar_path`) instead of sending it as Base64.
 * The interface shows it via the asset protocol; `avatar_data_url` then holds that URL, so
 * every `<img src={character.avatar_data_url}>` keeps working.
 *
 * The revision changes after saves and imports: the webview caches asset URLs, and a card
 * saved with a new picture keeps its file name.
 */
let revision = 0;

export function bumpAvatarRevision(): void {
  revision += 1;
}

export function withAvatarUrl<T extends CharacterProfile>(profile: T): T {
  if (profile.avatar_data_url || !profile.avatar_path) return profile;
  return { ...profile, avatar_data_url: `${convertFileSrc(profile.avatar_path)}?v=${revision}` };
}

/** Only a new picture (a data URL) travels to the backend; it reads the file itself otherwise. */
export function forBackend(profile: CharacterProfile): CharacterProfile {
  if (!profile.avatar_data_url || profile.avatar_data_url.startsWith('data:')) return profile;
  return { ...profile, avatar_data_url: undefined };
}
