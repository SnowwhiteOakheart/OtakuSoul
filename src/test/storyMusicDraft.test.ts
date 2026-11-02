import { describe, expect, it } from 'vitest';
import { MUSIC_MOODS } from '../services/stageMusic';
import {
  BACKGROUND_VOCALS,
  GENRE_MUSIC,
  genreMusic,
  musicPrompt,
  musicSection,
  parseMusicSuggestion,
} from '../services/storyMusicDraft';

describe('story music draft', () => {
  it('every genre has a sound and known moods with captions', () => {
    for (const [genre, music] of Object.entries(GENRE_MUSIC)) {
      expect(music.style, genre).toBeTruthy();
      expect(Object.keys(music.moods).length, genre).toBeGreaterThanOrEqual(4);
      for (const [mood, caption] of Object.entries(music.moods)) {
        expect(MUSIC_MOODS, genre).toContain(mood);
        expect(caption, `${genre} ${mood}`).toBeTruthy();
      }
    }
  });

  it('builds the scene section in mood order, vocals only for quiet moods', () => {
    const section = musicSection(
      { style: ' noir ', moods: { tension: 'ticking', calm: 'piano', combat: '  ' }, vocals: true },
      'story_own_1',
    );
    expect(section).toEqual({
      set: 'story_own_1',
      style: 'noir',
      moods: {
        calm: { caption: 'piano, soft wordless vocals far in the background', lyrics: BACKGROUND_VOCALS, vocal_language: 'en' },
        tension: { caption: 'ticking' },
      },
    });
    expect(musicSection({ style: 'x', moods: { calm: ' ' }, vocals: false }, 's')).toBeNull();
    expect(musicSection(genreMusic('scifi'), 's')?.moods).not.toHaveProperty('calm.lyrics');
  });

  it('asks for exactly the chosen moods with the story as context', () => {
    const { system, user } = musicPrompt(
      { genre: 'slice of life', title: 'Rainy Day', situation: 'A cafe in the rain.', location: '', party: ['Mint'] },
      ['calm', 'romance'],
    );
    expect(system).toContain('exactly these moods: calm, romance');
    expect(user).toBe('Genre: slice of life\nTitle: Rainy Day\nSituation: A cafe in the rain.\nCharacters: Mint');
  });

  it('reads the JSON out of the answer and drops what does not fit', () => {
    expect(
      parseMusicSuggestion('<think>{"x":1}</think>Sure! {"style":"epic","moods":{"Calm":"harp\\n  and flute","dance":"no","combat":7}}'),
    ).toEqual({ style: 'epic', moods: { calm: 'harp and flute' } });
    expect(parseMusicSuggestion('{"style":"epic","moods":{}}')).toBeNull();
    expect(parseMusicSuggestion('no json here')).toBeNull();
    expect(parseMusicSuggestion('{"moods": {"calm": "x"')).toBeNull();
    expect(parseMusicSuggestion(`{"moods":{"calm":"${'a'.repeat(500)}"}}`)?.moods.calm).toHaveLength(300);
  });
});
