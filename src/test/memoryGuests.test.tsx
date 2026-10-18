// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { memoryCharacter } from '../utils/groupChat';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, ChatSession, CognitiveOverview } from '../types';

const card = (id: string, name: string) => ({ id, card: { data: { name } }, bound_lorebooks: [] }) as unknown as CharacterProfile;
const ayu = card('ayu', 'Ayu');
const sora = card('sora', 'Sora');
const session: ChatSession = { id: 'chat-1', character_id: 'ayu', title: 'Gruppe', created_at: 0, updated_at: 0, author_note: '', author_note_depth: 0, message_count: 0, summary: '', summary_until: -1, members: ['sora'] };
const overview = (name: string) => ({ recent_memories: [{ id: 1, category: 'fact', content: `${name} mag Tee` }] }) as unknown as CognitiveOverview;
const initial = useAppStore.getState();

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({
    ...initial, appLanguage: 'en', activeCharacter: ayu, availableCharacters: [ayu, sora], activeChatId: 'chat-1',
    chatSessions: [session], activePersona: { ...initial.activePersona, name: 'Kai' },
  }, true);
  vi.mocked(api.getCognitiveOverview).mockImplementation(async (id) => overview(id));
  vi.mocked(api.listMemoryBackups).mockResolvedValue([]);
});

describe('memory of group chat guests', () => {
  it('shows a guest only while they are a guest of the open chat', () => {
    expect(memoryCharacter(useAppStore.getState())?.id).toBe('ayu');
    useAppStore.setState({ memoryCharacterId: 'sora' });
    expect(memoryCharacter(useAppStore.getState())?.id).toBe('sora');
    // Another chat or another character: back to the active one without a reset.
    useAppStore.setState({ activeChatId: 'chat-2' });
    expect(memoryCharacter(useAppStore.getState())?.id).toBe('ayu');
    useAppStore.setState({ activeChatId: 'chat-1', chatSessions: [{ ...session, members: [] }] });
    expect(memoryCharacter(useAppStore.getState())?.id).toBe('ayu');
  });

  it('loads and edits the shown guest\'s memory', async () => {
    useAppStore.setState({ cognitiveOverview: overview('ayu') });
    useAppStore.getState().setMemoryCharacter('sora');
    await vi.waitFor(() => expect(useAppStore.getState().cognitiveOverview?.recent_memories[0]?.content).toBe('sora mag Tee'));
    await useAppStore.getState().addManualMemory('fact', 'Sora schießt gut', 3);
    expect(api.addEpisodicMemory).toHaveBeenCalledWith('sora', 'fact', 'Sora schießt gut', 3, undefined);
    await useAppStore.getState().generateManualDiary();
    expect(api.generateManualDiaryEntry).toHaveBeenCalledWith(expect.objectContaining({ character_id: 'sora' }));
    useAppStore.getState().setMemoryCharacter(null);
    await vi.waitFor(() => expect(useAppStore.getState().cognitiveOverview?.recent_memories[0]?.content).toBe('ayu mag Tee'));
  });

  it('keeps a reflection of the host from replacing the shown guest\'s memory', async () => {
    useAppStore.getState().setMemoryCharacter('sora');
    await vi.waitFor(() => expect(useAppStore.getState().cognitiveOverview?.recent_memories[0]?.content).toBe('sora mag Tee'));
    vi.mocked(api.triggerMemoryPipeline).mockResolvedValue({ no_change: true } as never);
    await useAppStore.getState().triggerMemoryPipeline(8);
    expect(useAppStore.getState().lastReflectionResult).toBeNull();
    expect(useAppStore.getState().cognitiveOverview?.recent_memories[0]?.content).toBe('sora mag Tee');
  });
});
