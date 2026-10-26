import { useEffect, useRef, useState, type RefObject } from 'react';
import type * as THREE from 'three';
import type { AvatarMotion } from '../../types';
import type { GestureRequest, LoopRole, MotionRole } from '../../utils/avatarGestures';
import type { AvatarMotionPlayer } from './vrmMotions';

interface Options<Model> {
  /** The loaded avatar; motions are built for it (null while loading). */
  model: Model | null;
  /** Motions in formats this avatar can play. */
  motions: AvatarMotion[];
  player: RefObject<AvatarMotionPlayer | null>;
  load: (motion: AvatarMotion, model: Model) => Promise<THREE.AnimationClip | null>;
  gesture: GestureRequest | null;
  /** The avatar's mood (VRM expression); motions meant for it are preferred. */
  mood?: string;
  /** The gesture that started (its use, or the clip name when played by hand). */
  onGesture: (role: string) => void;
  /**
   * Clips the model brings itself (glTF animations), by use. They win over imported motions of
   * the same use; imported ones fill the other uses.
   */
  ownClips?: Map<MotionRole, THREE.AnimationClip[]>;
  /** Clips of the model without a use, played only when picked by hand. */
  extraClips?: THREE.AnimationClip[];
  /** A state loop to play instead of the idle loop (desktop pet walking or sitting). */
  loop?: LoopRole | null;
  /** Which state loops this avatar has motions for (after its motions loaded). */
  onLoops?: (available: Record<LoopRole, boolean>) => void;
}

/**
 * Loads the motions that have a use for this avatar and plays requested gestures. Returns
 * how many motions are loaded.
 */
export function useAvatarMotions<Model>({
  model,
  motions,
  player,
  load,
  gesture,
  mood = 'neutral',
  onGesture,
  ownClips,
  extraClips,
  loop = null,
  onLoops,
}: Options<Model>): number {
  const [count, setCount] = useState(0);
  // Only gestures requested after the viewer opened play; an old one is not replayed.
  const lastGesture = useRef(gesture?.id ?? 0);
  const used = motions.filter((m) => m.role && !ownClips?.get(m.role as MotionRole)?.length);
  // A new array with the same content must not reload the clips.
  const key = used.map((m) => `${m.file}:${m.role}:${m.mood}`).join('|');
  const moodRef = useRef(mood);

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
      const byRole = new Map<MotionRole, THREE.AnimationClip[]>(ownClips);
      clips.forEach((clip, i) => {
        if (!clip) return;
        clip.userData = { ...clip.userData, mood: used[i]!.mood };
        const role = used[i]!.role as MotionRole;
        byRole.set(role, [...(byRole.get(role) ?? []), clip]);
      });
      player.current.setMood(moodRef.current);
      player.current.setClips(byRole, extraClips);
      setCount([...byRole.values()].reduce((sum, list) => sum + list.length, 0) + (extraClips?.length ?? 0));
    });
    return () => {
      cancelled = true;
    };
    // `key` stands for `used`; `load` and `player` are stable per viewer.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [model, key, ownClips, extraClips]);

  useEffect(() => {
    moodRef.current = mood;
    player.current?.setMood(mood);
    // `player` is stable per viewer.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [mood]);

  useEffect(() => {
    if (!gesture || gesture.id === lastGesture.current) return;
    lastGesture.current = gesture.id;
    if (gesture.clip) {
      if (player.current?.playClip(gesture.clip)) onGesture(gesture.clip);
    } else if (gesture.role && player.current?.play(gesture.role)) {
      onGesture(gesture.role);
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [gesture]);

  // State loops follow the request, also once motions arrived after it.
  const onLoopsRef = useRef(onLoops);
  useEffect(() => {
    onLoopsRef.current = onLoops;
  }, [onLoops]);
  useEffect(() => {
    const current = player.current;
    if (!current) return;
    current.setLoopState(loop);
    onLoopsRef.current?.({ walk: current.has('walk'), sit: current.has('sit') });
    // `player` is stable per viewer; `count` changes once the clips are set.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [loop, count]);

  return count;
}
