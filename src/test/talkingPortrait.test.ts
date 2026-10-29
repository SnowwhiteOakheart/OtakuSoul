import { describe, expect, it } from 'vitest';
import { mouthFrame } from '../services/talkingPortrait';
import { SILENT_VISEMES } from '../services/lipSync';

const frames = Object.fromEntries(
  ['aa', 'aa_half', 'ou', 'ou_half', 'ee', 'ee_half', 'oh', 'oh_half', 'blink'].map((name) => [name, {}]),
);

describe('mouthFrame', () => {
  it('keeps the mouth closed without voice', () => {
    expect(mouthFrame(null, 0.5, frames)).toBeNull();
    expect(mouthFrame({ ...SILENT_VISEMES, aa: 1 }, 0.02, frames)).toBeNull();
  });

  it('opens half for a soft voice and fully for a loud one, with the strongest mouth shape', () => {
    expect(mouthFrame({ ...SILENT_VISEMES, oh: 0.8, aa: 0.2 }, 0.1, frames)).toBe('oh_half');
    expect(mouthFrame({ ...SILENT_VISEMES, oh: 0.8, aa: 0.2 }, 0.5, frames)).toBe('oh');
  });

  it('takes the closest shape when a set lacks one (too slight to show)', () => {
    // `ih` is missing in the frames: `ee` stands in.
    expect(mouthFrame({ ...SILENT_VISEMES, ih: 1 }, 0.5, frames)).toBe('ee');
    expect(mouthFrame({ ...SILENT_VISEMES, ih: 1 }, 0.1, frames)).toBe('ee_half');
    // Only a full frame there: used for a soft voice too.
    expect(mouthFrame({ ...SILENT_VISEMES, aa: 1 }, 0.1, { aa: {} })).toBe('aa');
    expect(mouthFrame({ ...SILENT_VISEMES, ou: 1 }, 0.5, {})).toBeNull();
  });
});
