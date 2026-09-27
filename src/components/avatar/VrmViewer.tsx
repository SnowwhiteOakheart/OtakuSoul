import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { api } from '../../services/api';
import { Loader2, Smile, Frown, Angry, Sparkles, RefreshCcw, RotateCcw } from 'lucide-react';
import { audioPlayer } from '../../services/audioPlayer';
import { loadVrmViewState, saveVrmViewState } from '../../services/avatarViewState';
import { translate, useTranslation } from '../../i18n';

const DEFAULT_CAMERA_POSITION: [number, number, number] = [0.0, 1.35, 1.0];
const DEFAULT_CAMERA_TARGET: [number, number, number] = [0.0, 1.25, 0.0];

interface VrmViewerProps {
  modelPath: string;
  emotion?: 'neutral' | 'happy' | 'angry' | 'sad' | 'surprised' | 'relaxed';
  isSpeaking?: boolean;
}

export const VrmViewer = ({
  modelPath,
  emotion = 'neutral',
  isSpeaking = false,
}: VrmViewerProps) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentEmotion, setCurrentEmotion] = useState(emotion);

  const vrmRef = useRef<VRM | null>(null);
  const emotionRef = useRef(emotion);
  const isSpeakingRef = useRef(isSpeaking);
  const resetViewRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    emotionRef.current = currentEmotion;
  }, [currentEmotion]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isDisposed = false;
    setLoading(true);
    setError(null);
    
    let currentAmplitude = 0;
    let leftArmDirection = 1;
    let rightArmDirection = -1;
    const cleanupAudio = audioPlayer.onAudioFrame((amp) => {
      currentAmplitude = amp;
    });

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      32,
      container.clientWidth / container.clientHeight,
      0.1,
      20.0
    );
    camera.position.fromArray(DEFAULT_CAMERA_POSITION);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.fromArray(DEFAULT_CAMERA_TARGET);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.4;
    controls.maxDistance = 2.5;
    controls.maxPolarAngle = Math.PI / 2 + 0.1;

    const savedView = loadVrmViewState(modelPath);
    if (savedView) {
      camera.position.fromArray(savedView.camera);
      controls.target.fromArray(savedView.target);
    }
    controls.update();

    let saveTimer: number | null = null;
    const saveViewState = () => {
      saveVrmViewState(modelPath, {
        camera: [camera.position.x, camera.position.y, camera.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z],
      });
    };
    const scheduleViewSave = () => {
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        saveTimer = null;
        saveViewState();
      }, 200);
    };
    controls.addEventListener('change', scheduleViewSave);

    resetViewRef.current = () => {
      camera.position.fromArray(DEFAULT_CAMERA_POSITION);
      controls.target.fromArray(DEFAULT_CAMERA_TARGET);
      controls.update();
      saveViewState();
    };

    // 2. Lighting (Gentle anime lighting)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff5ea, 1.2);
    keyLight.position.set(1.0, 2.0, 1.5).normalize();
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xccdcff, 0.6);
    rimLight.position.set(-1.0, 1.5, -1.0).normalize();
    scene.add(rimLight);

    // 3. VRM Loader
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const loadModel = async () => {
      if (!modelPath || !modelPath.trim()) {
        setLoading(false);
        return;
      }

      try {
        const bytes = await api.readFileBinary(modelPath);
        if (isDisposed) return;

        loader.parse(
          bytes.buffer as ArrayBuffer,
          '',
          (gltf) => {
            if (isDisposed) return;
            const vrm = gltf.userData.vrm as VRM;
            if (!vrm) {
              setError(translate('avatar.vrmInvalid'));
              setLoading(false);
              return;
            }

            VRMUtils.removeUnnecessaryVertices(gltf.scene);
            VRMUtils.combineSkeletons(gltf.scene);
            VRMUtils.rotateVRM0(vrm);

            // Normalized VRM 0.x rigs can still point their arm chains along
            // the opposite X axis from VRM 1.0 rigs. Derive the direction from
            // the actual skeleton instead of assuming one convention.
            leftArmDirection = Math.sign(
              vrm.humanoid.getNormalizedBoneNode('leftLowerArm')?.position.x ?? 1,
            ) || 1;
            rightArmDirection = Math.sign(
              vrm.humanoid.getNormalizedBoneNode('rightLowerArm')?.position.x ?? -1,
            ) || -1;

            vrmRef.current = vrm;
            scene.add(vrm.scene);
            setLoading(false);
          },
          (err) => {
            if (isDisposed) return;
            console.error('Error parsing VRM:', err);
            setError(`Fehler beim Laden des 3D-Modells: ${err}`);
            setLoading(false);
          }
        );
      } catch (err) {
        if (isDisposed) return;
        console.error('Failed to read VRM binary:', err);
        setError(`Fehler beim Lesen der VRM-Datei: ${err}`);
        setLoading(false);
      }
    };

    loadModel();

    // 4. Mouse Tracking for Look-At
    const mousePos = { x: 0, y: 0 };
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mousePos.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mousePos.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    container.addEventListener('mousemove', handleMouseMove);

    // 5. Animation Loop
    let lastTime = performance.now();
    const startTime = performance.now();
    let nextBlinkTime = 2.0;
    let blinkDuration = 0.15;
    let blinkTimer = 0.0;
    let isBlinking = false;
    let animationFrameId: number;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      const elapsed = (now - startTime) / 1000;

      controls.update();

      const vrm = vrmRef.current;
      if (vrm) {
        // A. Breathing animation, Head Tracking & Natural Idle Pose (Arms down)
        if (vrm.humanoid) {
          const spine = vrm.humanoid.getNormalizedBoneNode('spine');
          if (spine) {
            spine.rotation.x = Math.sin(elapsed * 1.8) * 0.012;
            spine.rotation.z = Math.sin(elapsed * 0.9) * 0.005;
          }
          const chest = vrm.humanoid.getNormalizedBoneNode('chest');
          if (chest) {
            chest.rotation.x = Math.sin(elapsed * 1.8 + 0.3) * 0.01;
            chest.rotation.y = Math.sin(elapsed * 0.9) * 0.008;
          }
          const head = vrm.humanoid.getNormalizedBoneNode('head');
          if (head) {
            head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, mousePos.x * 0.2, 0.05);
            head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, -mousePos.y * 0.12, 0.05);
            head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, -mousePos.x * 0.04, 0.05);
          }

          // Natural Resting Arms (Drop down from T-pose to sides of body)
          const leftUpperArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
          if (leftUpperArm) {
            // Rotate whichever way this model's arm chain points toward the floor.
            leftUpperArm.rotation.z = -leftArmDirection * (1.25 - Math.sin(elapsed * 1.8) * 0.015);
            leftUpperArm.rotation.x = 0.12;
            leftUpperArm.rotation.y = -0.05;
          }

          const rightUpperArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
          if (rightUpperArm) {
            rightUpperArm.rotation.z = -rightArmDirection * (1.25 - Math.sin(elapsed * 1.8) * 0.015);
            rightUpperArm.rotation.x = 0.12;
            rightUpperArm.rotation.y = 0.05;
          }

          const leftLowerArm = vrm.humanoid.getNormalizedBoneNode('leftLowerArm');
          if (leftLowerArm) {
            // Elbow naturally bent forward towards waist
            leftLowerArm.rotation.y = -leftArmDirection * 0.3;
            leftLowerArm.rotation.x = 0.05;
          }

          const rightLowerArm = vrm.humanoid.getNormalizedBoneNode('rightLowerArm');
          if (rightLowerArm) {
            // Elbow naturally bent forward towards waist
            rightLowerArm.rotation.y = -rightArmDirection * 0.3;
            rightLowerArm.rotation.x = 0.05;
          }

          const leftHand = vrm.humanoid.getNormalizedBoneNode('leftHand');
          if (leftHand) {
            leftHand.rotation.y = -leftArmDirection * 0.1;
          }

          const rightHand = vrm.humanoid.getNormalizedBoneNode('rightHand');
          if (rightHand) {
            rightHand.rotation.y = -rightArmDirection * 0.1;
          }
        }

        // B. Natural Blinking
        if (elapsed > nextBlinkTime) {
          isBlinking = true;
          blinkTimer = 0.0;
          nextBlinkTime = elapsed + 2.5 + Math.random() * 3.5;
        }

        if (isBlinking) {
          blinkTimer += delta;
          const progress = blinkTimer / blinkDuration;
          if (progress < 1.0) {
            // Sine wave for natural blink
            const blinkWeight = Math.sin(progress * Math.PI);
            vrm.expressionManager?.setValue('blink', blinkWeight);
          } else {
            vrm.expressionManager?.setValue('blink', 0.0);
            isBlinking = false;
          }
        }

        // C. Expressions & Emotion weights
        const em = vrm.expressionManager;
        if (em) {
          const activeEmo = emotionRef.current;
          em.setValue('happy', activeEmo === 'happy' ? 0.9 : 0.0);
          em.setValue('angry', activeEmo === 'angry' ? 0.8 : 0.0);
          em.setValue('sad', activeEmo === 'sad' ? 0.7 : 0.0);
          em.setValue('surprised', activeEmo === 'surprised' ? 0.8 : 0.0);
          em.setValue('relaxed', activeEmo === 'relaxed' ? 0.6 : 0.0);

          // D. Talking Viseme (LipSync)
          if (audioPlayer.isPlaying()) {
            em.setValue('aa', currentAmplitude);
          } else if (isSpeakingRef.current) {
            const talkWeight = (Math.sin(elapsed * 14.0) + 1.0) * 0.35;
            em.setValue('aa', talkWeight);
          } else {
            em.setValue('aa', 0.0);
          }
        }

        // E. SpringBone physics & Expression updates
        vrm.update(delta);
      }

      renderer.render(scene, camera);
    };

    animate();

    // 6. Resize Observer
    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      isDisposed = true;
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveViewState();
      controls.removeEventListener('change', scheduleViewSave);
      controls.dispose();
      resetViewRef.current = null;
      cleanupAudio();
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousemove', handleMouseMove);
      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
  }, [modelPath]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden bg-linear-to-b from-slate-900/40 via-accent-950/20 to-app">
      {/* 3D Canvas Container */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-app/80 backdrop-blur z-20 space-y-2">
          <Loader2 className="w-8 h-8 text-accent-400 animate-spin" />
          <span className="text-xs text-accent-300 font-mono">{t('avatar.vrmLoading')}</span>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-x-4 top-4 p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-300 text-xs z-30 font-mono">
          {error}
        </div>
      )}

      <button
        onClick={() => resetViewRef.current?.()}
        className="absolute bottom-4 right-4 z-20 p-2 rounded-full bg-slate-900/80 border border-slate-700/60 text-slate-400 hover:text-accent-300 hover:bg-slate-800 backdrop-blur shadow-xl transition-colors"
        title={t('avatar.resetView')}
        aria-label={t('avatar.resetView')}
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>

      {/* Interactive Emotion Bar */}
      <div
        role="group"
        aria-label={t('avatar.quickEmotions')}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 p-1.5 rounded-full bg-slate-900/80 border border-slate-700/60 backdrop-blur z-20 shadow-xl"
      >
        <button
          title={t('avatar.quickNeutral')}
          aria-label={t('avatar.quickNeutral')}
          onClick={() => setCurrentEmotion('neutral')}
          aria-pressed={currentEmotion === 'neutral'}
          className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
            currentEmotion === 'neutral'
              ? 'bg-accent-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <RefreshCcw className="w-3 h-3 inline 2xl:mr-1" />
          <span className="hidden 2xl:inline">{t('avatar.quickNeutral')}</span>
        </button>

        <button
          title={t('avatar.quickHappy')}
          aria-label={t('avatar.quickHappy')}
          onClick={() => setCurrentEmotion('happy')}
          aria-pressed={currentEmotion === 'happy'}
          className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
            currentEmotion === 'happy'
              ? 'bg-accent2-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Smile className="w-3 h-3 inline 2xl:mr-1 text-accent2-300" />
          <span className="hidden 2xl:inline">{t('avatar.quickHappy')}</span>
        </button>

        <button
          title={t('avatar.quickAngry')}
          aria-label={t('avatar.quickAngry')}
          onClick={() => setCurrentEmotion('angry')}
          aria-pressed={currentEmotion === 'angry'}
          className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
            currentEmotion === 'angry'
              ? 'bg-red-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Angry className="w-3 h-3 inline 2xl:mr-1 text-red-300" />
          <span className="hidden 2xl:inline">{t('avatar.quickAngry')}</span>
        </button>

        <button
          title={t('avatar.quickSad')}
          aria-label={t('avatar.quickSad')}
          onClick={() => setCurrentEmotion('sad')}
          aria-pressed={currentEmotion === 'sad'}
          className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
            currentEmotion === 'sad'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Frown className="w-3 h-3 inline 2xl:mr-1 text-indigo-300" />
          <span className="hidden 2xl:inline">{t('avatar.quickSad')}</span>
        </button>

        <button
          title={t('avatar.quickRelaxed')}
          aria-label={t('avatar.quickRelaxed')}
          onClick={() => setCurrentEmotion('relaxed')}
          aria-pressed={currentEmotion === 'relaxed'}
          className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
            currentEmotion === 'relaxed'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3 h-3 inline 2xl:mr-1 text-emerald-300" />
          <span className="hidden 2xl:inline">{t('avatar.quickRelaxed')}</span>
        </button>
      </div>
    </div>
  );
};
