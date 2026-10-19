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

  it('walks through the four steps and creates the story', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Start story' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const created = vi.mocked(api.createStageScene).mock.calls[0]![0];
    expect(created.title).toBe('The Island in the Fog');
    expect(created.party).toEqual(['Cosmos']);
    expect(created.opening_narration).toMatch(/WELCOME BACK/);
    expect(useAppStore.getState().stageLastScene).toBe(created.id);
  });

  it('needs an idea before an own story can start', async () => {
    const user = userEvent.setup();
    render(<StoryWizard onClose={vi.fn()} onCreated={vi.fn()} onAdvanced={vi.fn()} />);
    for (let i = 0; i < 3; i += 1) await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('radio', { name: /Own idea/ }));
    expect(screen.getByRole('button', { name: 'Start story' })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Own idea' }), 'We wake up on the moon.');
    expect(screen.getByRole('button', { name: 'Start story' })).toBeEnabled();
  });
});
