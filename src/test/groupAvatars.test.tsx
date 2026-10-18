// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import type { CharacterProfile, ChatSession, DoneEvent, EmotionResult } from '../types';

const card = (id: string, name: string, expressions: Record<string, string> = {}) =>
  ({ id, card: { data: { name, extensions: { custom_expressions: expressions } } }, avatar_data_url: `data:${id}`, bound_lorebooks: [] }) as unknown as CharacterProfile;
const ayu = card('ayu', 'Ayu');
const sora = card('sora', 'Sora');
const session: ChatSession = { id: 'chat', character_id: 'ayu', title: '', created_at: 0, updated_at: 0, author_note: '', author_note_depth: 0, message_count: 0, summary: '', summary_until: -1, members: ['sora'] };
const happy: EmotionResult = { emotion: 'joy', vrm_expression: 'happy', live2d_expression: 'joy_animation', confidence: 1, intensity: 0.8 };
const initial = useAppStore.getState();
let done: Parameters<typeof api.onLlmDone>[0];

beforeEach(() => {
  resetApiMocks();
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
  vi.mocked(api.scanCharacters).mockResolvedValue([]);
  vi.mocked(api.onLlmDone).mockImplementation(async (cb) => { done = cb; return vi.fn<() => void>(); });
  vi.mocked(api.onLlmToken).mockResolvedValue(vi.fn<() => void>());
  vi.mocked(api.onLlmThought).mockResolvedValue(vi.fn<() => void>());
  useAppStore.setState({
    ...initial, appLanguage: 'en', activeCharacter: ayu, availableCharacters: [ayu, sora], activeChatId: 'chat', chatSessions: [session],
  }, true);
});

async function mount() {
  render(<ChatView />);
  await waitFor(() => expect(api.onLlmDone).toHaveBeenCalled());
}

describe('avatars in a group chat', () => {
  it('shows who speaks or spoke last, with their own last expression', async () => {
    await mount();
    expect((await screen.findByTestId('avatar')).textContent).toBe('ayu');
    useAppStore.setState({ speakerEmotions: { sora: happy } });
    act(() => useAppStore.setState({ generationSpeakerId: 'sora' }));
    expect(screen.getByTestId('avatar').textContent).toBe('sora');
    expect(useAppStore.getState().currentEmotion).toEqual(happy);
    act(() => useAppStore.setState({ generationSpeakerId: '' }));
    expect(useAppStore.getState().currentEmotion).toEqual(NEUTRAL_EMOTION);
  });

  it('keeps each speaker\'s expression from their reply', async () => {
    vi.mocked(api.classifyTextEmotion).mockResolvedValue(happy);
    useAppStore.setState({ isGenerating: true, generationId: 'g', generationChatId: 'chat', generationSpeakerId: 'sora' });
    await mount();
    await act(async () => { await done({ generation_id: 'g', full_text: '*lacht*', full_thought: '', aborted: false } as DoneEvent); });
    expect(useAppStore.getState().speakerEmotions.sora).toEqual(happy);
    expect(useAppStore.getState().currentEmotion).toEqual(happy);
  });

  it('shows everyone as portraits when switched on, the speaker highlighted', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ generationSpeakerId: 'sora' });
    await mount();
    await user.click(screen.getByRole('button', { name: 'Show everyone' }));
    const tiles = screen.getAllByRole('listitem');
    expect(tiles.map((t) => t.getAttribute('data-portrait-speaker'))).toEqual(['host', 'sora']);
    expect(tiles[1]).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByTestId('avatar')).toBeNull();
    // The choice is kept per device.
    expect(localStorage.getItem('otakusoul.chat.groupEveryone')).toContain('true');
  });

  it('offers no group options in a normal chat', async () => {
    useAppStore.setState({ chatSessions: [{ ...session, members: [] }] });
    await mount();
    expect(screen.queryByRole('button', { name: 'Show everyone' })).toBeNull();
    expect((await screen.findByTestId('avatar')).textContent).toBe('ayu');
  });
});
