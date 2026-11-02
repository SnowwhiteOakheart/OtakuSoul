import { convertFileSrc } from '@tauri-apps/api/core';
import type { SceneDefinition, SceneState, StageMusicTrack } from '../types';
import { AudioFader } from './audioFade';

/** Moods the Stage plays music for; also the folder names under `<data>/music/` (Rust `stage_music::MOODS`). */
export const MUSIC_MOODS = ['calm', 'tavern', 'adventure', 'tension', 'mystery', 'combat', 'boss', 'romance', 'sorrow'] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];

/** Folder name of a story's music: `[a-z0-9_-]`, at most 64 characters (Rust `story_music::valid_set_id`). */
const SET_ID = /^[a-z0-9_-]{1,64}$/;

/**
 * The music set of a scene (`extensions.otakusoul_music.set`, else its id); null for scenes
 * without a music section, which play the general pool.
 */
export function musicSetOf(definition: Pick<SceneDefinition, 'id' | 'extensions'> | null | undefined): string | null {
  const music = (definition?.extensions as Record<string, unknown> | undefined)?.otakusoul_music;
  if (!music || typeof music !== 'object') return null;
  const named = (music as { set?: unknown }).set;
  return [typeof named === 'string' ? named : '', definition?.id ?? '']
    .map((id) => id.trim().toLowerCase())
    .find((id) => SET_ID.test(id)) ?? null;
}

export const isMusicMood = (value: unknown): value is MusicMood =>
  typeof value === 'string' && (MUSIC_MOODS as readonly string[]).includes(value);

/** A mood without own tracks borrows those of the first related mood that has some. */
const RELATED: Record<MusicMood, MusicMood[]> = {
  calm: [],
  tavern: ['calm'],
  adventure: ['calm'],
  tension: ['mystery'],
  mystery: ['tension', 'calm'],
  combat: ['tension'],
  boss: ['combat', 'tension'],
  romance: ['calm'],
  sorrow: ['calm'],
};

/**
 * The mood the scene calls for: a running fight decides (a boss among the living enemies or the
 * game master's "boss" makes it a boss fight), otherwise the game master's last pick, else calm.
 */
export function sceneMood(state: Pick<SceneState, 'combat' | 'current_music_mood'> | null | undefined): MusicMood {
  const picked = state?.current_music_mood;
  if (state?.combat?.is_active) {
    const bossAlive = state.combat.combatants.some((c) => c.role === 'boss' && c.hp > 0);
    return bossAlive || picked === 'boss' ? 'boss' : 'combat';
  }
  // Fight music only while a fight runs; after it the scene calms down.
  if (isMusicMood(picked) && picked !== 'combat' && picked !== 'boss') return picked;
  return 'calm';
}

/** The mood whose tracks play for `wanted`: itself or a related one with tracks; null without any. */
export function playableMood(wanted: MusicMood, tracks: StageMusicTrack[]): MusicMood | null {
  const moods = new Set(tracks.map((t) => t.mood));
  return [wanted, ...RELATED[wanted]].find((mood) => moods.has(mood)) ?? null;
}

/** The tracks that play for a mood: the story's own (its set) if it has any, else the general pool. */
export function moodTracks(tracks: StageMusicTrack[], mood: MusicMood): StageMusicTrack[] {
  const all = tracks.filter((t) => t.mood === mood);
  const story = all.filter((t) => t.set);
  return story.length > 0 ? story : all;
}

/** A random track of the mood, not the one that just played (when there are others). */
export function pickTrack(
  tracks: StageMusicTrack[],
  mood: MusicMood,
  last: string | null,
  random: () => number = Math.random,
): StageMusicTrack | null {
  const own = moodTracks(tracks, mood);
  const fresh = own.length > 1 ? own.filter((t) => t.path !== last) : own;
  return fresh[Math.floor(random() * fresh.length)] ?? null;
}

/** Cross-fade length when the mood changes; a new track of the same mood fades in faster. */
const MOOD_FADE_MS = 3000;
const TRACK_FADE_MS = 1500;

const VOLUME_KEY = 'otakusoul.stageMusicVolume';
const DEFAULT_VOLUME = 0.4;

export function loadMusicVolume(): number {
  try {
    const stored = Number(localStorage.getItem(VOLUME_KEY));
    return localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function saveMusicVolume(volume: number) {
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // Only a convenience: the default volume applies next time.
  }
}

interface Playing {
  audio: HTMLAudioElement;
  mood: MusicMood;
  path: string;
}

/**
 * Plays the Stage music: one track at a time, cross-faded when the mood changes; at its end the
 * next random track of the same mood follows. Only one instance plays (`stageMusic`).
 */
export class StageMusicPlayer {
  private current: Playing | null = null;
  private tracks: StageMusicTrack[] = [];
  private volume = loadMusicVolume();
  private fader = new AudioFader();

  constructor(private readonly createAudio: (src: string) => HTMLAudioElement = (src) => new Audio(src)) {}

  /** The mood playing now (null while silent). */
  get mood(): MusicMood | null {
    return this.current?.mood ?? null;
  }

  /** Plays music for `mood` (or a related one); keeps the running track when the mood stays. */
  play(mood: MusicMood, tracks: StageMusicTrack[]) {
    this.tracks = tracks;
    const target = playableMood(mood, tracks);
    if (!target) return this.stop();
    // Same mood and the track still belongs to it (another story's set changes it).
    const current = this.current;
    if (current?.mood === target && moodTracks(tracks, target).some((t) => t.path === current.path)) return;
    this.start(target, MOOD_FADE_MS);
  }

  stop() {
    if (!this.current) return;
    this.fader.fadeOut(this.current.audio, MOOD_FADE_MS);
    this.current = null;
  }

  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume));
    saveMusicVolume(this.volume);
    if (this.current && !this.fader.isFading(this.current.audio)) this.current.audio.volume = this.volume;
    else if (this.current) this.fader.fadeTo(this.current.audio, this.volume, TRACK_FADE_MS);
  }

  getVolume() {
    return this.volume;
  }

  private start(mood: MusicMood, fadeMs: number) {
    const track = pickTrack(this.tracks, mood, this.current?.path ?? null);
    if (!track) return this.stop();
    if (this.current) this.fader.fadeOut(this.current.audio, fadeMs);
    const audio = this.createAudio(convertFileSrc(track.path));
    audio.volume = 0;
    audio.loop = false;
    const playing: Playing = { audio, mood, path: track.path };
    // At the end of a track the next one of the same mood follows.
    audio.addEventListener('ended', () => {
      if (this.current === playing) this.start(mood, TRACK_FADE_MS);
    });
    audio.addEventListener('error', () => {
      console.warn('Stage music failed to play:', track.path);
      if (this.current === playing) this.current = null;
    });
    this.current = playing;
    void audio.play().catch((error: unknown) => console.warn('Stage music playback failed:', error));
    this.fader.fadeTo(audio, this.volume, fadeMs);
  }
}

export const stageMusic = new StageMusicPlayer();
