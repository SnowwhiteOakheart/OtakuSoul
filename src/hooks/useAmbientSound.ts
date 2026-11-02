import { useEffect, useRef } from 'react';
import { api } from '../services/api';
import { AmbientLoop } from '../services/ambientLoop';

/**
 * Loops an ambient sound from the Stage library (`name`) while `playing`. It fades in and out,
 * a new sound cross-fades with the old one and the loop point has no hard seam. The volume
 * (0–1) follows changes without restarting the sound.
 */
export function useAmbientSound(name: string | null | undefined, playing: boolean, volume: number) {
  const loopRef = useRef<AmbientLoop | null>(null);
  const volumeRef = useRef(volume);

  useEffect(() => {
    volumeRef.current = volume;
    loopRef.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    if (!name || !playing) return;
    let cancelled = false;
    api
      .getStageAmbientAudio(name)
      .then((url) => {
        if (cancelled) return;
        const loop = new AmbientLoop(url, volumeRef.current);
        loopRef.current = loop;
        loop.start();
      })
      .catch((error: unknown) => console.warn('Ambient sound missing:', error));
    return () => {
      cancelled = true;
      // The old sound fades out while the next one (if any) fades in.
      loopRef.current?.stop();
      loopRef.current = null;
    };
  }, [name, playing]);
}
