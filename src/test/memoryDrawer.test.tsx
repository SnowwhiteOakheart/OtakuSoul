// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { CognitiveMemoryDrawer } from '../components/chat/CognitiveMemoryDrawer';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, CognitiveOverview } from '../types';

const initialState = useAppStore.getState();

const overview: CognitiveOverview = {
  psychology: {
    primary_emotion: 'joy',
    intensity: 3,
    psychological_tension: 'Neugier',
    emotional_decay_counter: 0,
    active_agenda: 'Den Nutzer kennenlernen',
    immediate_focus: 'Gespräch',
    core_identity: ['Loyal'],
    updated_at: 0,
  },
  relationship: {
    user_name: 'Snow',
    trust_level: 'Hoch',
    unspoken_tension: 'Keine',
    preferences_habits: ['Tee'],
    shared_milestones: ['Erstes Treffen'],
    updated_at: 0,
  },
  recent_memories: [],
  recent_diary: [],
  healing_logs: [],
};

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState(initialState, true);
  useAppStore.setState({
    appLanguage: 'en',
    activeCharacter: { id: 'ayu', card: { data: { name: 'Ayu' } } } as CharacterProfile,
    cognitiveOverview: overview,
    characterMarkdown: '# Ayu',
    userMarkdown: '# Snow',
  });
  // Opening the drawer refreshes everything; keep the prepared state.
  vi.mocked(api.getCognitiveOverview).mockResolvedValue(overview);
  vi.mocked(api.getCharacterMemoryMarkdown).mockResolvedValue('# Ayu');
  vi.mocked(api.getUserMemoryMarkdown).mockResolvedValue('# Snow');
  vi.mocked(api.listMemoryBackups).mockResolvedValue([]);
});

describe('CognitiveMemoryDrawer', () => {
  it('renders every tab without crashing', async () => {
    const user = userEvent.setup();
    render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(7);
    for (const tab of tabs) {
      await user.click(tab);
      expect(tab).toHaveAttribute('aria-selected', 'true');
      expect(screen.queryByText(/View crashed/)).not.toBeInTheDocument();
    }
  });

  it('keeps unsaved markdown edits per file and saves the edited one', async () => {
    const user = userEvent.setup();
    const saveCharacterMarkdown = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({ saveCharacterMarkdown });
    render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);

    await user.click(screen.getAllByRole('tab')[2]!);
    const editor = screen.getByRole('textbox');
    expect(editor).toHaveValue('# Ayu');
    await user.type(editor, ' edited');

    const [charButton, userButton] = screen
      .getAllByRole('button')
      .filter((b) => b.textContent?.includes('MEMORY.md') || b.textContent?.includes('USER.md'));
    await user.click(userButton!);
    expect(screen.getByRole('textbox')).toHaveValue('# Snow');
    await user.click(charButton!);
    expect(screen.getByRole('textbox')).toHaveValue('# Ayu edited');

    await user.click(screen.getByRole('button', { name: 'Save to database' }));
    expect(saveCharacterMarkdown).toHaveBeenCalledWith('# Ayu edited');
  });

  it('renders nothing while closed', () => {
    const { container } = render(<CognitiveMemoryDrawer isOpen={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
