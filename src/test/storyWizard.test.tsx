// @vitest-environment jsdom
import { de, en, ru } from './locales';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { PREMISES_PER_GENRE, StoryWizard, WIZARD_GENRES, buildStoryDefinition } from '../components/stage/StoryWizard';
import { resetApiMocks } from './mockApi';
import { translate } from '../i18n';
import { BACKGROUND_VOCALS, GENRE_MUSIC } from '../services/storyMusicDraft';
import type { CharacterProfile, SceneState } from '../types';

const character = (name: string) => ({ id: name, card: { data: { name } }, avatar_data_url: null }) as unknown as CharacterProfile;

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({
    appLanguage: 'en',
    availableCharacters: [character('Emilia'), character('Cosmos')],
    activePersona: { id: 'p', name: 'Kai', description: '', avatar_data_url: null },
  });
});

describe('StoryWizard', () => {
  it('has every ready-made situation for every genre', () => {
    for (const genre of WIZARD_GENRES) {
      for (let n = 0; n < PREMISES_PER_GENRE; n += 1) {
        for (const field of ['title', 'hook', 'location', 'opening']) {
          const key = `storyWizard.premise.${genre}.${n}.${field}` as keyof typeof en;
          for (const dict of [de, en, ru]) expect(dict[key], `${genre} ${n} ${field}`).toBeTruthy();
        }
      }
      expect(en[`storyWizard.style.${genre}` as keyof typeof en]).toBeTruthy();
    }
  });

  it('builds a scene with story data, the player and an own idea', () => {
    const def = buildStoryDefinition({
      genre: 'mystery',
      playerName: 'Kai',
      playerDescription: 'a nosy reporter',
      party: [],
      premise: null,
      ownIdea: 'A train vanishes in a tunnel.',
      ownLocation: 'Old station',
    });
    expect(def.title).toBe('Own story (Mystery)');
    expect(def.description).toBe('A train vanishes in a tunnel.');
    expect(def.world_context).toContain('The player character Kai: a nosy reporter');
    expect(def.starting_location).toBe('Old station');
    expect(def.persona).toBe('Kai');
    expect(def.solo_mode).toBe(true);
    expect((def.extensions as { otakusoul_story: { genre: string } }).otakusoul_story.genre).toBe('mystery');
    expect(def.narrator_style).toBe(translate('storyWizard.style.mystery'));
  });

  it('walks through the five steps and creates the story', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    vi.mocked(api.createStageScene).mockImplementation(async (definition) => ({ definition }) as SceneState);
    render(<StoryWizard onClose={vi.fn()} onCreated={onCreated} onAdvanced={vi.fn()} />);

    await user.click(screen.getByRole('radio', { name: /Horror/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('textbox', { name: /Your character's name/ })).toHaveValue('Kai');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: /Cosmos/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('radio', { name: /The Island in the Fog/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('textbox', { name: 'Sound of the story' })).toHaveValue(GENRE_MUSIC.horror.style);
    await user.click(screen.getByRole('button', { name: 'Start story' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const created = vi.mocked(api.createStageScene).mock.calls[0]![0];
    expect(created.title).toBe('The Island in the Fog');
    expect(created.party).toEqual(['Cosmos']);
    expect(created.opening_narration).toMatch(/WELCOME BACK/);
    expect(useAppStore.getState().stageLastScene).toBe(created.id);
    const music = (created.extensions as { otakusoul_music: { set: string; moods: Record<string, unknown> } }).otakusoul_music;
    expect(music.set).toBe(created.id);
    expect(Object.keys(music.moods).sort()).toEqual(Object.keys(GENRE_MUSIC.horror.moods).sort());
  });

  it('needs an idea before an own story can start', async () => {
    const user = userEvent.setup();
    render(<StoryWizard onClose={vi.fn()} onCreated={vi.fn()} onAdvanced={vi.fn()} />);
    for (let i = 0; i < 3; i += 1) await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('radio', { name: /Own idea/ }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Own idea' }), 'We wake up on the moon.');
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('fills the music with the chat model\'s suggestion and lets moods be changed', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createStageScene).mockImplementation(async (definition) => ({ definition }) as SceneState);
    vi.mocked(api.quickReply).mockResolvedValue(
      'Here you go:\n```json\n{"style": "lofi jazz", "moods": {"calm": "soft rhodes, rainy cafe", "mystery": "muted trumpet", "boss": "ignored"}}\n```',
    );
    render(<StoryWizard onClose={vi.fn()} onCreated={vi.fn()} onAdvanced={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: /Mystery/ }));
    for (let i = 0; i < 4; i += 1) await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.click(screen.getByRole('button', { name: 'Sorrow' }));
    await user.click(screen.getByRole('button', { name: 'Tension' }));
    await user.click(screen.getByRole('button', { name: 'Suggestion from the chat model' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Sound of the story' })).toHaveValue('lofi jazz'));
    const request = vi.mocked(api.quickReply).mock.calls[0]![0];
    expect(request.system).toContain('exactly these moods: calm, mystery');
    expect(request.user).toContain('Genre: mystery');
    expect(screen.getByRole('textbox', { name: 'Description for Calm' })).toHaveValue('soft rhodes, rainy cafe');
    expect(screen.queryByRole('textbox', { name: 'Description for Boss fight' })).toBeNull();

    await user.click(screen.getByRole('checkbox', { name: /Soft singing/ }));
    await user.click(screen.getByRole('button', { name: 'Start story' }));
    await waitFor(() => expect(api.createStageScene).toHaveBeenCalled());
    const music = (vi.mocked(api.createStageScene).mock.calls[0]![0].extensions as { otakusoul_music: { style: string; moods: Record<string, { lyrics?: string; vocal_language?: string }> } }).otakusoul_music;
    expect(music.style).toBe('lofi jazz');
    expect(music.moods.calm?.lyrics).toBe(BACKGROUND_VOCALS);
    expect(music.moods.calm?.vocal_language).toBe('en');
    expect(Object.keys(music.moods)).toEqual(['calm', 'mystery']);
  });

  it('a story without own music has no music section', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createStageScene).mockImplementation(async (definition) => ({ definition }) as SceneState);
    render(<StoryWizard onClose={vi.fn()} onCreated={vi.fn()} onAdvanced={vi.fn()} />);
    for (let i = 0; i < 4; i += 1) await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('checkbox', { name: 'Own music for this story' }));
    await user.click(screen.getByRole('button', { name: 'Start story' }));
    await waitFor(() => expect(api.createStageScene).toHaveBeenCalled());
    expect(vi.mocked(api.createStageScene).mock.calls[0]![0].extensions).not.toHaveProperty('otakusoul_music');
  });
});
