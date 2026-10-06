import { useEffect, useRef } from 'react';
import { api } from '../services/api';

/**
 * Loops an ambient sound from the Stage library (`name`) while `playing`. The volume (0–1)
 * follows changes without restarting the sound.
 */
export function useAmbientSound(name: string | null | undefined, playing: boolean, volume: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const volumeRef = useRef(volume);

  useEffect(() => {
    volumeRef.current = volume;
    if (audioRef.current) audioRef.current.volume = Math.min(1, Math.max(0, volume));
  }, [volume]);

  useEffect(() => {
    if (!name || !playing) return;
    let cancelled = false;
    api
      .getStageAmbientAudio(name)
      .then((url) => {
        if (cancelled) return;
        const audio = new Audio(url);
        audio.loop = true;
        audio.volume = Math.min(1, Math.max(0, volumeRef.current));
        audioRef.current = audio;
        void audio.play().catch((error: unknown) => console.warn('Ambient playback failed:', error));
      })
      .catch((error: unknown) => console.warn('Ambient sound missing:', error));
    return () => {
      cancelled = true;
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [name, playing]);
}
