import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { api } from '../../services/api';
import { audioPlayer } from '../../services/audioPlayer';
import { mouthTarget, SILENT_VISEMES, type Visemes } from '../../services/lipSync';
import { translate, useTranslation } from '../../i18n';
import { errorMessage } from '../../utils/errors';
import type { AvatarMotion } from '../../types';
import { AvatarMotionPlayer } from './vrmMotions';
import { createAvatarStage, createBlinker } from './avatarStage';
import { loweredArm } from './avatarPose';
import { AvatarViewerChrome } from './AvatarViewerChrome';
import { useAvatarMotions } from './useAvatarMotions';
import { captureRest, findRigBones, MorphFace, retargetToRig, type RigRest } from './gltfRig';
import type { AvatarViewerProps } from './VrmViewer';

const EXPRESSION_WEIGHTS: Record<string, number> = { happy: 0.8, angry: 0.8, sad: 0.7, surprised: 0.8, relaxed: 0.6 };
const VISEME_KEYS = Object.keys(SILENT_VISEMES) as (keyof Visemes)[];

interface LoadedRig {
  root: THREE.Object3D;
  rest: RigRest;
}

/**
 * Bounds of the model as it is drawn in its rest pose. Skinned meshes are measured through
 * their skeleton (raw vertices can lie in another space when the rig root is rotated); the
 * skeleton is updated first, else the skinning matrices are still empty. Morph targets are
 * left out (geometry bounds would include each at full weight).
 */
function restPoseBounds(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  // updateMatrixWorld (not updateWorldMatrix): only it refreshes the bind matrix inverse of
  // skinned meshes, else a rescaled model is measured with its scale twice.
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    const mesh = node as THREE.SkinnedMesh;
    if (!mesh.isMesh) return;
    if (mesh.isSkinnedMesh) {
      mesh.skeleton.update();
      const influences = mesh.morphTargetInfluences?.slice();
      mesh.morphTargetInfluences?.fill(0);
      mesh.computeBoundingBox();
      if (influences) mesh.morphTargetInfluences!.splice(0, influences.length, ...influences);
      box.union(mesh.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));
    } else {
      const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
      if (position) box.union(new THREE.Box3().setFromBufferAttribute(position).applyMatrix4(mesh.matrixWorld));
    }
  });
  return box;
}

/** Mixamo FBX motions, moved onto this rig. */
async function loadFbxForRig(motion: AvatarMotion, rig: LoadedRig): Promise<THREE.AnimationClip | null> {
  const bytes = await api.readFileBinary(motion.path);
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
  const source = new FBXLoader().parse(bytes.buffer as ArrayBuffer, '');
  const clip = THREE.AnimationClip.findByName(source.animations, 'mixamo.com') ?? source.animations[0];
  if (!clip) return null;
  const result = retargetToRig(clip, source, rig.root, rig.rest);
  result.name = motion.file;
  return result.tracks.length ? result : null;
}

/**
 * Plain glTF/GLB avatars with a Mixamo-style rig (Ready Player Me-like, Blender exports): face
 * through ARKit blendshapes or Oculus visemes, Mixamo FBX motions.
 */
export const GltfViewer = ({
  modelPath,
  emotion = 'neutral',
  isSpeaking = false,
  motions = [],
  gesture = null,
  onPickEmotion = () => {},
}: AvatarViewerProps) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const emotionRef = useRef(emotion);
  const isSpeakingRef = useRef(isSpeaking);
  const resetViewRef = useRef<(() => void) | null>(null);
  const [loaded, setLoaded] = useState<LoadedRig | null>(null);
  const motionPlayerRef = useRef<AvatarMotionPlayer | null>(null);
  const [playingGesture, setPlayingGesture] = useState('');

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
    const cleanupAudio = audioPlayer.onAudioFrame((_amplitude, visemes) => {
      audioVisemes = visemes;
    });
    const stage = createAvatarStage(container, modelPath);
    stage.useStudioEnvironment();
    resetViewRef.current = stage.resetView;

    let root: THREE.Object3D | null = null;
    let face: MorphFace | null = null;
    let posed: { bone: THREE.Object3D; rest: THREE.Quaternion }[] = [];
    let head: THREE.Object3D | undefined;
    let spine: THREE.Object3D | undefined;

    const load = async () => {
      try {
        const bytes = await api.readFileBinary(modelPath);
        const gltf = await new GLTFLoader().parseAsync(bytes.buffer as ArrayBuffer, '');
        if (isDisposed) return;
        const scene = gltf.scene;
        stage.scene.add(scene);
        // Exports in other units (centimetres, decimetres …) are brought to human size; models
        // between half a metre (chibi) and three metres keep theirs.
        const height = restPoseBounds(scene).getSize(new THREE.Vector3()).y;
        if (height > 0 && (height < 0.5 || height > 3)) scene.scale.setScalar(1.6 / height);
        const bones = findRigBones(scene);
        head = bones.head;
        spine = bones.spine;
        scene.updateWorldMatrix(true, true);
        posed = [bones.head, bones.neck, bones.spine]
          .filter((b): b is THREE.Object3D => !!b)
          .map((b) => ({ bone: b, rest: b.quaternion.clone() }));
        for (const [arm, forearm, side] of [[bones.leftArm, bones.leftForeArm, 1], [bones.rightArm, bones.rightForeArm, -1]] as const) {
          if (arm && forearm) posed.push({ bone: arm, rest: loweredArm(arm, forearm, side) });
        }
        face = new MorphFace(scene);
        const box = restPoseBounds(scene);
        stage.frameModel(head ? head.getWorldPosition(new THREE.Vector3()).y : box.max.y - 0.15, box.max.y);
        const rest = captureRest(scene);
        root = scene;
        motionPlayerRef.current = new AvatarMotionPlayer(scene, () => setPlayingGesture(''));
        setLoaded({ root: scene, rest });
        setLoading(false);
      } catch (err) {
        if (isDisposed) return;
        console.error('glTF-Avatar konnte nicht geladen werden:', err);
        setError(translate('avatar.vrmLoadFailed', { error: errorMessage(err) }));
        setLoading(false);
      }
    };
    void load();

    const blink = createBlinker();
    let lookX = 0;
    let lookY = 0;
    const euler = new THREE.Euler();
    const turn = new THREE.Quaternion();

    stage.start((delta, elapsed) => {
      if (!root) return;
      const player = motionPlayerRef.current;
      const animated = player?.bodyWeight ?? 0;
      // Posed bones start from rest each frame; motions overwrite what they animate.
      for (const { bone, rest } of posed) bone.quaternion.copy(rest);
      player?.update(delta);
      if (animated > 0.001 && animated < 0.999) for (const { bone, rest } of posed) bone.quaternion.slerp(rest, 1 - animated);
      lookX = THREE.MathUtils.lerp(lookX, stage.mouse.x, 0.05);
      lookY = THREE.MathUtils.lerp(lookY, stage.mouse.y, 0.05);
      head?.quaternion.multiply(turn.setFromEuler(euler.set(-lookY * 0.12, lookX * 0.25, -lookX * 0.04)));
      spine?.quaternion.multiply(turn.setFromEuler(euler.set(Math.sin(elapsed * 1.8) * 0.012 * (1 - animated), 0, 0)));

      if (face) {
        face.set('blink', blink(elapsed));
        const weight = EXPRESSION_WEIGHTS[emotionRef.current];
        if (weight) face.set(emotionRef.current, weight);
        const target = mouthTarget(audioPlayer.isPlaying() ? audioVisemes : null, isSpeakingRef.current, elapsed);
        for (const key of VISEME_KEYS) {
          mouth[key] = THREE.MathUtils.lerp(mouth[key], target[key], 0.5);
          face.set(key, mouth[key]);
        }
        face.apply();
      }
    });

    return () => {
      isDisposed = true;
      resetViewRef.current = null;
      cleanupAudio();
      stage.dispose();
      motionPlayerRef.current?.dispose();
      motionPlayerRef.current = null;
      setLoaded(null);
      setPlayingGesture('');
    };
  }, [modelPath]);

  const motionCount = useAvatarMotions({
    model: loaded,
    motions: motions.filter((m) => m.kind === 'fbx'),
    player: motionPlayerRef,
    load: loadFbxForRig,
    gesture,
    onGesture: setPlayingGesture,
  });

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden bg-linear-to-b from-slate-900/40 via-accent-950/20 to-app">
      <div
        ref={containerRef}
        data-avatar-format="gltf"
        data-motions={motionCount}
        data-gesture={playingGesture}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />
      <AvatarViewerChrome
        loading={loading}
        loadingLabel={t('avatar.vrmLoading')}
        error={error}
        expression={emotion}
        onPickEmotion={onPickEmotion}
        onResetView={() => resetViewRef.current?.()}
      />
    </div>
  );
};

export default GltfViewer;
