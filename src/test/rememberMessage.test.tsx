// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { RememberMessageDialog, memorySuggestion } from '../components/chat/RememberMessageDialog';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, StoredChatMessage } from '../types';

const message: StoredChatMessage = { id: 'm1', chat_id: 'c1', role: 'user', content: '*lacht* Ich mag Tee. ((egal))', thought: null, order_index: 1, swipe_index: 0, swipes: [], created_at: 0, attachments: [] };
const initial = useAppStore.getState();
beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ ...initial, appLanguage: 'en', activeCharacter: { id: 'ayu', card: { data: { name: 'Ayu' } } } as CharacterProfile, fetchCognitiveOverview: vi.fn().mockResolvedValue(undefined) }, true);
});

describe('remember this message', () => {
  it('suggests the message without actions and directions, shortened', () => {
    expect(memorySuggestion(message.content)).toBe('Ich mag Tee.');
    expect(memorySuggestion('*nur Aktion*')).toBe('*nur Aktion*');
    expect(memorySuggestion('x'.repeat(500))).toHaveLength(401);
  });

  it('saves the memory with the message as source and keeps the dialog open on errors', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vi.mocked(api.addEpisodicMemory).mockRejectedValueOnce(new Error('DB locked')).mockResolvedValueOnce(1);
    render(<RememberMessageDialog message={message} onClose={onClose} />);
    const text = screen.getByRole('textbox', { name: 'Memory' });
    expect(text).toHaveValue('Ich mag Tee.');
    await user.clear(text);
    await user.type(text, 'Mag Tee');
    await user.click(screen.getByRole('button', { name: 'Remember' }));
    expect((await screen.findByRole('alert')).textContent).toContain('DB locked');
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remember' }));
    expect(api.addEpisodicMemory).toHaveBeenLastCalledWith('ayu', 'event', 'Mag Tee', 3, { chatId: 'c1', messageIds: ['m1'] });
    expect(onClose).toHaveBeenCalled();
  });
});
