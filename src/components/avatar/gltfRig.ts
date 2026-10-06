import * as THREE from 'three';

/** Bone roles of a humanoid glTF rig, found by Mixamo-style names (with or without prefix). */
const BONE_NAMES = {
  hips: 'hips',
  spine: 'spine',
  neck: 'neck',
  head: 'head',
  leftArm: 'leftarm',
  leftForeArm: 'leftforearm',
  rightArm: 'rightarm',
  rightForeArm: 'rightforearm',
} as const;
export type RigBone = keyof typeof BONE_NAMES;

/** "mixamorig:LeftArm", "mixamorigLeftArm", "LeftArm" → "leftarm". */
export const plainBoneName = (name: string) => name.replace(/^mixamorig[:_]?/i, '').toLowerCase();

/** The humanoid bones of a glTF scene by role; missing ones stay undefined. */
export function findRigBones(root: THREE.Object3D): Partial<Record<RigBone, THREE.Object3D>> {
  const byName = new Map<string, THREE.Object3D>();
  root.traverse((node) => {
    const key = plainBoneName(node.name);
    if (!byName.has(key) && ((node as THREE.Bone).isBone || node.type === 'Object3D' || node.type === 'Group')) byName.set(key, node);
  });
  return Object.fromEntries(
    Object.entries(BONE_NAMES).map(([role, name]) => [role, byName.get(name)]).filter(([, node]) => node),
  ) as Partial<Record<RigBone, THREE.Object3D>>;
}

type MorphRecipe = [string, number][];
/**
 * Each expression and mouth shape as morph recipes, best first: Oculus visemes and ARKit
 * blendshapes (used by most face-rigged glTF avatars), then simple names.
 */
const RECIPES: Record<string, MorphRecipe[]> = {
  blink: [[['eyeBlinkLeft', 1], ['eyeBlinkRight', 1]], [['eyesClosed', 1]], [['blink', 1]]],
  aa: [[['viseme_aa', 1]], [['jawOpen', 0.8]]],
  ih: [[['viseme_I', 1]], [['jawOpen', 0.3], ['mouthStretchLeft', 0.5], ['mouthStretchRight', 0.5]]],
  ou: [[['viseme_U', 1]], [['mouthPucker', 0.9], ['jawOpen', 0.2]]],
  ee: [[['viseme_E', 1]], [['jawOpen', 0.4], ['mouthSmileLeft', 0.3], ['mouthSmileRight', 0.3]]],
  oh: [[['viseme_O', 1]], [['mouthFunnel', 0.8], ['jawOpen', 0.5]]],
  happy: [[['mouthSmileLeft', 1], ['mouthSmileRight', 1], ['cheekSquintLeft', 0.5], ['cheekSquintRight', 0.5]], [['mouthSmile', 1]], [['happy', 1]]],
  angry: [[['browDownLeft', 1], ['browDownRight', 1], ['mouthFrownLeft', 0.5], ['mouthFrownRight', 0.5]], [['angry', 1]]],
  sad: [[['browInnerUp', 1], ['mouthFrownLeft', 0.7], ['mouthFrownRight', 0.7]], [['sad', 1]]],
  surprised: [[['browInnerUp', 0.8], ['eyeWideLeft', 1], ['eyeWideRight', 1], ['jawOpen', 0.3]], [['surprised', 1]]],
  relaxed: [[['mouthSmileLeft', 0.4], ['mouthSmileRight', 0.4]], [['relaxed', 1]]],
};

/**
 * Drives the face of a glTF avatar: `set` collects weights per expression for one frame,
 * `apply` adds up what they mean per morph target (several share `jawOpen`) on every mesh.
 */
export class MorphFace {
  private readonly meshes: THREE.Mesh[] = [];
  private readonly recipes = new Map<string, MorphRecipe>();
  private readonly frame = new Map<string, number>();

  constructor(root: THREE.Object3D) {
    const names = new Set<string>();
    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
        this.meshes.push(mesh);
        Object.keys(mesh.morphTargetDictionary).forEach((name) => names.add(name));
      }
    });
    for (const [key, options] of Object.entries(RECIPES)) {
      const recipe = options.find((option) => option.some(([name]) => names.has(name)));
      if (recipe) this.recipes.set(key, recipe.filter(([name]) => names.has(name)));
    }
  }

  /** Which expressions and mouth shapes this face can show. */
  get supported(): string[] {
    return [...this.recipes.keys()];
  }

  set(key: string, weight: number) {
    for (const [name, factor] of this.recipes.get(key) ?? []) this.frame.set(name, (this.frame.get(name) ?? 0) + weight * factor);
  }

  apply() {
    for (const mesh of this.meshes) {
      const dictionary = mesh.morphTargetDictionary!;
      for (const [name, index] of Object.entries(dictionary)) {
        if (this.frame.has(name) || this.recipesUse(name)) mesh.morphTargetInfluences![index] = Math.min(1, this.frame.get(name) ?? 0);
      }
    }
    this.frame.clear();
  }

  private recipesUse(name: string) {
    for (const recipe of this.recipes.values()) if (recipe.some(([n]) => n === name)) return true;
    return false;
  }
}

/** Rest rotations of a rig in world space, taken once before anything animates it. */
export interface RigRest {
  world: Map<THREE.Object3D, THREE.Quaternion>;
  parentWorld: Map<THREE.Object3D, THREE.Quaternion>;
  hipsHeight: number;
}

export function captureRest(root: THREE.Object3D): RigRest {
  root.updateWorldMatrix(true, true);
  const world = new Map<THREE.Object3D, THREE.Quaternion>();
  const parentWorld = new Map<THREE.Object3D, THREE.Quaternion>();
  root.traverse((node) => {
    world.set(node, node.getWorldQuaternion(new THREE.Quaternion()));
    parentWorld.set(node, node.parent ? node.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion());
  });
  const hips = findRigBones(root).hips;
  const rootY = root.getWorldPosition(new THREE.Vector3()).y;
  return { world, parentWorld, hipsHeight: hips ? Math.abs(hips.getWorldPosition(new THREE.Vector3()).y - rootY) : 1 };
}

/**
 * Moves a Mixamo clip onto another rig with Mixamo-style bone names: each key goes from the
 * source rest pose into world space and back into the target's rest pose, so rigs whose bind
 * pose or bone axes differ still move the same way; hips movement is scaled to the leg length.
 */
export function retargetToRig(clip: THREE.AnimationClip, source: THREE.Object3D, target: THREE.Object3D, rest: RigRest): THREE.AnimationClip {
  const targets = new Map<string, THREE.Object3D>();
  target.traverse((node) => {
    if (!targets.has(plainBoneName(node.name))) targets.set(plainBoneName(node.name), node);
  });
  source.updateWorldMatrix(true, true);
  const sourceHips = source.getObjectByName('mixamorigHips');
  const scale = rest.hipsHeight / (sourceHips?.getWorldPosition(new THREE.Vector3()).y || 1);
  const q = new THREE.Quaternion();
  const tracks: THREE.KeyframeTrack[] = [];
  for (const track of clip.tracks) {
    const [sourceName, property] = track.name.split('.');
    const from = source.getObjectByName(sourceName!);
    const to = targets.get(plainBoneName(sourceName!));
    if (!from || !to) continue;
    if (track instanceof THREE.QuaternionKeyframeTrack) {
      const sourceRestInverse = from.getWorldQuaternion(new THREE.Quaternion()).invert();
      const sourceParent = from.parent ? from.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
      const targetRest = rest.world.get(to) ?? new THREE.Quaternion();
      const targetParentInverse = (rest.parentWorld.get(to) ?? new THREE.Quaternion()).clone().invert();
      const values = Float32Array.from(track.values);
      for (let i = 0; i < values.length; i += 4) {
        // World-space change against the source rest, applied to the target rest.
        q.fromArray(values, i).premultiply(sourceParent).multiply(sourceRestInverse);
        q.premultiply(targetParentInverse).multiply(targetRest);
        q.toArray(values, i);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${to.uuid}.${property}`, Array.from(track.times), Array.from(values)));
    } else if (track instanceof THREE.VectorKeyframeTrack && property === 'position' && plainBoneName(sourceName!) === 'hips') {
      tracks.push(new THREE.VectorKeyframeTrack(`${to.uuid}.${property}`, Array.from(track.times), Array.from(track.values, (v) => v * scale)));
    }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
