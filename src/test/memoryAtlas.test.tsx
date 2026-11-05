// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { AtlasTab } from '../components/chat/memory/AtlasTab';
import { resetApiMocks } from './mockApi';
import { LANE_Y, edgePath, layoutAtlas } from '../utils/memoryAtlas';
import type { AtlasNode, CharacterProfile, MemoryAtlas } from '../types';

const node = (id: string, kind: string, text: string, at: number | null = null): AtlasNode => ({
  id, kind, text, tag: '', at, weight: 3, pinned: false, superseded: false, memory_id: null,
  chat_id: kind === 'memory' ? 'chat-1' : null, message_id: kind === 'memory' ? 'msg-1' : null,
});

const atlas: MemoryAtlas = {
  nodes: [
    node('identity:0', 'identity', 'Hat Angst vor Gewitter'),
    node('habit:0', 'habit', 'Trinkt Jasmintee'),
    node('memory:1', 'memory', 'Das Gewitter am See', 100),
    node('memory:2', 'memory', 'Kai bestellt Jasmintee', 200),
    node('diary:1', 'diary', 'Abend\nÜber Tee gesprochen', 300),
  ],
  edges: [
    { from: 'memory:1', to: 'identity:0', kind: 'shaped', inferred: true },
    { from: 'memory:2', to: 'habit:0', kind: 'shaped', inferred: true },
    { from: 'memory:2', to: 'diary:1', kind: 'reflects', inferred: true },
  ],
  hidden_memories: 0,
};

describe('layoutAtlas', () => {
  it('orders experiences by time and puts beliefs above what shaped them', () => {
    const layout = layoutAtlas(atlas, (at) => `d${at}`);
    const p = (id: string) => layout.points.get(id)!;
    expect(p('memory:1').x).toBeLessThan(p('memory:2').x);
    expect(p('memory:2').x).toBeLessThan(p('diary:1').x);
    expect(p('diary:1').y).toBe(LANE_Y.diary);
    expect(p('identity:0').y).toBe(LANE_Y.belief);
    // Each belief sits above its experience.
    expect(p('identity:0').x).toBe(p('memory:1').x);
    expect(p('habit:0').x).toBe(p('memory:2').x);
    expect(layout.ticks[0]).toEqual({ x: p('memory:1').x, label: 'd100' });
  });

  it('keeps beliefs apart when they want the same place', () => {
    const crowded: MemoryAtlas = {
      ...atlas,
      edges: [
        { from: 'memory:1', to: 'identity:0', kind: 'shaped', inferred: true },
        { from: 'memory:1', to: 'habit:0', kind: 'shaped', inferred: true },
      ],
    };
    const layout = layoutAtlas(crowded, String);
    const gap = Math.abs(layout.points.get('identity:0')!.x - layout.points.get('habit:0')!.x);
    expect(gap).toBeGreaterThanOrEqual(30);
  });

  it('arcs a link within one lane', () => {
    expect(edgePath({ x: 0, y: 10, r: 1 }, { x: 20, y: 10, r: 1 })).toContain('Q');
  });
});

describe('AtlasTab', () => {
  beforeEach(() => {
    resetApiMocks();
    useAppStore.setState({
      appLanguage: 'en',
      activeCharacter: { id: 'ayu', card: { data: { name: 'Ayu' } } } as CharacterProfile,
      memoryCharacterId: null,
    });
    vi.mocked(api.getMemoryAtlas).mockResolvedValue(atlas);
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows a point with its connections and follows them', async () => {
    const user = userEvent.setup();
    const { container } = render(<AtlasTab />);
    await waitFor(() => expect(container.querySelector('[data-atlas-node="habit:0"]')).not.toBeNull());
    expect(api.getMemoryAtlas).toHaveBeenCalledWith('ayu', expect.any(String), false);

    await user.click(container.querySelector('[data-atlas-node="habit:0"]')!);
    const detail = container.querySelector('[data-atlas-detail]')!;
    expect(detail.textContent).toContain('Trinkt Jasmintee');
    expect(detail.textContent).toContain('Shaped by:');
    // The link list, not the dot in the drawing.
    await user.click(detail.querySelector('li button')!);
    expect(container.querySelector('[data-atlas-detail]')!.textContent).toContain('Kai bestellt Jasmintee');
    expect(container.querySelector('[data-atlas-detail]')!.textContent).toContain('In the diary:');
    expect(screen.getByRole('button', { name: 'Go to message' })).toBeInTheDocument();
  });

  it('loads outdated memories on request', async () => {
    const user = userEvent.setup();
    render(<AtlasTab />);
    await user.click(screen.getByRole('checkbox', { name: 'Show outdated' }));
    await waitFor(() => expect(api.getMemoryAtlas).toHaveBeenLastCalledWith('ayu', expect.any(String), true));
  });
});
