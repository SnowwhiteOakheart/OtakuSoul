import { leaseAvatar, releaseAvatar, takeAvatar } from './avatarCache';
import { avatarTimer } from './avatarTiming';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { api } from '../../services/api';
import { audioPlayer } from '../../services/audioPlayer';
import { translate, useTranslation } from '../../i18n';
import { errorMessage } from '../../utils/errors';
import { mouthTarget, SILENT_VISEMES, type Visemes } from '../../services/lipSync';
import type { AvatarMotion } from '../../types';
import type { GestureRequest, LoopRole } from '../../utils/avatarGestures';
import { loadMotionClip, AvatarMotionPlayer } from './vrmMotions';
import type { FigureTouch } from './avatarTouch';
import { createAvatarStage, createBlinker, neverCull, type AvatarStage } from './avatarStage';
import { AvatarViewerChrome } from './AvatarViewerChrome';
import { bodyPose, BodySway, EDGE_SIT_LEGS, floorSitPose, legReach, walkBob, WALK_CYCLE_HZ, type BodyBone, type LegLengths } from './proceduralBody';
import { PET_EDGE_SEAT } from '../../services/avatarViewState';
import { reachWithArm } from './armReach';
import { useAvatarMotions } from './useAvatarMotions';

export interface AvatarViewerProps {
  modelPath: string;
  /** VRM expression of the current emotion (neutral, happy, angry, sad, surprised, relaxed). */
  emotion?: string;
  isSpeaking?: boolean;
  /** Imported motions with their use; each viewer takes the formats it can play. */
  motions?: AvatarMotion[];
  /** Gesture to play; a new `id` starts it again. */
  gesture?: GestureRequest | null;
  /** A quick emotion button was pressed (GoEmotions name). */
  onPickEmotion?: (emotion: string) => void;
  /** The figure was tapped (not dragged): a pat on the head or a poke, with its place in the viewer. */
  onTouch?: (touch: FigureTouch) => void;
  /**
   * Desktop pet: transparent, whole figure, no camera controls or buttons. Receives the stage
   * (pointer for looking, hit test for click-through) and `null` when it goes.
   */
  pet?: {
    onStage: (stage: AvatarStage | null) => void;
    /** Which state loops (walk, sit) this avatar has motions for. */
    onLoops?: (available: Record<LoopRole, boolean>) => void;
    /** Whether this viewer can sit the figure on the ground (VRM: yes, once loaded). */
    onFloorSit?: (available: boolean) => void;
  };
  /** State loop instead of the idle loop (desktop pet walking or sitting). */
  loop?: LoopRole | null;
  /**
   * Desktop pet: sitting with a pose of its own over any motion – on the ground (knees drawn up)
   * or on a window's edge (legs hanging; the pet window sinks `PET_EDGE_SINK` for them).
   */
  seat?: 'floor' | 'edge' | null;
}

/**
 * Bones that stand calmly while an idle or talking motion plays: the pack's stand is a wide-legged
 * game stance (knees bent, hips tilted and lowered); the legs and the pelvis follow the procedural
 * standing pose, the rest of the body the motion.
 */
const CALM_BONES = new Set<string>([
  'hips', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot', 'leftToes', 'rightToes',
]);

/** On the ground the hip joint sits this far (share of the model height) below the ankles. */
const SEAT_BELOW_ANKLES = 0.05;
/**
 * The ankles aim this far (share of the model height) below their standing height: at exactly
 * that height the shoes still floated a little (legs not quite straight down in the rest pose).
 */
const FEET_BELOW_ANKLES = 0.04;
const VISEME_KEYS = Object.keys(SILENT_VISEMES) as (keyof Visemes)[];
const EXPRESSION_WEIGHTS: Record<string, number> = { happy: 0.9, angry: 0.8, sad: 0.7, surprised: 0.8, relaxed: 0.6 };

/** Base moods and weights for romance / extra emotions so standard VRM facial morphs react naturally. */
const ROMANCE_VRM_BASE: Record<string, { baseMood: string; weight: number }> = {
  blush: { baseMood: 'relaxed', weight: 0.4 },
  aroused: { baseMood: 'relaxed', weight: 0.5 },
  seductive: { baseMood: 'relaxed', weight: 0.6 },
  ecstasy: { baseMood: 'happy', weight: 0.8 },
  afterglow: { baseMood: 'relaxed', weight: 0.7 },
  teasing: { baseMood: 'happy', weight: 0.6 },
  crying: { baseMood: 'sad', weight: 0.9 },
  fear: { baseMood: 'surprised', weight: 0.7 },
  disgust: { baseMood: 'angry', weight: 0.6 },
};

/** Candidate expression names on the VRM model for specific romance/extra emotions. */
const ROMANCE_EXPRESSIONS: Record<string, string[]> = {
  blush: ['blush', 'Blush', 'cheek', 'Cheek', 'fcl_all_blush', 'Fcl_ALL_Blush'],
  aroused: ['aroused', 'Aroused', 'blush', 'Blush', 'cheek', 'Cheek', 'heartEyes', 'HeartEyes', 'hearteyes', 'heart_eyes'],
  seductive: ['seductive', 'Seductive', 'smug', 'Smug', 'wink', 'Wink'],
  ecstasy: ['ecstasy', 'Ecstasy', 'blush', 'Blush', 'heartEyes', 'HeartEyes'],
  afterglow: ['afterglow', 'Afterglow', 'blush', 'Blush', 'cheek', 'Cheek'],
};

interface MorphBind {
  mesh: THREE.Mesh;
  index: number;
  kind: 'blush' | 'heartEyes' | 'smug';
}

function findMorphBinds(scene: THREE.Object3D): MorphBind[] {
  const binds: MorphBind[] = [];
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
      for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
        const lower = name.toLowerCase();
        if (lower.includes('blush') || lower.includes('cheek')) {
          binds.push({ mesh, index, kind: 'blush' });
        } else if (lower.includes('heart') && (lower.includes('eye') || lower.includes('form'))) {
          binds.push({ mesh, index, kind: 'heartEyes' });
        } else if (lower.includes('smug')) {
          binds.push({ mesh, index, kind: 'smug' });
        }
      }
    }
  });
  return binds;
}

export const VrmViewer = ({
  modelPath,
  emotion = 'neutral',
  isSpeaking = false,
  motions = [],
  gesture = null,
  onPickEmotion = () => {},
  onTouch,
  pet,
  loop = null,
  seat: seatMode = null,
}: AvatarViewerProps) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const onTouchRef = useRef(onTouch);
  useEffect(() => {
    onTouchRef.current = onTouch;
  }, [onTouch]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const emotionRef = useRef(emotion);
  const isSpeakingRef = useRef(isSpeaking);
  const resetViewRef = useRef<(() => void) | null>(null);
  const [loadedVrm, setLoadedVrm] = useState<VRM | null>(null);
  const motionPlayerRef = useRef<AvatarMotionPlayer | null>(null);
  const [playingGesture, setPlayingGesture] = useState('');
  const petRef = useRef(pet);
  useEffect(() => {
    petRef.current = pet;
  }, [pet]);
  const loopRef = useRef(loop);
  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);
  const seatRef = useRef(seatMode);
  useEffect(() => {
    seatRef.current = seatMode;
  }, [seatMode]);

  useEffect(() => {
    emotionRef.current = emotion;
  }, [emotion]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isDisposed = false;
    setLoading(true);
    setError(null);

    let audioVisemes: Visemes = { ...SILENT_VISEMES };
    const mouth: Visemes = { ...SILENT_VISEMES };
    let leftArmDirection = 1;
    let rightArmDirection = -1;
    let vrm: VRM | null = null;
    let morphBinds: MorphBind[] = [];
    const cleanupAudio = audioPlayer.onAudioFrame((_amplitude, visemes) => {
      audioVisemes = visemes;
    });
    const stage = createAvatarStage(container, modelPath, { pet: !!petRef.current });
    stage.setTapHandler((touch) => onTouchRef.current?.(touch));
    resetViewRef.current = stage.resetView;
    petRef.current?.onStage(stage);

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const loadModel = async () => {
      if (!modelPath.trim()) {
        setLoading(false);
        return;
      }
      try {
        const lap = avatarTimer(modelPath);
        // A model shown a moment ago is still parsed (avatarCache).
        let loaded = takeAvatar<VRM>(modelPath);
        if (loaded) {
          lap('cache');
        } else {
          const bytes = await api.readFileBinary(modelPath);
          lap('read');
          if (isDisposed) return;
          const gltf = await loader.parseAsync(bytes.buffer as ArrayBuffer, '');
          lap('parse');
          const parsed = gltf.userData.vrm as VRM | undefined;
          if (!parsed) {
            if (isDisposed) return;
            setError(translate('avatar.vrmInvalid'));
            setLoading(false);
            return;
          }
          VRMUtils.removeUnnecessaryVertices(gltf.scene);
          VRMUtils.combineSkeletons(gltf.scene);
          VRMUtils.rotateVRM0(parsed);
          leaseAvatar(modelPath, parsed, parsed.scene, () => {
            parsed.humanoid.resetNormalizedPose();
            parsed.expressionManager?.resetValues();
            parsed.springBoneManager?.reset();
          });
          loaded = parsed;
        }
        if (isDisposed) {
          releaseAvatar(loaded);
          return;
        }

        // Normalized VRM 0.x rigs can still point their arm chains along the opposite X axis
        // from VRM 1.0 rigs; take the direction from the skeleton instead of assuming one.
        leftArmDirection = Math.sign(loaded.humanoid.getNormalizedBoneNode('leftLowerArm')?.position.x ?? 1) || 1;
        rightArmDirection = Math.sign(loaded.humanoid.getNormalizedBoneNode('rightLowerArm')?.position.x ?? -1) || -1;

        vrm = loaded;
        morphBinds = findMorphBinds(loaded.scene);
        neverCull(loaded.scene);
        stage.scene.add(loaded.scene);
        motionPlayerRef.current = new AvatarMotionPlayer(loaded.scene, () => setPlayingGesture(''));
        setLoadedVrm(loaded);

        loaded.scene.updateMatrixWorld(true);
        const head = loaded.humanoid.getRawBoneNode('head');
        modelHeight = new THREE.Box3().setFromObject(loaded.scene).max.y;
        hipsRestY = loaded.humanoid.getNormalizedBoneNode('hips')?.position.y ?? null;
        // The legs as built (rest pose): sitting fits them to the ground instead of guessing.
        const at = (bone: 'leftUpperLeg' | 'leftLowerLeg' | 'leftFoot') =>
          loaded.humanoid.getRawBoneNode(bone)?.getWorldPosition(new THREE.Vector3());
        const [hipJoint, kneeJoint, ankle] = [at('leftUpperLeg'), at('leftLowerLeg'), at('leftFoot')];
        legs =
          hipJoint && kneeJoint && ankle
            ? { thigh: hipJoint.distanceTo(kneeJoint), shin: kneeJoint.distanceTo(ankle), hipY: hipJoint.y, ankleY: ankle.y }
            : null;
        if (head) {
          stage.frameModel(head.getWorldPosition(new THREE.Vector3()).y, modelHeight);
        }
        // The pet may sit this figure on the ground (the pose needs the humanoid rig).
        petRef.current?.onFloorSit?.(!!loaded.humanoid.getNormalizedBoneNode('hips'));
        stage.setHands(
          [loaded.humanoid.getRawBoneNode('leftHand'), loaded.humanoid.getRawBoneNode('rightHand')].filter(
            (hand): hand is THREE.Object3D => !!hand,
          ),
        );
        lap('setup');
        stage.timeNextFrame(modelPath);
        setLoading(false);
      } catch (err) {
        if (isDisposed) return;
        console.error('VRM konnte nicht geladen werden:', err);
        setError(translate('avatar.vrmLoadFailed', { error: errorMessage(err) }));
        setLoading(false);
      }
    };

    const blink = createBlinker();
    const sway = new BodySway();
    let walkPhase = 0;
    /** Model height (top of its bounds) and the hips' rest height, for the dip while walking. */
    let modelHeight = 0;
    let hipsRestY: number | null = null;
    /** How far the figure has sat down (0 standing … 1 sitting), eased; and where (kept while it gets up). */
    let seat = 0;
    let seatKind: 'floor' | 'edge' = 'floor';
    /** Leg lengths and the rest heights of hip joint and ankle (world), measured once loaded. */
    let legs: (LegLengths & { hipY: number; ankleY: number }) | null = null;
    // Scratch values for placing the hands while seated.
    const reachKnee = new THREE.Vector3();
    const reachHip = new THREE.Vector3();
    const reachAnkle = new THREE.Vector3();
    const reachFront = new THREE.Vector3();
    const reachTarget = new THREE.Vector3();
    const reachUpper = new THREE.Quaternion();
    const reachLower = new THREE.Quaternion();
    const upAxis = new THREE.Vector3(0, 1, 0);
    /** Spring settings of hair and cloth as loaded, to add the window's wind to (and restore). */
    const springRest = new Map<object, { dir: THREE.Vector3; power: number }>();
    const wind = new THREE.Vector3();
    let neckX = 0;
    let neckY = 0;
    let lookX = 0;
    let lookY = 0;
    const poseEuler = new THREE.Euler();
    const poseQuaternion = new THREE.Quaternion();
    const poseVector = new THREE.Vector3();

    // A cached model loads synchronously, so its measured pose state must exist first.
    void loadModel();

    stage.start((delta, elapsed) => {
      if (!vrm) return;
      const model = vrm;
      // A. Imported motions first; the procedural pose (breathing, resting arms) fills in
      // whatever share of the body they do not drive, the head always follows the mouse.
      const motionPlayer = motionPlayerRef.current;
      // The mouse look is added on top every frame, so the head starts from rest (or from
      // the motion, which overwrites it if it animates the head).
      model.humanoid.getNormalizedBoneNode('head')?.quaternion.identity();
      // The hips start from rest too (a motion moves them itself; sitting and steps add on top).
      const hips = model.humanoid.getNormalizedBoneNode('hips');
      if (hips && hipsRestY !== null) hips.position.y = hipsRestY;
      motionPlayer?.update(delta);
      const animated = motionPlayer?.bodyWeight ?? 0;
      // Idle and talking motions keep their upper body, but not their legs and hips (see CALM_BONES).
      const calm = motionPlayer?.standingWeight ?? 0;
      const pose = (name: Parameters<typeof model.humanoid.getNormalizedBoneNode>[0], x: number, y: number, z: number) => {
        const bone = model.humanoid.getNormalizedBoneNode(name);
        // The procedural share of this bone: what no motion drives, plus the calm legs of standing loops.
        const share = CALM_BONES.has(name) ? Math.min(1, 1 - animated + calm) : 1 - animated;
        if (!bone || share <= 0.001) return;
        poseQuaternion.setFromEuler(poseEuler.set(x, y, z));
        if (share >= 0.999) bone.quaternion.copy(poseQuaternion);
        else bone.quaternion.slerp(poseQuaternion, share);
      };
      lookX = THREE.MathUtils.lerp(lookX, stage.mouse.x, 0.05);
      lookY = THREE.MathUtils.lerp(lookY, stage.mouse.y, 0.05);
      // The look moves in a chain: eyes at once, the head soon, neck and chest last.
      neckX = THREE.MathUtils.lerp(neckX, stage.mouse.x, 0.02);
      neckY = THREE.MathUtils.lerp(neckY, stage.mouse.y, 0.02);
      // Desktop pet: its window's movement makes arms and hair trail behind.
      const moved = stage.takeWindowMove();
      sway.update(moved.dx, moved.dy, delta);
      // Walking without a walk motion: a stepping cycle (with one, the motion walks).
      const walking = loopRef.current === 'walk';
      if (walking) walkPhase += delta * WALK_CYCLE_HZ * Math.PI * 2;
      const body = bodyPose({
        t: elapsed,
        leftArm: leftArmDirection,
        rightArm: rightArmDirection,
        walkPhase: walking ? walkPhase : null,
        sway: sway.offset,
        look: { x: neckX, y: neckY },
      });
      for (const [bone, [x, y, z]] of Object.entries(body)) pose(bone as BodyBone, x, y, z);
      // The hips dip between steps (only without a motion, which moves them itself).
      if (hips && hipsRestY !== null && animated <= 0.001) {
        hips.position.y = hipsRestY + walkBob(walking ? walkPhase : null) * modelHeight;
      } else if (hips && hipsRestY !== null && calm > 0.001) {
        // Straight legs again: the hips go back up from the motion's knee-bend crouch.
        hips.position.y = THREE.MathUtils.lerp(hips.position.y, hipsRestY, calm);
      }
      // Desktop pet sitting on the ground: legs and hips go to the sitting pose over whatever
      // moved them (procedural or a motion), eased in and out.
      const wanted = seatRef.current;
      if (wanted) seatKind = wanted;
      seat += ((wanted ? 1 : 0) - seat) * Math.min(1, delta * 2.5);
      if (seat > 0.001 && hips && hipsRestY !== null) {
        const edge = seatKind === 'edge';
        // The hip joint sits on the seat line: on the ground a little below the ankles (with the
        // knees drawn up the backs of the thighs lift; level with the ankles the seat floated), on
        // a window's edge the seat's own thickness above it.
        const hipTarget = edge
          ? (PET_EDGE_SEAT + 0.04) * modelHeight
          : legs
            ? legs.ankleY - SEAT_BELOW_ANKLES * modelHeight
            : 0.09 * modelHeight;
        const angles = edge
          ? EDGE_SIT_LEGS
          : legs
            ? legReach(legs, 0.55 * (legs.thigh + legs.shin), hipTarget - (legs.ankleY - FEET_BELOW_ANKLES * modelHeight))
            : undefined;
        for (const [bone, [x, y, z]] of Object.entries(floorSitPose(leftArmDirection, angles, edge))) {
          const node = model.humanoid.getNormalizedBoneNode(bone as BodyBone);
          if (!node) continue;
          node.quaternion.slerp(poseQuaternion.setFromEuler(poseEuler.set(x, y, z)), seat);
        }
        const hipsTarget = legs ? hipsRestY + (hipTarget - legs.hipY) : hipTarget;
        hips.position.y = THREE.MathUtils.lerp(hips.position.y, hipsTarget, seat);
        // The hands go where they belong on this body: round the shins below the knees on the
        // ground, on the thighs on an edge (fixed arm angles missed on other proportions).
        hips.updateWorldMatrix(true, true);
        for (const side of ['left', 'right'] as const) {
          const node = (bone: string) => model.humanoid.getNormalizedBoneNode(`${side}${bone}` as BodyBone);
          const [upper, lower, hand, hipJoint, knee, ankle] = [
            node('UpperArm'), node('LowerArm'), node('Hand'), node('UpperLeg'), node('LowerLeg'), node('Foot'),
          ];
          if (!upper || !lower || !hand || !hipJoint || !knee || !ankle) continue;
          const kneeAt = knee.getWorldPosition(reachKnee);
          const hipAt = hipJoint.getWorldPosition(reachHip);
          // The legs point forwards while seated: that is the body's front.
          const front = reachFront.subVectors(kneeAt, hipAt).setY(0).normalize();
          const target = edge
            ? reachTarget.lerpVectors(hipAt, kneeAt, 0.65).addScaledVector(upAxis, 0.035 * modelHeight)
            : reachTarget
                .lerpVectors(kneeAt, ankle.getWorldPosition(reachAnkle), 0.3)
                .addScaledVector(front, 0.045 * modelHeight);
          reachUpper.copy(upper.quaternion);
          reachLower.copy(lower.quaternion);
          reachWithArm(upper, lower, hand, target);
          // Eased in and out with the seat.
          upper.quaternion.copy(reachUpper.slerp(upper.quaternion, seat));
          lower.quaternion.copy(reachLower.slerp(lower.quaternion, seat));
        }
      }
      model.humanoid
        .getNormalizedBoneNode('head')
        // Up and down turn the other way on VRM 0.x rigs (see `forFacing` in proceduralBody).
        ?.quaternion.multiply(
          poseQuaternion.setFromEuler(poseEuler.set(-lookY * 0.12 * leftArmDirection, lookX * 0.2, -lookX * 0.04 * leftArmDirection)),
        );
      if (model.lookAt) {
        // Eyes ahead of the head (degrees).
        model.lookAt.yaw = THREE.MathUtils.clamp(stage.mouse.x * 18, -18, 18);
        model.lookAt.pitch = THREE.MathUtils.clamp(stage.mouse.y * 10, -10, 10);
      }
      // Hair and cloth: wind against the window's speed (sideways, and up while it drops).
      const speed = sway.windowSpeed;
      wind.set(-speed.x * 0.5, speed.y * 0.5, 0);
      if (wind.lengthSq() > 4) wind.setLength(2);
      for (const joint of model.springBoneManager?.joints ?? []) {
        let rest = springRest.get(joint);
        if (!rest) {
          rest = { dir: joint.settings.gravityDir.clone(), power: joint.settings.gravityPower };
          springRest.set(joint, rest);
        }
        const pull = poseVector.copy(rest.dir).multiplyScalar(rest.power).add(wind);
        joint.settings.gravityPower = pull.length();
        if (joint.settings.gravityPower > 1e-4) joint.settings.gravityDir.copy(pull.normalize());
        else joint.settings.gravityDir.copy(rest.dir);
      }

      // B. Face: blinking, emotion and mouth shapes from the voice.
      const em = model.expressionManager;
      const currentMood = emotionRef.current;
      if (em) {
        em.setValue('blink', blink(elapsed));
        const romanceBase = ROMANCE_VRM_BASE[currentMood];
        const activeBaseMood = romanceBase ? romanceBase.baseMood : currentMood;

        for (const [expression, weight] of Object.entries(EXPRESSION_WEIGHTS)) {
          const isBase = activeBaseMood === expression;
          const targetWeight = romanceBase && isBase ? romanceBase.weight : weight;
          em.setValue(expression, isBase ? targetWeight : 0);
        }

        // Custom romance expressions on VRMExpressionManager (e.g. Blush, Cheek, HeartEyes)
        for (const [romanceKey, names] of Object.entries(ROMANCE_EXPRESSIONS)) {
          const isActive = currentMood === romanceKey;
          for (const name of names) {
            if (em.getExpression(name)) {
              em.setValue(name, isActive ? 0.85 : 0);
            }
          }
        }

        const target = mouthTarget(audioPlayer.isPlaying() ? audioVisemes : null, isSpeakingRef.current, elapsed);
        for (const key of VISEME_KEYS) {
          mouth[key] = THREE.MathUtils.lerp(mouth[key], target[key], 0.5);
          em.setValue(key, mouth[key]);
        }
      }

      // Direct mesh morph targets for models without VRMExpression metadata for blush/heartEyes
      const isBlushing = ['blush', 'aroused', 'ecstasy', 'afterglow'].includes(currentMood);
      const isHeartEyes = ['aroused', 'ecstasy'].includes(currentMood);
      const isSmug = currentMood === 'seductive';
      for (const bind of morphBinds) {
        if (!bind.mesh.morphTargetInfluences) continue;
        let targetVal = 0;
        if (bind.kind === 'blush' && isBlushing) targetVal = 0.85;
        else if (bind.kind === 'heartEyes' && isHeartEyes) targetVal = 1.0;
        else if (bind.kind === 'smug' && isSmug) targetVal = 0.7;
        bind.mesh.morphTargetInfluences[bind.index] = THREE.MathUtils.lerp(
          bind.mesh.morphTargetInfluences[bind.index] ?? 0,
          targetVal,
          0.2
        );
      }

      // C. Spring bones (hair, cloth) and expressions.
      model.update(delta);
    });

    return () => {
      isDisposed = true;
      resetViewRef.current = null;
      petRef.current?.onStage(null);
      cleanupAudio();
      stage.dispose();
      motionPlayerRef.current?.dispose();
      motionPlayerRef.current = null;
      for (const [joint, rest] of springRest) {
        const settings = (joint as { settings: { gravityDir: THREE.Vector3; gravityPower: number } }).settings;
        settings.gravityDir.copy(rest.dir);
        settings.gravityPower = rest.power;
      }
      // Back to the cache in its loaded pose, for the next viewer of this model.
      if (vrm) releaseAvatar(vrm);
      setLoadedVrm(null);
      setPlayingGesture('');
    };
  }, [modelPath]);

  const motionCount = useAvatarMotions({
    loop,
    onLoops: pet?.onLoops,
    model: loadedVrm,
    motions: motions.filter((m) => m.kind === 'vrma' || m.kind === 'fbx'),
    player: motionPlayerRef,
    load: (motion, model) => loadMotionClip(motion, model),
    gesture,
    mood: emotion,
    onGesture: setPlayingGesture,
  });

  return (
    <div className={pet ? 'relative w-full h-full overflow-hidden' : 'relative w-full h-full flex flex-col items-center justify-center overflow-hidden bg-linear-to-b from-slate-900/40 via-accent-950/20 to-app'}>
      <div
        ref={containerRef}
        data-motions={motionCount}
        data-gesture={playingGesture}
        className={pet ? 'w-full h-full' : 'w-full h-full cursor-grab active:cursor-grabbing'}
      />
      {!pet && <AvatarViewerChrome
        loading={loading}
        loadingLabel={t('avatar.vrmLoading')}
        error={error}
        empty={modelPath.trim() ? null : { title: t('avatar.noVrmTitle'), text: t('avatar.noVrmText') }}
        expression={emotion}
        onPickEmotion={onPickEmotion}
        onResetView={() => resetViewRef.current?.()}
      />}
    </div>
  );
};
