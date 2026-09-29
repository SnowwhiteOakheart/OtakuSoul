// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { SceneCreateModal } from '../components/stage/SceneCreateModal';
import { resetApiMocks } from './mockApi';
import type { SceneState } from '../types';

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ appLanguage: 'en', availableCharacters: [] });
  vi.mocked(api.listStageScenes).mockResolvedValue([]);
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
});
