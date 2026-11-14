import { describe, expect, it } from 'vitest';
import { atMouth } from '../components/companion/petFood';

describe('atMouth', () => {
  it('hits below the eyes in the middle of the head, not at the feet or the side', () => {
    expect(atMouth(150, 130, 300, 600, 0.25)).toBe(true);
    expect(atMouth(150, 500, 300, 600, 0.25)).toBe(false);
    expect(atMouth(10, 130, 300, 600, 0.25)).toBe(false);
    expect(atMouth(150, 10, 300, 600, 0.25)).toBe(false);
    expect(atMouth(0, 0, 0, 0, 0.25)).toBe(false);
  });
});
