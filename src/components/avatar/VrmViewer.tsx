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
import { bodyPose, BodySway, computeSitPose, walkBob, WALK_CYCLE_HZ, type BodyBone, type LegLengths, type SeatPose } from './proceduralBody';
import { PET_EDGE_SEAT } from '../../services/avatarViewState';
import { reachWithArm } from './armReach';
import { eatReach, type PetEat } from './eatTimeline';
import { climbLift, handWeight, stretchArch, type PetHands } from './handTimeline';
import { HangRig, isSkirtJoint } from './petHang';
import type { Hang, Recover } from './hangTimeline';
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
  /** Konkrete zufällig gewählte Sitzvariante (Boden oder Kante). */
  seatPose?: SeatPose | null;
  /** Desktop pet held up: hangs from where it was grabbed (VRM only; see `petHang.ts`). */
  hang?: Hang | null;
  /** Desktop pet getting up after a hard landing (VRM only). */
  recover?: Recover | null;
  /** Desktop pet eating what it was fed: the right hand brings it to the mouth (VRM only). */
  eat?: PetEat | null;
  /** Desktop pet's hands: stretching, rubbing the belly, holding a letter or book, on a ledge (VRM only). */
  hands?: PetHands | null;
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
const SEAT_BELOW_ANKLES = 0.02;
/**
 * The ankles aim this far (share of the model height) below their standing height: low enough
 * to keep the heels/soles grounded without cutting shoes below the window edge.
 */
const FEET_BELOW_ANKLES = 0.015;
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
const ALL_ROMANCE_NAMES = Array.from(new Set(Object.values(ROMANCE_EXPRESSIONS).flat()));

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
  seatPose = null,
  hang = null,
  recover = null,
  eat = null,
  hands = null,
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
  const seatPoseRef = useRef(seatPose);
  useEffect(() => {
    seatPoseRef.current = seatPose;
  }, [seatPose]);
  const hangRef = useRef(hang);
  useEffect(() => {
    hangRef.current = hang;
  }, [hang]);
  const eatRef = useRef(eat);
  useEffect(() => {
    eatRef.current = eat;
  }, [eat]);
  const recoverRef = useRef(recover);
  useEffect(() => {
    recoverRef.current = recover;
  }, [recover]);
  const handsRef = useRef(hands);
  useEffect(() => {
    handsRef.current = hands;
  }, [hands]);

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
    /** Hanging and getting up (desktop pet only), made once the model is loaded. */
    let hangRig: HangRig | null = null;
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
        if (petRef.current) hangRig = new HangRig(loaded, stage.camera, modelHeight, leftArmDirection);
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
    const reachHipOther = new THREE.Vector3();
    const reachAnkle = new THREE.Vector3();
    const reachLeftAxis = new THREE.Vector3();
    const reachBodyFront = new THREE.Vector3();
    const reachTarget = new THREE.Vector3();
    const reachUpper = new THREE.Quaternion();
    const reachLower = new THREE.Quaternion();
    const upAxis = new THREE.Vector3(0, 1, 0);
    // Eating: which meal it is on and since when (the viewer's own clock), and scratch values.
    let eatSeen: number | null = null;
    let eatStart = 0;
    const eatHead = new THREE.Vector3();
    const eatLeft = new THREE.Vector3();
    const eatOther = new THREE.Vector3();
    const eatFront = new THREE.Vector3();
    const eatUpper = new THREE.Quaternion();
    const eatLower = new THREE.Quaternion();
    // Other hand poses (`handTimeline.ts`): which one and since when (own clock).
    let handsSeen: number | null = null;
    let handsStart = 0;
    const handTarget = new THREE.Vector3();
    /** Weiches Überblenden bei Wechseln zwischen verschiedenen Sitzhaltungen. */
    const sitBoneQuats = new Map<string, THREE.Quaternion>();
    const sitHandSmooth = { left: new THREE.Vector3(), right: new THREE.Vector3(), ready: false };
    /** Spring settings of hair and cloth as loaded, to add the window's wind to (and restore). */
    const springRest = new Map<object, { dir: THREE.Vector3; power: number }>();
    const wind = new THREE.Vector3();
    const skirtFall = new THREE.Vector3();
    let neckX = 0;
    let neckY = 0;
    let lookX = 0;
    let lookY = 0;
    /** Glättung des vertikalen Hüft-Offsets (Roadmap 4.2 HipsAnchor). */
    let hipsSmoothY: number | null = null;
    /** Augen-Mikrosakkaden und weiche Blickrichtung. */
    let nextSaccadeAt = 1.4;
    let saccadeX = 0;
    let saccadeY = 0;
    let eyeYaw = 0;
    let eyePitch = 0;
    /** Aktuelle überblendete Gewichte je VRM-Expression. */
    const exprWeights: Record<string, number> = {};
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
      // The upper chest too: no procedural pose sets it, so a bend added on top (pet hanging)
      // would otherwise stay when no motion drives it.
      model.humanoid.getNormalizedBoneNode('upperChest')?.quaternion.identity();
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
      const headLerp = 1 - Math.exp(-delta * 4.5);
      const neckLerp = 1 - Math.exp(-delta * 1.8);
      lookX = THREE.MathUtils.lerp(lookX, stage.mouse.x, headLerp);
      lookY = THREE.MathUtils.lerp(lookY, stage.mouse.y, headLerp);
      // The look moves in a chain: eyes at once, the head soon, neck and chest last.
      neckX = THREE.MathUtils.lerp(neckX, stage.mouse.x, neckLerp);
      neckY = THREE.MathUtils.lerp(neckY, stage.mouse.y, neckLerp);
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
        mood: emotionRef.current,
        speaking: isSpeakingRef.current,
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
      // Getting up after a hard landing sits down on the ground for a while.
      hangRig?.sync(hangRef.current, recoverRef.current, elapsed);
      const wanted = seatRef.current ?? hangRig?.seat(elapsed) ?? null;
      if (wanted) seatKind = wanted;
      seat += ((wanted ? 1 : 0) - seat) * Math.min(1, delta * 2.5);
      const activeSeatPose: SeatPose =
        seatRef.current && seatPoseRef.current ? seatPoseRef.current : seatKind === 'edge' ? 'dangle' : 'hugKnees';
      let sitSpec: ReturnType<typeof computeSitPose> | null = null;
      if (seat <= 0.001) {
        sitBoneQuats.clear();
        sitHandSmooth.ready = false;
      } else if (hips && hipsRestY !== null) {
        const edge = seatKind === 'edge';
        // Die Hüfte bleibt auf Sitzhöhe, sodass angezogene oder baumelnde Beine sicher im Fenster bleiben.
        const hipTarget = edge
          ? (PET_EDGE_SEAT + 0.055) * modelHeight
          : legs
            ? Math.max(0.05 * modelHeight, legs.ankleY - SEAT_BELOW_ANKLES * modelHeight)
            : 0.09 * modelHeight;
        const hipToAnkleDrop = legs ? hipTarget - (legs.ankleY - FEET_BELOW_ANKLES * modelHeight) : 0;
        sitSpec = computeSitPose(leftArmDirection, legs, hipToAnkleDrop, activeSeatPose, elapsed);
        const poseBlend = 1 - Math.exp(-delta * 6.5);
        for (const [bone, [x, y, z]] of Object.entries(sitSpec.pose)) {
          const node = model.humanoid.getNormalizedBoneNode(bone as BodyBone);
          if (!node) continue;
          poseQuaternion.setFromEuler(poseEuler.set(x, y, z));
          let smoothed = sitBoneQuats.get(bone);
          if (!smoothed) {
            smoothed = poseQuaternion.clone();
            sitBoneQuats.set(bone, smoothed);
          } else {
            smoothed.slerp(poseQuaternion, poseBlend);
          }
          node.quaternion.slerp(smoothed, seat);
        }
        const hipsTarget = legs ? hipsRestY + (hipTarget - legs.hipY) : hipTarget;
        hips.position.y = THREE.MathUtils.lerp(hips.position.y, hipsTarget, seat);
      }
      // Roadmap 4.2 (HipsAnchor): vertikale Hüftübergänge bei Sitz-/Clip-Wechseln weich glätten.
      if (hips) {
        const hipLerp = 1 - Math.exp(-delta * 16);
        hipsSmoothY = hipsSmoothY === null ? hips.position.y : THREE.MathUtils.lerp(hipsSmoothY, hips.position.y, hipLerp);
        hips.position.y = hipsSmoothY;
      }
      if (sitSpec && seat > 0.001 && hips && hipsRestY !== null) {
        // Hände per IK an ihre sitzspezifischen Ruhepunkte (Schienbein, Knie, Oberschenkel, Hüfte) führen.
        hips.updateWorldMatrix(true, true);
        const lHip = model.humanoid.getNormalizedBoneNode('leftUpperLeg');
        const rHip = model.humanoid.getNormalizedBoneNode('rightUpperLeg');
        if (lHip && rHip) {
          lHip.getWorldPosition(reachHip);
          rHip.getWorldPosition(reachHipOther);
          reachLeftAxis.subVectors(reachHip, reachHipOther).setY(0);
        } else {
          reachLeftAxis.set(0, 0, 0);
        }
        if (reachLeftAxis.lengthSq() > 1e-6) {
          reachLeftAxis.normalize();
          reachBodyFront.crossVectors(reachLeftAxis, upAxis).normalize();
        } else {
          reachLeftAxis.set(1, 0, 0);
          reachBodyFront.set(0, 0, 1);
        }
        const handBlend = 1 - Math.exp(-delta * 6.5);
        for (const side of ['left', 'right'] as const) {
          const node = (bone: string) => model.humanoid.getNormalizedBoneNode(`${side}${bone}` as BodyBone);
          const [upper, lower, hand, hipJoint, knee, ankle] = [
            node('UpperArm'), node('LowerArm'), node('Hand'), node('UpperLeg'), node('LowerLeg'), node('Foot'),
          ];
          if (!upper || !lower || !hand || !hipJoint || !knee || !ankle) continue;
          const hipAt = hipJoint.getWorldPosition(reachHip);
          const kneeAt = knee.getWorldPosition(reachKnee);
          const ankleAt = ankle.getWorldPosition(reachAnkle);
          const handSpec = side === 'left' ? sitSpec.leftHand : sitSpec.rightHand;
          const outward = side === 'left' ? 1 : -1;
          if (handSpec.alongLeg <= 1) reachTarget.lerpVectors(hipAt, kneeAt, handSpec.alongLeg);
          else reachTarget.lerpVectors(kneeAt, ankleAt, handSpec.alongLeg - 1);
          reachTarget
            .addScaledVector(reachBodyFront, handSpec.forwardOffset * modelHeight)
            .addScaledVector(upAxis, handSpec.upOffset * modelHeight)
            .addScaledVector(reachLeftAxis, outward * handSpec.sideOffset * modelHeight);
          const smoothTarget = sitHandSmooth[side];
          if (!sitHandSmooth.ready) smoothTarget.copy(reachTarget);
          else smoothTarget.lerp(reachTarget, handBlend);
          reachUpper.copy(upper.quaternion);
          reachLower.copy(lower.quaternion);
          reachWithArm(upper, lower, hand, smoothTarget);
          upper.quaternion.copy(reachUpper.slerp(upper.quaternion, seat));
          lower.quaternion.copy(reachLower.slerp(lower.quaternion, seat));
        }
        sitHandSmooth.ready = true;
      }
      // Eating: the right hand brings the food up in front of the mouth and down again
      // (`eatTimeline.ts`); the behaviour chews through the mouth meanwhile.
      const meal = eatRef.current;
      if (meal && meal.id !== eatSeen) {
        eatSeen = meal.id;
        eatStart = elapsed;
      }
      const toMouth = meal && !hangRef.current ? eatReach(elapsed - eatStart) : 0;
      if (toMouth > 0.001) {
        const node = (bone: string) => model.humanoid.getNormalizedBoneNode(bone as BodyBone);
        const [head, upper, lower, hand, leftHip, rightHip] = [
          node('head'), node('rightUpperArm'), node('rightLowerArm'), node('rightHand'), node('leftUpperLeg'), node('rightUpperLeg'),
        ];
        if (head && upper && lower && hand && leftHip && rightHip) {
          model.scene.updateMatrixWorld(true);
          // The body's left and front from the hips (whatever way the rig's own axes point).
          eatLeft.subVectors(leftHip.getWorldPosition(eatLeft), rightHip.getWorldPosition(eatOther)).setY(0);
          if (eatLeft.lengthSq() < 1e-8) eatLeft.set(1, 0, 0);
          eatLeft.normalize();
          eatFront.crossVectors(eatLeft, upAxis).normalize();
          // The mouth: a little above the head joint and in front of the face; the hand holds
          // the food just before it, slightly to its own side.
          head
            .getWorldPosition(eatHead)
            .addScaledVector(upAxis, 0.025 * modelHeight)
            .addScaledVector(eatFront, 0.1 * modelHeight)
            .addScaledVector(eatLeft, -0.02 * modelHeight);
          eatUpper.copy(upper.quaternion);
          eatLower.copy(lower.quaternion);
          reachWithArm(upper, lower, hand, eatHead);
          upper.quaternion.copy(eatUpper.slerp(upper.quaternion, toMouth));
          lower.quaternion.copy(eatLower.slerp(lower.quaternion, toMouth));
        }
      }
      // Hand poses: stretching, the belly, a letter or a book held out, hands on a ledge.
      const handPose = handsRef.current;
      if (handPose && handPose.id !== handsSeen) {
        handsSeen = handPose.id;
        handsStart = elapsed;
      }
      const handT = elapsed - handsStart;
      const handShare = handPose && !hangRef.current && !toMouth ? handWeight(handPose.kind, handT) : 0;
      if (handPose && handShare > 0.001) {
        const node = (bone: string) => model.humanoid.getNormalizedBoneNode(bone as BodyBone);
        const [head, hipsNode, leftHip, rightHip, spine] = [
          node('head'), node('hips'), node('leftUpperLeg'), node('rightUpperLeg'), node('spine'),
        ];
        if (head && hipsNode && leftHip && rightHip) {
          // Stretching, the back arches a little at the top.
          if (handPose.kind === 'stretch' && spine) {
            spine.quaternion.multiply(poseQuaternion.setFromEuler(poseEuler.set(-0.18 * stretchArch(handT) * leftArmDirection, 0, 0)));
          }
          model.scene.updateMatrixWorld(true);
          eatLeft.subVectors(leftHip.getWorldPosition(eatLeft), rightHip.getWorldPosition(eatOther)).setY(0);
          if (eatLeft.lengthSq() < 1e-8) eatLeft.set(1, 0, 0);
          eatLeft.normalize();
          eatFront.crossVectors(eatLeft, upAxis).normalize();
          const sides: ('left' | 'right')[] = handPose.kind === 'belly' || handPose.kind === 'carry' ? ['right'] : ['left', 'right'];
          for (const side of sides) {
            const [upper, lower, hand] = [node(`${side}UpperArm`), node(`${side}LowerArm`), node(`${side}Hand`)];
            if (!upper || !lower || !hand) continue;
            const out = side === 'left' ? 1 : -1;
            if (handPose.kind === 'stretch') {
              head.getWorldPosition(handTarget).addScaledVector(upAxis, 0.24 * modelHeight).addScaledVector(eatLeft, out * 0.06 * modelHeight);
            } else if (handPose.kind === 'ledge') {
              // On the edge above the head; pulling up, the edge sinks to the hips (it pushes itself up).
              const lift = climbLift(handT);
              head
                .getWorldPosition(handTarget)
                .addScaledVector(upAxis, (0.2 - 0.55 * lift) * modelHeight)
                .addScaledVector(eatLeft, out * 0.11 * modelHeight)
                .addScaledVector(eatFront, 0.06 * lift * modelHeight);
            } else if (handPose.kind === 'belly') {
              const circle = elapsed * 6;
              hipsNode
                .getWorldPosition(handTarget)
                .addScaledVector(upAxis, (0.11 + 0.012 * Math.sin(circle)) * modelHeight)
                .addScaledVector(eatFront, 0.085 * modelHeight)
                .addScaledVector(eatLeft, (0.012 * Math.cos(circle) - 0.01) * modelHeight);
            } else if (handPose.kind === 'carry') {
              hipsNode.getWorldPosition(handTarget).addScaledVector(upAxis, 0.27 * modelHeight).addScaledVector(eatFront, 0.16 * modelHeight).addScaledVector(eatLeft, -0.04 * modelHeight);
            } else {
              hipsNode.getWorldPosition(handTarget).addScaledVector(upAxis, 0.24 * modelHeight).addScaledVector(eatFront, 0.15 * modelHeight).addScaledVector(eatLeft, out * 0.07 * modelHeight);
            }
            eatUpper.copy(upper.quaternion);
            eatLower.copy(lower.quaternion);
            reachWithArm(upper, lower, hand, handTarget);
            upper.quaternion.copy(eatUpper.slerp(upper.quaternion, handShare));
            lower.quaternion.copy(eatLower.slerp(lower.quaternion, handShare));
            upper.updateWorldMatrix(false, true);
          }
        }
      }
      // 3D-Schattenhöhe dynamisch an Hängen, Kante oder Boden anpassen.
      if (hangRef.current) {
        stage.setShadowFloor?.(null);
      } else if (seat > 0.1 && seatKind === 'edge') {
        stage.setShadowFloor?.(PET_EDGE_SEAT * modelHeight * seat);
      } else {
        stage.setShadowFloor?.(0);
      }
      // Held up or getting up: the whole body turns about the grip, limbs hang, a hand rubs.
      hangRig?.setHold(stage.hangHold?.() ?? null);
      hangRig?.apply(delta, elapsed, sway.windowSpeed);
      model.humanoid
        .getNormalizedBoneNode('head')
        // Up and down turn the other way on VRM 0.x rigs (see `forFacing` in proceduralBody).
        ?.quaternion.multiply(
          poseQuaternion.setFromEuler(poseEuler.set(-lookY * 0.12 * leftArmDirection, lookX * 0.2, -lookX * 0.04 * leftArmDirection)),
        );
      if (model.lookAt) {
        if (elapsed >= nextSaccadeAt) {
          nextSaccadeAt = elapsed + 1.2 + Math.random() * 1.8;
          saccadeX = (Math.random() - 0.5) * 2.4;
          saccadeY = (Math.random() - 0.5) * 1.2;
        }
        const saccadeDecay = Math.exp(-delta * 6);
        saccadeX *= saccadeDecay;
        saccadeY *= saccadeDecay;
        const eyeLerp = 1 - Math.exp(-delta * 16);
        // Eyes ahead of the head (degrees).
        const targetYaw = THREE.MathUtils.clamp(stage.mouse.x * 18 + saccadeX, -18, 18);
        // three-vrm: a positive pitch looks down (eye bones and lookUp/lookDown alike), the pointer above is +y.
        const targetPitch = THREE.MathUtils.clamp(-stage.mouse.y * 10 + saccadeY, -10, 10);
        eyeYaw = THREE.MathUtils.lerp(eyeYaw, targetYaw, eyeLerp);
        eyePitch = THREE.MathUtils.lerp(eyePitch, targetPitch, eyeLerp);
        model.lookAt.yaw = eyeYaw;
        model.lookAt.pitch = eyePitch;
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
        // Skirts fall along the legs however the body hangs (not over the head).
        const fallDir = hangRig && isSkirtJoint(joint.bone.name) ? skirtFall.copy(rest.dir).applyQuaternion(hangRig.turn) : rest.dir;
        const pull = poseVector.copy(fallDir).multiplyScalar(rest.power).add(wind);
        joint.settings.gravityPower = pull.length();
        if (joint.settings.gravityPower > 1e-4) joint.settings.gravityDir.copy(pull.normalize());
        else joint.settings.gravityDir.copy(rest.dir);
      }

      // B. Face: blinking, emotion and mouth shapes from the voice.
      const em = model.expressionManager;
      const currentMood = emotionRef.current;
      const exprLerp = 1 - Math.exp(-delta * 9);
      if (em) {
        const romanceBase = ROMANCE_VRM_BASE[currentMood];
        const activeBaseMood = romanceBase ? romanceBase.baseMood : currentMood;

        for (const [expression, weight] of Object.entries(EXPRESSION_WEIGHTS)) {
          const isBase = activeBaseMood === expression;
          const targetWeight = isBase ? (romanceBase ? romanceBase.weight : weight) : 0;
          const next = THREE.MathUtils.lerp(exprWeights[expression] ?? 0, targetWeight, exprLerp);
          exprWeights[expression] = next < 0.002 ? 0 : next;
          em.setValue(expression, exprWeights[expression]);
        }

        // Custom romance expressions on VRMExpressionManager (e.g. Blush, Cheek, HeartEyes)
        const activeRomanceNames = new Set(ROMANCE_EXPRESSIONS[currentMood] ?? []);
        for (const name of ALL_ROMANCE_NAMES) {
          if (!em.getExpression(name)) continue;
          const targetRomance = activeRomanceNames.has(name) ? 0.85 : 0;
          const key = `romance:${name}`;
          const next = THREE.MathUtils.lerp(exprWeights[key] ?? 0, targetRomance, exprLerp);
          exprWeights[key] = next < 0.002 ? 0 : next;
          em.setValue(name, exprWeights[key]);
        }

        // Lidschlag dämpfen, wenn fröhliche oder entspannte Mimik die Augen bereits verengt.
        const eyeSquint = Math.max((exprWeights.happy ?? 0) * 0.75, (exprWeights.relaxed ?? 0) * 0.5);
        em.setValue('blink', blink(elapsed) * (1 - eyeSquint));

        const target = mouthTarget(audioPlayer.isPlaying() ? audioVisemes : null, isSpeakingRef.current, elapsed);
        const mouthLerp = 1 - Math.exp(-delta * 20);
        for (const key of VISEME_KEYS) {
          mouth[key] = THREE.MathUtils.lerp(mouth[key], target[key], mouthLerp);
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
          exprLerp,
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
      hangRig?.reset();
      if (vrm) releaseAvatar(vrm);
      setLoadedVrm(null);
      setPlayingGesture('');
    };
  }, [modelPath]);

  const motionCount = useAvatarMotions({
    loop,
    onLoops: pet?.onLoops,
    model: loadedVrm,
    motions: motions.filter((m) => m.kind === 'vrma' || m.kind === 'fbx' || m.kind === 'vmd'),
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
