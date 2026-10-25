// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { StoryGallery, continueScenes, galleryCollections, galleryScenes } from '../components/stage/StoryGallery';
import { useHubStore } from '../components/hub/hubStore';
import { resetApiMocks } from './mockApi';
import type { ScenePreview, SceneState } from '../types';

const scene = (id: string, extra: Partial<ScenePreview> = {}): ScenePreview => ({
  id,
  title: id,
  description: `Beschreibung ${id}`,
  party: [],
  location: '',
  time_of_day: '',
  gm_tone: '',
  folder: '',
  is_preset: true,
  starting_bg: '',
  last_played: null,
  has_progress: false,
  turn_count: 0,
  rules_5e: false,
  adventure: false,
  ...extra,
});
const story = (genre: string, beginner = false) => ({
  genre,
  minutes: 30,
  difficulty: 'easy',
  notes: ['spooky'],
  beginner,
  choices: { de: [{ text: 'Untersuche die Glocke', badge: null, action_type: 'do' }] },
});

const bells = scene('story_frozen_bells', { title: 'Die Glocken', party: ['Emilia'], story: story('fantasy', true) });
const ryokan = scene('story_ryokan_night', { title: 'Ryokan', story: story('horror') });
const act1 = scene('akt1', { rules_5e: true, adventure: true, party: ['Thorin'], folder: 'Gruft' });
const act2 = scene('akt2', { rules_5e: true, adventure: true, party: ['Thorin'], folder: 'Gruft', has_progress: true, last_played: '2026-10-15', turn_count: 5 });
const own = scene('mine', { is_preset: false, has_progress: true, last_played: '2026-10-16', turn_count: 3 });

const hubInitial = useHubStore.getState();

beforeEach(() => {
  resetApiMocks();
  useHubStore.setState(hubInitial, true);
  useAppStore.setState({ appLanguage: 'en', stageScenes: [ryokan, act1, act2, bells, own], stageState: null });
  vi.mocked(api.listStageScenes).mockResolvedValue([ryokan, act1, act2, bells, own]);
});

describe('StoryGallery', () => {
  it('orders beginner stories first, shows the adventure once and own scenes last', () => {
    expect(galleryScenes([ryokan, act1, act2, bells, own]).map((s) => s.id)).toEqual([
      'story_frozen_bells', 'story_ryokan_night', 'akt2', 'mine',
    ]);
    expect(continueScenes([ryokan, act1, act2, bells, own]).map((s) => s.id)).toEqual(['mine', 'akt2']);
  });

  it('filters by genre and starts a story from its preview', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    vi.mocked(api.loadStageScene).mockResolvedValue({ definition: { id: 'story_frozen_bells' } } as SceneState);
    render(<StoryGallery onPlay={onPlay} onManage={vi.fn()} onCreate={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'What would you like to experience?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Continue playing' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Horror' }));
    expect(screen.queryByRole('heading', { name: 'Die Glocken' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ryokan' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'For beginners' }));

    const card = screen.getByRole('heading', { name: 'Die Glocken' }).closest('article')!;
    expect(within(card).getByText('about 30 min')).toBeInTheDocument();
    expect(within(card).getByText('Emilia')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: /Take a look/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Untersuche die Glocke')).toBeInTheDocument();
    expect(within(dialog).getByText('Spooky')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Start story' }));
    await waitFor(() => expect(onPlay).toHaveBeenCalled());
    expect(api.loadStageScene).toHaveBeenCalledWith('story_frozen_bells');
    expect(useAppStore.getState().stageLastScene).toBe('story_frozen_bells');
  });

  it('shows solo stories without companions', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ stageScenes: [scene('story_silent_station', { title: 'Station', story: story('scifi') })] });
    vi.mocked(api.listStageScenes).mockResolvedValue([scene('story_silent_station', { title: 'Station', story: story('scifi') })]);
    render(<StoryGallery onPlay={vi.fn()} onManage={vi.fn()} onCreate={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Open collection “Starter stories”' }));
    expect(screen.getByText(/Solo – the game master plays every character/)).toBeInTheDocument();
  });

  it('groups bundled stories, the adventure and installed hub scenes into collections', async () => {
    const user = userEvent.setup();
    const hubScene = scene('hub_sg_ep1', { title: 'Steins;Gate 1', is_preset: false, story: story('scifi'), party: ['Okabe'] });
    const scenes = [ryokan, act1, act2, bells, own, hubScene];
    useAppStore.setState({ stageScenes: scenes });
    vi.mocked(api.listStageScenes).mockResolvedValue(scenes);
    vi.mocked(api.fetchCollectionsGatewayRegistry).mockResolvedValue([
      { id: 'steins_gate', title: 'Steins;Gate', author: 'snow', description: 'Akihabara', cover_url: 'https://example.invalid/sg.webp', lorebooks: [], scenes: ['sg_ep1', 'sg_ep2'], characters: [], revision: 1, updated: '', translations: {}, nsfw: false },
    ]);
    vi.mocked(api.listInstalledHubItems).mockResolvedValue([
      { kind: 'scene', hub_id: 'sg_ep1', local_id: 'hub_sg_ep1', revision: 1, updated: '', local_sha256: '', installed_at: '' },
    ]);

    const hub = { collections: await api.fetchCollectionsGatewayRegistry(), installed: await api.listInstalledHubItems() };
    expect(galleryCollections(scenes, hub, 'en').map((c) => [c.id, c.scenes.map((sc) => sc.id), c.missing])).toEqual([
      ['starter_stories', ['story_frozen_bells', 'story_ryokan_night'], 0],
      ['crypt_of_shadows', ['akt2'], 0],
      ['hub:steins_gate', ['hub_sg_ep1'], 1],
    ]);

    render(<StoryGallery onPlay={vi.fn()} onManage={vi.fn()} onCreate={vi.fn()} />);
    // "All" shows the collections; only the own scene stays a single card.
    const hubCard = await screen.findByRole('button', { name: 'Open collection “Steins;Gate”' });
    expect(within(hubCard).getByText('1 more in the hub')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Die Glocken' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'mine' })).toBeInTheDocument();

    await user.click(hubCard);
    expect(screen.getByRole('heading', { name: 'Steins;Gate 1' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'mine' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Get the missing ones from the hub (1)' }));
    expect(useAppStore.getState().activeTab).toBe('hub');
    expect(useAppStore.getState().hubSubTab).toBe('scenes');
    expect(useHubStore.getState().openCollection).toBe('steins_gate');
  });
});
