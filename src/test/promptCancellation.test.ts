import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../services/soundFx', () => ({ soundFx: { playWarning: vi.fn() } }));
import { api } from '../services/api';
import { soundFx } from '../services/soundFx';
import { resolvePromptWithLore } from '../store/helpers';
import { useAppStore } from '../store/useAppStore';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, EvaluatedLoreResult } from '../types';

beforeEach(() => { resetApiMocks(); vi.clearAllMocks(); });

it.each(['resolve', 'reject'] as const)('stops waiting for lore and ignores a late %s without fallback or tension changes', async (outcome) => {
  let finish!: (value: EvaluatedLoreResult) => void;
  let fail!: (reason: Error) => void;
  vi.mocked(api.evaluateMultiLorebooks).mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
  const setCurrentTension = vi.fn();
  const state = { ...useAppStore.getState(), activeCharacter: { id: 'ayu', card: { data: { name: 'Ayu' } } } as CharacterProfile,
    allLorebooks: [{ name: 'Test', description: '', entries: [], is_global: true }], setCurrentTension };
  const controller = new AbortController();
  const pending = resolvePromptWithLore(state, [], 'danger', controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await Promise.resolve();
  expect(api.evaluateMultiLorebooks).toHaveBeenCalledOnce();
  controller.abort();
  await rejected;
  if (outcome === 'resolve') finish({ passive_entries: [], active_entries: [], activated_entry_names: [], triggered_tension_events: ['old'], new_tension: 99 });
  else fail(new Error('Late lore error'));
  await Promise.resolve();
  await Promise.resolve();
  expect(api.evaluateLorebookContext).not.toHaveBeenCalled();
  expect(api.assemblePrompt).not.toHaveBeenCalled();
  expect(setCurrentTension).not.toHaveBeenCalled();
  expect(soundFx.playWarning).not.toHaveBeenCalled();
});
