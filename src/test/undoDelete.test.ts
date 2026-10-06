import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { toast } from '../components/ui/feedback';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, ChatSession, CognitiveOverview, EpisodicMemory, StoredChatMessage } from '../types';

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

const session = (id: string): ChatSession => ({
  id, character_id: 'ayu', title: id, created_at: 0, updated_at: 0, author_note: '', author_note_depth: 2,
  message_count: 1, summary: '', summary_until: -1,
});

describe('deleting a chat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetApiMocks();
    vi.spyOn(toast, 'info').mockImplementation(() => undefined);
    vi.mocked(api.listChatSessions).mockResolvedValue([session('chat-1'), session('chat-2')]);
    vi.mocked(api.getChatMessages).mockResolvedValue([]);
    useAppStore.setState({
      activeCharacter: { id: 'ayu', card: { data: { name: 'Ayu' } } } as CharacterProfile,
      activeChatId: 'chat-1',
      chatSessions: [session('chat-1'), session('chat-2')],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const sessionIds = () => useAppStore.getState().chatSessions.map((s) => s.id);

  it('hides the open chat, opens another one and brings it back on undo', async () => {
    await useAppStore.getState().deleteChatSession('chat-1');
    expect(sessionIds()).toEqual(['chat-2']);
    expect(useAppStore.getState().activeChatId).toBe('chat-2');
    undo();
    await vi.waitFor(() => expect(useAppStore.getState().activeChatId).toBe('chat-1'));
    expect(sessionIds()).toEqual(['chat-1', 'chat-2']);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.deleteChatSession).not.toHaveBeenCalled();
  });

  it('keeps it out of reloaded lists and deletes it when the time is over', async () => {
    await useAppStore.getState().deleteChatSession('chat-2');
    await useAppStore.getState().loadChatSessions('ayu');
    expect(sessionIds()).toEqual(['chat-1']);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.deleteChatSession).toHaveBeenCalledWith('chat-2');
  });
});

describe('forgetting a memory', () => {
  const memory = (id: number) => ({ id, content: `m${id}` }) as unknown as EpisodicMemory;
  const visible = () => useAppStore.getState().cognitiveOverview?.recent_memories.map((m) => m.id);
  beforeEach(() => {
    vi.useFakeTimers();
    resetApiMocks();
    vi.spyOn(toast, 'info').mockImplementation(() => undefined);
    const overview = { recent_memories: [memory(1), memory(2)] } as unknown as CognitiveOverview;
    vi.mocked(api.getCognitiveOverview).mockResolvedValue(overview);
    useAppStore.setState({
      activeCharacter: { id: 'ayu', card: { data: { name: 'Ayu' } } } as CharacterProfile,
      cognitiveOverview: overview,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('hides it, keeps it out of reloads and forgets it after the undo time', async () => {
    await useAppStore.getState().forgetMemory(1);
    expect(visible()).toEqual([2]);
    await useAppStore.getState().fetchCognitiveOverview();
    expect(visible()).toEqual([2]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.forgetEpisodicMemory).toHaveBeenCalledWith('ayu', 1);
  });

  it('brings it back on undo without forgetting', async () => {
    await useAppStore.getState().forgetMemory(1);
    undo();
    await vi.waitFor(() => expect(visible()).toEqual([1, 2]));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.forgetEpisodicMemory).not.toHaveBeenCalled();
  });
});

