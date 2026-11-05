import { describe, expect, it } from 'vitest';
import { attachStageImage } from '../utils/stageImages';
import type { SceneTurnMessage } from '../types';

const line = (id: string, images?: string[]): SceneTurnMessage => ({
  id,
  sender_id: 'gm',
  sender_name: 'GM',
  sender_role: 'gm',
  content: id,
  turn_mode: 'do',
  timestamp: 0,
  ...(images ? { images } : {}),
});

describe('Stage pictures hang on their line', () => {
  it('goes to the line it was made at, even after a turn added more', () => {
    const log = [line('a'), line('b'), line('c')];
    const next = attachStageImage(log, 'b', 'moment.png');
    expect(next[1]!.images).toEqual(['moment.png']);
    expect(next[2]!.images).toBeUndefined();
    expect(log[1]!.images, 'the old log stays untouched').toBeUndefined();
  });

  it('adds to earlier pictures and leaves a rewound log alone', () => {
    expect(attachStageImage([line('a', ['one.png'])], 'a', 'two.png')[0]!.images).toEqual(['one.png', 'two.png']);
    const log = [line('a')];
    expect(attachStageImage(log, 'gone', 'x.png')).toBe(log);
    expect(attachStageImage(log, undefined, 'x.png')).toBe(log);
  });
});
