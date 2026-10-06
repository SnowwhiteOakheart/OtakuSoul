import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { convertFileSrc } from '@tauri-apps/api/core';
import { buildAnimation, MMDLoader, VMDLoader, type MMD } from '@moeru/three-mmd';
import { MMDSpringBonePlugin } from '@moeru/three-mmd-physics-springbone';
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
import type { AvatarViewerProps } from './VrmViewer';

/** MMD lengths are in "units" of about 8 cm. */
const MMD_TO_METRES = 0.08;
/** Prefix for texture paths, mapped to the model folder by the loading manager. */
const RESOURCE_PREFIX = 'otakusoul-mmd:';

/** Standard MMD morph names (Japanese) for each mouth shape and expression, first found wins. */
const MORPHS: Record<string, string[]> = {
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
const EXPRESSION_WEIGHTS: Record<string, number> = { happy: 0.8, angry: 0.8, sad: 0.7, surprised: 0.8, relaxed: 0.6 };
const VISEME_KEYS = Object.keys(SILENT_VISEMES) as (keyof Visemes)[];

const dirname = (path: string) => path.replace(/[\\/][^\\/]*$/, '');

/** Loads a VMD motion for this model. */
async function loadVmdClip(motion: AvatarMotion, mmd: MMD): Promise<THREE.AnimationClip | null> {
  const vmd = await new VMDLoader().loadAsync(convertFileSrc(motion.path));
  const clip = buildAnimation(vmd, mmd.mesh);
  clip.name = motion.file;
  return clip.tracks.length ? clip : null;
}

/** MMD models (PMX/PMD) with spring-bone hair, MMD morphs for face and mouth and VMD motions. */
export const MmdViewer = ({
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
  const [loaded, setLoaded] = useState<MMD | null>(null);
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
    resetViewRef.current = stage.resetView;

    let mmd: MMD | null = null;
    let morphIndex: Record<string, number> = {};
    // Bones the procedural pose moves, with their rest (or lowered) rotation.
    let posed: { bone: THREE.Bone; rest: THREE.Quaternion }[] = [];
    let head: THREE.Bone | undefined;
    let upperBody: THREE.Bone | undefined;

    const load = async () => {
      try {
        const files = await api.listAvatarModelFiles(modelPath);
        const byLowerCase = new Map(files.map((file) => [file.toLowerCase(), file]));
        const folder = dirname(modelPath);
        const manager = new THREE.LoadingManager();
        manager.setURLModifier((url) => {
          if (!url.startsWith(RESOURCE_PREFIX)) return url;
          const relative = url.slice(RESOURCE_PREFIX.length).replace(/\\/g, '/').replace(/^\.\//, '');
          const actual = byLowerCase.get(relative.toLowerCase()) ?? relative;
          return convertFileSrc(`${folder}/${actual}`);
        });
        const loader = new MMDLoader(manager).register(MMDSpringBonePlugin);
        loader.setResourcePath(RESOURCE_PREFIX);
        const model = await loader.loadAsync(convertFileSrc(modelPath));
        if (isDisposed) {
          model.dispose();
          return;
        }
        model.setScalar(MMD_TO_METRES);
        stage.scene.add(model.mesh);
        model.mesh.updateMatrixWorld(true);

        const dictionary = model.mesh.morphTargetDictionary ?? {};
        morphIndex = Object.fromEntries(
          Object.entries(MORPHS)
            .map(([key, names]) => [key, names.map((name) => dictionary[name]).find((i) => i !== undefined)] as const)
            .filter((entry): entry is readonly [string, number] => entry[1] !== undefined),
        );
        const bone = (name: string) => model.mesh.skeleton.getBoneByName(name);
        head = bone('頭');
        upperBody = bone('上半身');
        posed = [head, bone('首'), upperBody]
          .filter((b): b is THREE.Bone => !!b)
          .map((b) => ({ bone: b, rest: b.quaternion.clone() }));
        for (const [armName, elbowName, side] of [['左腕', '左ひじ', 1], ['右腕', '右ひじ', -1]] as const) {
          const arm = bone(armName);
          const elbow = bone(elbowName);
          if (arm && elbow) posed.push({ bone: arm, rest: loweredArm(arm, elbow, side) });
        }

        // Bind-pose bounds from the base positions: skinned bounds are empty before the first
        // render, and geometry bounds would include every morph at full weight.
        const box = new THREE.Box3()
          .setFromBufferAttribute(model.mesh.geometry.getAttribute('position') as THREE.BufferAttribute)
          .applyMatrix4(model.mesh.matrixWorld);
        const headY = head ? head.getWorldPosition(new THREE.Vector3()).y : box.max.y - 0.15;
        stage.frameModel(headY, box.max.y);
        mmd = model;
        motionPlayerRef.current = new AvatarMotionPlayer(model.mesh, () => setPlayingGesture(''));
        setLoaded(model);
        setLoading(false);
      } catch (err) {
        if (isDisposed) return;
        console.error('MMD-Modell konnte nicht geladen werden:', err);
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
    const setMorph = (key: string, value: number) => {
      const index = morphIndex[key];
      if (index !== undefined && mmd?.mesh.morphTargetInfluences) mmd.mesh.morphTargetInfluences[index] = value;
    };

    stage.start((delta, elapsed) => {
      if (!mmd) return;
      // MMD order: restore the last animated pose, run the mixer, then our pose on top, then
      // IK, append transforms and physics (mmd.update). The posed bones start from rest each
      // frame, so the additions never pile up.
      mmd.beforeUpdate();
      const player = motionPlayerRef.current;
      const animated = player?.bodyWeight ?? 0;
      for (const { bone, rest } of posed) bone.quaternion.copy(rest);
      player?.update(delta);
      if (animated > 0.001) {
        // Motions drive the body; only blend the rest pose back in while they fade.
        for (const { bone, rest } of posed) if (animated < 0.999) bone.quaternion.slerp(rest, 1 - animated);
      }
      lookX = THREE.MathUtils.lerp(lookX, stage.mouse.x, 0.05);
      lookY = THREE.MathUtils.lerp(lookY, stage.mouse.y, 0.05);
      head?.quaternion.multiply(turn.setFromEuler(euler.set(-lookY * 0.12, lookX * 0.25, -lookX * 0.04)));
      upperBody?.quaternion.multiply(turn.setFromEuler(euler.set(Math.sin(elapsed * 1.8) * 0.012 * (1 - animated), 0, 0)));

      setMorph('blink', blink(elapsed));
      for (const [expression, weight] of Object.entries(EXPRESSION_WEIGHTS)) {
        setMorph(expression, emotionRef.current === expression ? weight : 0);
      }
      const target = mouthTarget(audioPlayer.isPlaying() ? audioVisemes : null, isSpeakingRef.current, elapsed);
      for (const key of VISEME_KEYS) {
        mouth[key] = THREE.MathUtils.lerp(mouth[key], target[key], 0.5);
        setMorph(key, mouth[key]);
      }
      mmd.update(delta);
    });

    return () => {
      isDisposed = true;
      resetViewRef.current = null;
      cleanupAudio();
      stage.dispose();
      motionPlayerRef.current?.dispose();
      motionPlayerRef.current = null;
      mmd?.dispose();
      setLoaded(null);
      setPlayingGesture('');
    };
  }, [modelPath]);

  const motionCount = useAvatarMotions({
    model: loaded,
    motions: motions.filter((m) => m.kind === 'vmd'),
    player: motionPlayerRef,
    load: loadVmdClip,
    gesture,
    onGesture: setPlayingGesture,
  });

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden bg-linear-to-b from-slate-900/40 via-accent-950/20 to-app">
      <div
        ref={containerRef}
        data-avatar-format="mmd"
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

export default MmdViewer;
