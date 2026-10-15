import * as THREE from 'three';

/** Three light steps (shadow, half light, light) instead of a smooth falloff. */
let gradient: THREE.DataTexture | null = null;
function toonGradient(): THREE.DataTexture {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([175, 225, 255]), 3, 1, THREE.RedFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

/** Outline settings `OutlineEffect` reads from each material. */
interface OutlineParameters {
  thickness: number;
  color: [number, number, number];
  alpha: number;
  visible: boolean;
}

/**
 * The cel-shaded twin of a PBR material: same texture, transparency and sides, light in hard steps.
 * Cut-out and blended parts (hair cards, eyes, lashes) get no outline: the outline pass ignores
 * their alpha and would draw the whole quad.
 */
export function toonMaterialFor(source: THREE.Material): THREE.MeshToonMaterial {
  const pbr = source as THREE.MeshStandardMaterial;
  const toon = new THREE.MeshToonMaterial({
    name: source.name,
    color: pbr.color?.clone() ?? new THREE.Color(0xffffff),
    map: pbr.map ?? null,
    normalMap: pbr.normalMap ?? null,
    alphaMap: pbr.alphaMap ?? null,
    emissive: pbr.emissive?.clone() ?? new THREE.Color(0x000000),
    emissiveMap: pbr.emissiveMap ?? null,
    gradientMap: toonGradient(),
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest: source.alphaTest,
    side: source.side,
    depthWrite: source.depthWrite,
    vertexColors: source.vertexColors,
  });
  if (pbr.normalScale) toon.normalScale.copy(pbr.normalScale);
  const outline: OutlineParameters = {
    thickness: 0.0035,
    color: [0.16, 0.11, 0.14],
    alpha: 1,
    visible: !source.transparent && source.alphaTest <= 0,
  };
  toon.userData.outlineParameters = outline;
  return toon;
}

/**
 * Switches every mesh of a model between its own (PBR) materials and cel-shaded ones. The originals
 * are kept on the mesh, so switching back restores them exactly; toon materials are made once.
 */
export function applyToonLook(root: THREE.Object3D, enabled: boolean) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const data = mesh.userData as { pbrMaterial?: THREE.Material | THREE.Material[]; toonMaterial?: THREE.Material | THREE.Material[] };
    data.pbrMaterial ??= mesh.material;
    if (enabled) {
      data.toonMaterial ??= Array.isArray(data.pbrMaterial) ? data.pbrMaterial.map(toonMaterialFor) : toonMaterialFor(data.pbrMaterial);
      mesh.material = data.toonMaterial;
    } else {
      mesh.material = data.pbrMaterial;
    }
  });
}
