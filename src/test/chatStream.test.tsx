// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../components/chat/AdaptiveHud', () => ({ AdaptiveHud: () => null }));
vi.mock('../components/chat/SceneImageCard', () => ({ SceneImageCard: () => null }));
vi.mock('../components/chat/ChatSidebar', () => ({ ChatSidebar: () => null }));
vi.mock('../components/chat/MessageList', () => ({ MessageList: () => null }));
vi.mock('../components/chat/ChatComposer', () => ({ ChatComposer: () => null }));
vi.mock('../components/avatar/AvatarCanvas', () => ({ AvatarCanvas: () => null }));
vi.mock('../services/streamingTts', () => ({ streamingTts: { push: vi.fn(), flush: vi.fn(), cancel: vi.fn() } }));
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { ChatView } from '../components/chat/ChatView';
import { streamingTts } from '../services/streamingTts';
import { resetApiMocks } from './mockApi';
import type { DoneEvent, VoiceConfig } from '../types';
const initial = useAppStore.getState();
let token: Parameters<typeof api.onLlmToken>[0];
let thought: Parameters<typeof api.onLlmThought>[0];
let done: Parameters<typeof api.onLlmDone>[0];
const voice = { engine: 'kokoro' } as VoiceConfig;
beforeEach(() => {
  resetApiMocks();
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(api.scanCharacters).mockResolvedValue([]);
  vi.clearAllMocks();
  useAppStore.setState({ ...initial, appLanguage: 'en', isGenerating: true, generationChatId: 'chat', activeChatId: 'chat', autoTtsEnabled: true, activeVoiceConfig: voice }, true);
  vi.mocked(api.onLlmToken).mockImplementation(async (cb) => { token = cb; return vi.fn<() => void>(); });
  vi.mocked(api.onLlmThought).mockImplementation(async (cb) => { thought = cb; return vi.fn<() => void>(); });
  vi.mocked(api.onLlmDone).mockImplementation(async (cb) => { done = cb; return vi.fn<() => void>(); });
});
async function mount() {
  const view = render(<ChatView />);
  await waitFor(() => expect(api.onLlmDone).toHaveBeenCalled());
  return view;
}
const completed = (): DoneEvent => ({ full_text: 'Finished', full_thought: '' });
describe('native chat stream identity', () => {
  it('accepts tokens and thoughts', async () => {
    await mount();
    act(() => { token('Current text'); thought('Current thought'); });
    expect(screen.getByText('Current text')).toBeInTheDocument();
    expect(screen.getByText('Current thought')).toBeInTheDocument();
    expect(streamingTts.push).toHaveBeenCalledExactlyOnceWith('Current text', voice);
    expect(streamingTts.flush).not.toHaveBeenCalled();
    expect(api.classifyTextEmotion).not.toHaveBeenCalled();
  });
  it('rejects anonymous events and events after abort or navigation', async () => {
    await mount();
    act(() => { useAppStore.setState({ isGenerating: false }); token('Aborted'); useAppStore.setState({ isGenerating: true, activeChatId: 'other' }); token('Wrong chat'); });
    expect(screen.queryByText(/Anonymous|Aborted|Wrong chat/)).not.toBeInTheDocument();
  });
  it('accepts matching completion and applies its emotion after the request finishes', async () => {
    let finish!: (value: Awaited<ReturnType<typeof api.classifyTextEmotion>>) => void;
    vi.mocked(api.classifyTextEmotion).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await mount();
    act(() => token('Current text'));
    let pending!: void | Promise<void>;
    act(() => { pending = done(completed()); });
    expect(screen.queryByText('Current text')).not.toBeInTheDocument();
    const emotion = { emotion: 'happy', intensity: 0.8, confidence: 1, vrm_expression: 'happy', live2d_expression: 'joy_animation' } as const;
    act(() => useAppStore.setState({ isGenerating: false, generationChatId: null }));
    await act(async () => { finish(emotion); await pending; });
    expect(useAppStore.getState().currentEmotion).toEqual(emotion);
  });
  it('does not apply emotion from an old completion after another generation starts', async () => {
    let finish!: (value: Awaited<ReturnType<typeof api.classifyTextEmotion>>) => void;
    vi.mocked(api.classifyTextEmotion).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await mount();
    let pending!: void | Promise<void>;
    act(() => { pending = done(completed()); });
    expect(streamingTts.flush).toHaveBeenCalledWith('Finished', voice);
    act(() => useAppStore.setState({ generationChatId: 'next' }));
    await act(async () => { finish({ emotion: 'happy', intensity: 0.8, confidence: 1, vrm_expression: 'happy', live2d_expression: 'joy_animation' }); await pending; });
    expect(useAppStore.getState().currentEmotion).toEqual(initial.currentEmotion);
  });
});
