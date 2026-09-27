import { describe, it, expect } from 'vitest';
import { LOCALES, t, SupportedLanguage } from '../i18n';

describe('i18n', () => {
  const languages = Object.keys(LOCALES) as SupportedLanguage[];

  it('has a non-empty translation for every key in every language', () => {
    const keys = Object.keys(LOCALES.de);
    expect(keys.length).toBeGreaterThan(30);
    for (const lang of languages) {
      for (const key of keys) {
        const text = (LOCALES[lang] as Record<string, string>)[key];
        expect(text?.trim(), `"${key}" is empty in "${lang}"`).toBeTruthy();
      }
    }
  });

  it('keeps placeholders identical across languages', () => {
    const placeholders = (text: string) => (text.match(/\{\{\w+\}\}/g) ?? []).sort().join(',');
    for (const [key, text] of Object.entries(LOCALES.de)) {
      for (const lang of languages) {
        const translated = (LOCALES[lang] as Record<string, string>)[key] ?? '';
        expect(placeholders(translated), `placeholders of "${key}" in "${lang}"`).toBe(placeholders(text));
      }
    }
  });

  it('translates navigation keys', () => {
    expect(t('nav.characters', 'de')).toBe('Charaktere');
    expect(t('nav.characters', 'en')).toBe('Characters');
    expect(t('nav.characters', 'ru')).toBe('Персонажи');
  });

  it('interpolates placeholders', () => {
    expect(t('header.version', 'de', {})).toBe(t('header.version', 'de'));
    expect(t('unknown {{x}}', 'de', { x: 1 })).toBe('unknown 1');
  });

  it('falls back to the key for unknown keys', () => {
    expect(t('non.existent.key.xyz', 'de')).toBe('non.existent.key.xyz');
  });
});
