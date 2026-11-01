import { convertFileSrc } from '@tauri-apps/api/core';
import type { SceneState, StageMusicTrack } from '../types';

/** Moods the Stage plays music for; also the folder names under `<data>/music/` (Rust `stage_music::MOODS`). */
export const MUSIC_MOODS = ['calm', 'tavern', 'adventure', 'tension', 'mystery', 'combat', 'boss', 'romance', 'sorrow'] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];

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

/** A random track of the mood, not the one that just played (when there are others). */
export function pickTrack(
  tracks: StageMusicTrack[],
  mood: MusicMood,
  last: string | null,
  random: () => number = Math.random,
): StageMusicTrack | null {
  const own = tracks.filter((t) => t.mood === mood);
  const fresh = own.length > 1 ? own.filter((t) => t.path !== last) : own;
  return fresh[Math.floor(random() * fresh.length)] ?? null;
}

/** Cross-fade length when the mood changes; a new track of the same mood fades in faster. */
const MOOD_FADE_MS = 3000;
const TRACK_FADE_MS = 1500;
const FADE_STEP_MS = 50;

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
  private fades = new Map<HTMLAudioElement, ReturnType<typeof setInterval>>();

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
    if (this.current?.mood === target) return;
    this.start(target, MOOD_FADE_MS);
  }

  stop() {
    if (!this.current) return;
    this.fadeOut(this.current.audio, MOOD_FADE_MS);
    this.current = null;
  }

  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume));
    saveMusicVolume(this.volume);
    if (this.current && !this.fades.has(this.current.audio)) this.current.audio.volume = this.volume;
    else if (this.current) this.fadeTo(this.current.audio, this.volume, TRACK_FADE_MS);
  }

  getVolume() {
    return this.volume;
  }

  private start(mood: MusicMood, fadeMs: number) {
    const track = pickTrack(this.tracks, mood, this.current?.path ?? null);
    if (!track) return this.stop();
    if (this.current) this.fadeOut(this.current.audio, fadeMs);
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
    this.fadeTo(audio, this.volume, fadeMs);
  }

  private fadeOut(audio: HTMLAudioElement, ms: number) {
    this.fadeTo(audio, 0, ms, () => {
      audio.pause();
      audio.removeAttribute('src');
    });
  }

  private fadeTo(audio: HTMLAudioElement, target: number, ms: number, done?: () => void) {
    const running = this.fades.get(audio);
    if (running) clearInterval(running);
    const from = audio.volume;
    const steps = Math.max(1, Math.round(ms / FADE_STEP_MS));
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      audio.volume = Math.min(1, Math.max(0, from + ((target - from) * step) / steps));
      if (step >= steps) {
        clearInterval(timer);
        this.fades.delete(audio);
        done?.();
      }
    }, FADE_STEP_MS);
    this.fades.set(audio, timer);
  }
}

export const stageMusic = new StageMusicPlayer();
