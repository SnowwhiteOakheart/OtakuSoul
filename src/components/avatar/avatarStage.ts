import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  clearVrmViewState,
  frameUpperBody,
  loadVrmViewState,
  saveVrmViewState,
  type VrmViewState,
} from '../../services/avatarViewState';

const DEFAULT_CAMERA_POSITION: [number, number, number] = [0.0, 1.35, 1.0];
const DEFAULT_CAMERA_TARGET: [number, number, number] = [0.0, 1.25, 0.0];

/**
 * What every 3D avatar viewer shares: scene with soft anime lighting, camera with orbit
 * controls, the remembered camera per model, mouse position for looking and the render loop.
 * The model-specific part only adds its object and a per-frame callback.
 */
export interface AvatarStage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Mouse over the viewer in -1…1 (x right, y up). */
  mouse: { x: number; y: number };
  /** Frames the loaded model (head height and top in world units) unless the user moved the camera. */
  frameModel: (headY: number, topY: number) => void;
  resetView: () => void;
  start: (onFrame: (delta: number, elapsed: number) => void) => void;
  dispose: () => void;
}

export function createAvatarStage(container: HTMLElement, modelPath: string): AvatarStage {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, container.clientWidth / container.clientHeight, 0.1, 20.0);
  camera.position.fromArray(DEFAULT_CAMERA_POSITION);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.fromArray(DEFAULT_CAMERA_TARGET);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 0.4;
  controls.maxDistance = 2.5;
  controls.maxPolarAngle = Math.PI / 2 + 0.1;

  // Earlier versions stored the fixed start view even without a camera move; that is no
  // choice of the user and must not hide the framing of the model.
  const storedView = loadVrmViewState(modelPath);
  const savedView =
    storedView &&
    !(
      storedView.camera.every((v, i) => Math.abs(v - DEFAULT_CAMERA_POSITION[i]!) < 1e-4) &&
      storedView.target.every((v, i) => Math.abs(v - DEFAULT_CAMERA_TARGET[i]!) < 1e-4)
    )
      ? storedView
      : null;
  const applyView = (view: VrmViewState) => {
    camera.position.fromArray(view.camera);
    controls.target.fromArray(view.target);
    controls.update();
  };
  if (savedView) applyView(savedView);
  controls.update();

  let saveTimer: number | null = null;
  // Only a camera the user moved is remembered; otherwise the model framing applies.
  let userMoved = !!savedView;
  const saveViewState = () => {
    if (!userMoved) return;
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
  const markMoved = () => {
    userMoved = true;
  };
  controls.addEventListener('start', markMoved);
  controls.addEventListener('change', scheduleViewSave);

  // Framing of the loaded model; the fixed values only until it is there.
  let defaultView: VrmViewState = { camera: DEFAULT_CAMERA_POSITION, target: DEFAULT_CAMERA_TARGET };

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const keyLight = new THREE.DirectionalLight(0xfff5ea, 1.2);
  keyLight.position.set(1.0, 2.0, 1.5).normalize();
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xccdcff, 0.6);
  rimLight.position.set(-1.0, 1.5, -1.0).normalize();
  scene.add(rimLight);

  const mouse = { x: 0, y: 0 };
  const handleMouseMove = (e: MouseEvent) => {
    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  };
  container.addEventListener('mousemove', handleMouseMove);

  const handleResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', handleResize);

  let animationFrameId = 0;
  return {
    scene,
    camera,
    mouse,
    frameModel: (headY, topY) => {
      defaultView = frameUpperBody(headY, topY, camera.fov, camera.aspect);
      if (!savedView) applyView(defaultView);
    },
    resetView: () => {
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      userMoved = false;
      clearVrmViewState(modelPath);
      applyView(defaultView);
    },
    start: (onFrame) => {
      let lastTime = performance.now();
      const startTime = lastTime;
      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);
        const now = performance.now();
        // Long pauses (hidden window) must not make physics and motions jump.
        const delta = Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;
        controls.update();
        onFrame(delta, (now - startTime) / 1000);
        renderer.render(scene, camera);
      };
      animate();
    },
    dispose: () => {
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveViewState();
      cancelAnimationFrame(animationFrameId);
      controls.removeEventListener('start', markMoved);
      controls.removeEventListener('change', scheduleViewSave);
      controls.dispose();
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousemove', handleMouseMove);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/** Natural blinking every 2.5–6 s; returns the eyelid weight for this frame. */
export function createBlinker() {
  let next = 2.0;
  let start = -1;
  const duration = 0.15;
  return (elapsed: number) => {
    if (start < 0 && elapsed > next) start = elapsed;
    if (start < 0) return 0;
    const progress = (elapsed - start) / duration;
    if (progress < 1) return Math.sin(progress * Math.PI);
    start = -1;
    next = elapsed + 2.5 + Math.random() * 3.5;
    return 0;
  };
}
