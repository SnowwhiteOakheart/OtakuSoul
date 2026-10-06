import { useEffect, useRef, useState, type RefObject } from 'react';
import type * as THREE from 'three';
import type { AvatarMotion } from '../../types';
import type { MotionRole } from '../../utils/avatarGestures';
import type { AvatarMotionPlayer } from './vrmMotions';

interface Options<Model> {
  /** The loaded avatar; motions are built for it (null while loading). */
  model: Model | null;
  /** Motions in formats this avatar can play. */
  motions: AvatarMotion[];
  player: RefObject<AvatarMotionPlayer | null>;
  load: (motion: AvatarMotion, model: Model) => Promise<THREE.AnimationClip | null>;
  gesture: { role: MotionRole; id: number } | null;
  /** The gesture that started (or '' when none could). */
  onGesture: (role: string) => void;
}

/**
 * Loads the motions that have a use for this avatar and plays requested gestures. Returns
 * how many motions are loaded.
 */
export function useAvatarMotions<Model>({ model, motions, player, load, gesture, onGesture }: Options<Model>): number {
  const [count, setCount] = useState(0);
  // Only gestures requested after the viewer opened play; an old one is not replayed.
  const lastGesture = useRef(gesture?.id ?? 0);
  const used = motions.filter((m) => m.role);
  // A new array with the same content must not reload the clips.
  const key = used.map((m) => `${m.file}:${m.role}`).join('|');

  useEffect(() => {
    if (!model) {
      setCount(0);
      return;
    }
    let cancelled = false;
    void Promise.all(
      used.map((motion) =>
        load(motion, model).catch((e) => {
          console.warn(`Bewegung ${motion.file} konnte nicht geladen werden:`, e);
          return null;
        }),
      ),
    ).then((clips) => {
      if (cancelled || !player.current) return;
      const byRole = new Map<MotionRole, THREE.AnimationClip[]>();
      clips.forEach((clip, i) => {
        if (!clip) return;
        const role = used[i]!.role as MotionRole;
        byRole.set(role, [...(byRole.get(role) ?? []), clip]);
      });
      player.current.setClips(byRole);
      setCount(clips.filter(Boolean).length);
    });
    return () => {
      cancelled = true;
    };
    // `key` stands for `used`; `load` and `player` are stable per viewer.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [model, key]);

  useEffect(() => {
    if (!gesture || gesture.id === lastGesture.current) return;
    lastGesture.current = gesture.id;
    if (player.current?.play(gesture.role)) onGesture(gesture.role);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [gesture]);

  return count;
}
