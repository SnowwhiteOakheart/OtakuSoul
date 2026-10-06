import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VRM } from '@pixiv/three-vrm';
import { createVRMAnimationClip, VRMAnimationLoaderPlugin, type VRMAnimation } from '@pixiv/three-vrm-animation';
import { api } from '../../services/api';
import type { AvatarMotion } from '../../types';
import type { MotionRole } from '../../utils/avatarGestures';

const FADE_SECONDS = 0.35;

/**
 * Reads a motion file and turns it into a clip for this avatar: VRMA directly, Mixamo FBX
 * retargeted onto the VRM humanoid. Null when the file holds no animation.
 */
export async function loadMotionClip(motion: AvatarMotion, vrm: VRM): Promise<THREE.AnimationClip | null> {
  const bytes = await api.readFileBinary(motion.path);
  if (motion.kind === 'fbx') {
    // Loaded only when needed; most users have no FBX motions.
    const [{ FBXLoader }, { retargetMixamoClip }] = await Promise.all([
      import('three/examples/jsm/loaders/FBXLoader.js'),
      import('./mixamoRetarget'),
    ]);
    const rig = new FBXLoader().parse(bytes.buffer as ArrayBuffer, '');
    const source = THREE.AnimationClip.findByName(rig.animations, 'mixamo.com') ?? rig.animations[0];
    if (!source) return null;
    const clip = retargetMixamoClip(source, rig, vrm);
    clip.name = motion.file;
    return clip.tracks.length ? clip : null;
  }
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
  const gltf = await loader.parseAsync(bytes.buffer as ArrayBuffer, '');
  const animation = (gltf.userData.vrmAnimations as VRMAnimation[] | undefined)?.[0];
  if (!animation) return null;
  const clip = createVRMAnimationClip(animation, vrm);
  clip.name = motion.file;
  return clip;
}

/**
 * Plays the imported motions on one avatar: an idle loop (if there is one) and gestures that
 * fade in, play once and fade back. `bodyWeight` says how much the animations drive the body,
 * so the procedural pose can fill in the rest.
 */
export class VrmMotionPlayer {
  private readonly mixer: THREE.AnimationMixer;
  private idle: THREE.AnimationAction | null = null;
  private gesture: THREE.AnimationAction | null = null;
  private clips = new Map<MotionRole, THREE.AnimationClip[]>();

  constructor(vrm: VRM, private readonly onGestureEnd?: () => void) {
    this.mixer = new THREE.AnimationMixer(vrm.scene);
    this.mixer.addEventListener('finished', (event) => {
      if (event.action !== this.gesture) return;
      this.onGestureEnd?.();
      if (this.idle) {
        this.idle.reset().play();
        this.idle.crossFadeFrom(event.action, FADE_SECONDS, false);
      } else {
        event.action.fadeOut(FADE_SECONDS);
      }
      this.gesture = null;
    });
  }

  setClips(clips: Map<MotionRole, THREE.AnimationClip[]>) {
    this.mixer.stopAllAction();
    for (const list of this.clips.values()) for (const clip of list) this.mixer.uncacheClip(clip);
    this.clips = clips;
    this.gesture = null;
    const idleClip = clips.get('idle')?.[0];
    this.idle = idleClip ? this.mixer.clipAction(idleClip) : null;
    this.idle?.setLoop(THREE.LoopRepeat, Infinity).play();
  }

  /** Starts a gesture; false when no motion has this use. */
  play(role: MotionRole): boolean {
    const options = this.clips.get(role);
    if (!options?.length || role === 'idle') return false;
    const clip = options[Math.floor(Math.random() * options.length)]!;
    const action = this.mixer.clipAction(clip);
    const previous = this.gesture ?? this.idle;
    action.reset().setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    if (previous && previous !== action) action.crossFadeFrom(previous, FADE_SECONDS, false);
    else action.fadeIn(FADE_SECONDS);
    this.gesture = action;
    return true;
  }

  update(delta: number) {
    this.mixer.update(delta);
  }

  /** 0 = only the procedural pose, 1 = only the animations. */
  get bodyWeight(): number {
    let weight = 0;
    for (const action of [this.idle, this.gesture]) if (action?.isRunning()) weight += action.getEffectiveWeight();
    // A gesture fading out after its end is no longer running but still blends.
    for (const list of this.clips.values()) {
      for (const clip of list) {
        const action = this.mixer.existingAction(clip);
        if (action && action !== this.idle && action !== this.gesture && action.enabled) weight += action.getEffectiveWeight();
      }
    }
    return Math.min(1, weight);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}
