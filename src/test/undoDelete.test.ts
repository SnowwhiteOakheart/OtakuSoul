import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { toast } from '../components/ui/feedback';
import { resetApiMocks } from './mockApi';
import type { StoredChatMessage } from '../types';

const message = (id: string, order_index: number): StoredChatMessage => ({
  id, chat_id: 'chat-1', role: 'user', content: id, thought: null, order_index, swipe_index: 0, swipes: [], created_at: 0, attachments: [],
});
const ids = () => useAppStore.getState().storedMessages.map((m) => m.id);
const undo = () => vi.mocked(toast.info).mock.calls.at(-1)?.[1]?.onClick();

describe('deleting a chat message', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetApiMocks();
    vi.spyOn(toast, 'info').mockImplementation(() => undefined);
    vi.mocked(api.listChatSessions).mockResolvedValue([]);
    useAppStore.setState({ activeChatId: 'chat-1', storedMessages: [message('a', 0), message('b', 1), message('c', 2)] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('hides the message at once and restores it in place on undo, without deleting', async () => {
    await useAppStore.getState().deleteChatMessage('b');
    expect(ids()).toEqual(['a', 'c']);
    undo();
    expect(ids()).toEqual(['a', 'b', 'c']);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.deleteChatMessage).not.toHaveBeenCalled();
  });

  it('deletes it for good once the undo time is over', async () => {
    await useAppStore.getState().deleteChatMessage('b');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.deleteChatMessage).toHaveBeenCalledWith('b');
    expect(ids()).toEqual(['a', 'c']);
  });
});
