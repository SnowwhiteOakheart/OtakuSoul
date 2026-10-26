import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { leaseAvatar, releaseAvatar, takeAvatar } from './avatarCache';
import { avatarTimer } from './avatarTiming';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { clipFitsRig } from './clipFit';
import { api } from '../../services/api';
import { audioPlayer } from '../../services/audioPlayer';
import { mouthTarget, SILENT_VISEMES, type Visemes } from '../../services/lipSync';
import { translate, useTranslation } from '../../i18n';
import { errorMessage } from '../../utils/errors';
import type { AvatarMotion } from '../../types';
import { AvatarMotionPlayer } from './vrmMotions';
import { createAvatarStage, createBlinker, type AvatarStage } from './avatarStage';
import { applyToonLook } from './toonLook';
import { BoneFace } from './boneFace';
import { loadGltfAvatar } from './gltfFile';
import { usePersistentFlag } from '../../hooks/usePersistentFlag';
import { loweredArm } from './avatarPose';
import { AvatarViewerChrome } from './AvatarViewerChrome';
import { useAvatarMotions } from './useAvatarMotions';
import { captureRest, findRigBones, MorphFace, retargetToRig, type RigRest } from './gltfRig';
import type { AvatarViewerProps } from './VrmViewer';
import { useStoreFields } from '../../store/useAppStore';
import { MOTION_ROLES, type MotionRole } from '../../utils/avatarGestures';

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

/**
 * The model's own animations, ready to play: walking and other root motion would carry the figure
 * out of the picture. The hips and every node above them (Unreal's `root`, the Biped centre of mass
 * `Bip001`) keep their rest place sideways, even when a clip starts mid-stride; their movement up and
 * down (breathing, bobbing, crouching) stays. Rigs without known hips treat their top bones that way.
 */
export function withoutRootMotion(clips: THREE.AnimationClip[], scene: THREE.Object3D, hips?: THREE.Object3D): THREE.AnimationClip[] {
  scene.updateWorldMatrix(true, true);
  const carriers: THREE.Object3D[] = [];
  if (hips) {
    for (let node: THREE.Object3D | null = hips; node && node !== scene; node = node.parent) carriers.push(node);
  } else {
    scene.traverse((node) => {
      if ((node as THREE.Bone).isBone && !(node.parent as THREE.Bone | null)?.isBone) carriers.push(node);
    });
  }
  // Positions are keyed in the parent's space: turn each offset into the world, drop its sideways
  // part and turn it back.
  const toWorld = new Map(carriers.map((node) => [node.name, {
    rotation: node.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion(),
    rest: node.position.clone(),
  }]));
  const offset = new THREE.Vector3();
  return clips.map((clip) => {
    let changed = false;
    const tracks = clip.tracks.map((track) => {
      const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
      const carrier = toWorld.get(nodeName);
      if (propertyName !== 'position' || !carrier) return track;
      const { rotation, rest } = carrier;
      const back = rotation.clone().invert();
      const values = Float32Array.from(track.values);
      const [x0, y0, z0] = [rest.x, rest.y, rest.z];
      for (let i = 0; i < values.length; i += 3) {
        offset.set(values[i]! - x0, values[i + 1]! - y0, values[i + 2]! - z0).applyQuaternion(rotation);
        offset.x = 0;
        offset.z = 0;
        offset.applyQuaternion(back);
        values[i] = x0 + offset.x;
        values[i + 1] = y0 + offset.y;
        values[i + 2] = z0 + offset.z;
      }
      changed = true;
      return new THREE.VectorKeyframeTrack(track.name, Array.from(track.times), Array.from(values));
    });
    return changed ? new THREE.AnimationClip(clip.name, clip.duration, tracks) : clip;
  });
}

/** What drives a face: morph targets or face bones. */
interface FaceDriver {
  supported: string[];
  set: (key: string, weight: number) => void;
  apply: () => void;
  restore?: () => void;
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
 * through ARKit blendshapes or Oculus visemes, the model's own animations (uses from
 * `list_model_clips`) and Mixamo FBX motions for the uses it has none for.
 */
export const GltfViewer = ({
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
  const [loaded, setLoaded] = useState<LoadedRig | null>(null);
  const motionPlayerRef = useRef<AvatarMotionPlayer | null>(null);
  const [playingGesture, setPlayingGesture] = useState('');
  const petRef = useRef(pet);
  useEffect(() => {
    petRef.current = pet;
  }, [pet]);
  const [embedded, setEmbedded] = useState<THREE.AnimationClip[]>([]);
  const [ownClips, setOwnClips] = useState<Map<MotionRole, THREE.AnimationClip[]> | undefined>(undefined);
  const [extraClips, setExtraClips] = useState<THREE.AnimationClip[]>([]);
  const [playingClips, setPlayingClips] = useState({ idle: '', gesture: '' });
  const [faceInfo, setFaceInfo] = useState({ kind: '', keys: '' });
  // Both face drivers of the model; the frame loop uses the chosen one.
  const facesRef = useRef<{ morphs: MorphFace; bones: BoneFace | null } | null>(null);
  const faceRef = useRef<FaceDriver | null>(null);
  const previewRef = useRef<{ key: string; until: number } | null>(null);
  const { avatarFacePreview } = useStoreFields('avatarFacePreview');
  const lastPreview = useRef(avatarFacePreview?.id ?? 0);
  const stageRef = useRef<AvatarStage | null>(null);
  // Cel shading per model and device; game figures usually look right with it, scans without.
  const [toon, setToon] = usePersistentFlag(`avatarToon:${modelPath}`, false);
  const { modelClipRevision, playAvatarClip, setClipMisfits, clipMisfits } = useStoreFields(
    'modelClipRevision', 'playAvatarClip', 'setClipMisfits', 'clipMisfits',
  );

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
    const stage = createAvatarStage(container, modelPath, { pet: !!petRef.current });
    petRef.current?.onStage(stage);
    stage.useStudioEnvironment();
    stageRef.current = stage;
    resetViewRef.current = stage.resetView;

    let root: THREE.Object3D | null = null;
    // The parsed model while this viewer holds it; goes back to avatarCache on close.
    let held: GLTF | null = null;
    let posed: { bone: THREE.Object3D; rest: THREE.Quaternion }[] = [];
    let head: THREE.Object3D | undefined;
    let spine: THREE.Object3D | undefined;

    const load = async () => {
      try {
        // A model shown a moment ago is still parsed (avatarCache).
        let gltf = takeAvatar<GLTF>(modelPath);
        const fromCache = !!gltf;
        if (!gltf) {
          const parsed = await loadGltfAvatar(modelPath);
          // Models copied into the folder by hand skip the import check: no skeleton, no avatar.
          let rigged = false;
          parsed.scene.traverse((node) => {
            if ((node as THREE.SkinnedMesh).isSkinnedMesh) rigged = true;
          });
          if (!rigged) {
            if (isDisposed) return;
            setError(translate('avatar.noSkeleton'));
            setLoading(false);
            return;
          }
          leaseAvatar(modelPath, parsed, parsed.scene, () => applyToonLook(parsed.scene, false));
          gltf = parsed;
        }
        held = gltf;
        const lap = avatarTimer(modelPath);
        if (fromCache) lap('cache');
        if (isDisposed) {
          releaseAvatar(gltf);
          held = null;
          return;
        }
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
        facesRef.current = { morphs: new MorphFace(scene), bones: BoneFace.detect(scene) };
        chooseFace();
        const box = restPoseBounds(scene);
        stage.frameModel(head ? head.getWorldPosition(new THREE.Vector3()).y : box.max.y - 0.15, box.max.y);
        const rest = captureRest(scene);
        // Clips of another skeleton (common in game rips) would stretch the figure: left out.
        const fitting = gltf.animations.filter((clip) => clipFitsRig(clip, scene, bones));
        const misfits = gltf.animations.filter((clip) => !fitting.includes(clip)).map((clip) => clip.name);
        if (misfits.length) console.warn(`glTF-Avatar: ${misfits.length} Animation(en) passen nicht zum Skelett:`, misfits);
        setClipMisfits(modelPath, misfits);
        setEmbedded(withoutRootMotion(fitting, scene, bones.hips));
        root = scene;
        motionPlayerRef.current = new AvatarMotionPlayer(scene, () => setPlayingGesture(''));
        motionPlayerRef.current.onClipChange = (kind, name) => setPlayingClips((now) => ({ ...now, [kind]: name }));
        setLoaded({ root: scene, rest });
        lap('setup');
        stage.timeNextFrame(modelPath);
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
      const face = faceRef.current;
      face?.restore?.();
      player?.update(delta);
      if (animated > 0.001 && animated < 0.999) for (const { bone, rest } of posed) bone.quaternion.slerp(rest, 1 - animated);
      lookX = THREE.MathUtils.lerp(lookX, stage.mouse.x, 0.05);
      lookY = THREE.MathUtils.lerp(lookY, stage.mouse.y, 0.05);
      head?.quaternion.multiply(turn.setFromEuler(euler.set(-lookY * 0.12, lookX * 0.25, -lookX * 0.04)));
      spine?.quaternion.multiply(turn.setFromEuler(euler.set(Math.sin(elapsed * 1.8) * 0.012 * (1 - animated), 0, 0)));

      if (face) {
        const preview = previewRef.current && performance.now() < previewRef.current.until ? previewRef.current.key : '';
        if (preview) face.set(preview, 1);
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
      petRef.current?.onStage(null);
      stageRef.current = null;
      cleanupAudio();
      stage.dispose();
      motionPlayerRef.current?.dispose();
      motionPlayerRef.current = null;
      // Back to the cache in its loaded pose, for the next viewer of this model.
      if (held) releaseAvatar(held);
      setLoaded(null);
      setPlayingGesture('');
      setEmbedded([]);
      setOwnClips(undefined);
      setExtraClips([]);
      facesRef.current = null;
      faceRef.current = null;
    };
  }, [modelPath]);

  /** Morph targets (own or recognised) first, else face bones, else none. */
  function chooseFace() {
    const faces = facesRef.current;
    if (!faces) return;
    const driver: FaceDriver | null = faces.morphs.supported.length ? faces.morphs : faces.bones ?? null;
    faceRef.current = driver ?? faces.morphs;
    setFaceInfo({
      kind: !driver ? 'none' : driver === faces.morphs ? 'morphs' : 'bones',
      keys: [...(driver?.supported ?? [])].sort().join(' '),
    });
  }

  // The face set up in the face editor (own morphs, strengths), again after every change there.
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    api
      .getModelFace(modelPath)
      .then(({ face: setup }) => {
        const faces = facesRef.current;
        if (cancelled || !faces) return;
        faces.morphs.configure(setup);
        faces.bones?.configure(setup);
        chooseFace();
      })
      .catch((e) => console.warn('Gesicht des Modells konnte nicht geladen werden:', e));
    return () => {
      cancelled = true;
    };
    // `chooseFace` only reads refs and setters.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, modelPath, modelClipRevision]);

  // A preview from the face editor shows its key for a moment.
  useEffect(() => {
    if (!avatarFacePreview || avatarFacePreview.id === lastPreview.current) return;
    lastPreview.current = avatarFacePreview.id;
    previewRef.current = { key: avatarFacePreview.key, until: performance.now() + 1500 };
  }, [avatarFacePreview]);

  useEffect(() => {
    if (!loaded) return;
    applyToonLook(loaded.root, toon);
    stageRef.current?.setToon(toon);
  }, [loaded, toon]);

  // Which of the model's animations are used for what (saved per model, else guessed by name).
  useEffect(() => {
    if (!embedded.length) return;
    let cancelled = false;
    api
      .listModelClips(modelPath)
      .then((uses) => {
        if (cancelled) return;
        const byRole = new Map<MotionRole, THREE.AnimationClip[]>();
        const extras: THREE.AnimationClip[] = [];
        for (const { name, role, mood } of uses) {
          const clip = embedded.find((c) => c.name === name);
          if (!clip) continue;
          clip.userData = { ...clip.userData, mood };
          if ((MOTION_ROLES as readonly string[]).includes(role)) {
            byRole.set(role as MotionRole, [...(byRole.get(role as MotionRole) ?? []), clip]);
          } else {
            extras.push(clip);
          }
        }
        setOwnClips(byRole);
        setExtraClips(extras);
      })
      .catch((e) => console.warn('Animationen im Modell konnten nicht zugeordnet werden:', e));
    return () => {
      cancelled = true;
    };
  }, [embedded, modelPath, modelClipRevision]);

  const motionCount = useAvatarMotions({
    loop,
    onLoops: pet?.onLoops,
    model: loaded,
    motions: motions.filter((m) => m.kind === 'fbx'),
    player: motionPlayerRef,
    load: loadFbxForRig,
    gesture,
    mood: emotion,
    onGesture: setPlayingGesture,
    ownClips,
    extraClips,
  });

  return (
    <div className={pet ? 'relative w-full h-full overflow-hidden' : 'relative w-full h-full flex flex-col items-center justify-center overflow-hidden bg-linear-to-b from-slate-900/40 via-accent-950/20 to-app'}>
      <div
        ref={containerRef}
        data-avatar-format="gltf"
        data-motions={motionCount}
        data-gesture={playingGesture}
        data-toon={toon}
        data-face={faceInfo.kind}
        data-face-keys={faceInfo.keys}
        data-idle-clip={playingClips.idle}
        data-clip-misfits={clipMisfits[modelPath]?.length ?? 0}
        data-gesture-clip={playingGesture ? playingClips.gesture : ''}
        className={pet ? 'w-full h-full' : 'w-full h-full cursor-grab active:cursor-grabbing'}
      />
      {!pet && <AvatarViewerChrome
        loading={loading}
        loadingLabel={t('avatar.vrmLoading')}
        error={error}
        expression={emotion}
        onPickEmotion={onPickEmotion}
        onResetView={() => resetViewRef.current?.()}
        gestureClips={extraClips.map((clip) => clip.name)}
        onPlayGesture={playAvatarClip}
        toon={loaded ? { enabled: toon, onToggle: () => setToon(!toon) } : undefined}
      />}
    </div>
  );
};

export default GltfViewer;
