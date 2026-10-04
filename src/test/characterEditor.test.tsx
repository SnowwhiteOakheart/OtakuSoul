// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { CharacterEditorModal } from '../components/characters/CharacterEditorModal';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile } from '../types';

const initial = useAppStore.getState();
const existing: CharacterProfile = {
  id: 'ayu_ikue',
  source_path: '/cards/ayu.png',
  bound_lorebooks: ['kyoto'],
  card: {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: 'Ayu Ikue',
      description: 'Studentin aus Kyoto.',
      personality: 'warm',
      scenario: '',
      first_mes: 'Hallo!',
      mes_example: '',
      alternate_greetings: ['Na du?'],
      tags: ['Slice of Life'],
      extensions: { sow_title: 'Die Reiseführerin', depth_prompt: { depth: 4 } },
    },
  },
};

const onSaved = vi.fn();
const onClose = vi.fn();
const open = (character: CharacterProfile | null) => {
  render(<CharacterEditorModal character={character} onClose={onClose} onSaved={onSaved} />);
  return userEvent.setup();
};
const saved = () => vi.mocked(api.saveCharacterCard).mock.calls.at(-1)![0];

beforeEach(() => {
  resetApiMocks();
  vi.clearAllMocks();
  useAppStore.setState({ ...initial, appLanguage: 'en' }, true);
  vi.mocked(api.saveCharacterCard).mockImplementation(async (profile) => profile);
  vi.mocked(api.scanCharacters).mockResolvedValue([]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('character editor', () => {
  it('requires a name before saving', async () => {
    const user = open(null);
    await user.click(screen.getByRole('button', { name: 'Save character' }));
    expect(await screen.findByText('Please give the character a name.')).toBeInTheDocument();
    expect(api.saveCharacterCard).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('builds a trimmed V2 card from all tabs for a new character', async () => {
    const user = open(null);
    await user.type(screen.getByLabelText('Character name *'), '  Rin Tohsaka ');
    await user.type(screen.getByLabelText(/Tags/), 'Magierin, , Tsundere');
    await user.click(screen.getByRole('tab', { name: /prompts/i }));
    await user.type(screen.getByLabelText('Description / background'), ' Eine Magierin. ');
    await user.click(screen.getByRole('tab', { name: /Greetings/ }));
    await user.type(screen.getByLabelText('Main greeting (first message) *'), 'Hmpf.');
    await user.type(screen.getByRole('textbox', { name: /alternative greeting/ }), 'Schon wieder du?');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('tab', { name: 'Greetings (2)' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save character' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const profile = saved();
    expect(profile.id).toBe('rin_tohsaka');
    expect(profile.card.data).toMatchObject({
      name: 'Rin Tohsaka',
      description: 'Eine Magierin.',
      first_mes: 'Hmpf.',
      alternate_greetings: ['Schon wieder du?'],
      tags: ['Magierin', 'Tsundere'],
      system_prompt: undefined,
    });
    expect(api.scanCharacters).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps id, path, lorebooks and foreign extensions and migrates legacy fields', async () => {
    const user = open(existing);
    expect(screen.getByLabelText(/Title/)).toHaveValue('Die Reiseführerin');
    await user.click(screen.getByRole('tab', { name: /Greetings/ }));
    await user.click(screen.getByRole('button', { name: 'Remove greeting' }));
    await user.click(screen.getByRole('button', { name: 'Save character' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const profile = saved();
    expect(profile).toMatchObject({ id: 'ayu_ikue', source_path: '/cards/ayu.png', bound_lorebooks: ['kyoto'] });
    expect(profile.card.data.alternate_greetings).toEqual([]);
    const extensions = profile.card.data.extensions as Record<string, unknown>;
    expect(extensions.custom_title).toBe('Die Reiseführerin');
    expect(extensions).not.toHaveProperty('sow_title');
    expect(extensions.depth_prompt).toEqual({ depth: 4 });
  });

  it('shows a failed save and stays open for another try', async () => {
    vi.mocked(api.saveCharacterCard).mockRejectedValueOnce(new Error('Disk full'));
    const user = open(existing);
    await user.click(screen.getByRole('button', { name: 'Save character' }));
    expect(await screen.findByText('Saving failed: Disk full')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Character name *')).toHaveValue('Ayu Ikue');

    await user.click(screen.getByRole('button', { name: 'Save character' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(screen.queryByText('Saving failed: Disk full')).not.toBeInTheDocument();
  });
});
