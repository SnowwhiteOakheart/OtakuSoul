import { describe, expect, it } from 'vitest';
import { emotionTagOf, withoutEmotionTag } from '../utils/replyTags';
import { cuePattern, gestureForReply } from '../utils/avatarGestures';

describe('expression tag of a reply', () => {
  it('reads the last tag and removes every tag from the text', () => {
    const reply = '*wird rot* „Ach du …“ [emotion: Blush]';
    expect(emotionTagOf(reply)).toBe('blush');
    expect(withoutEmotionTag(reply)).toBe('*wird rot* „Ach du …“');
    expect(emotionTagOf('[emotion: sad] dann <emotion>happy</emotion>')).toBe('happy');
    expect(emotionTagOf('Ohne Tag.')).toBeUndefined();
  });

  it('hides a tag that is still being streamed', () => {
    expect(withoutEmotionTag('Hallo! [emo')).toBe('Hallo!');
    expect(withoutEmotionTag('Hallo! [emotion: bl')).toBe('Hallo!');
    expect(withoutEmotionTag('Siehe [1] und [e')).toBe('Siehe [1] und');
  });
});

describe('cue words from the language files', () => {
  it('match whole words or stems in any script', () => {
    expect(cuePattern('winkt')!.test('*winkt dir zu*')).toBe(true);
    expect(cuePattern('wave')!.test('*waves*')).toBe(false);
    expect(cuePattern('кива*')!.test('*кивает*')).toBe(true);
    expect(cuePattern('кива*')!.test('*покивает*')).toBe(false);
    expect(cuePattern('ballt die fäuste')!.test('*ballt  die Fäuste*')).toBe(true);
    expect(cuePattern(' * ')).toBeNull();
  });

  it('give gestures in every bundled language', () => {
    expect(gestureForReply('*nickt*')).toBe('nod');
    expect(gestureForReply('*nods slowly*')).toBe('nod');
    expect(gestureForReply('*машет рукой*')).toBe('greeting');
  });
});
