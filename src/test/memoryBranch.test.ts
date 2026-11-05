// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../services/soundFx', () => ({ soundFx: { playWarning: vi.fn() } }));
import { api } from '../services/api';
import { resolvePromptWithLore } from '../store/helpers';
import { useAppStore } from '../store/useAppStore';
import { resetApiMocks } from './mockApi';
import { memoryId, memoryIdFor } from '../utils/groupChat';
import type { CharacterProfile, ChatSession } from '../types';

const session = (id: string, memory_branch: string, members: string[] = []): ChatSession => ({
  id, character_id: 'ayu', title: id, created_at: 0, updated_at: 0, author_note: '', author_note_depth: 0,
  message_count: 2, summary: '', summary_until: -1, members, memory_branch,
});
const ayu = { id: 'ayu', card: { data: { name: 'Ayu' } } } as CharacterProfile;
const sora = { id: 'sora', card: { data: { name: 'Sora' } } } as CharacterProfile;
const initial = useAppStore.getState();

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({
    ...initial, appLanguage: 'en', activeCharacter: ayu, availableCharacters: [ayu, sora],
    chatSessions: [session('main', ''), session('whatif', 'ab12cd34', ['sora'])], activeChatId: 'whatif',
  }, true);
});

describe('memory of a branch', () => {
  it('belongs to the chat\'s own character only', () => {
    expect(memoryIdFor('ayu', session('main', ''))).toBe('ayu');
    expect(memoryIdFor('ayu', session('whatif', 'ab12cd34'))).toBe('ayu@branch-ab12cd34');
    // A guest keeps their shared memory.
    expect(memoryIdFor('sora', session('whatif', 'ab12cd34'))).toBe('sora');
    expect(memoryId(useAppStore.getState())).toBe('ayu@branch-ab12cd34');
    useAppStore.setState({ memoryCharacterId: 'sora' });
    expect(memoryId(useAppStore.getState())).toBe('sora');
  });

  it('is what the prompt, the reflection and the drawer use', async () => {
    vi.mocked(api.evaluateMultiLorebooks).mockResolvedValue({ passive_entries: [], active_entries: [], activated_entry_names: [], triggered_tension_events: [], new_tension: 0 });
    vi.mocked(api.assemblePrompt).mockResolvedValue({ system: 'S', post_history: null });
    await resolvePromptWithLore(useAppStore.getState(), [], 'hi');
    expect(api.getPromptMemories).toHaveBeenCalledWith('ayu@branch-ab12cd34', expect.any(String), expect.any(String));

    vi.mocked(api.triggerMemoryPipeline).mockResolvedValue(null as never);
    await useAppStore.getState().triggerMemoryPipeline(8);
    expect(api.triggerMemoryPipeline).toHaveBeenLastCalledWith(expect.objectContaining({ character_id: 'ayu@branch-ab12cd34', chat_id: 'whatif' }));
    // The guest learns into their own, shared memory.
    await useAppStore.getState().triggerMemoryPipeline(8, 'sora');
    expect(api.triggerMemoryPipeline).toHaveBeenLastCalledWith(expect.objectContaining({ character_id: 'sora' }));

    vi.mocked(api.getCognitiveOverview).mockResolvedValue(null as never);
    await useAppStore.getState().fetchCognitiveOverview();
    expect(api.getCognitiveOverview).toHaveBeenLastCalledWith('ayu@branch-ab12cd34', expect.any(String));
  });

  it('reloads the overview when switching between main line and branch', async () => {
    vi.mocked(api.getChatMessages).mockResolvedValue([]);
    vi.mocked(api.listChatBookmarks).mockResolvedValue([]);
    vi.mocked(api.getCognitiveOverview).mockResolvedValue(null as never);
    await useAppStore.getState().switchChatSession('main');
    expect(api.getCognitiveOverview).toHaveBeenCalledWith('ayu', expect.any(String));
  });

  it('asks the backend for a memory of its own when branching that way', async () => {
    vi.mocked(api.branchChat).mockResolvedValue(session('new', 'ffff0000'));
    vi.mocked(api.listChatSessions).mockResolvedValue([]);
    vi.mocked(api.getChatMessages).mockResolvedValue([]);
    await useAppStore.getState().branchChatFrom('m1', true, 'main');
    expect(api.branchChat).toHaveBeenCalledWith('main', 'm1', expect.stringContaining('what if'), true);
  });
});
