import { describe, expect, it } from 'vitest';
import { MAX_SMILEYS, splitSmileys } from '../components/companion/petSmileys';
import de from '../../presets/locales/ui/de.json';

describe('pet smileys', () => {
  it('takes emoji, kaomoji and text faces out of the words', () => {
    expect(splitSmileys('Hab dich! ✋ (ﾉ◕ヮ◕)ﾉ')).toEqual({ text: 'Hab dich!', smileys: ['✋', '(ﾉ◕ヮ◕)ﾉ'] });
    expect(splitSmileys('Ui… alles dreht sich… @_@')).toEqual({ text: 'Ui… alles dreht sich…', smileys: ['@_@'] });
    expect(splitSmileys('Klettermeisterin! (ง •̀_•́)ง')).toEqual({ text: 'Klettermeisterin!', smileys: ['(ง •̀_•́)ง'] });
    expect(splitSmileys('Ich mag Dich 💕 (Stufe 2)').text).toBe('Ich mag Dich (Stufe 2)');
    expect(splitSmileys('👨‍👩‍👧 Familie').smileys).toEqual(['👨‍👩‍👧']);
  });

  it('keeps words in brackets, symbol swearing and plain text', () => {
    expect(splitSmileys('#@%&!! Das war die Wand!')).toEqual({ text: '#@%&!! Das war die Wand!', smileys: [] });
    expect(splitSmileys('Das ist (wirklich) gut')).toEqual({ text: 'Das ist (wirklich) gut', smileys: [] });
    expect(splitSmileys('大好物（おいしい）だ').smileys).toEqual([]);
    expect(splitSmileys('Mail an a:b').text).toBe('Mail an a:b');
  });

  it('leaves only smileys when there are no words, and shows a few at most', () => {
    expect(splitSmileys('(｀・ω・´)')).toEqual({ text: '', smileys: ['(｀・ω・´)'] });
    expect(splitSmileys('✨✨✨✨✨').smileys).toHaveLength(MAX_SMILEYS);
  });

  it('cleans every pet line of the German texts', () => {
    const lines = Object.entries(de as Record<string, unknown>).filter(
      (entry): entry is [string, string] => entry[0].startsWith('pet.') && typeof entry[1] === 'string',
    );
    for (const [, line] of lines) {
      const { text, smileys } = splitSmileys(line);
      for (const smiley of smileys) expect(text).not.toContain(smiley);
      expect(text).not.toMatch(/\(\s*[^\p{L}\s]{1,3}[_ω﹏][^\p{L}\s]{1,3}\s*\)/u);
    }
  });
});
