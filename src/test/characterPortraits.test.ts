import { describe, expect, it, vi } from 'vitest';
import {
  getPortraitExpressions,
  resolveCharacterImagePath,
  resolveCharacterImageSource,
  selectCharacterPortrait,
} from '../utils/characterPortraits';
import { CharacterProfile } from '../types';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost${path.startsWith('/') ? '' : '/'}${path}`,
}));

const createMockCharacter = (overrides?: Partial<CharacterProfile>): CharacterProfile => ({
  id: 'test-char',
  source_path: '/home/user/presets/no-game-no-life/chlammy_zell.json',
  avatar_data_url: 'data:image/png;base64,fallbackImageData',
  bound_lorebooks: [],
  card: {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: 'Chlammy Zell',
      description: 'Test description',
      personality: 'Cool',
      scenario: 'Test scenario',
      first_mes: 'Hello',
      mes_example: '',
      creator_notes: '',
      system_prompt: '',
      post_history_instructions: '',
      tags: [],
      creator: '',
      character_version: '1.0',
      alternate_greetings: [],
      extensions: {
        expressions: {
          neutral: 'expressions/chlammy_zell/neutral.webp',
          happy: 'expressions/chlammy_zell/happy.webp',
          sad: 'expressions/chlammy_zell/sad.webp',
          angry: 'expressions/chlammy_zell/angry.webp',
        },
      },
    },
  },
  ...overrides,
});

describe('characterPortraits', () => {
  describe('getPortraitExpressions', () => {
    it('returns empty object when character is null or has no extensions', () => {
      expect(getPortraitExpressions(null)).toEqual({});
      const charWithoutExt = createMockCharacter();
      delete (charWithoutExt.card.data as any).extensions;
      expect(getPortraitExpressions(charWithoutExt)).toEqual({});
    });

    it('extracts expressions from extensions.expressions', () => {
      const char = createMockCharacter();
      const exps = getPortraitExpressions(char);
      expect(exps.neutral).toBe('expressions/chlammy_zell/neutral.webp');
      expect(exps.happy).toBe('expressions/chlammy_zell/happy.webp');
    });

    it('extracts expressions from legacy sow_expressions if expressions is missing', () => {
      const char = createMockCharacter();
      delete (char.card.data.extensions as any).expressions;
      char.card.data.extensions.sow_expressions = {
        neutral: 'legacy/neutral.png',
      };
      const exps = getPortraitExpressions(char);
      expect(exps.neutral).toBe('legacy/neutral.png');
    });
  });

  describe('resolveCharacterImagePath', () => {
    it('returns undefined for empty or data/blob/asset URLs', () => {
      expect(resolveCharacterImagePath(undefined)).toBeUndefined();
      expect(resolveCharacterImagePath('data:image/png;base64,...')).toBeUndefined();
      expect(resolveCharacterImagePath('blob:http://localhost/...')).toBeUndefined();
      expect(resolveCharacterImagePath('asset://localhost/...')).toBeUndefined();
      expect(resolveCharacterImagePath('https://example.com/img.png')).toBeUndefined();
    });

    it('returns absolute paths as-is (normalized)', () => {
      expect(resolveCharacterImagePath('/absolute/path/to/img.webp')).toBe('/absolute/path/to/img.webp');
      expect(resolveCharacterImagePath('C:\\images\\waifu.png')).toBe('C:/images/waifu.png');
    });

    it('resolves relative path relative to character source_path directory', () => {
      const resolved = resolveCharacterImagePath(
        'expressions/chlammy_zell/neutral.webp',
        '/home/user/presets/no-game-no-life/chlammy_zell.json'
      );
      expect(resolved).toBe('/home/user/presets/no-game-no-life/expressions/chlammy_zell/neutral.webp');
    });

    it('returns undefined for relative path when characterSourcePath is missing', () => {
      expect(resolveCharacterImagePath('expressions/neutral.webp', undefined)).toBeUndefined();
    });
  });

  describe('resolveCharacterImageSource', () => {
    it('passes through data, blob, http, and asset URLs directly without calling convertFileSrc', () => {
      expect(resolveCharacterImageSource('data:image/png;base64,123')).toBe('data:image/png;base64,123');
      expect(resolveCharacterImageSource('https://example.com/pic.png')).toBe('https://example.com/pic.png');
      expect(resolveCharacterImageSource('asset://localhost/pic.png')).toBe('asset://localhost/pic.png');
    });

    it('converts resolved file paths via convertFileSrc', () => {
      const src = resolveCharacterImageSource(
        'expressions/chlammy_zell/neutral.webp',
        '/home/user/presets/no-game-no-life/chlammy_zell.json'
      );
      expect(src).toBe('asset://localhost/home/user/presets/no-game-no-life/expressions/chlammy_zell/neutral.webp');
    });
  });

  describe('selectCharacterPortrait', () => {
    it('selects detectedEmotion when available', () => {
      const char = createMockCharacter();
      const portrait = selectCharacterPortrait(char, 'happy', 'relaxed');
      expect(portrait).toContain('happy.webp');
    });

    it('falls back to canonicalMood when detectedEmotion is not mapped', () => {
      const char = createMockCharacter();
      const portrait = selectCharacterPortrait(char, 'amusement', 'happy');
      expect(portrait).toContain('happy.webp');
    });

    it('falls back to neutral when neither detectedEmotion nor canonicalMood match', () => {
      const char = createMockCharacter();
      const portrait = selectCharacterPortrait(char, 'grief', 'relaxed');
      expect(portrait).toContain('neutral.webp');
    });

    it('falls back to avatar_data_url when character has no expressions', () => {
      const char = createMockCharacter();
      delete (char.card.data.extensions as any).expressions;
      const portrait = selectCharacterPortrait(char, 'happy', 'happy');
      expect(portrait).toBe('data:image/png;base64,fallbackImageData');
    });

    it('falls back to avatar_data_url when character is null or expressions are empty', () => {
      expect(selectCharacterPortrait(null, 'happy', 'happy')).toBeUndefined();
    });
  });
});
