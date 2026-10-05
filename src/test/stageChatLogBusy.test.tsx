// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../services/stageVoice', () => ({ stopStageVoice: vi.fn(), speakStageMessages: vi.fn() }));
import { useAppStore } from '../store/useAppStore';
import { StageChatLog } from '../components/stage/StageChatLog';
import type { SceneState } from '../types';

const scene = {
  definition: { id: 'scene-1', title: 'Das Tor', persona: 'Hiroki', party: [] },
  chat_log: [
    {
      id: 'gm-0', sender_id: 'gm', sender_name: 'Game Master', sender_role: 'gm', avatar_url: null,
      content: 'Ein Tor.', turn_mode: 'say', whisper_target: null, event_card: null, timestamp: 0,
    },
  ],
  npcs: [],
} as unknown as SceneState;

describe('StageChatLog during a running turn', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    useAppStore.setState({ stageState: scene, stageLive: [], isProcessingStageTurn: false });
  });

  it('locks editing, regenerating and deleting while the turn runs', () => {
    useAppStore.setState({ isProcessingStageTurn: true });
    render(<StageChatLog />);
    for (const name of ['Nachricht bearbeiten', 'Zug neu generieren', 'Nachricht löschen']) {
      const buttons = screen.queryAllByRole('button', { name });
      expect(buttons.length, name).toBeGreaterThan(0);
      buttons.forEach((button) => expect(button).toBeDisabled());
    }
  });
});
