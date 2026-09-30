import { describe, expect, it } from 'vitest';
import { fillCardMacros, languageCode, localizeCard } from '../utils/cardI18n';
import type { CharacterData } from '../types';

const card: CharacterData = {
  name: 'Ayu',
  description: '{{char}} ist ein Idol.',
  personality: 'stolz',
  scenario: 'Tokio',
  first_mes: 'Hallo {{user}}!',
  mes_example: '',
  alternate_greetings: ['Na?'],
  tags: ['Idol', 'Deutsch'],
  extensions: {
    sow_title: 'Top-Idol',
    otakusoul_i18n: {
      source_language: 'de',
      translations: {
        en: { description: '{{char}} is an idol.', personality: '', tags: ['Idol', 'English'], sow_title: 'Top idol' },
      },
    },
  },
};

describe('card translations', () => {
  it('uses the translation and keeps base text for missing fields', () => {
    const en = localizeCard(card, 'en');
    expect(en.description).toBe('{{char}} is an idol.');
    expect(en.personality).toBe('stolz');
    expect(en.first_mes).toBe('Hallo {{user}}!');
    expect(en.tags).toEqual(['Idol', 'English']);
    expect(en.extensions.sow_title).toBe('Top idol');
  });

  it('leaves cards without translations unchanged', () => {
    expect(localizeCard(card, 'ru')).toBe(card);
    const plain = { ...card, extensions: {} };
    expect(localizeCard(plain, 'en')).toBe(plain);
  });

  it('maps reply language names to codes', () => {
    expect(languageCode('Deutsch')).toBe('de');
    expect(languageCode('Русский')).toBe('ru');
    expect(languageCode('en')).toBe('en');
  });

  it('fills {{char}} and {{user}} in any case', () => {
    expect(fillCardMacros('{{char}} mag {{User}}. {{ CHAR }}!', 'Ayu', 'Hiroki')).toBe('Ayu mag Hiroki. Ayu!');
  });
});
