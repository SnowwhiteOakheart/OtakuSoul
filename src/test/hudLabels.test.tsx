// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { useAppStore } from '../store/useAppStore';
import { AdaptiveHud } from '../components/chat/AdaptiveHud';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile } from '../types';

const initial = useAppStore.getState();

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ ...initial, appLanguage: 'de' }, true);
});

describe('HUD state values', () => {
  it('shows the shipped values in the interface language and keeps own names', () => {
    useAppStore.setState({
      activeCharacter: { id: 'a', card: { data: { name: 'Althea', tags: [] } }, avatar_data_url: null } as unknown as CharacterProfile,
      stateVariables: [
        { name: 'Affection', value: '45', var_type: 'progress', max_value: 100 },
        { name: 'Energy', value: '80', var_type: 'progress', max_value: 100 },
        { name: 'Mood', value: 'Glücklich', var_type: 'str' },
        { name: 'Gold', value: '12', var_type: 'progress', max_value: 50 },
      ],
    });
    render(<AdaptiveHud />);
    expect(screen.getByText('Zuneigung:')).toBeInTheDocument();
    expect(screen.getByText('Energie:')).toBeInTheDocument();
    expect(screen.getByText('Stimmung:')).toBeInTheDocument();
    expect(screen.getByText('Gold:')).toBeInTheDocument();
    expect(screen.queryByText('Affection:')).not.toBeInTheDocument();
  });
});
