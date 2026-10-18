// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { applyReplacements, ruleError } from '../utils/replyFilters';
import { useAppStore } from '../store/useAppStore';
import { ReplyFilterSettings } from '../components/settings/ReplyFilterSettings';
import { resetApiMocks } from './mockApi';

const initial = useAppStore.getState();
beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ ...initial, appLanguage: 'en', saveCurrentSettings: vi.fn() }, true);
});

describe('reply filters', () => {
  it('replaces plain text and regular expressions in order, skipping broken rules', () => {
    const rules = [
      { find: 'Kyoto', replace: 'Kioto', regex: false },
      { find: '(\\d+) Tore', replace: '$1 leuchtende Tore', regex: true },
      { find: '([', replace: 'x', regex: true },
      { find: '', replace: 'nichts', regex: false },
    ];
    expect(applyReplacements('In Kyoto gibt es 1000 Tore. Kyoto!', rules)).toBe('In Kioto gibt es 1000 leuchtende Tore. Kioto!');
    expect(ruleError(rules[2]!)).toBeTruthy();
    expect(ruleError(rules[1]!)).toBeNull();
  });

  it('saves the phrase list on leaving the field and edits rules in expert mode', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ expertMode: true });
    render(<ReplyFilterSettings />);
    const phrases = screen.getByRole('textbox', { name: 'Avoid these words and phrases' });
    await user.type(phrases, 'Schauer{Enter} {Enter}Ozon');
    expect(useAppStore.getState().avoidPhrases).toEqual([]);
    fireEvent.blur(phrases);
    expect(useAppStore.getState().avoidPhrases).toEqual(['Schauer', 'Ozon']);

    await user.click(screen.getByRole('button', { name: 'Add rule' }));
    const find = screen.getByRole('textbox', { name: 'Find' });
    await user.type(find, '((');
    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('alert').textContent).toContain('Invalid expression');
    expect(useAppStore.getState().replyReplacements).toEqual([{ find: '((', replace: '', regex: true }]);
    await user.click(screen.getByRole('button', { name: 'Remove rule' }));
    expect(useAppStore.getState().replyReplacements).toEqual([]);
  });
});
