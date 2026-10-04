// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { useAppStore } from '../store/useAppStore';
import { Header } from '../components/Header';
import { resetApiMocks } from './mockApi';

const initial = useAppStore.getState();
// The header starts the app on mount; keep that out of these tests.
const quiet = { initApp: vi.fn(), fetchHardware: vi.fn(), fetchServerStatus: vi.fn() };

beforeEach(() => {
  resetApiMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  useAppStore.setState({ ...initial, ...quiet, appLanguage: 'en', settingsLoaded: true }, true);
});

describe('header status', () => {
  it('shows the cloud model instead of a stopped local server', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ selectedBackend: 'cloud', cloudModel: 'anthropic/claude-sonnet-5', serverStatus: { ...initial.serverStatus, state: 'stopped' } });
    render(<Header onOpenCommandPalette={() => {}} />);
    expect(screen.getByText('Cloud')).toBeInTheDocument();
    expect(screen.getByText('anthropic/claude-sonnet-5')).toBeInTheDocument();
    expect(screen.queryByText('Server stopped')).not.toBeInTheDocument();
    await user.click(screen.getByTitle('Set up the cloud provider and model'));
    expect(useAppStore.getState()).toMatchObject({ activeTab: 'settings', pendingSettingsSection: 'providers' });
  });

  it('shows the local server state with the local backend', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ selectedBackend: 'local', serverStatus: { ...initial.serverStatus, state: 'stopped' } });
    render(<Header onOpenCommandPalette={() => {}} />);
    expect(screen.getByText('Server stopped')).toBeInTheDocument();
    expect(screen.queryByText('Cloud')).not.toBeInTheDocument();
    await user.click(screen.getByText('Server stopped'));
    expect(useAppStore.getState().pendingSettingsSection).toBe('server');
  });

  it('shows no backend status before the settings are loaded', () => {
    useAppStore.setState({ settingsLoaded: false, serverStatus: { ...initial.serverStatus, state: 'stopped' } });
    render(<Header onOpenCommandPalette={() => {}} />);
    expect(screen.queryByText('Server stopped')).not.toBeInTheDocument();
    expect(screen.queryByText('Cloud')).not.toBeInTheDocument();
  });
});
