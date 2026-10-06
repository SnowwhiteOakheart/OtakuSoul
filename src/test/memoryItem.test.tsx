// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { MemoryItem } from '../components/chat/memory/MemoryItem';
import { FeedbackHost, toast } from '../components/ui/feedback';
import { resetApiMocks } from './mockApi';
import type { EpisodicMemory } from '../types';

const initial = useAppStore.getState();
const memory = (over: Partial<EpisodicMemory> = {}): EpisodicMemory => ({
  id: 7, category: 'fact', content: 'Der Nutzer heißt Hiroki', significance: 3, created_at: 0, last_accessed_at: 0,
  source_chat_id: 'c1', source_message_ids: ['m1', 'm2'], origin: 'auto', pinned: false, needs_review: false, ...over,
});

beforeEach(() => {
  resetApiMocks();
  vi.spyOn(toast, 'success').mockImplementation(() => {});
  useAppStore.setState({
    ...initial,
    appLanguage: 'en',
    activeCharacter: { id: 'ayu', card: { data: { name: 'Ayu' } } } as never,
    activeChatId: 'c1',
    chatSessions: [{ id: 'c1', title: 'Kyoto' } as never],
    fetchCognitiveOverview: vi.fn(async () => {}),
  }, true);
});

const renderItem = (m: EpisodicMemory) => render(<><MemoryItem memory={m} /><FeedbackHost /></>);

describe('memory item', () => {
  it('names where it comes from and jumps to the source message', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ isMemoryDrawerOpen: true });
    renderItem(memory());
    expect(screen.getByText('derived by the model')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Source: chat “Kyoto”/ }));
    expect(useAppStore.getState().chatJumpTarget?.messageId).toBe('m1');
    expect(useAppStore.getState().isMemoryDrawerOpen).toBe(false);
  });

  it('pins, corrects and forgets through the backend', async () => {
    const user = userEvent.setup();
    renderItem(memory());
    await user.click(screen.getByRole('button', { name: 'Pin' }));
    expect(api.setEpisodicMemoryPinned).toHaveBeenCalledWith('ayu', 7, true);

    await user.click(screen.getByRole('button', { name: 'Correct' }));
    const text = screen.getByRole('textbox', { name: 'Correct' });
    await user.clear(text);
    await user.type(text, 'Der Nutzer heißt Kenji');
    await user.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(api.updateEpisodicMemory).toHaveBeenCalledWith('ayu', 7, 'fact', 'Der Nutzer heißt Kenji', 3));

    // Forgetting asks nothing; the backend call follows after the undo time (store test).
    await user.click(screen.getByRole('button', { name: 'Forget' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.forgetEpisodicMemory).not.toHaveBeenCalled();
  });

  it('asks to check a memory whose source changed and keeps it on request', async () => {
    const user = userEvent.setup();
    renderItem(memory({ needs_review: true, origin: '' }));
    expect(screen.getByRole('note')).toHaveTextContent('was changed or deleted');
    expect(screen.getByText('origin unknown')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Still right' }));
    expect(api.confirmEpisodicMemory).toHaveBeenCalledWith('ayu', 7);
  });

  it('shows the history of changes', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getMemoryHistory).mockResolvedValue([
      { action: 'created', content_before: '', content_after: 'a', at: 1 },
      { action: 'edited', content_before: 'a', content_after: 'b', at: 2 },
    ]);
    renderItem(memory());
    await user.click(screen.getByRole('button', { name: 'History' }));
    const list = await screen.findByRole('list', { name: 'History' });
    expect(list).toHaveTextContent('created');
    expect(list).toHaveTextContent('corrected');
  });
});

describe('changing a source message', () => {
  it('hints at the memories learned from it and opens the drawer', async () => {
    vi.spyOn(toast, 'info').mockImplementation(() => {});
    vi.mocked(api.updateChatMessage).mockResolvedValue({ id: 'm1', chat_id: 'c1', order_index: 0, content: 'neu' } as never);
    vi.mocked(api.countMemoriesFromMessage).mockResolvedValue(2);
    await useAppStore.getState().editChatMessage('m1', 'neu');
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('2 memories come from this message. They are marked for review.', expect.anything()));
    const action = vi.mocked(toast.info).mock.calls[0]![1]!;
    action.onClick();
    expect(useAppStore.getState().isMemoryDrawerOpen).toBe(true);
  });
});
