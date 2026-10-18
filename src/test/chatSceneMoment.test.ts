import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../services/soundFx', () => ({ soundFx: { playDiceRoll: vi.fn() } }));
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, GeneratedImageResult, ImageGenConfig, StoredChatMessage } from '../types';

const stored = (id: string, role: StoredChatMessage['role'], content: string): StoredChatMessage =>
  ({ id, chat_id: 'c1', role, content, thought: null, order_index: 0, swipe_index: 0, swipes: [], created_at: 0, attachments: [] });
const image = { file_name: 'gen.png', file_path: '/data/images/gen.png', base64_data_url: 'data:', prompt_used: 'p' } as GeneratedImageResult;
const initial = useAppStore.getState();
beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({
    ...initial,
    activeCharacter: { id: 'ayu', card: { data: { name: 'Ayu', description: 'Fuchsmädchen' } } } as CharacterProfile,
    activeChatId: 'c1',
    selectedBackend: 'cloud',
    imageGenConfig: { provider: 'automatic1111' } as ImageGenConfig,
    storedMessages: [stored('a', 'assistant', 'Willkommen'), stored('u', 'user', 'Zum Tor'), stored('b', 'assistant', 'Am Tor')],
    messages: [{ role: 'assistant', content: 'Willkommen' }, { role: 'user', content: 'Zum Tor' }, { role: 'assistant', content: 'Am Tor' }],
    chatSessions: [{ id: 'c1', character_id: 'ayu', title: '', created_at: 0, updated_at: 0, author_note: '', author_note_depth: 0, message_count: 3, summary: '', summary_until: -1, members: [] }],
  }, true);
  vi.mocked(api.writeImagePrompt).mockResolvedValue('1girl, gate');
  vi.mocked(api.generateImageAction).mockResolvedValue(image);
  vi.mocked(api.listGeneratedImages).mockResolvedValue([]);
});

describe('chat scene image', () => {
  it('pictures the moment of a chosen reply with the story up to it', async () => {
    await useAppStore.getState().generateSceneImage('chat', { kind: 'moment', upToMessageId: 'a' });
    expect(api.writeImagePrompt).toHaveBeenCalledWith(expect.objectContaining({ kind: 'moment', subject: 'Ayu', context: ['Ayu: Willkommen'] }));
    expect(useAppStore.getState().chatSceneImages.c1).toBe(image);
  });

  it('keeps the portrait and the whole recent story for the HUD button', async () => {
    await useAppStore.getState().generateSceneImage('chat');
    expect(api.writeImagePrompt).toHaveBeenCalledWith(expect.objectContaining({ kind: 'portrait', context: ['Ayu: Willkommen', 'User: Zum Tor', 'Ayu: Am Tor'].map((t) => t.replace('User', useAppStore.getState().activePersona.name)) }));
  });

  it('makes the picture the chat background without touching the rest of its look', async () => {
    useAppStore.setState({ chatSceneImages: { c1: image } });
    vi.mocked(api.saveStageBackground).mockResolvedValue('gen.png');
    await useAppStore.getState().setSceneImageAsBackground('c1');
    expect(api.saveStageBackground).toHaveBeenCalledWith('/data/images/gen.png');
    expect(api.updateChatStyle).toHaveBeenCalledWith('c1', expect.objectContaining({ background: 'gen.png', background_dim: 40 }));
  });
});
