// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../components/chat/AdaptiveHud', () => ({ AdaptiveHud: () => null }));
vi.mock('../components/chat/SceneImageCard', () => ({ SceneImageCard: () => null }));
vi.mock('../components/chat/ChatSidebar', () => ({ ChatSidebar: () => null }));
vi.mock('../components/chat/MessageList', () => ({ MessageList: () => null }));
vi.mock('../components/chat/ChatComposer', () => ({ ChatComposer: () => null }));
vi.mock('../components/avatar/AvatarCanvas', () => ({
  AvatarCanvas: ({ character }: { character: { id: string } | null }) => <div data-testid="avatar">{character?.id}</div>,
  MorphingPortrait: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock('../services/streamingTts', () => ({ streamingTts: { push: vi.fn(), flush: vi.fn(), cancel: vi.fn() } }));
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { ChatView } from '../components/chat/ChatView';
import { NEUTRAL_EMOTION } from '../store/slices/avatarSlice';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, ChatSession, EmotionResult } from '../types';
import type { StoredChatMessage } from '../types';

// The expression follows the reply on screen, not only a freshly generated one.
const ayu = { id: 'ayu', card: { data: { name: 'Ayu', extensions: {} } }, bound_lorebooks: [] } as unknown as CharacterProfile;
const session: ChatSession = { id: 'chat', character_id: 'ayu', title: '', created_at: 0, updated_at: 0, author_note: '', author_note_depth: 0, message_count: 0, summary: '', summary_until: -1, members: [] };
const emotion = (portrait: string): EmotionResult =>
  ({ emotion: 'embarrassment', vrm_expression: 'sad', live2d_expression: 'embarrassment_animation', confidence: 1, intensity: 0.8, portrait });
const reply = (content: string, swipe_index = 0) =>
  ({ id: 'm1', chat_id: 'chat', role: 'assistant', content, order_index: 0, swipe_index, swipes: [], created_at: 0, attachments: [], speaker_id: '' }) as unknown as StoredChatMessage;
const initial = useAppStore.getState();

beforeEach(() => {
  resetApiMocks();
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(api.onLlmDone).mockResolvedValue(vi.fn<() => void>());
  vi.mocked(api.onLlmToken).mockResolvedValue(vi.fn<() => void>());
  vi.mocked(api.onLlmThought).mockResolvedValue(vi.fn<() => void>());
  vi.mocked(api.classifyTextEmotion).mockImplementation(async (text) => emotion(text.includes('rot') ? 'blush' : 'crying'));
  useAppStore.setState({ ...initial, appLanguage: 'en', activeCharacter: ayu, availableCharacters: [ayu], activeChatId: 'chat', chatSessions: [session] }, true);
});

describe('expression of the reply on screen', () => {
  it('comes from the last reply when a chat opens and follows swipes and edits', async () => {
    useAppStore.setState({ storedMessages: [reply('*wird rot*')] });
    render(<ChatView />);
    await waitFor(() => expect(useAppStore.getState().currentEmotion.portrait).toBe('blush'));
    act(() => useAppStore.setState({ storedMessages: [reply('*weint*', 1)] }));
    await waitFor(() => expect(useAppStore.getState().currentEmotion.portrait).toBe('crying'));
  });

  it('goes back to neutral in a chat without a reply', async () => {
    useAppStore.setState({ currentEmotion: emotion('blush'), storedMessages: [] });
    render(<ChatView />);
    await waitFor(() => expect(useAppStore.getState().currentEmotion).toEqual(NEUTRAL_EMOTION));
  });

  it('leaves the expression alone while a reply is generated', async () => {
    useAppStore.setState({ isGenerating: true, storedMessages: [reply('*wird rot*')] });
    render(<ChatView />);
    await act(async () => { await Promise.resolve(); });
    expect(api.classifyTextEmotion).not.toHaveBeenCalled();
  });
});
