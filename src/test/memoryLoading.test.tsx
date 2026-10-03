// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { CognitiveMemoryDrawer } from '../components/chat/CognitiveMemoryDrawer';
import { toast } from '../components/ui/feedback';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, CognitiveOverview, MemoryBackupInfo } from '../types';
const initial = useAppStore.getState();
const character = { id: 'ayu', card: { data: { name: 'Ayu' } } } as CharacterProfile;
const overview: CognitiveOverview = {
  psychology: { primary_emotion: 'joy', intensity: 3, psychological_tension: 'Original tension', emotional_decay_counter: 0, active_agenda: '', immediate_focus: '', core_identity: [], updated_at: 0 },
  relationship: { user_name: 'User', trust_level: 'High', unspoken_tension: '', preferences_habits: [], shared_milestones: [], updated_at: 0 },
  recent_memories: [], recent_diary: [], healing_logs: [],
};
const backup: MemoryBackupInfo = { filename: 'backup_ayu_123.json', timestamp: 123, date_formatted: 'Yesterday', size_bytes: 2048 };
beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ ...initial, appLanguage: 'en', activeCharacter: character, cognitiveOverview: overview, memoryBackups: [backup] }, true);
  vi.mocked(api.getCognitiveOverview).mockResolvedValue(overview);
  vi.mocked(api.listMemoryBackups).mockResolvedValue([backup]);
  vi.mocked(api.getCharacterMemoryMarkdown).mockResolvedValue('# Ayu');
  vi.mocked(api.getUserMemoryMarkdown).mockResolvedValue('# User');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(toast, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('memory read failures', () => {
  it('keeps cached overview and drafts, shows a persistent error and clears it on retry', async () => {
    vi.mocked(api.getCognitiveOverview).mockRejectedValueOnce(new Error('Cannot read psychology')).mockResolvedValueOnce({ ...overview, psychology: { ...overview.psychology, psychological_tension: 'New tension' } });
    const user = userEvent.setup();
    render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load overview: Cannot read psychology');
    expect(useAppStore.getState().cognitiveOverview).toBe(overview);
    const field = screen.getByRole('textbox', { name: 'Inner tension & conflicts' });
    await user.type(field, ' edited');
    await user.click(screen.getByRole('button', { name: 'Retry overview' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(field).toHaveValue('Original tension edited');
    expect(useAppStore.getState().cognitiveOverview?.psychology.psychological_tension).toBe('New tension');
  });

  it('does not label a failed first overview load as empty memories, diary or healing', async () => {
    useAppStore.setState({ cognitiveOverview: null });
    vi.mocked(api.getCognitiveOverview).mockRejectedValue(new Error('Database unavailable'));
    const user = userEvent.setup();
    render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    await screen.findByRole('alert');
    for (const [index, empty] of [[3, 'No episodic memories stored yet.'], [4, 'The diary is still empty.'], [5, 'No healing or contradiction events logged yet.']] as const) {
      await user.click(screen.getAllByRole('tab')[index]!);
      expect(screen.getByRole('alert')).toHaveTextContent('Database unavailable');
      expect(screen.queryByText(empty)).not.toBeInTheDocument();
    }
  });

  it('keeps cached snapshots on failure and retries only their list', async () => {
    vi.mocked(api.listMemoryBackups).mockRejectedValueOnce(new Error('Permission denied')).mockResolvedValueOnce([]);
    const user = userEvent.setup();
    render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    await user.click(screen.getAllByRole('tab')[6]!);
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load snapshot list: Permission denied');
    expect(screen.getByText(backup.filename)).toBeInTheDocument();
    expect(useAppStore.getState().memoryBackups).toEqual([backup]);
    await user.click(screen.getByRole('button', { name: 'Reload snapshot list' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.queryByText(backup.filename)).not.toBeInTheDocument();
    expect(api.getCognitiveOverview).toHaveBeenCalledOnce();
  });

  it('does not show no snapshots when their first read fails', async () => {
    useAppStore.setState({ memoryBackups: [] });
    vi.mocked(api.listMemoryBackups).mockRejectedValue(new Error('Not a directory'));
    const user = userEvent.setup();
    render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    await user.click(screen.getAllByRole('tab')[6]!);
    await screen.findByRole('alert');
    expect(screen.queryByText(/No snapshots yet/)).not.toBeInTheDocument();
  });

  it('ignores an older overview error while the latest request is still loading', async () => {
    let fail!: (error: Error) => void;
    let finish!: (value: CognitiveOverview) => void;
    vi.mocked(api.getCognitiveOverview).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; })).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const first = useAppStore.getState().fetchCognitiveOverview();
    const second = useAppStore.getState().fetchCognitiveOverview();
    fail(new Error('Old error'));
    await first;
    expect(useAppStore.getState().isMemoryLoading).toBe(true);
    expect(useAppStore.getState().memoryOverviewError).toBeNull();
    finish(overview);
    await second;
    expect(useAppStore.getState().isMemoryLoading).toBe(false);
  });

  it('ignores an older successful snapshot list after a newer failure', async () => {
    let finish!: (value: MemoryBackupInfo[]) => void;
    vi.mocked(api.listMemoryBackups).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockRejectedValueOnce(new Error('Latest failure'));
    const first = useAppStore.getState().fetchMemoryBackups();
    await useAppStore.getState().fetchMemoryBackups();
    finish([]);
    await first;
    expect(useAppStore.getState().memoryBackups).toEqual([backup]);
    expect(useAppStore.getState().memoryBackupsError).toBe('Latest failure');
  });

  it('does not apply another character’s snapshots or stop its pending loader', async () => {
    let finishA!: (value: MemoryBackupInfo[]) => void;
    let finishB!: (value: MemoryBackupInfo[]) => void;
    vi.mocked(api.listMemoryBackups).mockImplementationOnce(() => new Promise((resolve) => { finishA = resolve; })).mockImplementationOnce(() => new Promise((resolve) => { finishB = resolve; }));
    const first = useAppStore.getState().fetchMemoryBackups();
    useAppStore.setState({ activeCharacter: { ...character, id: 'sora' }, memoryBackups: [] });
    const second = useAppStore.getState().fetchMemoryBackups();
    finishA([backup]);
    await first;
    expect(useAppStore.getState().memoryBackups).toEqual([]);
    expect(useAppStore.getState().isLoadingBackups).toBe(true);
    finishB([]);
    await second;
  });

  it('clears overview errors on persona change and ignores an old failure', async () => {
    let fail!: (error: Error) => void;
    vi.mocked(api.getCognitiveOverview).mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
    useAppStore.setState({ memoryOverviewError: 'Previous failure', saveCurrentSettings: vi.fn() });
    const first = useAppStore.getState().fetchCognitiveOverview();
    useAppStore.getState().selectPersona({ ...initial.activePersona, name: 'Other' });
    fail(new Error('Old persona failed'));
    await first;
    expect(useAppStore.getState().memoryOverviewError).toBeNull();
    expect(useAppStore.getState().cognitiveOverview).toBeNull();
    expect(useAppStore.getState().isMemoryLoading).toBe(false);
  });

  it('clears snapshots, errors and loading flags on actual character selection', async () => {
    useAppStore.setState({ memoryOverviewError: 'Old overview error', memoryBackupsError: 'Old backups error', isLoadingBackups: true,
      loadChatSessions: vi.fn(), fetchCognitiveOverview: vi.fn(), loadVoiceConfigForCharacter: vi.fn(), saveCurrentSettings: vi.fn() });
    await useAppStore.getState().selectCharacter({ ...character, id: 'sora' });
    expect(useAppStore.getState().memoryBackups).toEqual([]);
    expect(useAppStore.getState().memoryBackupsError).toBeNull();
    expect(useAppStore.getState().memoryOverviewError).toBeNull();
    expect(useAppStore.getState().isLoadingBackups).toBe(false);
  });

  it('retains successful memory and diary writes despite a failed overview refresh', async () => {
    vi.mocked(api.getCognitiveOverview).mockRejectedValue(new Error('Read blocked'));
    await expect(useAppStore.getState().addManualMemory('fact', 'See', 3)).resolves.toBeUndefined();
    await expect(useAppStore.getState().addManualDiary('Title', 'Text', 'Calm')).resolves.toBeUndefined();
    expect(api.addEpisodicMemory).toHaveBeenCalledOnce();
    expect(api.addDiaryEntry).toHaveBeenCalledOnce();
    expect(useAppStore.getState().memoryOverviewError).toBe('Read blocked');
  });

  it('returns a created snapshot despite failed listing and retains the cached list', async () => {
    vi.mocked(api.backupMemoryState).mockResolvedValue(backup);
    vi.mocked(api.listMemoryBackups).mockRejectedValue(new Error('Listing blocked'));
    await expect(useAppStore.getState().createMemoryBackup()).resolves.toEqual(backup);
    expect(api.backupMemoryState).toHaveBeenCalledOnce();
    expect(useAppStore.getState().memoryBackups).toEqual([backup]);
    expect(useAppStore.getState().memoryBackupsError).toBe('Listing blocked');
  });
});
