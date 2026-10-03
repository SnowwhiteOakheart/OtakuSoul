// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { ChatSidebar } from '../components/chat/ChatSidebar';
import { toast } from '../components/ui/feedback';
import { resetApiMocks } from './mockApi';
import type { ChatSession } from '../types';

const initial = useAppStore.getState();
const session: ChatSession = { id: 'chat-1', character_id: 'ayu', title: 'First chat', author_note: 'Original note', author_note_depth: 0, summary: 'Original summary', summary_until: 5, message_count: 6, created_at: 0, updated_at: 0 };
const other: ChatSession = { ...session, id: 'chat-2', title: 'Second chat', author_note: 'Other note', summary: 'Other summary' };
beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ ...initial, appLanguage: 'en', activeChatId: session.id, chatSessions: [session, other], isSummarizing: false }, true);
  vi.spyOn(toast, 'error').mockImplementation(() => {});
  vi.spyOn(toast, 'success').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
const openNotes = async () => {
  const user = userEvent.setup();
  const view = render(<ChatSidebar isOpen onClose={() => {}} />);
  await user.click(screen.getByRole('tab', { name: "Author's note" }));
  return { user, view };
};

describe('chat sidebar editing', () => {
  it('keeps a failed rename open and saves on retry without reloading sessions', async () => {
    vi.mocked(api.renameChatSession).mockRejectedValueOnce(new Error('Disk full')).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<ChatSidebar isOpen onClose={() => {}} />);
    await user.click(screen.getAllByRole('button', { name: 'Rename' })[0]!);
    const title = screen.getByRole('textbox', { name: 'New title' });
    await user.clear(title);
    expect(screen.getByRole('button', { name: 'Save title' })).toBeDisabled();
    await user.type(title, 'Changed title{Enter}');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not save title: Disk full'));
    expect(title).toHaveValue('Changed title');
    expect(useAppStore.getState().chatSessions[0]?.title).toBe(session.title);
    await user.click(screen.getByRole('button', { name: 'Save title' }));
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
    expect(useAppStore.getState().chatSessions[0]?.title).toBe('Changed title');
    expect(api.listChatSessions).not.toHaveBeenCalled();
  });

  it('retains note and summary drafts across session updates, chat switches and closing', async () => {
    const { user, view } = await openNotes();
    await user.clear(screen.getByLabelText('Stage direction'));
    await user.type(screen.getByLabelText('Stage direction'), 'My note');
    await user.clear(screen.getByLabelText('Story so far'));
    await user.type(screen.getByLabelText('Story so far'), 'My summary');
    act(() => useAppStore.setState({ chatSessions: [{ ...session, title: 'Renamed elsewhere', summary: 'Background summary' }, other] }));
    expect(screen.getByLabelText('Story so far')).toHaveValue('My summary');
    view.rerender(<ChatSidebar isOpen={false} onClose={() => {}} />);
    act(() => useAppStore.setState({ activeChatId: other.id }));
    view.rerender(<ChatSidebar isOpen onClose={() => {}} />);
    expect(screen.getByLabelText('Stage direction')).toHaveValue(other.author_note);
    expect(screen.getByLabelText('Story so far')).toHaveValue(other.summary);
    act(() => useAppStore.setState({ activeChatId: session.id }));
    expect(screen.getByLabelText('Stage direction')).toHaveValue('My note');
    expect(screen.getByLabelText('Story so far')).toHaveValue('My summary');
  });

  it('reports note failure without success, preserves depth zero and retries', async () => {
    vi.mocked(api.updateChatAuthorNote).mockRejectedValueOnce(new Error('Read only')).mockResolvedValueOnce(undefined);
    const { user } = await openNotes();
    await user.type(screen.getByLabelText('Stage direction'), ' edited');
    await user.click(screen.getByRole('button', { name: "Save author's note" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not save author’s note: Read only'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Stage direction')).toHaveValue('Original note edited');
    expect(useAppStore.getState().chatSessions[0]).toEqual(session);
    await user.click(screen.getByRole('button', { name: "Save author's note" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(api.updateChatAuthorNote).toHaveBeenLastCalledWith(session.id, 'Original note edited', 0);
    expect(api.listChatSessions).not.toHaveBeenCalled();
  });

  it('locks pending notes after reopening and isolates a late save from the other chat', async () => {
    let finish!: () => void;
    vi.mocked(api.updateChatAuthorNote).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const { user, view } = await openNotes();
    await user.type(screen.getByLabelText('Stage direction'), ' edited');
    await user.click(screen.getByRole('button', { name: "Save author's note" }));
    expect(screen.getByLabelText('Stage direction')).toBeDisabled();
    expect(screen.getByLabelText('Injection depth')).toBeDisabled();
    view.rerender(<ChatSidebar isOpen={false} onClose={() => {}} />);
    view.rerender(<ChatSidebar isOpen onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    act(() => useAppStore.setState({ activeChatId: other.id }));
    await user.type(screen.getByLabelText('Stage direction'), ' draft');
    await act(async () => finish());
    expect(screen.getByLabelText('Stage direction')).toHaveValue('Other note draft');
    expect(useAppStore.getState().chatSessions[1]).toEqual(other);
    expect(api.updateChatAuthorNote).toHaveBeenCalledOnce();
  });

  it('retains summary on failed save and reset, then resets the saved marker on retry', async () => {
    vi.mocked(api.updateChatSummary).mockRejectedValueOnce(new Error('Summary blocked')).mockRejectedValueOnce(new Error('Reset blocked')).mockResolvedValueOnce(undefined);
    const { user } = await openNotes();
    await user.type(screen.getByLabelText('Story so far'), ' edited');
    await user.click(screen.getByRole('button', { name: 'Save summary' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not save summary: Summary blocked'));
    await user.click(screen.getByRole('button', { name: 'Start over' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not save summary: Reset blocked'));
    expect(screen.getByLabelText('Story so far')).toHaveValue('Original summary edited');
    expect(toast.success).not.toHaveBeenCalled();
    expect(useAppStore.getState().chatSessions[0]).toEqual(session);
    await user.click(screen.getByRole('button', { name: 'Start over' }));
    await waitFor(() => expect(screen.getByLabelText('Story so far')).toHaveValue(''));
    expect(api.updateChatSummary).toHaveBeenLastCalledWith(session.id, '', -1);
    expect(useAppStore.getState().chatSessions[0]?.summary_until).toBe(-1);
  });

  it('locks summary writes, suppresses duplicate requests and keeps the other draft', async () => {
    let finish!: () => void;
    vi.mocked(api.updateChatSummary).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const { user } = await openNotes();
    await user.type(screen.getByLabelText('Story so far'), ' edited');
    await user.click(screen.getByRole('button', { name: 'Save summary' }));
    expect(screen.getByLabelText('Story so far')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start over' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Saving…' }));
    act(() => useAppStore.setState({ activeChatId: other.id }));
    await user.type(screen.getByLabelText('Story so far'), ' draft');
    await act(async () => finish());
    expect(screen.getByLabelText('Story so far')).toHaveValue('Other summary draft');
    expect(api.updateChatSummary).toHaveBeenCalledOnce();
    expect(api.updateChatSummary).toHaveBeenCalledWith(session.id, 'Original summary edited', 5);
  });

  it('locks rename text, keyboard and cancel while a write is pending', async () => {
    let finish!: () => void;
    vi.mocked(api.renameChatSession).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    render(<ChatSidebar isOpen onClose={() => {}} />);
    await user.click(screen.getAllByRole('button', { name: 'Rename' })[0]!);
    const title = screen.getByRole('textbox', { name: 'New title' });
    await user.type(title, ' edited{Enter}');
    expect(title).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel renaming' })).toBeDisabled();
    fireEvent.keyDown(title, { key: 'Escape' });
    fireEvent.keyDown(title, { key: 'Enter' });
    expect(api.renameChatSession).toHaveBeenCalledOnce();
    await act(async () => finish());
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
