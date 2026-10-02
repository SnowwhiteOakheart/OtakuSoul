import { useEffect } from 'react';
import { api } from '../../services/api';

/** Volume of the background sound; voices and effects stay on top of it. */
const AMBIENT_VOLUME = 0.35;

/** Loops the scene's ambient sound file while `playing` (scene ambient set, not muted). */
export function useStageAmbient(name: string | null | undefined, playing: boolean) {
  useEffect(() => {
    if (!name || !playing) return;
    let cancelled = false;
    let audio: HTMLAudioElement | null = null;
    api
      .getStageAmbientAudio(name)
      .then((url) => {
        if (cancelled) return;
        audio = new Audio(url);
        audio.loop = true;
        audio.volume = AMBIENT_VOLUME;
        void audio.play().catch((error: unknown) => console.warn('Ambient playback failed:', error));
      })
      .catch((error: unknown) => console.warn('Ambient sound missing:', error));
    return () => {
      cancelled = true;
      audio?.pause();
      audio = null;
    };
  }, [name, playing]);
}
