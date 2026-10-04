import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { resetApiMocks } from './mockApi';
import type { ChatSession, StoredChatMessage } from '../types';

const initial = useAppStore.getState();
const session = { id: 'chat-1', summary: 'Bisher: Ayu traf Hiroki.', summary_until: 3 } as ChatSession;
const message = (order_index: number): StoredChatMessage => ({
  id: `m${order_index}`, chat_id: 'chat-1', role: 'user', content: 'x', thought: null, order_index,
  swipe_index: 0, swipes: [{ content: 'x', thought: null }], created_at: 0, attachments: [],
});

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ ...initial, activeChatId: 'chat-1', chatSessions: [session], storedMessages: [message(2), message(5)] }, true);
});
const summaryOf = () => useAppStore.getState().chatSessions[0]!;

describe('running summary after history changes', () => {
  it('drops the summary when a summarized message is edited or its variant switched', async () => {
    vi.mocked(api.updateChatMessage).mockResolvedValue(message(2));
    await useAppStore.getState().editChatMessage('m2', 'korrigiert');
    expect(summaryOf()).toMatchObject({ summary: '', summary_until: -1 });

    useAppStore.setState({ chatSessions: [session] });
    vi.mocked(api.switchMessageSwipe).mockResolvedValue(message(2));
    await useAppStore.getState().switchMessageSwipe('m2', 0);
    expect(summaryOf()).toMatchObject({ summary: '', summary_until: -1 });
  });

  it('keeps it for changes after the summarized part', async () => {
    vi.mocked(api.updateChatMessage).mockResolvedValue(message(5));
    await useAppStore.getState().editChatMessage('m5', 'neu');
    expect(summaryOf()).toEqual(session);
  });
});
