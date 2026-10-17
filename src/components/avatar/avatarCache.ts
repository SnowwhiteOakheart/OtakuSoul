import type * as THREE from 'three';

/**
 * Parsed 3D avatars kept for a while after their viewer closed: switching between the chat and the
 * avatar manager (or back to a model looked at a moment ago) skips reading and decoding again.
 *
 * A viewer leases a model; while leased nobody else gets it (a second viewer of the same file loads
 * its own copy), so one object never sits in two scenes. On release it goes back to the pose it was
 * loaded in (every node's transform and morph weights as recorded at the first lease, plus the
 * viewer's own `reset`) and waits for the next viewer; the oldest beyond `AVATAR_CACHE_SIZE` are
 * dropped. GPU resources belong to each viewer's renderer and are freed with it; the cache only
 * keeps the parsed scene (geometry and decoded textures in memory).
 */
export const AVATAR_CACHE_SIZE = 2;

interface NodeState {
  node: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  visible: boolean;
  morphs?: number[];
}

interface Entry {
  key: string;
  root: THREE.Object3D;
  pristine: NodeState[];
  reset?: () => void;
}

const idle = new Map<string, { value: unknown; entry: Entry }>();
const leased = new Map<unknown, Entry>();

function record(root: THREE.Object3D): NodeState[] {
  const states: NodeState[] = [];
  root.traverse((node) => {
    const influences = (node as THREE.Mesh).morphTargetInfluences;
    states.push({
      node,
      position: node.position.clone(),
      quaternion: node.quaternion.clone(),
      scale: node.scale.clone(),
      visible: node.visible,
      morphs: influences ? [...influences] : undefined,
    });
  });
  return states;
}

function restore(states: NodeState[]) {
  for (const { node, position, quaternion, scale, visible, morphs } of states) {
    node.position.copy(position);
    node.quaternion.copy(quaternion);
    node.scale.copy(scale);
    node.visible = visible;
    const influences = (node as THREE.Mesh).morphTargetInfluences;
    if (influences && morphs) for (let i = 0; i < influences.length; i += 1) influences[i] = morphs[i] ?? 0;
  }
  states[0]?.node.updateMatrixWorld(true);
}

/** The model of `key` if one is waiting, now leased to the caller; else `null` (load it). */
export function takeAvatar<T>(key: string): T | null {
  const waiting = idle.get(key);
  if (!waiting) return null;
  idle.delete(key);
  leased.set(waiting.value, waiting.entry);
  return waiting.value as T;
}

/**
 * Registers a freshly loaded model as leased. Call it before the viewer poses the model: the pose it
 * has now is the one it returns to. `reset` undoes what transforms cannot (spring bones, expressions).
 */
export function leaseAvatar<T>(key: string, value: T, root: THREE.Object3D, reset?: () => void) {
  leased.set(value, { key, root, pristine: record(root), reset });
}

/** Gives a leased model back: out of its scene, back to its first pose, kept for the next viewer. */
export function releaseAvatar(value: unknown) {
  const entry = leased.get(value);
  if (!entry) return;
  leased.delete(value);
  entry.root.removeFromParent();
  restore(entry.pristine);
  entry.reset?.();
  idle.delete(entry.key);
  idle.set(entry.key, { value, entry });
  while (idle.size > AVATAR_CACHE_SIZE) idle.delete(idle.keys().next().value!);
}

/** Drops a waiting model (its file was replaced by an import or removed). */
export function forgetAvatar(key: string) {
  idle.delete(key);
}

/** For tests: how many models wait. */
export const idleAvatarCount = () => idle.size;
