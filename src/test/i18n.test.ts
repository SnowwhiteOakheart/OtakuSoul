import { describe, it, expect } from 'vitest';
import { DICTIONARY, t, SupportedLanguage } from '../i18n';

describe('i18n Dictionary & Translation Helper', () => {
  const supportedLanguages: SupportedLanguage[] = ['de', 'en', 'ru'];

  it('contains valid translation entries for all keys across de, en, ru', () => {
    const keys = Object.keys(DICTIONARY);
    expect(keys.length).toBeGreaterThan(30);

    for (const key of keys) {
      const entry = DICTIONARY[key];
      expect(entry, `Entry for key "${key}" should exist`).toBeDefined();

      for (const lang of supportedLanguages) {
        const text = entry[lang];
        expect(
          typeof text,
          `Translation for key "${key}" in lang "${lang}" should be a string`
        ).toBe('string');
        expect(
          text.trim().length,
          `Translation for key "${key}" in lang "${lang}" should not be empty`
        ).toBeGreaterThan(0);
      }
    }
  });

  it('translates navigation keys correctly', () => {
    expect(t('nav.chat', 'de')).toBe('Chat');
    expect(t('nav.characters', 'de')).toBe('Charaktere');
    expect(t('nav.characters', 'en')).toBe('Characters');
    expect(t('nav.characters', 'ru')).toBe('Персонажи');
    expect(t('nav.hub', 'en')).toBe('Soul Hub');
  });

  it('translates header and settings keys correctly', () => {
    expect(t('header.logs', 'de')).toBe('System-Logs');
    expect(t('header.logs', 'en')).toBe('System Logs');
    expect(t('header.logs', 'ru')).toBe('Системные логи');

    expect(t('header.update', 'de')).toBe('Updates prüfen');
    expect(t('header.update', 'en')).toBe('Check Updates');

    expect(t('settings.appearance', 'de')).toBe('Erscheinungsbild & Theme');
    expect(t('settings.appearance', 'en')).toBe('Appearance & Theme');
  });

  it('falls back gracefully to key name if not found in dictionary', () => {
    const missing = t('non.existent.key.xyz', 'de');
    expect(missing).toBe('non.existent.key.xyz');
  });
});
