import { afterEach, describe, expect, it, vi } from 'vitest';
// Not the module mock: the test setup loads the registry with the real `api` object first.
import { api } from '../services/api';
import { LOCALES, loadLocale, t, tPlural } from '../i18n';
import { FALLBACKS } from '../i18n/registry';

afterEach(() => {
  vi.restoreAllMocks();
  delete LOCALES.pl;
  delete FALLBACKS.pl;
});

describe('languages from JSON files', () => {
  it('loads a language the app does not ship and fills gaps from its fallback, then English', async () => {
    const load = vi.spyOn(api, 'loadUiLanguage').mockResolvedValue({ 'nav.chat': 'Czat' });
    await loadLocale('pl', { fallback: 'en' });
    expect(load).toHaveBeenCalledWith('pl');
    expect(t('nav.chat', 'pl')).toBe('Czat');
    // en is loaded in the test setup and stands in before German.
    expect(t('nav.characters', 'pl')).toBe('Characters');
    // Without an own fallback English stands in as well, not German.
    delete FALLBACKS.pl;
    expect(t('nav.characters', 'pl')).toBe('Characters');
    // Only a text English lacks too comes from German.
    const english = LOCALES.en as Record<string, string>;
    const kept = english['nav.characters']!;
    delete english['nav.characters'];
    expect(t('nav.characters', 'pl')).toBe('Charaktere');
    english['nav.characters'] = kept;
  });

  it('keeps a loaded language until it is reread', async () => {
    const load = vi.spyOn(api, 'loadUiLanguage').mockResolvedValue({ 'nav.chat': 'Czat' });
    await loadLocale('pl');
    await loadLocale('pl');
    expect(load).toHaveBeenCalledTimes(1);
    vi.spyOn(api, 'loadUiLanguage').mockResolvedValue({ 'nav.chat': 'Rozmowa' });
    await loadLocale('pl', { force: true });
    expect(t('nav.chat', 'pl')).toBe('Rozmowa');
  });

  it('reads German from disk only for an own de.json', async () => {
    const load = vi.spyOn(api, 'loadUiLanguage').mockResolvedValue({ 'nav.chat': 'Plaudern' });
    await loadLocale('de');
    expect(load).not.toHaveBeenCalled();
    await loadLocale('de', { fromDisk: true });
    expect(t('nav.chat', 'de')).toBe('Plaudern');
    expect(t('nav.characters', 'de')).toBe('Charaktere');
    await loadLocale('de', { force: true });
    expect(t('nav.chat', 'de')).toBe('Chat');
  });

  it('uses the plural forms of the new language and `_other` where they are missing', async () => {
    vi.spyOn(api, 'loadUiLanguage').mockResolvedValue({
      'chat.messageCount_one': '{{count}} wiadomość',
      'chat.messageCount_few': '{{count}} wiadomości',
    });
    await loadLocale('pl');
    expect(tPlural('chat.messageCount', 1, 'pl')).toBe('1 wiadomość');
    expect(tPlural('chat.messageCount', 3, 'pl')).toBe('3 wiadomości');
    // "many" is not in the file: German `_other` stands in.
    expect(tPlural('chat.messageCount', 5, 'pl')).toBe(t('chat.messageCount_other', 'de', { count: 5 }));
  });
});
