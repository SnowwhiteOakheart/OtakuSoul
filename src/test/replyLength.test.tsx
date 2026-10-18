// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../components/voice/VoiceCallControls', () => ({ VoiceCallControls: () => null }));
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { chatSampling } from '../store/helpers';
import { ChatComposer } from '../components/chat/ChatComposer';
import { resetApiMocks } from './mockApi';
import type { ChatSession } from '../types';

const session: ChatSession = { id: 'chat-1', character_id: 'ayu', title: 'Eins', created_at: 0, updated_at: 0, author_note: '', author_note_depth: 0, message_count: 0, summary: '', summary_until: -1, members: [] };
const initial = useAppStore.getState();
const withLength = (reply_length: string) => ({ ...session, style: { background: 'wald.png', background_dim: 40, text_size: '', bubbles: '', ambient: null, ambient_volume: 35, reply_length } });
beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ ...initial, appLanguage: 'en', activeChatId: 'chat-1', chatSessions: [session], sampling: { ...initial.sampling, max_tokens: 2048 } }, true);
});

describe('reply length per chat', () => {
  it('bounds max_tokens by the chosen length, not with thinking on', () => {
    expect(chatSampling(useAppStore.getState()).max_tokens).toBe(2048);
    useAppStore.setState({ chatSessions: [withLength('short')] });
    expect(chatSampling(useAppStore.getState()).max_tokens).toBe(400);
    useAppStore.setState({ chatSessions: [withLength('long')], sampling: { ...initial.sampling, max_tokens: 1000 } });
    expect(chatSampling(useAppStore.getState()).max_tokens).toBe(2048);
    useAppStore.setState({ chatSessions: [withLength('short')], serverConfig: { ...initial.serverConfig, reasoning_mode: true } });
    expect(chatSampling(useAppStore.getState()).max_tokens).toBe(1000);
  });

  it('is chosen at the composer and saved with the chat style', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ chatSessions: [withLength('')] });
    vi.mocked(api.updateChatStyle).mockResolvedValue(undefined);
    render(<ChatComposer />);
    await user.selectOptions(screen.getByRole('combobox', { name: /Reply length/ }), 'Short');
    // The rest of the chat's look stays as it was.
    expect(api.updateChatStyle).toHaveBeenCalledWith('chat-1', expect.objectContaining({ reply_length: 'short', background: 'wald.png' }));
    expect(useAppStore.getState().chatSessions[0]?.style?.reply_length).toBe('short');
  });
});
