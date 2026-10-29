import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VRM } from '@pixiv/three-vrm';
import { createVRMAnimationClip, VRMAnimationLoaderPlugin, type VRMAnimation } from '@pixiv/three-vrm-animation';
import { api } from '../../services/api';
import type { AvatarMotion } from '../../types';
import { bestByMood, pickByMood, type LoopRole, type MotionRole } from '../../utils/avatarGestures';

const FADE_SECONDS = 0.35;
/** With several idle loops, another one takes over after this long (random within). */
const IDLE_SWITCH_SECONDS: [number, number] = [18, 40];

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

/** The mood a clip is meant for ('' = any), kept in its `userData`. */
const clipMood = (clip: THREE.AnimationClip): string => (clip.userData?.mood as string | undefined) ?? '';

/**
 * Plays the imported motions on one avatar (VRM scene or MMD mesh): an idle loop (if there is one) and gestures that
 * fade in, play once and fade back. With several motions for one use, those meant for the current
 * mood (`clip.userData.mood`) are preferred; the idle loop follows the mood. `bodyWeight` says how
 * much the animations drive the body, so the procedural pose can fill in the rest.
 */
export class AvatarMotionPlayer {
  private readonly mixer: THREE.AnimationMixer;
  private idle: THREE.AnimationAction | null = null;
  private gesture: THREE.AnimationAction | null = null;
  /** A state loop (walking, sitting) that stands in for the idle loop while it lasts. */
  private loop: THREE.AnimationAction | null = null;
  private loopRole: LoopRole | null = null;
  private clips = new Map<MotionRole, THREE.AnimationClip[]>();
  private extras: THREE.AnimationClip[] = [];
  private mood = 'neutral';
  /** Seconds until the next idle loop takes over (several idle loops only). */
  private idleSwitchIn = IDLE_SWITCH_SECONDS[0];
  /** Called with the clip name whenever the idle loop or a gesture starts (for test hooks). */
  onClipChange?: (kind: 'idle' | 'gesture', name: string) => void;

  constructor(root: THREE.Object3D, private readonly onGestureEnd?: () => void) {
    this.mixer = new THREE.AnimationMixer(root);
    this.mixer.addEventListener('finished', (event) => {
      if (event.action !== this.gesture) return;
      this.onGestureEnd?.();
      const back = this.loop ?? this.idle;
      if (back) {
        back.reset().play();
        back.crossFadeFrom(event.action, FADE_SECONDS, false);
      } else {
        event.action.fadeOut(FADE_SECONDS);
      }
      this.gesture = null;
    });
  }

  /** Motions by use, and clips without a use that can only be played by hand. */
  setClips(clips: Map<MotionRole, THREE.AnimationClip[]>, extras: THREE.AnimationClip[] = []) {
    this.mixer.stopAllAction();
    for (const clip of this.allClips()) this.mixer.uncacheClip(clip);
    this.clips = clips;
    this.extras = extras;
    this.gesture = null;
    const idleClip = this.idleFor(this.mood);
    this.idle = idleClip ? this.mixer.clipAction(idleClip) : null;
    this.idle?.setLoop(THREE.LoopRepeat, Infinity).play();
    this.onClipChange?.('idle', idleClip?.name ?? '');
    // Clips arrive after the state was asked for: start its loop now.
    this.loop = null;
    if (this.loopRole) this.setLoopState(this.loopRole);
  }

  /** Whether a motion has this use (the desktop pet sits only with a sitting motion). */
  has(role: MotionRole): boolean {
    return !!this.clips.get(role)?.length;
  }

  /**
   * Plays the loop of a state (walking, sitting) instead of the idle loop, or goes back to idle
   * (`null`). False when no motion has that use; the avatar then keeps its idle motion.
   */
  setLoopState(role: LoopRole | null): boolean {
    this.loopRole = role;
    const previous = this.loop;
    const options = role ? this.clips.get(role) : undefined;
    const pick = options?.length ? pickByMood(options.map((clip) => ({ clip, mood: clipMood(clip) })), this.mood) : undefined;
    if (pick && previous?.getClip() === pick.clip) return true;
    const from = this.gesture ?? previous ?? this.idle;
    if (!pick) {
      this.loop = null;
      if (previous && !this.gesture) {
        this.idle?.reset().play();
        if (this.idle) this.idle.crossFadeFrom(previous, FADE_SECONDS, false);
        else previous.fadeOut(FADE_SECONDS);
      }
      return false;
    }
    const action = this.mixer.clipAction(pick.clip).setLoop(THREE.LoopRepeat, Infinity);
    action.reset().play();
    if (from && from !== action) action.crossFadeFrom(from, FADE_SECONDS, false);
    else action.fadeIn(FADE_SECONDS);
    this.loop = action;
    this.gesture = null;
    return true;
  }

  /** The avatar's mood changed: switch to the idle loop that fits it best. */
  setMood(mood: string) {
    this.mood = mood;
    const clip = this.idleFor(mood);
    if (!clip || clip === this.idle?.getClip()) return;
    const previous = this.idle;
    this.idle = this.mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity);
    this.onClipChange?.('idle', clip.name);
    // During a gesture or a state loop the new idle loop starts when they end.
    if (this.gesture || this.loop) {
      previous?.fadeOut(FADE_SECONDS);
      return;
    }
    this.idle.reset().play();
    if (previous) this.idle.crossFadeFrom(previous, FADE_SECONDS * 2, false);
  }

  /** Starts a gesture; false when no motion has this use. */
  play(role: MotionRole): boolean {
    const options = this.clips.get(role);
    if (!options?.length || role === 'idle') return false;
    const pick = pickByMood(options.map((clip) => ({ clip, mood: clipMood(clip) })), this.mood);
    return pick ? this.start(pick.clip) : false;
  }

  /** Plays a clip by name once (gestures picked by hand); false when there is none. */
  playClip(name: string): boolean {
    const clip = this.allClips().find((c) => c.name === name);
    return clip ? this.start(clip) : false;
  }

  private start(clip: THREE.AnimationClip): boolean {
    const action = this.mixer.clipAction(clip);
    const previous = this.gesture ?? this.idle;
    action.reset().setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    if (previous && previous !== action) action.crossFadeFrom(previous, FADE_SECONDS, false);
    else action.fadeIn(FADE_SECONDS);
    this.gesture = action;
    this.onClipChange?.('gesture', clip.name);
    return true;
  }

  /** Idle loops for this mood: those meant for it, else those for any mood, else all. */
  private idlesFor(mood: string): THREE.AnimationClip[] {
    const idles = this.clips.get('idle') ?? [];
    const exact = idles.filter((clip) => clipMood(clip) === mood);
    if (exact.length) return exact;
    const any = idles.filter((clip) => !clipMood(clip));
    return any.length ? any : idles;
  }

  /** Several idle loops: now and then another one, so standing around does not repeat. */
  private varyIdle(delta: number) {
    this.idleSwitchIn -= delta;
    if (this.idleSwitchIn > 0) return;
    const [min, max] = IDLE_SWITCH_SECONDS;
    this.idleSwitchIn = min + Math.random() * (max - min);
    if (this.gesture || this.loop || !this.idle) return;
    const others = this.idlesFor(this.mood).filter((clip) => clip !== this.idle?.getClip());
    if (!others.length) return;
    const next = others[Math.floor(Math.random() * others.length)]!;
    const previous = this.idle;
    this.idle = this.mixer.clipAction(next).setLoop(THREE.LoopRepeat, Infinity);
    this.idle.reset().play();
    this.idle.crossFadeFrom(previous, FADE_SECONDS * 3, false);
    this.onClipChange?.('idle', next.name);
  }

  private idleFor(mood: string): THREE.AnimationClip | undefined {
    const idles = this.clips.get('idle') ?? [];
    return bestByMood(idles.map((clip) => ({ clip, mood: clipMood(clip) })), mood)?.clip;
  }

  private allClips(): THREE.AnimationClip[] {
    return [...[...this.clips.values()].flat(), ...this.extras];
  }

  update(delta: number) {
    this.varyIdle(delta);
    this.mixer.update(delta);
  }

  /** The mixer, for avatars that drive it themselves (MMD runs IK and physics after it). */
  get animationMixer(): THREE.AnimationMixer {
    return this.mixer;
  }

  /** Whether any motion is assigned (MMD then leaves the pose to the mixer). */
  get hasClips(): boolean {
    return this.clips.size > 0;
  }

  /** 0 = only the procedural pose, 1 = only the animations. */
  get bodyWeight(): number {
    let weight = 0;
    for (const action of [this.idle, this.gesture, this.loop]) if (action?.isRunning()) weight += action.getEffectiveWeight();
    // A gesture fading out after its end is no longer running but still blends.
    for (const clip of this.allClips()) {
      const action = this.mixer.existingAction(clip);
      if (action && action !== this.idle && action !== this.gesture && action !== this.loop && action.enabled) {
        weight += action.getEffectiveWeight();
      }
    }
    return Math.min(1, weight);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}
