import { describe, expect, it } from 'vitest';
import { bestByMood, gestureForReply, pickByMood } from '../utils/avatarGestures';

describe('gestureForReply', () => {
  it('takes the first roleplay action that names a gesture', () => {
    expect(gestureForReply('*winkt dir fröhlich zu* "Hallo!" *lacht*')).toBe('greeting');
    expect(gestureForReply('"Hmm." *tilts her head and thinks*')).toBe('thinking');
    expect(gestureForReply('*nickt langsam*', 'sad')).toBe('nod');
  });

  it('understands Russian roleplay actions in any form', () => {
    expect(gestureForReply('*машет рукой* «Привет!»')).toBe('greeting');
    expect(gestureForReply('*Кивнула* «Хорошо.»')).toBe('nod');
    expect(gestureForReply('*задумчиво смотрит в окно*')).toBe('thinking');
    expect(gestureForReply('*вздрогнула от неожиданности*')).toBe('surprised');
    expect(gestureForReply('*тихо засмеялась*')).toBe('happy');
    expect(gestureForReply('*всхлипывает*')).toBe('sad');
    expect(gestureForReply('*нахмурилась и топнула ногой*')).toBe('angry');
  });

  it('does not match Russian stems inside other words', () => {
    // "машина" (car) is no wave, "откивать" is no word, "потоп" (flood) no stomp.
    expect(gestureForReply('*садится в машину*')).toBeNull();
    expect(gestureForReply('*смотрит на потоп*')).toBeNull();
  });

  it('falls back to the emotion and ignores words outside actions', () => {
    expect(gestureForReply('Ich lache nie. *schaut aus dem Fenster*', 'sad')).toBe('sad');
    expect(gestureForReply('She waves.', 'relaxed')).toBeNull();
  });
});

describe('mood weighting', () => {
  const waves = [{ name: 'plain' }, { name: 'happy', mood: 'happy' }, { name: 'sad', mood: 'sad' }];

  it('prefers motions made for the current mood', () => {
    // Weights 1, 4 and 0.25 (total 5.25): rolls map onto them in order.
    expect(pickByMood(waves, 'happy', () => 0.1)?.name).toBe('plain');
    expect(pickByMood(waves, 'happy', () => 0.5)?.name).toBe('happy');
    expect(pickByMood(waves, 'happy', () => 0.99)?.name).toBe('sad');
    const counts = { plain: 0, happy: 0, sad: 0 };
    for (let i = 0; i < 1000; i += 1) counts[pickByMood(waves, 'happy', () => i / 1000)!.name as keyof typeof counts] += 1;
    expect(counts.happy).toBeGreaterThan(counts.plain * 3);
    expect(counts.sad).toBeLessThan(counts.plain);
  });

  it('chooses the best fitting idle, motions for any mood when nothing matches', () => {
    expect(bestByMood(waves, 'sad')?.name).toBe('sad');
    expect(bestByMood(waves, 'neutral')?.name).toBe('plain');
    expect(bestByMood([], 'happy')).toBeUndefined();
  });
});
