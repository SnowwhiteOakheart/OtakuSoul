import * as THREE from 'three';

type Side = 'left' | 'right';
const FULL_WIDTH = '０１２３';

/** Names of one limb bone on one side: `l`/`r` and `左`/`右` are filled in, the Mixamo name comes first. */
const sided = (side: Side, names: (s: { l: string; side: string; jp: string }) => string[]) =>
  names({ l: side[0]!, side, jp: side === 'left' ? '左' : '右' });

/** Finger roles: thumb, index, middle, ring and little finger with three segments each. */
const FINGERS = [
  // [Mixamo, Unreal/Rigify, Biped number, VRoid, MMD English, MMD Japanese, first Japanese segment]
  ['thumb', 'thumb', 0, 'thumb', 'thumb', '親指', 0],
  ['index', 'index', 1, 'index', 'indexfinger', '人指', 1],
  ['middle', 'middle', 2, 'middle', 'middlefinger', '中指', 1],
  ['ring', 'ring', 3, 'ring', 'ringfinger', '薬指', 1],
  ['pinky', 'pinky', 4, 'little', 'littlefinger', '小指', 1],
] as const;

function fingerAliases(side: Side): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const l = side[0]!;
  const jp = side === 'left' ? '左' : '右';
  for (const [mixamo, unreal, biped, vroid, mmd, japanese, jpStart] of FINGERS) {
    for (const segment of [1, 2, 3]) {
      out[`${side}${mixamo[0]!.toUpperCase()}${mixamo.slice(1)}${segment}`] = [
        `${side}hand${mixamo}${segment}`,
        `${unreal}0${segment}${l}`,
        `f${unreal}0${segment}${l}`,
        `bip001${l}finger${biped}${segment === 1 ? '' : segment - 1}`,
        `jbip${l}${vroid}${segment}`,
        `${mmd}${segment}${l}`,
        `${jp}${japanese}${FULL_WIDTH[jpStart + segment - 1]}`,
        // "finger1-1_L": numbered from the thumb.
        `finger${biped + 1}${segment}${l}`,
      ];
    }
  }
  return out;
}

function limbAliases(side: Side): Record<string, string[]> {
  return {
    [`${side}Shoulder`]: sided(side, ({ l, jp }) => [`${side}shoulder`, `clavicle${l}`, `bip001${l}clavicle`, `jbip${l}shoulder`, `shoulder${l}`, `${l}clavicle`, `${jp}肩`]),
    [`${side}Arm`]: sided(side, ({ l, jp }) => [`${side}arm`, `${side}upperarm`, `upperarm${l}`, `upperarm01${l}`, `${l}upperarm`, `arm${side}`, `jbip${l}upperarm`, `bip001${l}upperarm`, `${jp}腕`, `arm${l}`]),
    [`${side}ForeArm`]: sided(side, ({ l, jp }) => [
      `${side}forearm`, `${side}lowerarm`, `lowerarm${l}`, `lowerarm01${l}`, `forearm${l}`, `${l}forearm`, `jbip${l}lowerarm`,
      `bip001${l}forearm`, `${side}elbow`, `elbow${l}`, `${l}elbow`, `${jp}ひじ`, `${jp}肘`,
    ]),
    [`${side}Hand`]: sided(side, ({ l, jp }) => [`${side}hand`, `hand${l}`, `bip001${l}hand`, `jbip${l}hand`, `${side}wrist`, `wrist${l}`, `${l}hand`, `${jp}手首`]),
    // MMD calls the thigh "leg" and the shin "knee" – see `findRigBones`.
    [`${side}UpLeg`]: sided(side, ({ l, jp }) => [`${side}upleg`, `thigh${l}`, `bip001${l}thigh`, `jbip${l}upperleg`, `upperleg${l}`, `upperleg01${l}`, `${side}upperleg`, `${l}thigh`, `${jp}足`]),
    [`${side}Leg`]: sided(side, ({ l, jp }) => [`${side}leg`, `calf${l}`, `bip001${l}calf`, `jbip${l}lowerleg`, `lowerleg${l}`, `lowerleg01${l}`, `${side}lowerleg`, `shin${l}`, `${l}calf`, `${side}knee`, `${jp}ひざ`]),
    [`${side}Foot`]: sided(side, ({ l, jp }) => [`${side}foot`, `foot${l}`, `bip001${l}foot`, `jbip${l}foot`, `${side}ankle`, `${l}foot`, `${jp}足首`]),
    [`${side}ToeBase`]: sided(side, ({ l, jp }) => [`${side}toebase`, `ball${l}`, `bip001${l}toe0`, `jbip${l}toebase`, `${side}toe`, `toe${l}`, `${jp}つま先`]),
    ...fingerAliases(side),
  };
}

/**
 * Bone roles of a humanoid glTF rig and the (normalized) names rigs use for them: Mixamo /
 * Ready Player Me (first, they name the roles for retargeting), Unreal, Blender/Rigify (".L"),
 * MakeHuman, VRoid ("J_Bip_…"), 3ds Max Biped ("Bip001 L UpperArm") and MMD models converted to glTF
 * (English "Left elbow" or Japanese "左ひじ").
 */
const BONE_ALIASES: Record<string, readonly string[]> = Object.fromEntries(
  Object.entries({
    hips: ['hips', 'pelvis', 'jbipchips', 'bip001pelvis', '下半身', 'root'],
    spine: ['spine', 'spine1', 'spine01', 'spine02', 'spine03', 'chest', 'jbipcspine', 'bip001spine', '上半身', 'upperbody'],
    spine1: ['spine1', 'bip001spine1', 'jbipcchest', 'spine02', 'chest', '上半身2'],
    spine2: ['spine2', 'bip001spine2', 'jbipcupperchest', 'spine03', 'upperchest'],
    neck: ['neck', 'neck01', 'jbipcneck', 'bip001neck', '首'],
    head: ['head', 'jbipchead', 'bip001head', '頭'],
    ...limbAliases('left'),
    ...limbAliases('right'),
  }).filter(([, names]) => names.length > 0),
);
export type RigBone = string;

/**
 * "mixamorig:LeftArm" → "leftarm", "upperarm01_L" → "upperarm01l", "upper_arm.L" → "upperarml",
 * "Bip001 L UpperArm" → "bip001lupperarm"; letters of other scripts stay ("左ひじ").
 */
export const plainBoneName = (name: string) =>
  name.replace(/^mixamorig[:_]?/i, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** Standard MMD morph names (Japanese) for each mouth shape and expression, first found wins. */
export const MMD_MORPHS: Record<string, string[]> = {
  blink: ['まばたき', '瞬き', 'blink'],
  aa: ['あ', 'a'],
  ih: ['い', 'i'],
  ou: ['う', 'u'],
  ee: ['え', 'e'],
  oh: ['お', 'o'],
  happy: ['笑い', 'にこり', '笑顔'],
  angry: ['怒り'],
  sad: ['困る', '悲しい'],
  surprised: ['びっくり', '驚き'],
  relaxed: ['なごみ', 'にこり'],
};

/** The humanoid bones of a glTF scene by role; missing ones stay undefined. */
export function findRigBones(root: THREE.Object3D): Partial<Record<RigBone, THREE.Object3D>> {
  const byName = new Map<string, THREE.Object3D>();
  root.traverse((node) => {
    const key = plainBoneName(node.name);
    if (!byName.has(key) && ((node as THREE.Bone).isBone || node.type === 'Object3D' || node.type === 'Group')) byName.set(key, node);
  });
  const found: Partial<Record<RigBone, THREE.Object3D>> = {};
  // MMD names the thigh "leg" and the shin "knee"; Mixamo's "LeftLeg" is the shin.
  const mmdLegs = byName.has('leftknee') || byName.has('rightknee');
  for (const [role, names] of Object.entries(BONE_ALIASES)) {
    let aliases = names;
    if (mmdLegs && /UpLeg$/.test(role)) aliases = [role.startsWith('left') ? 'leftleg' : 'rightleg', ...names];
    if (mmdLegs && /^(left|right)Leg$/.test(role)) aliases = names.filter((n) => n !== 'leftleg' && n !== 'rightleg');
    const node = aliases.map((alias) => byName.get(alias)).find(Boolean);
    if (node) found[role] = node;
  }
  return found;
}

type MorphRecipe = [string, number][];
/**
 * Each expression and mouth shape as morph recipes, best first: Oculus visemes and ARKit
 * blendshapes (used by most face-rigged glTF avatars), then simple names, then the Japanese MMD
 * names of models converted from MMD.
 */
const BASE_RECIPES: Record<string, MorphRecipe[]> = {
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
const RECIPES: Record<string, MorphRecipe[]> = Object.fromEntries(
  Object.entries(BASE_RECIPES).map(([key, recipes]) => [
    key,
    [...recipes, ...(MMD_MORPHS[key] ?? []).filter((name) => [...name].some((char) => char.charCodeAt(0) > 127)).map((name): MorphRecipe => [[name, 1]])],
  ]),
);

/**
 * Drives the face of a glTF avatar: `set` collects weights per expression for one frame,
 * `apply` adds up what they mean per morph target (several share `jawOpen`) on every mesh.
 */
/** What the user set up for a model's face: own morphs per key and a strength per key. */
export interface FaceSetup {
  morphs?: Record<string, { morph: string; weight: number }[] | undefined>;
  strength?: Record<string, number | undefined>;
}

export class MorphFace {
  private readonly meshes: THREE.Mesh[] = [];
  private readonly recipes = new Map<string, MorphRecipe>();
  private readonly frame = new Map<string, number>();
  private readonly names = new Set<string>();
  private strength: Record<string, number | undefined> = {};

  constructor(root: THREE.Object3D) {
    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
        this.meshes.push(mesh);
        Object.keys(mesh.morphTargetDictionary).forEach((name) => this.names.add(name));
      }
    });
    this.configure({});
  }

  /** Own morphs replace the automatic choice of their key; strengths scale every key. */
  configure(setup: FaceSetup) {
    this.recipes.clear();
    for (const [key, options] of Object.entries(RECIPES)) {
      const recipe = options.find((option) => option.some(([name]) => this.names.has(name)));
      if (recipe) this.recipes.set(key, recipe.filter(([name]) => this.names.has(name)));
    }
    for (const [key, list] of Object.entries(setup.morphs ?? {})) {
      const own = (list ?? []).filter((m) => this.names.has(m.morph)).map((m): [string, number] => [m.morph, m.weight]);
      if (own.length) this.recipes.set(key, own);
    }
    this.strength = setup.strength ?? {};
    // Morphs no recipe uses any more are left alone again (and reset once here).
    for (const mesh of this.meshes) mesh.morphTargetInfluences?.fill(0);
  }

  /** Morph target names of the model, for the face editor. */
  get morphNames(): string[] {
    return [...this.names];
  }

  /** Which expressions and mouth shapes this face can show. */
  get supported(): string[] {
    return [...this.recipes.keys()];
  }

  set(key: string, weight: number) {
    const scaled = weight * (this.strength[key] ?? 1);
    for (const [name, factor] of this.recipes.get(key) ?? []) this.frame.set(name, (this.frame.get(name) ?? 0) + scaled * factor);
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
  // Rigs with other naming (MakeHuman, Unreal …): the main bones by their role.
  // Every role is filed under its Mixamo name, which is how the source tracks are named.
  for (const [role, node] of Object.entries(findRigBones(target))) {
    const mixamo = BONE_ALIASES[role]?.[0];
    if (mixamo && node) targets.set(mixamo, node);
  }
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
