// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { useHubStore } from '../components/hub/hubStore';
import { SoulHubView } from '../components/hub/SoulHubView';
import { FeedbackHost } from '../components/ui/feedback';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile } from '../types';

const appInitial = useAppStore.getState();
const hubInitial = useHubStore.getState();

const ayu = { id: 'ayu', card: { data: { name: 'Ayu Ikue' } } } as CharacterProfile;

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState(appInitial, true);
  useHubStore.setState(hubInitial, true);
  useAppStore.setState({ appLanguage: 'en', hubSubTab: 'soul_gateway' });
  vi.mocked(api.fetchSoulGatewayRegistry).mockResolvedValue([
    { name: 'Ayu Ikue', author: 'snow', download_url: 'https://example.invalid/ayu.png' },
    { name: 'Sakura', author: 'hana', download_url: 'https://example.invalid/sakura.png' },
  ]);
  vi.mocked(api.fetchLorebooksGatewayRegistry).mockResolvedValue([
    { name: 'Welt', author: 'snow', description: 'Eine Welt', entry_count: 1, download_url: 'x' },
  ]);
});

const renderHub = () =>
  render(
    <>
      <SoulHubView />
      <FeedbackHost />
    </>
  );

describe('SoulHubView', () => {
  it('loads the gateway once, filters locally and caches across tab switches', async () => {
    const user = userEvent.setup();
    renderHub();

    expect(await screen.findByText('Sakura')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), 'ayu');
    expect(screen.queryByText('Sakura')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ayu Ikue' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /World lorebooks/ }));
    await user.clear(screen.getByRole('searchbox'));
    expect(await screen.findByText('1 entry')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Soul Gateway/ }));
    expect(screen.getByRole('tab', { name: /Soul Gateway/ })).toHaveAttribute('aria-selected', 'true');
    expect(api.fetchSoulGatewayRegistry).toHaveBeenCalledTimes(1);
  });

  it('imports a character and offers to open it in the chat', async () => {
    const user = userEvent.setup();
    vi.mocked(api.importSoulGatewayCharacter).mockResolvedValue({ profile: ayu, imported_lorebook: null });
    renderHub();

    const card = (await screen.findByRole('heading', { name: 'Ayu Ikue' })).closest('div.group') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Import' }));

    expect(api.importSoulGatewayCharacter).toHaveBeenCalledWith('Ayu Ikue', 'snow', 'https://example.invalid/ayu.png');
    expect(api.scanCharacters).toHaveBeenCalled();
    const status = await screen.findByRole('status');
    await user.click(within(status).getByRole('button', { name: /Open in chat/ }));
    await vi.waitFor(() => expect(useAppStore.getState().activeTab).toBe('chat'));
  });

  it('shows load errors with a retry that does not loop', async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchSoulGatewayRegistry).mockRejectedValueOnce(new Error('offline'));
    renderHub();

    expect(await screen.findByRole('alert')).toHaveTextContent('offline');
    expect(api.fetchSoulGatewayRegistry).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Sakura')).toBeInTheDocument();
    expect(api.fetchSoulGatewayRegistry).toHaveBeenCalledTimes(2);
  });
});
