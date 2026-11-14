import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAFT, INSTRUMENTAL, fromRequest, toRequest } from '../components/music/songDraft';

describe('Song-Studio-Formular', () => {
  it('macht aus den Liedtext-Modi die passende Anfrage', () => {
    const own = toRequest({ ...DEFAULT_DRAFT, caption: ' lofi ', lyricsMode: 'own', lyrics: '[Verse]\nla', vocalLanguage: 'de' }, 'standard');
    expect(own).toMatchObject({ caption: 'lofi', lyrics: '[Verse]\nla', vocal_language: 'de', model_id: 'standard', seed: null });

    const auto = toRequest({ ...DEFAULT_DRAFT, lyricsMode: 'auto', lyrics: 'alter Text' }, 'xl');
    expect(auto.lyrics).toBe('');

    const instrumental = toRequest({ ...DEFAULT_DRAFT, lyricsMode: 'instrumental', vocalLanguage: 'ja' }, 'xl');
    expect(instrumental.lyrics).toBe(INSTRUMENTAL);
    expect(instrumental.vocal_language).toBe('');

    expect(toRequest({ ...DEFAULT_DRAFT, seed: '42' }, 'x').seed).toBe(42);
  });

  it('lädt gespeicherte Einstellungen zurück ins Formular', () => {
    const request = toRequest({ ...DEFAULT_DRAFT, title: 'Neon', caption: 'synthwave', lyricsMode: 'instrumental', bpm: 120, versions: 4 }, 'standard');
    const draft = fromRequest(request, 7);
    expect(draft).toMatchObject({ title: 'Neon', caption: 'synthwave', lyricsMode: 'instrumental', bpm: 120, seed: '7', versions: 1 });
    expect(fromRequest({ ...request, lyrics: '' }, null).lyricsMode).toBe('auto');
    expect(fromRequest({ ...request, lyrics: '[Chorus]\nhey' }, null)).toMatchObject({ lyricsMode: 'own', lyrics: '[Chorus]\nhey' });
  });
});
