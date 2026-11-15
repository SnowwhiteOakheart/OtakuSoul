import { beforeEach, describe, expect, it, vi } from 'vitest';

// The sandbox runs QuickJS in a worker; here a stand-in applies the "script" directly.
vi.mock('../services/scriptSandbox', () => ({
  runUserScript: vi.fn(async (code: string, text: string, info: { role: string; stage: string }) =>
    code.includes('throw') ? { ok: false, error: 'Error: kaputt' } : { ok: true, text: `${text}|${code.trim()}:${info.role}/${info.stage}` },
  ),
}));

import { runUserScript } from '../services/scriptSandbox';
import { NEW_RULE, applyScripts, applyScriptsAsync, forPromptAsync, scriptError } from '../utils/replyFilters';
import type { ReplyReplacement } from '../types';

const rule = (over: Partial<ReplyReplacement>): ReplyReplacement => ({ ...NEW_RULE, ...over });

beforeEach(() => {
  vi.mocked(runUserScript).mockClear();
});

describe('JavaScript rules in the reply pipeline', () => {
  it('runs scripts in their place among find/replace rules', async () => {
    const rules = [rule({ find: 'a', replace: 'b' }), rule({ code: 'S1' }), rule({ find: 'S1', replace: 'X' })];
    expect(await applyScriptsAsync('a', rules, 'assistant', 'save')).toBe('b|X:assistant/save');
  });

  it('keeps the text when a script fails and remembers the error for the settings', async () => {
    const rules = [rule({ code: 'throw' }), rule({ find: 'Hallo', replace: 'Hi' })];
    expect(await applyScriptsAsync('Hallo', rules, 'assistant', 'save')).toBe('Hi');
    expect(scriptError('throw')).toBe('Error: kaputt');
  });

  it('respects direction, stage and switched-off rules', async () => {
    const rules = [rule({ code: 'IN', on_input: true, on_output: false }), rule({ code: 'OFF', disabled: true }), rule({ code: 'P', mode: 'prompt' })];
    expect(await applyScriptsAsync('t', rules, 'user', 'save')).toBe('t|IN:user/save');
    expect(await applyScriptsAsync('t', rules, 'assistant', 'save')).toBe('t');
    expect(runUserScript).toHaveBeenCalledTimes(1);
  });

  it('leaves the sandbox alone without script rules, and sync callers skip scripts', async () => {
    expect(await applyScriptsAsync('a', [rule({ find: 'a', replace: 'b' })], 'assistant', 'save')).toBe('b');
    expect(applyScripts('a', [rule({ code: 'S' }), rule({ find: 'a', replace: 'c' })], 'assistant', 'save')).toBe('c');
    expect(runUserScript).not.toHaveBeenCalled();
  });

  it('changes only user and assistant messages for the prompt', async () => {
    const messages = [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }, { role: 'assistant', content: 'a' }];
    const out = await forPromptAsync(messages, [rule({ code: 'P', mode: 'prompt', on_input: true })]);
    expect(out.map((m) => m.content)).toEqual(['s', 'u|P:user/prompt', 'a|P:assistant/prompt']);
  });
});
