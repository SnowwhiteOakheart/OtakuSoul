// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../services/soundFx', () => ({ soundFx: { playWarning: vi.fn() } }));
import { api } from '../services/api';
import { mergeHits, resolvePromptWithLore, type PromptHits } from '../store/helpers';
import { useAppStore } from '../store/useAppStore';
import { PromptHitsButton, PromptHitsList } from '../components/chat/PromptHitsView';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, CognitiveOverview, LorebookEntry } from '../types';

const entry = (name: string, injection_behavior = 'passive') =>
  ({ name, key: [name], exclude_key: [], content: `${name} text`, trigger_type: 'keyword', injection_behavior }) as LorebookEntry;
const initial = useAppStore.getState();
beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ ...initial, appLanguage: 'en' }, true);
});

describe('prompt hits', () => {
  it('records the lorebook entries, memories and summary that went into the prompt', async () => {
    const tor = entry('Tor');
    const regel = entry('Regel', 'active');
    vi.mocked(api.evaluateMultiLorebooks).mockResolvedValue({ passive_entries: [tor], active_entries: [regel], activated_entry_names: [], triggered_tension_events: [], new_tension: 0 });
    vi.mocked(api.assemblePrompt).mockResolvedValue({ system: 'S', post_history: null });
    const state = {
      ...useAppStore.getState(),
      activeCharacter: { id: 'ayu', card: { data: { name: 'Ayu' } } } as CharacterProfile,
      allLorebooks: [{ name: 'Kyoto', description: '', entries: [tor, regel], is_global: true }],
      cognitiveOverview: { recent_memories: [{ id: 7, category: 'promise', content: 'Morgen zum Schrein' }] } as unknown as CognitiveOverview,
      activeChatId: 'c',
      chatSessions: [{ id: 'c', character_id: 'ayu', title: '', created_at: 0, updated_at: 0, author_note: '', author_note_depth: 0, message_count: 0, summary: 'Bisher …', summary_until: 3 }],
    };
    const prompt = await resolvePromptWithLore(state, [], 'hi');
    expect(prompt.system).toBe('S');
    expect(prompt.hits).toEqual({
      lore: [{ name: 'Regel', book: 'Kyoto', directive: true }, { name: 'Tor', book: 'Kyoto', directive: false }],
      memories: [{ id: 7, category: 'promise', content: 'Morgen zum Schrein' }],
      summary: true,
    });
  });

  it('merges the hits of a continued reply without duplicates', () => {
    const a: PromptHits = { lore: [{ name: 'Tor', book: 'K', directive: false }], memories: [{ id: 1, category: 'x', content: 'a' }], summary: false };
    const b: PromptHits = { lore: [{ name: 'Tor', book: 'K', directive: false }, { name: 'See', book: 'K', directive: false }], memories: [{ id: 1, category: 'x', content: 'a' }], summary: true };
    expect(mergeHits(a, b)).toEqual({ lore: [...a.lore, b.lore[1]], memories: a.memories, summary: true });
    expect(mergeHits(undefined, b)).toBe(b);
  });

  it('shows a count at the reply and the list when opened', async () => {
    const user = userEvent.setup();
    const hits: PromptHits = { lore: [{ name: 'Tor', book: 'Kyoto', directive: true }], memories: [], summary: false };
    const onToggle = vi.fn();
    render(<PromptHitsButton hits={hits} open={false} onToggle={onToggle} />);
    await user.click(screen.getByRole('button', { name: /lorebook: 1, memories: 0/ }));
    expect(onToggle).toHaveBeenCalled();
    render(<PromptHitsList hits={hits} />);
    expect(screen.getByText('Tor')).toBeTruthy();
    expect(screen.getByText('Direction')).toBeTruthy();
  });
});
