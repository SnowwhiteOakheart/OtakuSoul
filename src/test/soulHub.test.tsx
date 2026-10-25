// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { useHubStore } from '../components/hub/hubStore';
import { HubView } from '../components/hub/HubView';
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
    { name: 'Ayu Ikue', author: 'snow', download_url: 'https://example.invalid/ayu.png', revision: 1, updated: '', nsfw: false },
    { name: 'Sakura', author: 'hana', download_url: 'https://example.invalid/sakura.png', revision: 2, updated: '2026-10-16', nsfw: true },
  ]);
  vi.mocked(api.fetchLorebooksGatewayRegistry).mockResolvedValue([
    { name: 'Welt', author: 'snow', description: 'Eine Welt', entry_count: 1, download_url: 'x', revision: 3, updated: '', translations: { en: { name: 'World', description: 'A world' } }, nsfw: false },
  ]);
});

const renderHub = () =>
  render(
    <>
      <HubView />
      <FeedbackHost />
    </>
  );

describe('HubView', () => {
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

    await user.click(screen.getByRole('tab', { name: /Curated characters/ }));
    expect(screen.getByRole('tab', { name: /Curated characters/ })).toHaveAttribute('aria-selected', 'true');
    expect(api.fetchSoulGatewayRegistry).toHaveBeenCalledTimes(1);
  });

  it('marks adult entries and reloads the lists when adult content is switched', async () => {
    renderHub();
    const sakura = (await screen.findByText('Sakura')).closest('article, li, div') as HTMLElement;
    expect(within(sakura.parentElement as HTMLElement).getByText('18+')).toBeInTheDocument();
    expect(api.fetchSoulGatewayRegistry).toHaveBeenCalledTimes(1);
    useAppStore.setState({ nsfwEnabled: true, adultConfirmed: true });
    useHubStore.getState().ensureLoaded('gateway');
    expect(api.fetchSoulGatewayRegistry).toHaveBeenCalledTimes(2);
  });

  it('imports a character and offers to open it in the chat', async () => {
    const user = userEvent.setup();
    vi.mocked(api.importSoulGatewayCharacter).mockResolvedValue({ profile: ayu, imported_lorebook: null });
    renderHub();

    const card = (await screen.findByRole('heading', { name: 'Ayu Ikue' })).closest('div.group') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Import' }));

    expect(api.importSoulGatewayCharacter).toHaveBeenCalledWith('Ayu Ikue', 'snow', 'https://example.invalid/ayu.png', false, 1, '');
    expect(api.scanCharacters).toHaveBeenCalled();
    const status = await screen.findByRole('status');
    await user.click(within(status).getByRole('button', { name: /Open in chat/ }));
    await vi.waitFor(() => expect(useAppStore.getState().activeTab).toBe('chat'));
  });

  it('asks before replacing a character of the same name', async () => {
    const user = userEvent.setup();
    const exists = new Error('{"code":"backend.characters.exists","params":{"name":"Ayu Ikue"}}');
    vi.mocked(api.importSoulGatewayCharacter)
      .mockRejectedValueOnce(exists)
      .mockResolvedValueOnce({ profile: ayu, imported_lorebook: null })
      .mockRejectedValueOnce(exists);
    renderHub();
    const card = (await screen.findByRole('heading', { name: 'Ayu Ikue' })).closest('div.group') as HTMLElement;

    // Confirmed: imported again with overwrite.
    await user.click(within(card).getByRole('button', { name: 'Import' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('“Ayu Ikue” already exists');
    await user.click(within(dialog).getByRole('button', { name: 'Overwrite' }));
    await vi.waitFor(() => expect(api.importSoulGatewayCharacter).toHaveBeenLastCalledWith('Ayu Ikue', 'snow', 'https://example.invalid/ayu.png', true, 1, ''));
    expect(await screen.findByRole('status')).toHaveTextContent('Ayu Ikue');

    // Declined: nothing replaced, no error.
    await user.click(within(card).getByRole('button', { name: 'Import' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.importSoulGatewayCharacter).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('marks installed entries, offers updates and keeps an edited lorebook as copy', async () => {
    const user = userEvent.setup();
    const installed = (kind: string, hub_id: string, revision: number) =>
      ({ kind, hub_id, local_id: hub_id.toLowerCase(), revision, updated: '', local_sha256: '', installed_at: '' });
    vi.mocked(api.listInstalledHubItems).mockResolvedValue([
      installed('character', 'Ayu Ikue', 1),
      installed('character', 'Sakura', 1),
      installed('lorebook', 'Welt', 1),
    ]);
    vi.mocked(api.importSoulGatewayCharacter).mockResolvedValue({ profile: ayu, imported_lorebook: null });
    renderHub();

    const ayuCard = (await screen.findByRole('heading', { name: 'Ayu Ikue' })).closest('div.group') as HTMLElement;
    expect(within(ayuCard).getByText('Installed')).toBeInTheDocument();
    const sakuraCard = screen.getByRole('heading', { name: 'Sakura' }).closest('div.group') as HTMLElement;
    expect(within(sakuraCard).getByText('Update available')).toBeInTheDocument();
    expect(screen.getByText('1 installed item has a newer version.')).toBeInTheDocument();
    // An update replaces the installed card without asking.
    await user.click(within(sakuraCard).getByRole('button', { name: 'Update' }));
    expect(api.importSoulGatewayCharacter).toHaveBeenCalledWith('Sakura', 'hana', 'https://example.invalid/sakura.png', true, 2, '2026-10-16');

    await user.click(screen.getByRole('tab', { name: /World lorebooks/ }));
    // List texts in the app language; the original name stays the key for the update.
    expect(await screen.findByRole('heading', { name: 'World' })).toBeInTheDocument();
    expect(screen.getByText('A world')).toBeInTheDocument();
    vi.mocked(api.importLorebookFromGateway)
      .mockRejectedValueOnce(new Error('{"code":"backend.hub.lorebookModified","params":{"name":"Welt"}}'))
      .mockResolvedValueOnce({ id: 'welt', name: 'Welt', entries: [{}] } as never);
    await user.click(screen.getByRole('button', { name: 'Update all' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('You changed "Welt"');
    await user.click(within(dialog).getByRole('button', { name: 'Update and keep my version' }));
    await vi.waitFor(() => expect(api.importLorebookFromGateway).toHaveBeenLastCalledWith('x', 'Welt', 3, '', true));
  });

  it('groups a story into one collection and installs it completely', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ hubSubTab: 'lorebooks' });
    vi.mocked(api.fetchLorebooksGatewayRegistry).mockResolvedValue([
      { name: 'Welt', author: 'snow', description: 'Eine Welt', entry_count: 1, download_url: 'x', revision: 3, updated: '', translations: { en: { name: 'World', description: 'A world' } }, nsfw: false },
      { name: 'Figuren', author: 'snow', description: 'Alle Figuren', entry_count: 2, download_url: 'y', revision: 1, updated: '', translations: {}, nsfw: false },
      { name: 'Allein', author: 'snow', description: 'Ohne Sammlung', entry_count: 1, download_url: 'z', revision: 1, updated: '', translations: {}, nsfw: false },
    ]);
    vi.mocked(api.fetchStagesGatewayRegistry).mockResolvedValue([
      { id: 'ep1', title: 'Folge 1', author: 'snow', description: 'Der Anfang', starting_location: 'Tor', download_url: 's', revision: 1, updated: '', translations: {}, nsfw: false },
    ]);
    vi.mocked(api.fetchCollectionsGatewayRegistry).mockResolvedValue([
      { id: 'saga', title: 'Saga', author: 'snow', description: 'Die ganze Saga', cover_url: 'https://example.invalid/cover.webp', lorebooks: ['Welt', 'Figuren', 'Fehlt'], scenes: ['ep1'], characters: ['Ayu Ikue'], revision: 1, updated: '', translations: { en: { description: 'The whole saga' } }, nsfw: false },
    ]);
    vi.mocked(api.listInstalledHubItems).mockResolvedValue([
      { kind: 'lorebook', hub_id: 'Welt', local_id: 'welt', revision: 3, updated: '', local_sha256: '', installed_at: '' },
    ]);
    vi.mocked(api.importSoulGatewayCharacter).mockResolvedValue({ profile: ayu, imported_lorebook: null });
    vi.mocked(api.importLorebookFromGateway).mockResolvedValue({ id: 'figuren', name: 'Figuren', entries: [{}, {}] } as never);
    vi.mocked(api.importSceneFromGateway).mockResolvedValue({ definition: { id: 'hub_ep1', title: 'Folge 1' } } as never);
    renderHub();

    // One card for the collection; its lorebooks no longer show on their own.
    const card = await screen.findByRole('button', { name: 'Open collection “Saga”' });
    expect(await within(card).findByText('1/4 installed')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'World' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Allein' })).toBeInTheDocument();

    await user.click(card);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('The whole saga');
    expect(within(dialog).getByText('World')).toBeInTheDocument();
    expect(within(dialog).getByText('Folge 1')).toBeInTheDocument();
    expect(within(dialog).getByText('Ayu Ikue')).toBeInTheDocument();

    // Everything not yet installed, characters first: the scene casts them by name.
    await user.click(within(dialog).getByRole('button', { name: 'Install the rest (3)' }));
    expect(await screen.findByText('“Saga”: 3 items installed.')).toBeInTheDocument();
    expect(api.importSoulGatewayCharacter).toHaveBeenCalledWith('Ayu Ikue', 'snow', 'https://example.invalid/ayu.png', false, 1, '');
    expect(api.importLorebookFromGateway).toHaveBeenCalledTimes(1);
    expect(api.importLorebookFromGateway).toHaveBeenCalledWith('y', 'Figuren', 1, '', false);
    expect(api.importSceneFromGateway).toHaveBeenCalledWith('s', 'Folge 1', 'ep1', 1, '');
    const order = [api.importSoulGatewayCharacter, api.importLorebookFromGateway, api.importSceneFromGateway].map(
      (fn) => vi.mocked(fn).mock.invocationCallOrder[0]
    );
    expect(order).toEqual([...order].sort((a, b) => a! - b!));
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
