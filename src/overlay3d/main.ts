/**
 * The 3D figure of the OBS overlay (`/overlay`): a small, separate bundle (`vite.overlay.config.ts`)
 * without Tauri, loaded by the overlay page from the app's web server as `/overlay/3d.js`.
 * It shows the active figure's VRM or GLB model, breathes and stands like the figure in the
 * chat (`bodyPose`), blinks, shows the mood (VRM expressions) and moves the mouth with the voice.
 * The page drives it through `window.OtakuOverlay3D`.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';
import { bodyPose } from '../components/avatar/proceduralBody';

export interface Overlay3D {
  /** Loads the model at `url` into `canvas`; false if it is no usable model. */
  show(canvas: HTMLCanvasElement, url: string): Promise<boolean>;
  /** Removes the model (back to the portrait). */
  clear(): void;
  /** VRM expression of the mood (`happy`, `sad` …; empty = neutral) and the mood name for the posture. */
  setMood(expression: string, emotion: string): void;
  /** Voice level 0–1 (mouth). */
  setVoice(level: number): void;
}

declare global {
  interface Window {
    OtakuOverlay3D?: Overlay3D;
  }
}

const MOODS = ['happy', 'angry', 'sad', 'relaxed', 'surprised'] as const;

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let root: THREE.Object3D | null = null;
let vrm: VRM | null = null;
let mixer: THREE.AnimationMixer | null = null;
let frame = 0;
let started = 0;
let last = 0;
let mood = { expression: '', emotion: '' };
let voice = 0;
let mouth = 0;
const moodWeights = new Map<string, number>();
let leftArm = 1;
let rightArm = -1;
const euler = new THREE.Euler();
const quaternion = new THREE.Quaternion();

/** Seconds of the next blink and how far into it we are. */
let nextBlink = 2;
function blinkAt(t: number): number {
  if (t > nextBlink + 0.16) nextBlink = t + 2 + Math.random() * 4;
  const into = t - nextBlink;
  if (into < 0 || into > 0.16) return 0;
  return Math.sin((into / 0.16) * Math.PI);
}

function dispose() {
  cancelAnimationFrame(frame);
  frame = 0;
  if (root && scene) scene.remove(root);
  if (root) VRMUtils.deepDispose(root);
  root = null;
  vrm = null;
  mixer = null;
}

function fit(canvas: HTMLCanvasElement) {
  if (!renderer || !camera) return;
  const width = canvas.clientWidth || 1;
  const height = canvas.clientHeight || 1;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

/** Full body in view, feet at the bottom edge. */
function frameModel(object: THREE.Object3D) {
  if (!camera) return;
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const distance = (size.y * 1.08) / 2 / Math.tan(fov / 2);
  camera.position.set(center.x, center.y, box.max.z + distance);
  camera.lookAt(center.x, center.y, center.z);
}

function animate() {
  frame = requestAnimationFrame(animate);
  if (!renderer || !scene || !camera) return;
  const now = performance.now() / 1000;
  const delta = Math.min(0.1, now - (last || now));
  last = now;
  const t = now - started;
  mouth += (Math.min(1, voice * 1.6) - mouth) * 0.45;
  voice *= 0.85;

  if (vrm) {
    const body = bodyPose({ t, leftArm, rightArm, walkPhase: null, sway: { x: 0, y: 0 }, look: { x: 0, y: 0 }, mood: mood.emotion, speaking: mouth > 0.05 });
    for (const [bone, [x, y, z]] of Object.entries(body)) {
      const node = vrm.humanoid.getNormalizedBoneNode(bone as VRMHumanBoneName);
      if (node) node.quaternion.copy(quaternion.setFromEuler(euler.set(x, y, z)));
    }
    const faces = vrm.expressionManager;
    if (faces) {
      for (const name of MOODS) {
        const target = mood.expression === name ? 0.75 : 0;
        const value = (moodWeights.get(name) ?? 0) + (target - (moodWeights.get(name) ?? 0)) * Math.min(1, delta * 6);
        moodWeights.set(name, value);
        faces.setValue(name, value);
      }
      faces.setValue('aa', mouth);
      faces.setValue('blink', blinkAt(t) * (1 - (moodWeights.get('happy') ?? 0)));
    }
    vrm.update(delta);
  } else if (root) {
    mixer?.update(delta);
    // A GLB without its own motion breathes a little.
    if (!mixer) root.scale.setScalar(1 + Math.sin(t * 1.8) * 0.004);
  }
  renderer.render(scene, camera);
}

const api: Overlay3D = {
  async show(canvas, url) {
    dispose();
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(28, 1, 0.05, 100);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x404060, 1.6));
      const key = new THREE.DirectionalLight(0xffffff, 1.4);
      key.position.set(1, 2, 3);
      scene.add(key);
      window.addEventListener('resize', () => fit(canvas));
    }
    fit(canvas);
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) return false;
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      const gltf = await loader.parseAsync(await response.arrayBuffer(), '');
      const parsed = gltf.userData.vrm as VRM | undefined;
      if (parsed) {
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.rotateVRM0(parsed);
        // VRM 0.x rigs may point their arm chains the other way (as in the chat's viewer).
        leftArm = Math.sign(parsed.humanoid.getNormalizedBoneNode('leftLowerArm')?.position.x ?? 1) || 1;
        rightArm = Math.sign(parsed.humanoid.getNormalizedBoneNode('rightLowerArm')?.position.x ?? -1) || -1;
        vrm = parsed;
        root = parsed.scene;
      } else {
        root = gltf.scene;
        if (gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(root);
          mixer.clipAction(gltf.animations[0]!).play();
        }
      }
      root.traverse((object) => {
        object.frustumCulled = false;
      });
      scene!.add(root);
      frameModel(root);
      started = performance.now() / 1000;
      last = 0;
      animate();
      document.documentElement.dataset.overlayModel = parsed ? 'vrm' : 'glb';
      return true;
    } catch (error) {
      console.error('Overlay model failed:', error);
      dispose();
      return false;
    }
  },
  clear() {
    dispose();
    renderer?.clear();
    delete document.documentElement.dataset.overlayModel;
  },
  setMood(expression, emotion) {
    mood = { expression, emotion };
  },
  setVoice(level) {
    voice = Math.max(voice, Math.min(1, Math.max(0, level)));
  },
};

window.OtakuOverlay3D = api;
