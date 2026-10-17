// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { AVATAR_UNDO_MS, AvatarActions } from '../components/settings/AvatarActions';
import { toast } from '../components/ui/feedback';
import { resetApiMocks } from './mockApi';

const imported = { name: 'Mika', path: '/data/avatars/Mika.vrm', removable: true };

beforeEach(() => {
  resetApiMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

describe('AvatarActions', () => {
  it('renames an avatar and resets to the file name when the field is empty', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(<AvatarActions kind="vrm" entry={imported} refresh={refresh} hide={vi.fn()} unhide={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Umbenennen' }));
    const field = screen.getByLabelText('Name für Mika');
    expect(field).toHaveValue('Mika');
    fireEvent.change(field, { target: { value: 'Mika im Kimono' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Speichern' })));
    expect(api.renameAvatar).toHaveBeenCalledWith('vrm', '/data/avatars/Mika.vrm', 'Mika im Kimono');
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByLabelText('Name für Mika')).not.toBeInTheDocument();
  });

  it('opens the name field right after an import', () => {
    render(<AvatarActions kind="live2d" entry={imported} refresh={vi.fn()} hide={vi.fn()} unhide={vi.fn()} startEditing />);
    expect(screen.getByLabelText('Name für Mika')).toHaveValue('Mika');
  });

  it('removes after the undo time, and undo keeps the avatar', async () => {
    const hide = vi.fn();
    const unhide = vi.fn();
    const info = vi.spyOn(toast, 'info').mockImplementation(() => {});
    render(<AvatarActions kind="vrm" entry={imported} refresh={vi.fn().mockResolvedValue(undefined)} hide={hide} unhide={unhide} />);
    fireEvent.click(screen.getByRole('button', { name: 'Entfernen' }));
    expect(hide).toHaveBeenCalledWith('/data/avatars/Mika.vrm');
    expect(info).toHaveBeenCalledWith('„Mika“ entfernt (liegt im Papierkorb der App).', expect.objectContaining({ label: 'Rückgängig' }));
    act(() => info.mock.calls[0]![1]!.onClick());
    expect(unhide).toHaveBeenCalledWith('/data/avatars/Mika.vrm');
    await act(async () => vi.advanceTimersByTime(AVATAR_UNDO_MS + 100));
    expect(api.deleteAvatar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Entfernen' }));
    await act(async () => vi.advanceTimersByTime(AVATAR_UNDO_MS + 100));
    expect(api.deleteAvatar).toHaveBeenCalledWith('vrm', '/data/avatars/Mika.vrm');
  });

  it('keeps bundled avatars', () => {
    render(<AvatarActions kind="vrm" entry={{ ...imported, removable: false }} refresh={vi.fn()} hide={vi.fn()} unhide={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Entfernen' })).toBeDisabled();
    expect(screen.getAllByText('Mitgelieferte Avatare lassen sich nicht entfernen.').length).toBeGreaterThan(0);
  });
});
