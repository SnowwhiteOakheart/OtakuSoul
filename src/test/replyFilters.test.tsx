// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { NEW_RULE, applyReplacements, applyScripts, forPrompt, importSillyTavernScripts, ruleError, withDefaults } from '../utils/replyFilters';
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
    ].map(withDefaults);
    expect(applyReplacements('In Kyoto gibt es 1000 Tore. Kyoto!', rules)).toBe('In Kioto gibt es 1000 leuchtende Tore. Kioto!');
    expect(ruleError(rules[2]!)).toBeTruthy();
    expect(ruleError(rules[1]!)).toBeNull();
  });

  it('applies scripts by role and stage, with /pattern/flags', () => {
    const rules = [
      withDefaults({ find: '/<think>[\\s\\S]*?<\\/think>/g', replace: '', regex: true, mode: 'display' }),
      withDefaults({ find: 'OOC:', replace: '((', regex: false, on_input: true, on_output: false }),
      withDefaults({ find: '/hallo/i', replace: 'Hi', regex: true, on_input: true, mode: 'prompt' }),
      withDefaults({ find: 'weg', replace: '', disabled: true }),
    ];
    const reply = '<think>geheim</think>Hallo weg';
    expect(applyScripts(reply, rules, 'assistant', 'display')).toBe('Hallo weg');
    expect(applyScripts(reply, rules, 'assistant', 'save')).toBe(reply);
    expect(applyScripts('OOC: kurz', rules, 'user', 'save')).toBe('(( kurz');
    expect(applyScripts('OOC: kurz', rules, 'assistant', 'save')).toBe('OOC: kurz');
    const prompt = forPrompt([{ role: 'user', content: 'HALLO da' }, { role: 'system', content: 'hallo' }], rules);
    expect(prompt.map((m) => m.content)).toEqual(['Hi da', 'hallo']);
  });

  it('imports SillyTavern regex scripts', () => {
    const { rules, skipped } = importSillyTavernScripts([
      { scriptName: 'Gedanken weg', findRegex: '/<think>.*?<\\/think>/gs', replaceString: '', placement: [2], markdownOnly: true },
      { scriptName: 'Fett', findRegex: '/\\*\\*(.+?)\\*\\*/g', replaceString: '<b>{{match}}</b>', placement: [1, 2], promptOnly: true, disabled: true },
      { scriptName: 'Slash', findRegex: '/x/', replaceString: '', placement: [3] },
    ]);
    expect(skipped).toBe(1);
    expect(rules).toEqual([
      { ...NEW_RULE, name: 'Gedanken weg', find: '/<think>.*?<\\/think>/gs', regex: true, mode: 'display' },
      { ...NEW_RULE, name: 'Fett', find: '/\\*\\*(.+?)\\*\\*/g', replace: '<b>$&</b>', regex: true, on_input: true, disabled: true, mode: 'prompt' },
    ]);
    expect(() => importSillyTavernScripts({ name: 'kein Skript' })).toThrow();
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
    await user.click(screen.getByRole('checkbox', { name: 'RegEx' }));
    expect(screen.getByRole('alert').textContent).toContain('Invalid expression');
    expect(useAppStore.getState().replyReplacements).toEqual([{ ...NEW_RULE, find: '((', regex: true }]);
    await user.click(screen.getByRole('button', { name: 'Remove rule' }));
    expect(useAppStore.getState().replyReplacements).toEqual([]);
  });
});
