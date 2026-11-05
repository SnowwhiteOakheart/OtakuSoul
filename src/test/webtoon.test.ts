import { describe, expect, it } from 'vitest';
import { plainText, wrapText } from '../services/webtoon';

// Every character 10 px wide: enough to check where lines break.
const ctx = { measureText: (text: string) => ({ width: text.length * 10 }) as TextMetrics };

describe('webtoon text', () => {
  it('drops markdown marks but keeps paragraphs', () => {
    expect(plainText('*lächelt* **Komm**   mit.\n\n\n\nJa.')).toBe('lächelt Komm mit.\n\nJa.');
  });

  it('wraps at spaces and keeps empty lines between paragraphs', () => {
    expect(wrapText(ctx, 'eins zwei drei vier', 100)).toEqual(['eins zwei', 'drei vier']);
    expect(wrapText(ctx, 'a\n\nb', 100)).toEqual(['a', '', 'b']);
  });

  it('breaks Japanese between characters and cuts words longer than a line', () => {
    expect(wrapText(ctx, 'フロストヴァイラーの鐘', 50)).toEqual(['フロストヴ', 'ァイラーの', '鐘']);
    expect(wrapText(ctx, 'x Donaudampfschifffahrt', 80)).toEqual(['x', 'Donaudam', 'pfschiff', 'fahrt']);
  });
});
