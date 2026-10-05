// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { useAppStore } from '../store/useAppStore';
import { ChatSearchBar } from '../components/chat/ChatSearchBar';
import type { StoredChatMessage } from '../types';

const initial = useAppStore.getState();
const msg = (id: string, content: string) => ({ id, content, chat_id: 'c', role: 'user', order_index: 0 }) as StoredChatMessage;
const messages = [msg('m1', 'Wir gehen zum Schrein.'), msg('m2', 'Hallo'), msg('m3', 'Der SCHREIN ist alt.')];

beforeEach(() => useAppStore.setState({ ...initial, appLanguage: 'en' }, true));

describe('chat search', () => {
  it('counts hits, jumps through them and closes with Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ChatSearchBar messages={messages} onClose={onClose} />);
    const input = screen.getByRole('textbox', { name: 'Search the chat' });
    expect(input).toHaveFocus();
    await user.type(input, 'schrein{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2');
    expect(useAppStore.getState().chatJumpTarget?.messageId).toBe('m1');
    await user.keyboard('{Enter}');
    expect(useAppStore.getState().chatJumpTarget?.messageId).toBe('m3');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(useAppStore.getState().chatJumpTarget?.messageId).toBe('m1');
    await user.clear(input);
    await user.type(input, 'xyz');
    expect(screen.getByRole('status')).toHaveTextContent('No matches');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('chat bookmarks', () => {
  it('keeps bookmarks in story order and reports a failed save', async () => {
    const { api } = await import('../services/api');
    const { toast } = await import('../components/ui/feedback');
    vi.spyOn(toast, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    useAppStore.setState({ activeChatId: 'c', storedMessages: messages, bookmarkedMessageIds: [] });
    vi.mocked(api.setChatBookmark).mockResolvedValue(undefined);
    await useAppStore.getState().toggleBookmark('m3');
    await useAppStore.getState().toggleBookmark('m1');
    expect(useAppStore.getState().bookmarkedMessageIds).toEqual(['m1', 'm3']);
    expect(api.setChatBookmark).toHaveBeenLastCalledWith('c', 'm1', true);
    await useAppStore.getState().toggleBookmark('m3');
    expect(useAppStore.getState().bookmarkedMessageIds).toEqual(['m1']);

    vi.mocked(api.setChatBookmark).mockRejectedValueOnce(new Error('locked'));
    await useAppStore.getState().toggleBookmark('m2');
    expect(useAppStore.getState().bookmarkedMessageIds).toEqual(['m1']);
    expect(toast.error).toHaveBeenCalledWith("That didn't work: locked");
  });
});

describe('continuing a chat as a new one', () => {
  it('creates the branch, lists it and opens it', async () => {
    const { api } = await import('../services/api');
    const branch = { id: 'c2', title: 'Kyoto (branch)', character_id: 'ayu', summary: '', summary_until: -1 };
    useAppStore.setState({
      activeChatId: 'c',
      activeCharacter: { id: 'ayu', card: { data: { name: 'Ayu' } } } as never,
      chatSessions: [{ id: 'c', title: 'Kyoto' } as never],
    });
    vi.mocked(api.branchChat).mockResolvedValue(branch as never);
    vi.mocked(api.listChatSessions).mockResolvedValue([branch, { id: 'c', title: 'Kyoto' }] as never);
    const copied = { ...messages[0]!, attachments: [], swipes: [{ content: messages[0]!.content, thought: null }] };
    vi.mocked(api.getChatMessages).mockResolvedValue([copied]);
    vi.mocked(api.listChatBookmarks).mockResolvedValue([]);
    await useAppStore.getState().branchChatFrom('m1');
    expect(api.branchChat).toHaveBeenCalledWith('c', 'm1', 'Kyoto (branch)');
    expect(useAppStore.getState()).toMatchObject({ activeChatId: 'c2', storedMessages: [copied] });
    expect(useAppStore.getState().chatSessions).toHaveLength(2);
  });
});
