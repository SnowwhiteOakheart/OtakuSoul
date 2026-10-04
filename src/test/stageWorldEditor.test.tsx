// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { StageWorldEditor } from '../components/stage/StageWorldEditor';
import { toast } from '../components/ui/feedback';
import { resetApiMocks } from './mockApi';
import type { SceneState } from '../types';

const initial = useAppStore.getState();
const scene = {
  definition: { id: 'scene-1', party: ['Ayu'] },
  world: { key_facts: { tor_status: 'verschlossen' } },
  arcs: [
    { id: 'arc-open', title: 'Das Tor', description: '', stage: 1, max_stage: 3, is_revealed: true, is_resolved: false },
    { id: 'arc-hidden', title: 'HIDDEN_TRAITOR', description: '', stage: 0, max_stage: 2, is_revealed: false, is_resolved: false },
  ],
  objectives: [],
  relationships: [],
  inventory: [],
  overlays: [{ name: 'Ayu', current_role: 'Hüterin', arc_stage: '', facts: { wunde: 'linker Arm' } }],
  lore_cards: [],
  chat_log: [],
} as unknown as SceneState;
const onClose = vi.fn();
const saved = () => vi.mocked(api.saveStageScene).mock.calls.at(-1)![0];

beforeEach(() => {
  resetApiMocks();
  vi.clearAllMocks();
  useAppStore.setState({ ...initial, appLanguage: 'en', stageState: scene }, true);
  vi.spyOn(toast, 'error').mockImplementation(() => {});
  vi.spyOn(toast, 'success').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const open = () => {
  render(<StageWorldEditor onClose={onClose} />);
  return userEvent.setup();
};
const saveButton = () => screen.getByRole('button', { name: /^Save/ });

describe('stage world editor', () => {
  it('hides unrevealed arcs until the spoiler switch is on', async () => {
    const user = open();
    expect(screen.queryByDisplayValue('HIDDEN_TRAITOR')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /hidden/i }));
    expect(screen.getByDisplayValue('HIDDEN_TRAITOR')).toBeInTheDocument();
  });

  it('saves edits into the newest scene, drops empty entries and parses overlay facts', async () => {
    const user = open();
    // A turn finishes while the editor is open.
    act(() => useAppStore.setState({ stageState: { ...scene, chat_log: [{ id: 'new-line' }] } as unknown as SceneState }));
    const value = screen.getByDisplayValue('verschlossen');
    await user.clear(value);
    await user.type(value, 'offen');
    const facts = screen.getByDisplayValue(/wunde/);
    await user.type(facts, '\nmut:  wächst ');
    const addButtons = screen.getAllByRole('button', { name: /Add/ });
    await user.click(addButtons.at(-1)!);
    await user.click(saveButton());

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    const state = saved();
    expect(state.chat_log).toEqual([{ id: 'new-line' }]);
    expect(state.world.key_facts).toEqual({ tor_status: 'offen' });
    expect(state.arcs).toHaveLength(2);
    expect(state.overlays![0]!.facts).toEqual({ wunde: 'linker Arm', mut: 'wächst' });
    expect(state.lore_cards).toEqual([]);
    expect(useAppStore.getState().stageState).toBe(state);
  });

  it('keeps the draft open when saving fails', async () => {
    vi.mocked(api.saveStageScene).mockRejectedValueOnce(new Error('Disk full'));
    const user = open();
    const value = screen.getByDisplayValue('verschlossen');
    await user.clear(value);
    await user.type(value, 'offen');
    await user.click(saveButton());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not save the scene: Disk full'));
    expect(onClose).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('offen')).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
    expect(useAppStore.getState().stageState).toBe(scene);
  });

  it('cannot save while a turn is running', () => {
    useAppStore.setState({ isProcessingStageTurn: true });
    open();
    expect(saveButton()).toBeDisabled();
  });
});
