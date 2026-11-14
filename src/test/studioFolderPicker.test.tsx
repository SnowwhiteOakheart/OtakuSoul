// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
import { open } from '@tauri-apps/plugin-dialog';
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { StudioFolderPicker } from '../components/studio/StudioFolderPicker';
import { resetApiMocks } from './mockApi';

const DEFAULT = 'C:\\Users\\Sebas\\OneDrive\\Bilder\\OtakuSoul';

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ appLanguage: 'en' });
  vi.mocked(api.getStudioFolder).mockResolvedValue({ path: DEFAULT, is_default: true });
});
afterEach(() => vi.restoreAllMocks());

describe('StudioFolderPicker', () => {
  it('shows the system folder as default, chooses another and goes back', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    vi.mocked(open).mockResolvedValue('D:\\Kunst');
    vi.mocked(api.setStudioFolder)
      .mockResolvedValueOnce({ path: 'D:\\Kunst', is_default: false })
      .mockResolvedValueOnce({ path: DEFAULT, is_default: true });
    render(<StudioFolderPicker kind="images" onChanged={onChanged} />);

    const folder = await screen.findByTestId('studio-folder');
    await waitFor(() => expect(folder).toHaveTextContent(`${DEFAULT}(default)`));
    expect(api.getStudioFolder).toHaveBeenCalledWith('images');
    // The default can't be reset any further.
    expect(screen.queryByRole('button', { name: /Default folder/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Choose folder/ }));
    expect(open).toHaveBeenCalledWith({ directory: true, defaultPath: DEFAULT });
    await waitFor(() => expect(folder).toHaveTextContent('D:\\Kunst'));
    expect(folder).not.toHaveTextContent('(default)');
    expect(api.setStudioFolder).toHaveBeenCalledWith('images', 'D:\\Kunst');

    await user.click(screen.getByRole('button', { name: /Default folder/ }));
    expect(api.setStudioFolder).toHaveBeenLastCalledWith('images', null);
    await waitFor(() => expect(folder).toHaveTextContent(`${DEFAULT}(default)`));
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('keeps the folder when the dialog is closed without a choice', async () => {
    const user = userEvent.setup();
    vi.mocked(open).mockResolvedValue(null);
    render(<StudioFolderPicker kind="songs" onChanged={vi.fn()} />);
    await screen.findByText(/default/);
    await user.click(screen.getByRole('button', { name: /Choose folder/ }));
    expect(api.setStudioFolder).not.toHaveBeenCalled();
  });
});
