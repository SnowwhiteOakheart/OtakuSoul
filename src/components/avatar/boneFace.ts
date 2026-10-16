import * as THREE from 'three';

/**
 * Faces driven by bones instead of morph targets, as many game rigs have them (eyelids, brows and
 * lips as small bones on the head). Bone axes differ between games, so every movement is defined
 * geometrically in the rest pose (upper lid down to the lower lid, lower lip down, mouth corners up)
 * and turned once into each bone's parent space; it then follows the head however it turns.
 * Distances scale with the face: the eye distance is the unit.
 */

type Side = 'L' | 'R' | 'M';
type Part = 'lidUp' | 'lidLo' | 'brow' | 'lipUp' | 'lipLo' | 'corner' | 'eye';

interface FaceBone {
  bone: THREE.Object3D;
  part: Part;
  side: Side;
  /** Rest position in the parent's space, restored every frame. */
  rest: THREE.Vector3;
  /** World position at rest. */
  world: THREE.Vector3;
  /** World direction → parent-space offset (rotation and scale of the parent at rest, inverted). */
  toLocal: THREE.Matrix3;
}

const SIDE = /(?:^|[^a-z])([lr])(?:$|[^a-z])|(left|right)/i;
const sideOf = (name: string): Side => {
  const match = name.replace(/([a-z])([A-Z])/g, '$1_$2').match(SIDE);
  const letter = (match?.[1] ?? match?.[2] ?? '').toLowerCase();
  return letter.startsWith('l') ? 'L' : letter.startsWith('r') ? 'R' : 'M';
};

/** The face part a bone name stands for, if any. */
export function facePartOf(name: string): Part | null {
  const n = name.toLowerCase();
  if (/eyeball|eye_?ball/.test(n)) return 'eye';
  if (/lid|eyelash/.test(n)) {
    if (/(^|[^a-z])(up|upper|top)([^a-z]|$)|_up|up_|upper|top/.test(n)) return 'lidUp';
    if (/(^|[^a-z])(lo|low|lower|bot|bottom)([^a-z]|$)|_lo|lo_|lower|bottom/.test(n)) return 'lidLo';
    return null;
  }
  if (/brow/.test(n)) return 'brow';
  if (/corner|colip|lipco|mouthcorner|lip_?corner/.test(n)) return 'corner';
  if (/lip/.test(n)) {
    if (/up|upper|top/.test(n)) return 'lipUp';
    if (/lo|low|lower|bot|bottom/.test(n)) return 'lipLo';
  }
  return null;
}

type Move = { bone: FaceBone; world: THREE.Vector3 };

export class BoneFace {
  private readonly bones: FaceBone[];
  private readonly moves = new Map<string, Move[]>();
  private readonly frame = new Map<string, number>();

  private constructor(bones: FaceBone[]) {
    this.bones = bones;
    this.build();
  }

  /** The bone face of a rig, or null when it has no eyelids and no lips to move. */
  static detect(root: THREE.Object3D): BoneFace | null {
    root.updateMatrixWorld(true);
    const found: FaceBone[] = [];
    root.traverse((node) => {
      if (!(node as THREE.Bone).isBone || !node.parent) return;
      const part = facePartOf(node.name);
      if (!part) return;
      const inverse = new THREE.Matrix3().setFromMatrix4(node.parent.matrixWorld).invert();
      found.push({
        bone: node,
        part,
        side: sideOf(node.name),
        rest: node.position.clone(),
        world: node.getWorldPosition(new THREE.Vector3()),
        toLocal: inverse,
      });
    });
    const face = new BoneFace(found);
    return face.supported.length ? face : null;
  }

  /** Which expressions and mouth shapes this face can show. */
  get supported(): string[] {
    return [...this.moves.keys()];
  }

  set(key: string, weight: number) {
    if (this.moves.has(key)) this.frame.set(key, (this.frame.get(key) ?? 0) + weight);
  }

  /** Puts the face bones back to rest; call before animations update them for the frame. */
  restore() {
    for (const face of this.bones) face.bone.position.copy(face.rest);
  }

  /** Adds this frame's expressions on top of what the animations set. */
  apply() {
    const offset = new THREE.Vector3();
    for (const [key, weight] of this.frame) {
      if (weight <= 0) continue;
      for (const { bone, world } of this.moves.get(key) ?? []) {
        bone.bone.position.add(offset.copy(world).multiplyScalar(Math.min(1, weight)).applyMatrix3(bone.toLocal));
      }
    }
    this.frame.clear();
  }

  private of(part: Part, side?: Side) {
    return this.bones.filter((b) => b.part === part && (!side || b.side === side));
  }

  private add(key: string, bones: FaceBone[], world: (bone: FaceBone) => THREE.Vector3 | null) {
    const moves = bones.map((bone) => ({ bone, world: world(bone) })).filter((m): m is Move => !!m.world);
    if (moves.length) this.moves.set(key, [...(this.moves.get(key) ?? []), ...moves]);
  }

  private build() {
    const eyes = this.of('eye');
    const lids = [...this.of('lidUp'), ...this.of('lidLo')];
    // The unit: distance between the eyes (about 6–8 cm), else the width of all lid bones.
    const spread = (list: FaceBone[]) => {
      const xs = list.map((b) => b.world.x);
      return xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : 0;
    };
    const unit = spread(eyes) || spread(lids) * 0.75 || spread(this.bones) || 0.07;
    const v = (x: number, y: number, z = 0) => new THREE.Vector3(x * unit, y * unit, z * unit);
    // +1 / −1: which way along x is away from the middle of the face (0 for bones on the middle).
    const mean = (list: FaceBone[]) => list.reduce((sum, b) => sum + b.world.x, 0) / list.length;
    const centred = this.bones.filter((b) => b.side === 'M');
    const xs = this.bones.map((b) => b.world.x);
    const middle = eyes.length === 2 ? mean(eyes) : centred.length ? mean(centred) : (Math.min(...xs) + Math.max(...xs)) / 2;
    const outward = (b: FaceBone) => (Math.abs(b.world.x - middle) < 0.02 * unit ? 0 : Math.sign(b.world.x - middle));

    // Upper lid to the height of the nearest lower lid bone on its side (eye closed).
    const lidGap = (up: FaceBone) => {
      const lower = this.of('lidLo', up.side).sort((a, b) => Math.abs(a.world.x - up.world.x) - Math.abs(b.world.x - up.world.x))[0];
      const gap = lower ? lower.world.y - up.world.y : -0.35 * unit;
      return gap < 0 ? gap : -0.35 * unit;
    };
    const upper = this.of('lidUp');
    this.add('blink', upper, (b) => new THREE.Vector3(0, lidGap(b) * 0.92, 0));
    this.add('relaxed', upper, (b) => new THREE.Vector3(0, lidGap(b) * 0.3, 0));
    this.add('surprised', upper, (b) => new THREE.Vector3(0, -lidGap(b) * 0.15, 0));
    this.add('happy', this.of('lidLo'), () => v(0, 0.07));
    this.add('angry', upper, (b) => new THREE.Vector3(0, lidGap(b) * 0.2, 0));
    this.add('sad', upper, (b) => new THREE.Vector3(0, lidGap(b) * 0.18, 0));

    // Brows: the inner ones move most.
    const brows = this.of('brow');
    const innerX = (b: FaceBone) => {
      const same = brows.filter((o) => o.side === b.side).map((o) => Math.abs(o.world.x - middle));
      const min = Math.min(...same), max = Math.max(...same);
      return max > min ? 1 - (Math.abs(b.world.x - middle) - min) / (max - min) : 1;
    };
    this.add('surprised', brows, () => v(0, 0.09));
    this.add('angry', brows, (b) => v(0, -0.05 - 0.07 * innerX(b)));
    this.add('sad', brows, (b) => v(0, 0.1 * innerX(b) - 0.015));

    // Mouth: lower lip opens, corners widen, narrow or lift.
    const lower = this.of('lipLo');
    const upperLip = this.of('lipUp');
    const corners = this.of('corner');
    const open = (amount: number) => (b: FaceBone) => v(0, -amount * (1 - 0.4 * Math.min(1, Math.abs(b.world.x - middle) / (0.25 * unit))));
    this.add('aa', lower, open(0.15));
    this.add('aa', corners, () => v(0, -0.04));
    this.add('aa', upperLip, () => v(0, 0.015));
    this.add('oh', lower, open(0.1));
    this.add('oh', corners, (b) => v(-0.035 * outward(b), -0.03));
    this.add('ou', lower, open(0.04));
    this.add('ou', corners, (b) => v(-0.05 * outward(b), 0, 0.02));
    this.add('ee', lower, open(0.05));
    this.add('ee', corners, (b) => v(0.04 * outward(b), 0.005));
    this.add('ih', lower, open(0.04));
    this.add('ih', corners, (b) => v(0.05 * outward(b), 0.01));
    this.add('happy', corners, (b) => v(0.025 * outward(b), 0.065));
    this.add('relaxed', corners, (b) => v(0.01 * outward(b), 0.02));
    this.add('sad', corners, () => v(0, -0.05));
    this.add('angry', corners, (b) => v(-0.015 * outward(b), -0.035));
    this.add('surprised', lower, open(0.08));
  }
}
