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
import { createAvatarStage, createBlinker, type AvatarStage } from './avatarStage';
import { AvatarViewerChrome } from './AvatarViewerChrome';
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
  /**
   * Desktop pet: transparent, whole figure, no camera controls or buttons. Receives the stage
   * (pointer for looking, hit test for click-through) and `null` when it goes.
   */
  pet?: {
    onStage: (stage: AvatarStage | null) => void;
    /** Which state loops (walk, sit) this avatar has motions for. */
    onLoops?: (available: Record<LoopRole, boolean>) => void;
  };
  /** State loop instead of the idle loop (desktop pet walking or sitting). */
  loop?: LoopRole | null;
}

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
  pet,
  loop = null,
}: AvatarViewerProps) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
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
        stage.scene.add(loaded.scene);
        motionPlayerRef.current = new AvatarMotionPlayer(loaded.scene, () => setPlayingGesture(''));
        setLoadedVrm(loaded);

        loaded.scene.updateMatrixWorld(true);
        const head = loaded.humanoid.getRawBoneNode('head');
        if (head) {
          stage.frameModel(head.getWorldPosition(new THREE.Vector3()).y, new THREE.Box3().setFromObject(loaded.scene).max.y);
        }
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
    void loadModel();

    const blink = createBlinker();
    let lookX = 0;
    let lookY = 0;
    const poseEuler = new THREE.Euler();
    const poseQuaternion = new THREE.Quaternion();

    stage.start((delta, elapsed) => {
      if (!vrm) return;
      const model = vrm;
      // A. Imported motions first; the procedural pose (breathing, resting arms) fills in
      // whatever share of the body they do not drive, the head always follows the mouse.
      const motionPlayer = motionPlayerRef.current;
      // The mouse look is added on top every frame, so the head starts from rest (or from
      // the motion, which overwrites it if it animates the head).
      model.humanoid.getNormalizedBoneNode('head')?.quaternion.identity();
      motionPlayer?.update(delta);
      const animated = motionPlayer?.bodyWeight ?? 0;
      const pose = (name: Parameters<typeof model.humanoid.getNormalizedBoneNode>[0], x: number, y: number, z: number) => {
        const bone = model.humanoid.getNormalizedBoneNode(name);
        if (!bone || animated >= 0.999) return;
        poseQuaternion.setFromEuler(poseEuler.set(x, y, z));
        if (animated <= 0.001) bone.quaternion.copy(poseQuaternion);
        else bone.quaternion.slerp(poseQuaternion, 1 - animated);
      };
      lookX = THREE.MathUtils.lerp(lookX, stage.mouse.x, 0.05);
      lookY = THREE.MathUtils.lerp(lookY, stage.mouse.y, 0.05);
      const breath = Math.sin(elapsed * 1.8);
      pose('spine', breath * 0.012, 0, Math.sin(elapsed * 0.9) * 0.005);
      pose('chest', Math.sin(elapsed * 1.8 + 0.3) * 0.01, Math.sin(elapsed * 0.9) * 0.008, 0);
      model.humanoid
        .getNormalizedBoneNode('head')
        ?.quaternion.multiply(poseQuaternion.setFromEuler(poseEuler.set(-lookY * 0.12, lookX * 0.2, -lookX * 0.04)));
      // Resting arms (down from the T-pose), whichever way this model's arm chain points.
      pose('leftUpperArm', 0.12, -0.05, -leftArmDirection * (1.25 - breath * 0.015));
      pose('rightUpperArm', 0.12, 0.05, -rightArmDirection * (1.25 - breath * 0.015));
      // Elbows bent slightly forward towards the waist.
      pose('leftLowerArm', 0.05, -leftArmDirection * 0.3, 0);
      pose('rightLowerArm', 0.05, -rightArmDirection * 0.3, 0);
      pose('leftHand', 0, -leftArmDirection * 0.1, 0);
      pose('rightHand', 0, -rightArmDirection * 0.1, 0);

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
