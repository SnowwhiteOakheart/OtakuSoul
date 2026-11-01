import type { AvatarMotion } from '../types';
import type { MotionPackItem } from '../types/generated/MotionPackItem';

/** Loops the desktop pet needs to walk and sit like a figure (not a statue sliding along). */
export const PET_MOTION_ROLES = ['walk', 'sit'] as const;

/** 3D motions (VRMA/FBX) are missing for walking or sitting. */
export const lacksPetMotions = (motions: Pick<AvatarMotion, 'role' | 'kind'>[]): boolean =>
  PET_MOTION_ROLES.some((role) => !motions.some((m) => m.role === role && m.kind !== 'vmd'));

/** The pack to offer: the first one not yet loaded that brings walking or sitting. */
export const recommendedMotionPack = (packs: MotionPackItem[]): MotionPackItem | null =>
  packs.find((p) => !p.installed && PET_MOTION_ROLES.some((role) => p.roles.includes(role))) ?? null;
