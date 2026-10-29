import { answerSnapshots } from '../../services/avatarSnapshot';
import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  clearVrmViewState,
  DEFAULT_PET_FRAMING,
  frameFullBody,
  frameUpperBody,
  loadVrmViewState,
  saveVrmViewState,
  type PetFraming,
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
  /**
   * Soft studio reflections for PBR materials (plain glTF): without an environment, metallic
   * parts such as eyes render almost black. VRM (MToon) and MMD (toon) do not need it.
   */
  useStudioEnvironment: () => void;
  /**
   * Cel-shaded look (glTF toon switch): outlines through `OutlineEffect` and neutral tone mapping,
   * which keeps anime colours instead of the filmic curve's washed-out skin.
   */
  setToon: (enabled: boolean) => void;
  start: (onFrame: (delta: number, elapsed: number) => void) => void;
  /** Times the next rendered frame (shader compile and texture upload of a new model) as `avatar:firstFrame`. */
  timeNextFrame: (modelPath: string) => void;
  /**
   * Whether the model covers the point (CSS pixels in the viewer) in the next rendered frame:
   * the desktop pet lets clicks through everywhere else. A newer probe drops an unanswered one.
   */
  probe: (x: number, y: number, onResult: (hit: boolean) => void) => void;
  /**
   * Desktop pet: turns the figure (radians, positive = towards the right of the screen),
   * eased in the render loop. The camera circles the figure, so every model format turns.
   */
  setTurn: (yaw: number) => void;
  /** Stops drawing (desktop pet behind a fullscreen window or the lock screen). */
  setPaused: (paused: boolean) => void;
  /** Desktop pet on battery and at rest: draws only ~12 FPS, whatever happens. */
  setSaver: (saver: boolean) => void;
  /** Desktop pet: frames per second it draws (20, 30 or 60); the battery saver goes below. */
  setFrameRate: (fps: number) => void;
  /**
   * Desktop pet: its window moved by (dx, dy) physical px (walking, falling, dragged), so arms
   * and hair can swing with it. Collected until the viewer takes it with `takeWindowMove`.
   */
  addWindowMove: (dx: number, dy: number) => void;
  /** The window's movement since the last call, in heights of the viewer (y down). */
  takeWindowMove: () => { dx: number; dy: number };
  /** Desktop pet: the model's own framing (zoom around the feet, lift); applies at once. */
  setFraming: (framing: PetFraming) => void;
  /**
   * Desktop pet: where the head ends on screen (share of the viewer's height from the top;
   * above it counts as head), from the model as framed and turned now. Null until it is framed.
   */
  headLine: () => number | null;
  /** The model's hand bones (wrists), for touching the hands; set by the viewer once loaded. */
  setHands: (hands: THREE.Object3D[]) => void;
  /** Desktop pet: is this point (px in the viewer) on one of the hands as posed right now? */
  handAt: (x: number, y: number) => boolean;
  dispose: () => void;
}

/** What the desktop pet needs of any figure (3D stage or Inochi2D puppet). */
export type PetFigure = Pick<
  AvatarStage,
  'mouse' | 'probe' | 'setPaused' | 'setSaver' | 'setFrameRate' | 'addWindowMove' | 'setTurn' | 'setFraming' | 'headLine' | 'handAt'>;

/** Reach around a wrist bone that counts as the hand (metres; the hand itself is about this long). */
const HAND_REACH = 0.11;

export interface AvatarStageOptions {
  /**
   * Desktop pet: whole figure, no camera controls and no remembered view; the pet window
   * sets `mouse` itself (from the global pointer, also outside the window).
   */
  pet?: boolean;
}

/** Alpha above which a pixel counts as part of the model (soft hair edges stay click-through). */
const PROBE_ALPHA = 24;
/** Frame interval of the pet in power-saving mode (~12 FPS). */
export const SAVER_FRAME_MS = 83;
/** Frame rates the pet offers; 30 unless chosen otherwise. */
export const PET_FRAME_RATES = [20, 30, 60] as const;
export const DEFAULT_PET_FRAME_RATE = 30;
/** Interval between frames for a rate (a millisecond less, so a 60 Hz display keeps every second frame). */
export const frameInterval = (fps: number) => (fps >= 60 ? 0 : 1000 / fps - 1);

export function createAvatarStage(container: HTMLElement, modelPath: string, options: AvatarStageOptions = {}): AvatarStage {
  const pet = !!options.pet;
  // Idle frame interval in the app: 30 FPS (the pet has its own rate, `setFrameRate`).
  const idleFrameMs = 31;
  let paused = false;
  let saver = false;
  // The pet moves all the time (breathing, drifting arms): it draws at its own steady rate.
  let petFrameMs = frameInterval(DEFAULT_PET_FRAME_RATE);
  let windowMove = { dx: 0, dy: 0 };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, container.clientWidth / container.clientHeight, 0.1, 20.0);
  camera.position.fromArray(DEFAULT_CAMERA_POSITION);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  // Fully transparent background (the desktop pet window shows the desktop through it).
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  // Preview pictures for the avatar manager (drawn again in the same call, see avatarSnapshot).
  const stopSnapshots = answerSnapshots(renderer.domElement, () => {
    if (toon && outline) outline.render(scene, camera);
    else renderer.render(scene, camera);
  });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.fromArray(DEFAULT_CAMERA_TARGET);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 0.4;
  controls.maxDistance = 2.5;
  controls.maxPolarAngle = Math.PI / 2 + 0.1;
  // The pet is dragged as a whole window; the camera stays put.
  controls.enabled = !pet;

  // Earlier versions stored the fixed start view even without a camera move; that is no
  // choice of the user and must not hide the framing of the model.
  const storedView = pet ? null : loadVrmViewState(modelPath);
  const savedView =
    storedView &&
    !(
      storedView.camera.every((v, i) => Math.abs(v - DEFAULT_CAMERA_POSITION[i]!) < 1e-4) &&
      storedView.target.every((v, i) => Math.abs(v - DEFAULT_CAMERA_TARGET[i]!) < 1e-4)
    )
      ? storedView
      : null;
  // The pet's turn: the camera offset from the target in the framed view, turned around Y.
  const baseOffset = new THREE.Vector3();
  const turnedOffset = new THREE.Vector3();
  const upAxis = new THREE.Vector3(0, 1, 0);
  let turn = 0;
  let turnTarget = 0;
  const applyView = (view: VrmViewState) => {
    camera.position.fromArray(view.camera);
    controls.target.fromArray(view.target);
    controls.update();
    baseOffset.subVectors(camera.position, controls.target);
    turn = 0;
  };
  const applyTurn = (delta: number) => {
    if (!pet || baseOffset.lengthSq() === 0 || Math.abs(turnTarget - turn) < 1e-4) return;
    turn += (turnTarget - turn) * Math.min(1, delta * 5);
    // Turning the figure to the right is the camera going round to its left.
    turnedOffset.copy(baseOffset).applyAxisAngle(upAxis, -turn);
    camera.position.copy(controls.target).add(turnedOffset);
    camera.lookAt(controls.target);
  };
  if (savedView) applyView(savedView);
  controls.update();

  let saveTimer: number | null = null;
  // Only a camera the user moved is remembered; otherwise the model framing applies.
  let userMoved = !!savedView;
  const saveViewState = () => {
    if (!userMoved || pet) return;
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
  let lastActiveTime = performance.now();
  const markActive = () => {
    lastActiveTime = performance.now();
  };
  const markMoved = () => {
    userMoved = true;
    markActive();
  };
  const markChanged = () => {
    markActive();
    scheduleViewSave();
  };
  controls.addEventListener('start', markMoved);
  controls.addEventListener('change', markChanged);

  // Framing of the loaded model; the fixed values only until it is there.
  let defaultView: VrmViewState = { camera: DEFAULT_CAMERA_POSITION, target: DEFAULT_CAMERA_TARGET };
  // Desktop pet: the model's top (once framed) and its own framing from the avatar manager.
  let modelTop: number | null = null;
  /** Height of the head bone (the head's lower end, about the chin) in the rest pose. */
  let modelHead: number | null = null;
  const headPoint = new THREE.Vector3();
  /** Wrist bones (hands) as the viewer found them; they follow every pose and motion. */
  let hands: THREE.Object3D[] = [];
  const handPoint = new THREE.Vector3();
  const handEdge = new THREE.Vector3();
  let petFraming: PetFraming = DEFAULT_PET_FRAMING;

  const ambient = new THREE.AmbientLight(0xffffff, 0.85);
  scene.add(ambient);
  const keyLight = new THREE.DirectionalLight(0xfff5ea, 1.2);
  keyLight.position.set(1.0, 2.0, 1.5).normalize();
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xccdcff, 0.6);
  rimLight.position.set(-1.0, 1.5, -1.0).normalize();
  scene.add(rimLight);

  let cachedRect: DOMRect | null = null;
  const invalidateRect = () => {
    cachedRect = null;
  };
  const mouse = { x: 0, y: 0 };
  const handleMouseMove = (e: MouseEvent) => {
    markActive();
    const rect = (cachedRect ??= container.getBoundingClientRect());
    if (rect.width > 0 && rect.height > 0) {
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
  };
  if (!pet) {
    container.addEventListener('mouseenter', invalidateRect);
    container.addEventListener('mousemove', handleMouseMove);
  }

  const handleResize = () => {
    invalidateRect();
    markActive();
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', handleResize);

  let animationFrameId = 0;
  let environment: THREE.Texture | null = null;
  let outline: OutlineEffect | null = null;
  let toon = false;
  let timedFrame: string | null = null;
  let pendingProbe: { x: number; y: number; onResult: (hit: boolean) => void } | null = null;
  const probePixel = new Uint8Array(4);
  // Right after rendering, before the frame is shown, the drawing buffer still holds it.
  const answerProbe = () => {
    if (!pendingProbe) return;
    const { x, y, onResult } = pendingProbe;
    pendingProbe = null;
    const gl = renderer.getContext();
    const ratio = gl.drawingBufferWidth / Math.max(1, container.clientWidth);
    const px = Math.floor(x * ratio);
    const py = Math.floor(gl.drawingBufferHeight - y * ratio);
    if (px < 0 || py < 0 || px >= gl.drawingBufferWidth || py >= gl.drawingBufferHeight) {
      onResult(false);
      return;
    }
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probePixel);
    onResult(probePixel[3]! > PROBE_ALPHA);
  };
  return {
    scene,
    camera,
    mouse,
    frameModel: (headY, topY) => {
      modelTop = topY;
      modelHead = headY;
      defaultView = pet
        ? frameFullBody(topY, camera.fov, camera.aspect, petFraming)
        : frameUpperBody(headY, topY, camera.fov, camera.aspect);
      if (!savedView) applyView(defaultView);
    },
    setHands: (nodes) => {
      hands = nodes;
    },
    handAt: (x, y) => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!hands.length || !width || !height) return false;
      camera.updateMatrixWorld();
      return hands.some((hand) => {
        hand.getWorldPosition(handPoint);
        // The reach on screen: a point that far above the wrist, projected the same way.
        handEdge.copy(handPoint);
        handEdge.y += HAND_REACH;
        handPoint.project(camera);
        handEdge.project(camera);
        const hx = ((handPoint.x + 1) / 2) * width;
        const hy = ((1 - handPoint.y) / 2) * height;
        const reach = (Math.abs(handEdge.y - handPoint.y) / 2) * height;
        return Math.hypot(x - hx, y - hy) <= reach;
      });
    },
    headLine: () => {
      if (modelHead === null) return null;
      camera.updateMatrixWorld();
      headPoint.set(0, modelHead, 0).project(camera);
      return (1 - headPoint.y) / 2;
    },
    setFraming: (framing) => {
      petFraming = framing;
      if (!pet || modelTop === null) return;
      const keptTurn = turn;
      defaultView = frameFullBody(modelTop, camera.fov, camera.aspect, framing);
      applyView(defaultView);
      // Turned while walking: stays turned in the new framing.
      turn = keptTurn;
      turnedOffset.copy(baseOffset).applyAxisAngle(upAxis, -turn);
      camera.position.copy(controls.target).add(turnedOffset);
      camera.lookAt(controls.target);
      markActive();
    },
    resetView: () => {
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      userMoved = false;
      clearVrmViewState(modelPath);
      applyView(defaultView);
    },
    useStudioEnvironment: () => {
      if (environment) return;
      const pmrem = new THREE.PMREMGenerator(renderer);
      environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
      scene.environment = environment;
      scene.environmentIntensity = 0.6;
    },
    setToon: (enabled) => {
      toon = enabled;
      if (enabled) outline ??= new OutlineEffect(renderer, { defaultThickness: 0.0035, defaultColor: [0.16, 0.11, 0.14] });
      renderer.toneMapping = enabled ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
      // Toon materials take no light from the studio environment; more ambient light makes up for it.
      ambient.intensity = enabled ? 1.5 : 0.85;
      // Tone mapping is compiled into each shader.
      scene.traverse((node) => {
        const material = (node as THREE.Mesh).material;
        for (const m of Array.isArray(material) ? material : material ? [material] : []) m.needsUpdate = true;
      });
    },
    timeNextFrame: (nextModelPath) => {
      timedFrame = nextModelPath;
    },
    setPaused: (next) => {
      paused = next;
      markActive();
    },
    setSaver: (next) => {
      saver = next;
    },
    setFrameRate: (fps) => {
      petFrameMs = frameInterval(fps);
    },
    addWindowMove: (dx, dy) => {
      windowMove.dx += dx;
      windowMove.dy += dy;
    },
    takeWindowMove: () => {
      // Physical px over the viewer's height in physical px.
      const height = Math.max(1, container.clientHeight * (window.devicePixelRatio || 1));
      const moved = { dx: windowMove.dx / height, dy: windowMove.dy / height };
      windowMove = { dx: 0, dy: 0 };
      return moved;
    },
    setTurn: (yaw) => {
      // Called on every behaviour tick; only a new direction is activity worth full frame rate.
      if (yaw === turnTarget) return;
      turnTarget = yaw;
      markActive();
    },
    probe: (x, y, onResult) => {
      // A newer pointer position replaces one not yet answered.
      pendingProbe = { x, y, onResult };
    },
    start: (onFrame) => {
      let lastTime = performance.now();
      const startTime = lastTime;
      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);
        const now = performance.now();
        if (timedFrame === null) {
          if (paused || (typeof document !== 'undefined' && document.hidden)) {
            lastTime = now;
            return;
          }
          // Throttle idle breathing/blinking to ~30 FPS after 2s of no pointer/camera interaction
          // so local LLM/SD GPU workloads aren't starved by 60-144 Hz WebGL redraws.
          const frameMs = saver ? SAVER_FRAME_MS : pet ? petFrameMs : now - lastActiveTime > 2000 ? idleFrameMs : 0;
          if (now - lastTime < frameMs) {
            return;
          }
        }
        // Long pauses (hidden window) must not make physics and motions jump.
        const delta = Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;
        controls.update();
        applyTurn(delta);
        onFrame(delta, (now - startTime) / 1000);
        const frameStart = timedFrame === null ? 0 : performance.now();
        if (toon && outline) outline.render(scene, camera);
        else renderer.render(scene, camera);
        answerProbe();
        if (timedFrame !== null) {
          // A WebGL call returns before the GPU finishes; reading one pixel waits for it.
          renderer.getContext().readPixels(0, 0, 1, 1, WebGL2RenderingContext.RGBA, WebGL2RenderingContext.UNSIGNED_BYTE, new Uint8Array(4));
          try {
            performance.measure('avatar:firstFrame', { start: frameStart, end: performance.now(), detail: timedFrame });
          } catch {
            // Diagnostic only.
          }
          timedFrame = null;
        }
      };
      animate();
    },
    dispose: () => {
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveViewState();
      cancelAnimationFrame(animationFrameId);
      pendingProbe = null;
      stopSnapshots();
      controls.removeEventListener('start', markMoved);
      controls.removeEventListener('change', markChanged);
      controls.dispose();
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mouseenter', invalidateRect);
      container.removeEventListener('mousemove', handleMouseMove);
      environment?.dispose();
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
