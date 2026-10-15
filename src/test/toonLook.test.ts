import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyToonLook } from '../components/avatar/toonLook';

describe('applyToonLook', () => {
  it('switches to cel shading and back to the very same materials', () => {
    const map = new THREE.Texture();
    const body = new THREE.MeshStandardMaterial({ name: 'body', map, side: THREE.DoubleSide });
    const hair = new THREE.MeshStandardMaterial({ name: 'hair', map, alphaTest: 0.5 });
    const lashes = new THREE.MeshStandardMaterial({ name: 'lashes', transparent: true, opacity: 0.8, depthWrite: false });
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), [body, hair]);
    const eyes = new THREE.Mesh(new THREE.BufferGeometry(), lashes);
    root.add(mesh, eyes);

    applyToonLook(root, true);
    const [toonBody, toonHair] = mesh.material as unknown as THREE.MeshToonMaterial[];
    const toonLashes = eyes.material as unknown as THREE.MeshToonMaterial;
    expect(toonBody!.type).toBe('MeshToonMaterial');
    expect([toonBody!.map, toonBody!.side, toonBody!.gradientMap]).toEqual([map, THREE.DoubleSide, expect.any(THREE.DataTexture)]);
    expect([toonHair!.alphaTest, toonLashes.transparent, toonLashes.opacity, toonLashes.depthWrite]).toEqual([0.5, true, 0.8, false]);
    // Only opaque parts get an outline; cut-outs and blended parts would show their whole quad.
    expect([toonBody, toonHair, toonLashes].map((m) => m!.userData.outlineParameters.visible)).toEqual([true, false, false]);

    applyToonLook(root, false);
    expect(mesh.material).toEqual([body, hair]);
    expect(eyes.material).toBe(lashes);
    // Switching on again reuses the toon materials made before.
    applyToonLook(root, true);
    expect((mesh.material as THREE.Material[])[0]).toBe(toonBody);
  });
});
