import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AVATAR_CACHE_SIZE, forgetAvatar, idleAvatarCount, leaseAvatar, releaseAvatar, takeAvatar } from '../components/avatar/avatarCache';

const model = () => {
  const root = new THREE.Group();
  const bone = new THREE.Bone();
  bone.name = 'head';
  root.add(bone);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  mesh.morphTargetInfluences = [0, 0];
  root.add(mesh);
  return { root, bone, mesh };
};

beforeEach(() => {
  for (const key of ['a', 'b', 'c']) forgetAvatar(key);
});

describe('avatar cache', () => {
  it('gives a released model back in the pose it was loaded in', () => {
    const m = model();
    const scene = new THREE.Scene();
    let resets = 0;
    leaseAvatar('a', m, m.root, () => (resets += 1));
    scene.add(m.root);
    m.root.scale.setScalar(0.01);
    m.bone.rotation.set(0.5, 0, 0);
    m.mesh.morphTargetInfluences![1] = 0.8;
    releaseAvatar(m);
    expect(m.root.parent).toBeNull();
    expect(m.root.scale.x).toBe(1);
    expect(m.bone.quaternion.equals(new THREE.Quaternion())).toBe(true);
    expect(m.mesh.morphTargetInfluences).toEqual([0, 0]);
    expect(resets).toBe(1);
    expect(takeAvatar('a')).toBe(m);
  });

  it('lends a model to one viewer at a time', () => {
    const m = model();
    leaseAvatar('a', m, m.root);
    expect(takeAvatar('a')).toBeNull();
    releaseAvatar(m);
    expect(takeAvatar('a')).toBe(m);
    expect(takeAvatar('a')).toBeNull();
  });

  it('keeps only the latest models and forgets replaced files', () => {
    const models = ['a', 'b', 'c'].map((key) => {
      const m = model();
      leaseAvatar(key, m, m.root);
      releaseAvatar(m);
      return m;
    });
    expect(idleAvatarCount()).toBe(AVATAR_CACHE_SIZE);
    expect(takeAvatar('a')).toBeNull();
    expect(takeAvatar('c')).toBe(models[2]);
    forgetAvatar('b');
    expect(takeAvatar('b')).toBeNull();
  });
});
