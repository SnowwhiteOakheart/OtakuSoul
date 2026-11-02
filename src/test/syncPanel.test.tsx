// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn().mockResolvedValue('/home/me/Nextcloud/OtakuSoul') }));

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { SyncPanel } from '../components/integrations/tabs/SyncPanel';
import { SYNC_CHECK_DELAY_MS, useSyncUpdateCheck } from '../hooks/useSyncUpdateCheck';
import { FeedbackHost, toast } from '../components/ui/feedback';
import { resetApiMocks } from './mockApi';
import type { SyncConfig, SyncSnapshot } from '../types';

const groups = { characters: true, lorebooks: true, personas: true, memory: true, stage: true, companion: true, settings: false };
const config = (patch: Partial<SyncConfig> = {}): SyncConfig => ({
  kind: 'off', folder: '', webdav_url: '', webdav_user: '', webdav_password: '',
  device_id: 'aaaaaaaaaaaaaaaa', device_name: 'Laptop', keep: 5, groups, last_sync_at: null, ...patch,
});
const snapshot = (patch: Partial<SyncSnapshot> = {}): SyncSnapshot => ({
  device_id: 'bbbbbbbbbbbbbbbb', device_name: 'Desktop', filename: 'otakusoul_backup_1.zip',
  created_at: '2026-11-02T12:00:00Z', size_bytes: 3 * 1024 ** 2, app_version: '0.7.1', groups, description: null, own: false, ...patch,
});

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ appLanguage: 'en' });
});

describe('SyncPanel', () => {
  it('sets up a folder target, checks and saves it', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getSyncConfig).mockResolvedValue(config());
    vi.mocked(api.testSyncTarget).mockResolvedValue(2);
    vi.mocked(api.saveSyncConfig).mockImplementation(async (c) => c);
    vi.mocked(api.listSyncSnapshots).mockResolvedValue([]);
    render(<><SyncPanel onRestored={vi.fn()} /><FeedbackHost /></>);

    expect(await screen.findByText(/Sync is off/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Shared folder' }));
    await user.click(screen.getByRole('button', { name: 'Choose folder' }));
    expect(screen.getByRole('textbox', { name: 'Folder' })).toHaveValue('/home/me/Nextcloud/OtakuSoul');
    expect(screen.getByRole('checkbox', { name: /App settings/ })).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Check connection' }));
    expect(await screen.findByText(/2 states found/)).toBeInTheDocument();
    expect(api.testSyncTarget).toHaveBeenCalledWith(expect.objectContaining({ kind: 'folder', folder: '/home/me/Nextcloud/OtakuSoul' }));

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.listSyncSnapshots).toHaveBeenCalled());
    expect(await screen.findByText('No states at the sync target yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload now' })).toBeEnabled();
  });

  it('lists the states, shows a newer one and restores it', async () => {
    const user = userEvent.setup();
    const onRestored = vi.fn();
    const saved = config({ kind: 'folder', folder: '/sync', last_sync_at: '2026-11-02T10:00:00Z' });
    vi.mocked(api.getSyncConfig).mockResolvedValue(saved);
    vi.mocked(api.listSyncSnapshots).mockResolvedValue([
      snapshot(),
      snapshot({ device_id: 'aaaaaaaaaaaaaaaa', device_name: 'Laptop', filename: 'own.zip', created_at: '2026-11-02T10:00:00Z', own: true }),
    ]);
    vi.mocked(api.restoreSyncSnapshot).mockResolvedValue('');
    render(<><SyncPanel onRestored={onRestored} /><FeedbackHost /></>);

    expect(await screen.findByTestId('sync-newer')).toHaveTextContent('Newer state from “Desktop”');
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[1]!).getByText('this device')).toBeInTheDocument();
    expect(within(items[0]!).getByText(/3\.0 MB · Version 0\.7\.1/)).toBeInTheDocument();

    vi.mocked(api.getSyncConfig).mockResolvedValue({ ...saved, last_sync_at: '2026-11-02T12:00:00Z' });
    await user.click(within(items[0]!).getByRole('button', { name: 'Restore' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(api.restoreSyncSnapshot).toHaveBeenCalledWith('bbbbbbbbbbbbbbbb', 'otakusoul_backup_1.zip'));
    await waitFor(() => expect(onRestored).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('sync-newer')).toBeNull());
  });

  it('uploads only after the target change was saved', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getSyncConfig).mockResolvedValue(config({ kind: 'webdav', webdav_url: 'https://dav.example/' }));
    vi.mocked(api.listSyncSnapshots).mockResolvedValue([]);
    vi.mocked(api.uploadSyncSnapshot).mockResolvedValue(snapshot({ own: true }));
    render(<><SyncPanel onRestored={vi.fn()} /><FeedbackHost /></>);

    const upload = await screen.findByRole('button', { name: 'Upload now' });
    await user.type(screen.getByLabelText('Password'), 'x');
    expect(upload).toBeDisabled();
    expect(screen.getByText(/Save the changes/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Password'));
    expect(upload).toBeEnabled();
    await user.click(upload);
    await waitFor(() => expect(api.uploadSyncSnapshot).toHaveBeenCalled());
    expect(await screen.findByText(/uploaded\./)).toBeInTheDocument();
  });

  it('shows why the target cannot be listed', async () => {
    vi.mocked(api.getSyncConfig).mockResolvedValue(config({ kind: 'webdav', webdav_url: 'https://dav.example/' }));
    vi.mocked(api.listSyncSnapshots).mockRejectedValue('{"code":"backend.sync.auth","params":{}}');
    render(<SyncPanel onRestored={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('rejects the user name or password');
  });
});

describe('useSyncUpdateCheck', () => {
  const Probe = ({ enabled }: { enabled: boolean }) => {
    useSyncUpdateCheck(enabled);
    return null;
  };
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tells about a newer state of another device after the start', async () => {
    const info = vi.spyOn(toast, 'info');
    vi.mocked(api.checkSyncUpdates).mockResolvedValue(snapshot());
    render(<Probe enabled />);
    expect(api.checkSyncUpdates).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNC_CHECK_DELAY_MS);
    });
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/Newer state from “Desktop”/), expect.anything());
    info.mock.calls[0]![1]!.onClick();
    expect(useAppStore.getState().activeTab).toBe('integrations');
    expect(useAppStore.getState().integrationsTab).toBe('backup');
  });

  it('stays silent when disabled, without news or offline', async () => {
    const info = vi.spyOn(toast, 'info');
    vi.mocked(api.checkSyncUpdates).mockRejectedValue('offline');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { unmount } = render(<Probe enabled />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNC_CHECK_DELAY_MS);
    });
    expect(info).not.toHaveBeenCalled();
    unmount();
    render(<Probe enabled={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNC_CHECK_DELAY_MS);
    });
    expect(api.checkSyncUpdates).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
