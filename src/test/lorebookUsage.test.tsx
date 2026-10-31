// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { LorebookUsage } from '../components/lorebook/LorebookUsage';
import { chatLorebooks, scenesUsing } from '../utils/lorebookUsage';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, Lorebook, ScenePreview } from '../types';

const book = (id: string, name: string, extra: Partial<Lorebook> = {}): Lorebook => ({
  id, name, description: '', scan_depth: 5, is_global: false, file_path: `/lore/${id}.json`, entries: [], extensions: {}, ...extra,
});
const character = (id: string, bound: string[] = []) =>
  ({ id, card: { data: { name: id, extensions: {} } }, bound_lorebooks: bound, source_path: null }) as unknown as CharacterProfile;
const scene = (id: string, lorebook: string[]) => ({ id, title: id, lorebook }) as ScenePreview;

describe('lorebookUsage', () => {
  const world = book('ngnl_world', 'No Game No Life – Welt & Gebote');
  const other = book('kyoto', 'Kyoto');

  it('reads the global and bound lorebooks, by id, path or name', () => {
    expect(chatLorebooks([world, other], ['kyoto'], [character('sora')])).toEqual([other]);
    expect(chatLorebooks([world, other], [], [character('sora', ['/lore/ngnl_world.json'])])).toEqual([world]);
    // Stage NPCs are bound by the scene's lorebook names.
    expect(chatLorebooks([world, other], [], [character('npc', ['no game no life – welt & gebote'])])).toEqual([world]);
  });

  it('reads no lorebook when none is assigned', () => {
    // Another world's lore must not leak into a chat that has nothing to do with it.
    expect(chatLorebooks([world, other], [], [character('sora')])).toEqual([]);
  });

  it('finds the stories that name a lorebook', () => {
    const scenes = [scene('ep1', ['No Game No Life – Welt & Gebote']), scene('kyoto_walk', ['Kyoto']), scene('free', [])];
    expect(scenesUsing(world, scenes).map((s) => s.id)).toEqual(['ep1']);
  });
});

describe('LorebookUsage', () => {
  const world = book('ngnl_world', 'No Game No Life – Welt & Gebote');

  beforeEach(() => {
    resetApiMocks();
    useAppStore.setState({
      appLanguage: 'en',
      globalLorebookIds: [],
      availableCharacters: [character('Sora', ['ngnl_world']), character('Shiro')],
      stageScenes: [scene('Episode 1', ['No Game No Life – Welt & Gebote'])],
    });
  });

  it('shows bound characters and the stories that use the lorebook', () => {
    render(<LorebookUsage lorebook={world} />);
    expect(screen.getByText('Sora')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Episode 1' })).toBeInTheDocument();
  });

  it('unbinds a character by any reference to the lorebook', async () => {
    vi.mocked(api.saveCharacterCard).mockImplementation(async (p) => p);
    const user = userEvent.setup();
    render(<LorebookUsage lorebook={world} />);
    await user.click(screen.getByRole('button', { name: /Sora/ }));
    expect(vi.mocked(api.saveCharacterCard).mock.calls[0]![0].bound_lorebooks).toEqual([]);
  });
});
