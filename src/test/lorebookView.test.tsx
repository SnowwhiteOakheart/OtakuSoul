// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { useAppStore } from '../store/useAppStore';
import { LorebookView } from '../components/lorebook/LorebookView';
import { resetApiMocks } from './mockApi';
import type { Lorebook, LorebookEntry } from '../types';

const initialState = useAppStore.getState();

const entry = (name: string): LorebookEntry => ({
  name,
  key: [name.toLowerCase()],
  secondary_keys: [],
  exclude_key: [],
  regex_keys: [],
  content: `${name} content`,
  trigger_type: 'keyword',
  probability: 100,
  priority: 10,
  enabled: true,
  injection_behavior: 'passive',
  case_sensitive: false,
  match_whole_words: false,
  chain_requires: [],
  chain_activates: [],
});

const book: Lorebook = {
  id: 'world',
  name: 'Welt',
  description: '',
  scan_depth: 5,
  is_global: false,
  entries: [entry('Castle'), entry('Dragon')],
};

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState(initialState, true);
  useAppStore.setState({ appLanguage: 'en', allLorebooks: [book], activeLorebook: book });
});

describe('LorebookView', () => {
  it('toggles the clicked entry even while the list is filtered', async () => {
    const user = userEvent.setup();
    render(<LorebookView />);

    await user.type(screen.getByRole('textbox', { name: /filter/i }), 'dragon');
    expect(screen.queryByText('Castle')).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Dragon/ }));

    const entries = useAppStore.getState().activeLorebook!.entries;
    expect(entries.find((e) => e.name === 'Dragon')!.enabled).toBe(false);
    expect(entries.find((e) => e.name === 'Castle')!.enabled).toBe(true);
  });
});
