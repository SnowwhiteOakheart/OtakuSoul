// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
import { open } from '@tauri-apps/plugin-dialog';
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { CognitiveMemoryDrawer } from '../components/chat/CognitiveMemoryDrawer';
import * as feedback from '../components/ui/feedback';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, CognitiveOverview, MemoryBackupInfo, SoulMemoryPipelineResult } from '../types';
const initial = useAppStore.getState();
const character = { id: 'ayu', card: { data: { name: 'Ayu' } } } as CharacterProfile;
const overview: CognitiveOverview = {
  psychology: { primary_emotion: 'joy', intensity: 3, psychological_tension: 'Original tension', emotional_decay_counter: 0, active_agenda: '', immediate_focus: '', core_identity: [], updated_at: 0 },
  relationship: { user_name: 'User', trust_level: 'High', unspoken_tension: '', preferences_habits: [], shared_milestones: [], updated_at: 0 },
  recent_memories: [], recent_diary: [], healing_logs: [],
};
const backup: MemoryBackupInfo = { filename: 'backup_ayu_123.json', timestamp: 123, date_formatted: 'Yesterday', size_bytes: 2048 };
const result: SoulMemoryPipelineResult = { no_change: true, character_id: 'ayu', psychology: overview.psychology, relationship: overview.relationship, topics_processed: [], diary_entry: null, healing_entries: [] };
beforeEach(() => {
  resetApiMocks();
  vi.mocked(open).mockReset().mockResolvedValue('/tmp/sow-test');
  useAppStore.setState({ ...initial, appLanguage: 'en', activeCharacter: character, cognitiveOverview: overview, memoryBackups: [backup] }, true);
  vi.mocked(api.getCognitiveOverview).mockResolvedValue(overview);
  vi.mocked(api.listMemoryBackups).mockResolvedValue([backup]);
  vi.mocked(api.getCharacterMemoryMarkdown).mockResolvedValue('# Ayu');
  vi.mocked(api.getUserMemoryMarkdown).mockResolvedValue('# User');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(feedback.toast, 'error').mockImplementation(() => {});
  vi.spyOn(feedback.toast, 'success').mockImplementation(() => {});
  vi.spyOn(feedback, 'confirmDialog').mockResolvedValue(true);
});
afterEach(() => vi.restoreAllMocks());
const openBackups = async () => {
  const user = userEvent.setup();
  const view = render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
  await user.click(screen.getAllByRole('tab')[6]!);
  return { user, view };
};
describe('memory operations', () => {
  it('shows reflection errors persistently, releases the busy flag and only reports success after retry', async () => {
    vi.mocked(api.triggerMemoryPipeline).mockRejectedValueOnce(new Error('Router unavailable')).mockResolvedValueOnce(result);
    const user = userEvent.setup();
    render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Start reflection' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('Reflection failed: Router unavailable');
    expect(screen.getByRole('alert')).toHaveTextContent('Nothing was changed');
    expect(feedback.toast.success).not.toHaveBeenCalled();
    expect(useAppStore.getState().isReflecting).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Start reflection' }));
    await waitFor(() => expect(feedback.toast.success).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(useAppStore.getState().lastReflectionResult).toBe(result);
  });
  it('rejects duplicate reflections and keeps all memory operations locked after reopening', async () => {
    let finish!: (value: SoulMemoryPipelineResult) => void;
    vi.mocked(api.triggerMemoryPipeline).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { user, view } = await openBackups();
    await user.click(screen.getByRole('button', { name: 'Start reflection' }));
    view.rerender(<CognitiveMemoryDrawer isOpen={false} onClose={() => {}} />);
    view.rerender(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Reflecting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create snapshot now' })).toBeDisabled();
    await expect(useAppStore.getState().triggerMemoryPipeline()).rejects.toThrow('already running');
    expect(api.triggerMemoryPipeline).toHaveBeenCalledOnce();
    await act(async () => finish(result));
  });
  it('does not show an earlier character’s reflection result or error', async () => {
    let fail!: (error: Error) => void;
    vi.mocked(api.triggerMemoryPipeline).mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
    const promise = useAppStore.getState().triggerMemoryPipeline();
    useAppStore.setState({ activeCharacter: { ...character, id: 'sora' } });
    fail(new Error('Ayu failed'));
    await expect(promise).rejects.toThrow('Ayu failed');
    expect(useAppStore.getState().memoryReflectionError).toBeNull();
    expect(api.getCognitiveOverview).not.toHaveBeenCalled();
    expect(useAppStore.getState().isReflecting).toBe(false);
  });
  it('stops old refresh phases if the character changes while the overview is loading', async () => {
    let finish!: (value: CognitiveOverview) => void;
    vi.mocked(api.getCognitiveOverview).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const promise = useAppStore.getState().restoreMemoryBackup(backup.filename);
    await waitFor(() => expect(api.getCognitiveOverview).toHaveBeenCalled());
    useAppStore.setState({ activeCharacter: { ...character, id: 'sora' }, cognitiveOverview: null });
    finish(overview);
    await promise;
    expect(api.getCharacterMemoryMarkdown).not.toHaveBeenCalled();
    expect(api.listMemoryBackups).not.toHaveBeenCalled();
    expect(useAppStore.getState().cognitiveOverview).toBeNull();
    expect(useAppStore.getState().memoryOperation).toBeNull();
  });
  it('keeps a failed restore retryable and passes the character with the selected filename', async () => {
    vi.mocked(api.restoreMemoryBackup).mockRejectedValueOnce(new Error('Restore blocked')).mockResolvedValueOnce(undefined);
    const { user } = await openBackups();
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(feedback.toast.error).toHaveBeenCalledWith('Restore failed: Restore blocked'));
    expect(feedback.toast.success).not.toHaveBeenCalled();
    expect(useAppStore.getState().memoryOperation).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(feedback.toast.success).toHaveBeenCalled());
    expect(api.restoreMemoryBackup).toHaveBeenLastCalledWith(backup.filename, 'ayu');
  });
  it('locks restore and snapshot creation until a pending operation fails', async () => {
    let fail!: (error: Error) => void;
    vi.mocked(api.restoreMemoryBackup).mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
    const { user, view } = await openBackups();
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(useAppStore.getState().memoryOperation).toBe('restore'));
    view.rerender(<CognitiveMemoryDrawer isOpen={false} onClose={() => {}} />);
    view.rerender(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Restore' })).toBeDisabled();
    await expect(useAppStore.getState().createMemoryBackup()).rejects.toThrow('already running');
    await act(async () => fail(new Error('Failed write')));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Restore' })).toBeEnabled());
  });
  it.each(['restore', 'reflection'] as const)('retains successful %s despite failed markdown refresh and allows a read-only retry', async (operation) => {
    vi.mocked(api.getCharacterMemoryMarkdown).mockRejectedValue(new Error('Read blocked'));
    vi.mocked(api.triggerMemoryPipeline).mockResolvedValue(result);
    if (operation === 'restore') await useAppStore.getState().restoreMemoryBackup(backup.filename);
    if (operation === 'reflection') await expect(useAppStore.getState().triggerMemoryPipeline()).resolves.toBe(result);
    expect(useAppStore.getState().memoryMarkdownError).toBe('Read blocked');
    const user = userEvent.setup();
    render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    await screen.findByRole('alert');
    const callCount = vi.mocked(api.restoreMemoryBackup).mock.calls.length + vi.mocked(api.triggerMemoryPipeline).mock.calls.length;
    vi.mocked(api.getCharacterMemoryMarkdown).mockResolvedValue('# Refreshed');
    await user.click(screen.getByRole('button', { name: 'Retry markdown' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(vi.mocked(api.restoreMemoryBackup).mock.calls.length + vi.mocked(api.triggerMemoryPipeline).mock.calls.length).toBe(callCount);
  });
});
