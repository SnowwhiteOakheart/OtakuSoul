import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { resetApiMocks } from './mockApi';
import { OFFSCREEN_MIN_PAUSE_SECONDS, stageOffscreenDue } from '../utils/stageOffscreen';
import type { SceneState, SceneTurnMessage } from '../types';

const initialState = useAppStore.getState();
const now = 2_000_000_000;
const line = (sender_role: string, timestamp: number): SceneTurnMessage =>
  ({ id: `${sender_role}${timestamp}`, sender_id: sender_role, sender_name: sender_role, sender_role, content: '…', turn_mode: 'say', timestamp });
const scene = (over: Partial<SceneState> = {}): SceneState => ({
  definition: { id: 's1', party: ['Lirwen', 'Faelion'] },
  combat: { is_active: false },
  chat_log: [line('gm', now - OFFSCREEN_MIN_PAUSE_SECONDS - 60), line('player', now - OFFSCREEN_MIN_PAUSE_SECONDS)],
  ...over,
} as unknown as SceneState);

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ ...initialState, settingsLoaded: true }, true);
});

describe('story between the sessions', () => {
  it('is due only after a long pause in a story the player has started', () => {
    expect(stageOffscreenDue(scene(), now)).toBe(true);
    expect(stageOffscreenDue(scene(), now - 1)).toBe(false);
    expect(stageOffscreenDue(scene({ chat_log: [line('gm', 0)] }), now)).toBe(false);
    expect(stageOffscreenDue(scene({ combat: { is_active: true } as never }), now)).toBe(false);
    expect(stageOffscreenDue(scene({ definition: { id: 's1', party: [] } as never }), now)).toBe(false);
    expect(stageOffscreenDue(scene({ definition: { id: 's1', party: ['Lirwen'], disable_offscreen: true } as never }), now)).toBe(false);
  });

  it('asks the backend once it is due and shows the story', async () => {
    const old = scene({ chat_log: [line('player', 1)] });
    const told = { ...old, chat_log: [...old.chat_log, line('companion', 2)] };
    vi.mocked(api.stageTellOffscreen).mockResolvedValue(told);
    useAppStore.setState({ stageState: old });
    await useAppStore.getState().tellStageOffscreen();
    expect(api.stageTellOffscreen).toHaveBeenCalledWith('s1');
    expect(useAppStore.getState().stageState?.chat_log).toHaveLength(2);
    expect(useAppStore.getState().isProcessingStageTurn).toBe(false);
  });

  it('leaves a scene played recently alone', async () => {
    useAppStore.setState({ stageState: scene({ chat_log: [line('player', Date.now() / 1000)] }) });
    await useAppStore.getState().tellStageOffscreen();
    expect(api.stageTellOffscreen).not.toHaveBeenCalled();
  });
});
