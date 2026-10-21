import { describe, expect, it } from 'vitest';
import { projectorFor } from '../utils/visionProjector';

const dir = '/data/models';
const gemma12 = `${dir}/gemma-4-12b-it-Q4_K_M.gguf`;
const own12 = `${dir}/gemma-4-12b-it-Q4_K_M-mmproj-F16.gguf`;
const own26 = `${dir}/gemma-4-26B-A4B-it-UD-Q4_K_M-mmproj-F16.gguf`;
const manual = '/home/kai/Downloads/mmproj-model-f16.gguf';

describe('vision projector for a model', () => {
  it('picks the projector downloaded for this model', () => {
    expect(projectorFor(gemma12, null, [own26, own12])).toBe(own12);
    expect(projectorFor(gemma12, manual, [own12])).toBe(own12);
  });

  it('drops one downloaded for another model, keeps a hand-picked one', () => {
    expect(projectorFor(gemma12, own26, [own26])).toBeNull();
    expect(projectorFor(gemma12, manual, [own26])).toBeUndefined();
    expect(projectorFor(gemma12, null, [])).toBeUndefined();
    expect(projectorFor('C:\\models\\gemma-4-12b-it-Q4_K_M.gguf', null, ['C:\\models\\gemma-4-12b-it-Q4_K_M-mmproj-F16.gguf']))
      .toBe('C:\\models\\gemma-4-12b-it-Q4_K_M-mmproj-F16.gguf');
  });
});
