// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (config: { count: number; getItemKey: (index: number) => string }) => ({
    getVirtualItems: () => Array.from({ length: config.count }, (_, index) => ({ index, key: config.getItemKey(index), start: index * 100 })),
    getTotalSize: () => config.count * 100,
    measureElement: () => {},
    scrollToIndex: () => {},
  }),
}));

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { MessageList } from '../components/chat/MessageList';
import { toast } from '../components/ui/feedback';
import { resetApiMocks } from './mockApi';
import type { StoredChatMessage } from '../types';

const initialState = useAppStore.getState();
const original: StoredChatMessage = {
  id: 'message-1', chat_id: 'chat-1', role: 'user', content: 'Original message.',
  thought: null, order_index: 0, swipe_index: 0, swipes: [{ content: 'Original message.', thought: null }],
  created_at: 0, attachments: [],
};
const scrollRef = { current: null };
const History = () => {
  const messages = useAppStore((state) => state.storedMessages);
  return <MessageList messages={messages} scrollRef={scrollRef} characterName="Ayu" persona={initialState.activePersona} isGenerating={false} />;
};

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ ...initialState, appLanguage: 'en', activeChatId: 'chat-1', storedMessages: [original] }, true);
  vi.spyOn(toast, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const startEdit = async () => {
  const user = userEvent.setup();
  render(<History />);
  await user.click(screen.getByRole('button', { name: 'Edit message' }));
  return user;
};

describe('chat message editing', () => {
  it('retains failed edits and the original stored message, then commits a retry', async () => {
    vi.mocked(api.updateChatMessage).mockRejectedValueOnce(new Error('Disk full')).mockResolvedValueOnce({ ...original, content: 'Corrected message.' });
    const user = await startEdit();
    const editor = screen.getByRole('textbox', { name: 'Edit message' });
    await user.clear(editor);
    await user.type(editor, 'Corrected message.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not save message: Disk full'));
    expect(editor).toHaveValue('Corrected message.');
    expect(useAppStore.getState().storedMessages).toEqual([original]);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
    expect(screen.getByText('Corrected message.')).toBeInTheDocument();
    expect(api.updateChatMessage).toHaveBeenLastCalledWith('message-1', 'Corrected message.');
  });

  it('locks text, save and cancel during a pending write', async () => {
    let finish!: (value: StoredChatMessage) => void;
    vi.mocked(api.updateChatMessage).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const user = await startEdit();
    await user.type(screen.getByRole('textbox'), ' changed');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Saving…' }));
    expect(api.updateChatMessage).toHaveBeenCalledOnce();
    expect(useAppStore.getState().storedMessages).toEqual([original]);
    await act(async () => { finish({ ...original, content: 'Original message. changed' }); });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('keeps an empty edit open without writing', async () => {
    const user = await startEdit();
    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), '  ');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(api.updateChatMessage).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveValue('  ');
  });

  it('cancels without changing the saved message', async () => {
    const user = await startEdit();
    await user.type(screen.getByRole('textbox'), ' discarded');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Original message.')).toBeInTheDocument();
    expect(api.updateChatMessage).not.toHaveBeenCalled();
  });

  it('prevents switching reply variants while an edit is open', async () => {
    useAppStore.setState({ storedMessages: [{ ...original, role: 'assistant', swipes: [original.swipes[0]!, { content: 'Alternative.', thought: null }] }] });
    const user = await startEdit();
    const next = screen.getByRole('button', { name: 'Next reply variant' });
    expect(next).toBeDisabled();
    await user.click(next);
    expect(api.switchMessageSwipe).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(next).toBeEnabled();
  });

  it('does not replace the current history when an earlier chat finishes saving', async () => {
    let finish!: (value: StoredChatMessage) => void;
    vi.mocked(api.updateChatMessage).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const saving = useAppStore.getState().editChatMessage(original.id, 'Edited');
    const other = [{ ...original, id: 'message-2', chat_id: 'chat-2', content: 'Other chat.' }];
    useAppStore.setState({ activeChatId: 'chat-2', storedMessages: other });
    finish({ ...original, content: 'Edited' });
    await saving;
    expect(useAppStore.getState().storedMessages).toBe(other);
  });
});
