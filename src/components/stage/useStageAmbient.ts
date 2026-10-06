import { useAmbientSound } from '../../hooks/useAmbientSound';

/** Volume of the background sound; voices and effects stay on top of it. */
const AMBIENT_VOLUME = 0.35;

/** Loops the scene's ambient sound file while `playing` (scene ambient set, not muted). */
export function useStageAmbient(name: string | null | undefined, playing: boolean) {
  useAmbientSound(name, playing, AMBIENT_VOLUME);
}
