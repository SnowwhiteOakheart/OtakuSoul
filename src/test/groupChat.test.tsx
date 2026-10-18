// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../store/helpers', async (original) => ({ ...await original<object>(), resolvePromptWithLore: vi.fn() }));
vi.mock('../components/voice/VoiceCallControls', () => ({ VoiceCallControls: () => null }));
vi.mock('../services/soundFx', () => ({ soundFx: { playMessageSent: vi.fn() } }));
import { api } from '../services/api';
import { NO_PROMPT_HITS, resolvePromptWithLore, type ResolvedPrompt } from '../store/helpers';
import { useAppStore } from '../store/useAppStore';
import { ChatComposer } from '../components/chat/ChatComposer';
import { groupHistory } from '../utils/groupChat';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, ChatSession, CognitiveOverview, StoredChatMessage } from '../types';

const card = (id: string, name: string, description = '') =>
  ({ id, card: { data: { name, description } }, bound_lorebooks: [] }) as unknown as CharacterProfile;
const ayu = card('ayu', 'Ayu', 'Eine Fuchsdame.');
const sora = card('sora', 'Sora', 'Ein Bogenschütze.');
const msg = (id: string, role: StoredChatMessage['role'], content: string, speaker_id = ''): StoredChatMessage =>
  ({ id, chat_id: 'chat-1', role, content, thought: null, order_index: 0, swipe_index: 0, swipes: [{ content, thought: null }], created_at: 0, attachments: [], speaker_id });
const session: ChatSession = { id: 'chat-1', character_id: 'ayu', title: 'Gruppe', created_at: 0, updated_at: 0, author_note: '', author_note_depth: 0, message_count: 2, summary: '', summary_until: -1, members: ['sora'] };
const prompt: ResolvedPrompt = { system: 'System', post_history: '', hits: NO_PROMPT_HITS };
const done = { generation_id: 'g', full_text: 'Bin dabei.', full_thought: '', aborted: false };
const history = [msg('a', 'assistant', 'Hallo!'), msg('u', 'user', 'Sora, kommst du mit?'), msg('s', 'assistant', 'Klar.', 'sora')];
const initial = useAppStore.getState();

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({
    ...initial, appLanguage: 'en', replyLanguage: 'Deutsch', activeCharacter: ayu, availableCharacters: [ayu, sora],
    activeChatId: 'chat-1', chatSessions: [session], storedMessages: history, autoReflectionEnabled: false,
    activePersona: { ...initial.activePersona, name: 'Kai' },
  }, true);
  vi.mocked(resolvePromptWithLore).mockReset().mockResolvedValue(prompt);
  vi.mocked(api.sendChatMessage).mockResolvedValue(done);
  vi.mocked(api.listChatSessions).mockResolvedValue([session]);
  vi.mocked(api.getCognitiveOverview).mockResolvedValue({ recent_memories: [] } as unknown as CognitiveOverview);
  vi.mocked(api.addChatMessage).mockImplementation(async (_chat, role, content, _thought, _files, speakerId) =>
    ({ ...msg(`new-${role}`, role as StoredChatMessage['role'], content, speakerId ?? ''), order_index: 9 }));
});
afterEach(() => vi.restoreAllMocks());

describe('group chats', () => {
  it('shows each speaker the others by name and keeps their own replies as the assistant', () => {
    const nameOf = (id: string) => (id === 'sora' ? 'Sora' : 'Ayu');
    expect(groupHistory(history, 'sora', nameOf, 'Kai').map((m) => [m.role, m.content])).toEqual([
      ['user', 'Ayu: Hallo!'], ['user', 'Kai: Sora, kommst du mit?'], ['assistant', 'Klar.'],
    ]);
    expect(groupHistory(history, '', nameOf, 'Kai').map((m) => m.role)).toEqual(['assistant', 'user', 'user']);
  });

  it('lets a guest answer with their own card and memory, the others named, and stores them as speaker', async () => {
    await useAppStore.getState().replyAs('sora');
    const [, recent, , , speaker] = vi.mocked(resolvePromptWithLore).mock.calls[0]!;
    expect(speaker?.character.id).toBe('sora');
    expect(speaker?.others).toEqual([{ name: 'Ayu', description: 'Eine Fuchsdame.' }]);
    expect(api.getCognitiveOverview).toHaveBeenCalledWith('sora', 'Kai');
    expect(recent.at(-1)).toEqual({ role: 'assistant', content: 'Klar.', thought: undefined, attachments: undefined });
    const payload = vi.mocked(api.sendChatMessage).mock.calls[0]![0].messages;
    expect(payload.at(-1)).toEqual({ role: 'system', content: "[It is Sora's turn to speak.]" });
    expect(api.addChatMessage).toHaveBeenCalledWith('chat-1', 'assistant', 'Bin dabei.', null, undefined, 'sora');
    expect(useAppStore.getState().storedMessages.at(-1)?.speaker_id).toBe('sora');
    expect(useAppStore.getState().generationSpeakerId).toBe('sora');
  });

  it('gives a new variant to the same speaker', async () => {
    vi.mocked(api.addMessageSwipe).mockResolvedValue({ ...history[2]!, content: 'Gern!' });
    await useAppStore.getState().regenerateMessageSwipe('s');
    expect(vi.mocked(resolvePromptWithLore).mock.calls[0]![4]?.character.id).toBe('sora');
    expect(useAppStore.getState().generationSpeakerId).toBe('sora');
  });

  it('keeps a normal chat as it was', async () => {
    useAppStore.setState({ chatSessions: [{ ...session, members: [] }] });
    await useAppStore.getState().sendMessage('Hallo');
    expect(vi.mocked(resolvePromptWithLore).mock.calls[0]![4]).toBeUndefined();
    expect(api.getCognitiveOverview).not.toHaveBeenCalledWith('sora', expect.anything());
    expect(api.addChatMessage).toHaveBeenLastCalledWith('chat-1', 'assistant', 'Bin dabei.', null);
  });

  it('lets the addressed or routed characters answer in turn until it is the user\'s turn', async () => {
    vi.mocked(api.routeGroupChat).mockResolvedValueOnce('Sora').mockResolvedValueOnce('Ayu').mockResolvedValueOnce('PLAYER');
    await useAppStore.getState().sendMessage('Sora, Ayu – was meint ihr?');
    const speakers = vi.mocked(api.addChatMessage).mock.calls.filter((c) => c[1] === 'assistant').map((c) => c[5] ?? '');
    expect(speakers).toEqual(['sora', '']);
    const firstRoute = vi.mocked(api.routeGroupChat).mock.calls[0]![0];
    expect(firstRoute).toMatchObject({ last_speaker: 'Kai', last_text: 'Sora, Ayu – was meint ihr?', candidates: ['Ayu', 'Sora'], this_turn: [] });
    expect(vi.mocked(api.routeGroupChat).mock.calls[1]![0]).toMatchObject({ last_speaker: 'Sora', this_turn: ['Sora'] });
    // Each reply streams under its own ID.
    const ids = vi.mocked(api.sendChatMessage).mock.calls.map((c) => c[1]);
    expect(new Set(ids).size).toBe(2);
  });

  it('stops after a few replies and lets the chat\'s own character answer when routing names nobody', async () => {
    vi.mocked(api.routeGroupChat).mockResolvedValue('Sora');
    await useAppStore.getState().sendMessage('Und jetzt?');
    expect(vi.mocked(api.sendChatMessage).mock.calls).toHaveLength(3);
    vi.mocked(api.sendChatMessage).mockClear();
    vi.mocked(api.addChatMessage).mockClear();
    vi.mocked(api.routeGroupChat).mockReset().mockResolvedValue('PLAYER');
    await useAppStore.getState().sendMessage('Hallo?');
    expect(vi.mocked(api.addChatMessage).mock.calls.filter((c) => c[1] === 'assistant').map((c) => c[5] ?? '')).toEqual(['']);
  });

  it('ends the round when the user stops', async () => {
    vi.mocked(api.routeGroupChat).mockResolvedValue('Sora');
    vi.mocked(api.sendChatMessage).mockImplementationOnce(async () => {
      await useAppStore.getState().abortGeneration();
      return { ...done, aborted: true };
    });
    vi.mocked(api.abortChatGeneration).mockResolvedValue(undefined);
    await useAppStore.getState().sendMessage('Erzählt mal.');
    expect(api.sendChatMessage).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().isGenerating).toBe(false);
  });

  it('lets every character present learn from the chat into their own memory', async () => {
    const triggerMemoryPipeline = vi.fn().mockResolvedValue(null);
    useAppStore.setState({ autoReflectionEnabled: true, autoReflectionThreshold: 5, triggerMemoryPipeline });
    vi.mocked(api.routeGroupChat).mockResolvedValue('PLAYER');
    await useAppStore.getState().sendMessage('Gute Nacht!');
    await vi.waitFor(() => expect(triggerMemoryPipeline).toHaveBeenCalledTimes(2));
    expect(triggerMemoryPipeline.mock.calls).toEqual([[5, undefined], [5, 'sora']]);
  });

  it('names the speakers in the memory transcript of a guest', async () => {
    vi.mocked(api.triggerMemoryPipeline).mockResolvedValue(null as never);
    await useAppStore.getState().triggerMemoryPipeline(8, 'sora');
    expect(api.triggerMemoryPipeline).toHaveBeenCalledWith(expect.objectContaining({
      character_id: 'sora', chat_id: 'chat-1', speaker_names: { '': 'Ayu', sora: 'Sora' },
    }));
  });

  it('reads a guest\'s reply with the guest\'s voice, loaded once', async () => {
    const voice = { engine: 'kokoro', voice_id: 'sora' } as never;
    vi.mocked(api.getCharacterVoiceConfig).mockResolvedValue(voice);
    await useAppStore.getState().replyAs('sora');
    await useAppStore.getState().replyAs('sora');
    expect(api.getCharacterVoiceConfig).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().speakerVoices.sora).toBe(voice);
    expect(await useAppStore.getState().loadSpeakerVoice('')).toBe(useAppStore.getState().activeVoiceConfig);
  });

  it('offers a button per speaker above the composer', async () => {
    const user = userEvent.setup();
    const replyAs = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({ replyAs });
    render(<ChatComposer />);
    await user.click(screen.getByRole('button', { name: 'Let Sora answer now' }));
    expect(replyAs).toHaveBeenCalledWith('sora');
    expect(screen.getByRole('button', { name: 'Let Ayu answer now' })).toBeTruthy();
  });
});
