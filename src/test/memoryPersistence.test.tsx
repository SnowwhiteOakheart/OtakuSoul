// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../components/ui/feedback', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { MemoriesTab } from '../components/chat/memory/MemoriesTab';
import { DiaryTab } from '../components/chat/memory/DiaryTab';
import { toast } from '../components/ui/feedback';
import { translate } from '../i18n';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile } from '../types';

const initialState = useAppStore.getState();
beforeEach(() => {
  resetApiMocks();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  useAppStore.setState(initialState, true);
  useAppStore.setState({
    appLanguage: 'en',
    activeCharacter: { id: 'ayu', card: { data: { name: 'Ayu' } } } as CharacterProfile,
  });
});
afterEach(() => vi.restoreAllMocks());

describe('memory persistence', () => {
  it('preserves a failed memory draft and clears it only after a successful retry', async () => {
    const user = userEvent.setup();
    vi.mocked(api.addEpisodicMemory).mockRejectedValueOnce(new Error('Disk full')).mockResolvedValueOnce(1);
    render(<MemoriesTab />);
    const editor = screen.getByRole('textbox');
    await user.type(editor, 'Our promise');
    await user.click(screen.getByRole('button', { name: translate('memory.save') }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Disk full')));
    expect(editor).toHaveValue('Our promise');
    expect(toast.success).not.toHaveBeenCalled();
    expect(api.getCognitiveOverview).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: translate('memory.save') }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledOnce());
    expect(editor).toHaveValue('');
    expect(api.addEpisodicMemory).toHaveBeenNthCalledWith(2, 'ayu', 'fact', 'Our promise', 3);
  });

  it('preserves all diary fields on failure and saves the same draft on retry', async () => {
    const user = userEvent.setup();
    vi.mocked(api.addDiaryEntry).mockRejectedValueOnce(new Error('Disk full')).mockResolvedValueOnce(1);
    render(<DiaryTab />);
    const title = screen.getByRole('textbox', { name: translate('memory.diaryTitlePlaceholder') });
    const text = screen.getByRole('textbox', { name: translate('memory.writeDiary') });
    const mood = screen.getByRole('combobox');
    await user.type(title, 'Festival');
    await user.type(text, 'We met at the festival.');
    await user.selectOptions(mood, 'Happy');
    await user.click(screen.getByRole('button', { name: translate('memory.saveDiary') }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
    expect(title).toHaveValue('Festival');
    expect(text).toHaveValue('We met at the festival.');
    expect(mood).toHaveValue('Happy');
    expect(toast.success).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: translate('memory.saveDiary') }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledOnce());
    expect(title).toHaveValue('');
    expect(text).toHaveValue('');
    expect(api.addDiaryEntry).toHaveBeenNthCalledWith(2, 'ayu', 'Festival', 'We met at the festival.', 'Happy');
  });

  it('blocks duplicate submissions and edits while a memory write is pending', async () => {
    const user = userEvent.setup();
    let finish!: (id: number) => void;
    vi.mocked(api.addEpisodicMemory).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<MemoriesTab />);
    await user.type(screen.getByRole('textbox'), 'One memory');
    await user.click(screen.getByRole('button', { name: translate('memory.save') }));
    expect(screen.getByRole('textbox')).toBeDisabled();
    const saving = screen.getByRole('button', { name: translate('common.saving') });
    expect(saving).toBeDisabled();
    await user.click(saving);
    expect(api.addEpisodicMemory).toHaveBeenCalledOnce();
    await act(async () => finish(1));
    expect(screen.getByRole('textbox')).toBeEnabled();
  });

  it('reports a failed generated diary instead of silently doing nothing', async () => {
    const user = userEvent.setup();
    vi.mocked(api.generateManualDiaryEntry).mockRejectedValue(new Error('Provider unavailable'));
    render(<DiaryTab />);
    await user.click(screen.getByRole('button', { name: translate('memory.generateDiary') }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Provider unavailable')));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('propagates backup failures to callers', async () => {
    const failure = new Error('Disk full');
    vi.mocked(api.backupMemoryState).mockRejectedValue(failure);
    await expect(useAppStore.getState().createMemoryBackup()).rejects.toBe(failure);
    expect(api.listMemoryBackups).not.toHaveBeenCalled();
  });

  it('rejects writes when there is no character instead of reporting success', async () => {
    useAppStore.setState({ activeCharacter: null });
    await expect(useAppStore.getState().addManualMemory('fact', 'Text', 3)).rejects.toThrow();
    await expect(useAppStore.getState().addManualDiary('Title', 'Text', 'Happy')).rejects.toThrow();
    expect(api.addEpisodicMemory).not.toHaveBeenCalled();
    expect(api.addDiaryEntry).not.toHaveBeenCalled();
  });
});
