// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { StoryMusicGenerator, missingTracks } from '../components/stage/StoryMusicGenerator';
import { FeedbackHost, toast } from '../components/ui/feedback';
import { resetApiMocks } from './mockApi';
import type { MusicModelInfo, PlannedMood, SceneDefinition, SceneMusicPlan } from '../types';

const mood = (name: string, count: number, installed: number): PlannedMood => ({
  mood: name, caption: 'harp', lyrics: '[Instrumental]', vocal_language: '', has_vocals: false,
  bpm: null, keyscale: '', duration: 120, count, seed: null, installed,
});
const plan: SceneMusicPlan = {
  set: 'frozen_bells', style: 'celtic', style_source: 'scene', shipped: 0, shipped_installed: 0,
  moods: [mood('calm', 2, 1), mood('combat', 1, 0)],
};
const definition = { id: 'story_frozen_bells', title: 'T', description: 'D' } as SceneDefinition;
const model = (id: string, installed: boolean, recommended = false): MusicModelInfo => ({
  id, name: `Set ${id}`, vram_mb: 6000, download_bytes: 4e9, missing_bytes: installed ? 0 : 4e9,
  installed, recommended, fits_gpu: true,
});

beforeEach(() => {
  resetApiMocks();
  localStorage.clear();
  useAppStore.setState({ appLanguage: 'en' });
  vi.mocked(api.getRuntime).mockResolvedValue({ build: 'acestep-6013134', backend: 'vulkan', server_path: '/x', library_dirs: [] });
  vi.mocked(api.listMusicModels).mockResolvedValue([model('standard', true, true), model('xl', false)]);
  vi.mocked(api.onMusicModelProgress).mockResolvedValue(() => {});
  vi.mocked(api.onMusicGenProgress).mockResolvedValue(() => {});
});

describe('StoryMusicGenerator', () => {
  it('counts the missing tracks of the plan', () => {
    expect(missingTracks(plan)).toBe(2);
    expect(missingTracks({ ...plan, moods: [mood('calm', 1, 3)] })).toBe(0);
  });

  it('generates the missing tracks with the installed model', async () => {
    const user = userEvent.setup();
    const onGenerated = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.generateSceneMusic).mockResolvedValue(2);
    render(<><StoryMusicGenerator definition={definition} plan={plan} onGenerated={onGenerated} /><FeedbackHost /></>);

    const button = await screen.findByRole('button', { name: 'Generate missing tracks (2)' });
    await user.click(button);
    expect(api.generateSceneMusic).toHaveBeenCalledWith(definition, 'standard');
    expect(await screen.findByText('2 tracks generated.')).toBeInTheDocument();
    expect(onGenerated).toHaveBeenCalled();
  });

  it('offers the download for a model that is not there and blocks generating', async () => {
    const user = userEvent.setup();
    render(<StoryMusicGenerator definition={definition} plan={plan} onGenerated={vi.fn()} />);
    await user.click(await screen.findByRole('radio', { name: /Set xl/ }));
    expect(screen.getByRole('button', { name: 'Download model (3.7 GB)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate missing tracks (2)' })).toBeDisabled();
    expect(localStorage.getItem('otakusoul.musicModel')).toBe('xl');
  });

  it('a cancel is no error', async () => {
    const user = userEvent.setup();
    const error = vi.spyOn(toast, 'error');
    vi.mocked(api.generateSceneMusic).mockRejectedValue('{"code":"backend.music.cancelled","params":{}}');
    render(<StoryMusicGenerator definition={definition} plan={plan} onGenerated={vi.fn().mockResolvedValue(undefined)} />);
    await user.click(await screen.findByRole('button', { name: 'Generate missing tracks (2)' }));
    await vi.waitFor(() => expect(api.generateSceneMusic).toHaveBeenCalled());
    expect(error).not.toHaveBeenCalled();
  });
});
