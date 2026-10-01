// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { SceneCreateModal } from '../components/stage/SceneCreateModal';
import { resetApiMocks } from './mockApi';
import type { SceneDefinition, SceneState } from '../types';

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ appLanguage: 'en', availableCharacters: [], allLorebooks: [], isProcessingStageTurn: false });
  vi.mocked(api.listStageScenes).mockResolvedValue([]);
  vi.mocked(api.listAllLorebooks).mockResolvedValue([]);
  vi.mocked(api.listStageAssets).mockResolvedValue({ backgrounds: [], ambient: [] });
});

describe('SceneCreateModal', () => {
  it('shows why creating failed and keeps the entered values', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createStageScene).mockRejectedValue(new Error('Disk full'));
    const onCreated = vi.fn();
    render(<SceneCreateModal isOpen onClose={() => {}} onCreated={onCreated} />);

    const title = screen.getByLabelText(/title/i, { selector: '#scene-title' });
    await user.type(title, 'Die verlassene Burg');
    await user.click(screen.getByRole('button', { name: 'Start scene' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Disk full');
    expect(title).toHaveValue('Die verlassene Burg');
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Start scene' })).toBeEnabled();
  });

  it('hands the created scene to the caller and closes', async () => {
    const user = userEvent.setup();
    const created = { definition: { id: 'scene_custom_1', title: 'Burg' } } as SceneState;
    vi.mocked(api.createStageScene).mockResolvedValue(created);
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(<SceneCreateModal isOpen onClose={onClose} onCreated={onCreated} />);

    await user.type(screen.getByLabelText(/title/i, { selector: '#scene-title' }), 'Burg');
    await user.click(screen.getByRole('button', { name: 'Start scene' }));

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(created.definition));
    expect(onClose).toHaveBeenCalled();
  });
  it('edits settings, preserves missing bindings and displays save errors without losing the draft', async () => {
    const user = userEvent.setup();
    const definition = { id: 'scene-existing', title: 'Burg', description: '', world_context: '', starting_location: 'Turm', time_of_day: 'Nacht', opening_narration: '', first_message: '', party: ['Missing companion'], gm_tone: 'Custom tone', narrator_style: '', persona: '', lorebook: ['missing-book'], solo_mode: false, max_actor_depth: 2, dice_rolls_enabled: false, starting_bg: 'lost.png', starting_ambient: 'wind.ogg', created_at: 'original' } as SceneDefinition;
    vi.mocked(api.updateStageSceneDefinition).mockRejectedValue(new Error('Disk full'));
    render(<SceneCreateModal isOpen definition={definition} onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByRole('button', { name: 'Missing companion' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('checkbox', { name: 'missing-book' })).toBeChecked();
    expect(screen.getByLabelText('Starting background')).toHaveValue('lost.png');
    await user.clear(screen.getByLabelText('Maximum actors per turn (1–6)'));
    await user.type(screen.getByLabelText('Maximum actors per turn (1–6)'), '4');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Disk full');
    expect(api.updateStageSceneDefinition).toHaveBeenCalledWith(expect.objectContaining({ id: 'scene-existing', max_actor_depth: 4, opening_narration: '', lorebook: ['missing-book'], party: ['Missing companion'], starting_ambient: 'wind.ogg' }));
    expect(api.createStageScene).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Maximum actors per turn (1–6)')).toHaveValue(4);
  });

});
