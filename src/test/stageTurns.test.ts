import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../services/stageVoice', () => ({ stopStageVoice: vi.fn(), speakStageMessages: vi.fn() }));
vi.mock('../services/soundFx', () => ({ soundFx: new Proxy({}, { get: () => vi.fn() }) }));
import { api } from '../services/api';
import { speakStageMessages } from '../services/stageVoice';
import { useAppStore } from '../store/useAppStore';
import { resetApiMocks } from './mockApi';
import type { SceneState, SceneTurnMessage, StageTurnRequest } from '../types';

const initial = useAppStore.getState();
const line = (id: string, sender_role: string, content: string): SceneTurnMessage => ({
  id, sender_id: id, sender_name: sender_role === 'player' ? 'Hiroki' : 'Game Master', sender_role, avatar_url: null,
  content, turn_mode: 'say', whisper_target: null, event_card: null, timestamp: 0,
});
const scene = {
  definition: { id: 'scene-1', title: 'Das Tor', persona: 'Hiroki', party: ['Ayu', 'Rin'] },
  chat_log: [line('gm-0', 'gm', 'Ein Tor.')],
  npcs: [
    { name: 'Wirt', active: true, promoted_character_id: null },
    { name: 'Geist', active: false, promoted_character_id: null },
  ],
} as unknown as SceneState;
const withLines = (...extra: SceneTurnMessage[]) => ({ ...scene, chat_log: [...scene.chat_log, ...extra] });
const request = () => vi.mocked(api.runStageTurn).mock.calls.at(-1)![0] as StageTurnRequest;

beforeEach(() => {
  resetApiMocks();
  vi.clearAllMocks();
  useAppStore.setState({ ...initial, stageState: scene, stageReadAloud: false }, true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('stage turns', () => {
  it('shows the player line at once and replaces it with the stored turn', async () => {
    let finish!: (state: SceneState) => void;
    vi.mocked(api.runStageTurn).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const turn = useAppStore.getState().runStageTurn('  Ich klopfe an. ', 'do');
    const pending = useAppStore.getState();
    expect(pending.isProcessingStageTurn).toBe(true);
    expect(pending.stageState!.chat_log.at(-1)).toMatchObject({ sender_name: 'Hiroki', content: 'Ich klopfe an.', turn_mode: 'do' });
    expect(request()).toMatchObject({ scene_id: 'scene-1', user_input: '  Ich klopfe an. ', turn_mode: 'do' });

    const stored = withLines(line('p-1', 'player', 'Ich klopfe an.'), line('gm-1', 'gm', 'Es knarrt.'));
    finish(stored);
    await turn;
    expect(useAppStore.getState()).toMatchObject({ stageState: stored, isProcessingStageTurn: false, stageLive: [] });
  });

  it('restores the scene and rethrows when a turn fails', async () => {
    vi.mocked(api.runStageTurn).mockRejectedValueOnce(new Error('Server weg'));
    await expect(useAppStore.getState().runStageTurn('Hallo?')).rejects.toThrow('Server weg');
    expect(useAppStore.getState()).toMatchObject({ stageState: scene, isProcessingStageTurn: false });
  });

  it('whispers to the first party member unless a known target is picked, active NPCs included', async () => {
    vi.mocked(api.runStageTurn).mockResolvedValue(scene);
    await useAppStore.getState().runStageTurn('Psst.', 'whisper', 'Unbekannt');
    expect(request().whisper_target).toBe('Ayu');
    await useAppStore.getState().runStageTurn('Psst.', 'whisper', 'Wirt');
    expect(request().whisper_target).toBe('Wirt');
    await useAppStore.getState().runStageTurn('Psst.', 'whisper', 'Geist');
    expect(request().whisper_target).toBe('Ayu');
  });

  it('reads only the new lines aloud', async () => {
    useAppStore.setState({ stageReadAloud: true });
    const stored = withLines(line('p-1', 'player', 'Hallo'), line('gm-1', 'gm', 'Antwort'));
    vi.mocked(api.runStageTurn).mockResolvedValue(stored);
    await useAppStore.getState().runStageTurn('Hallo');
    expect(speakStageMessages).toHaveBeenCalledWith(stored.chat_log.slice(1), expect.anything());
  });

  it('regenerating reads the lines after the last player line', async () => {
    useAppStore.setState({ stageReadAloud: true });
    const stored = withLines(line('p-1', 'player', 'Hallo'), line('gm-1', 'gm', 'Neue Antwort'));
    vi.mocked(api.regenerateStageTurn).mockResolvedValue(stored);
    await useAppStore.getState().regenerateStageTurn();
    expect(useAppStore.getState().stageState).toBe(stored);
    expect(speakStageMessages).toHaveBeenCalledWith([stored.chat_log[2]], expect.anything(), true);
  });

  it('merges streamed chunks per message', () => {
    const { applyStageStream } = useAppStore.getState();
    applyStageStream({ message_id: 'm1', sender_name: 'GM', text: 'Der ', done: false } as never);
    applyStageStream({ message_id: 'm2', sender_name: 'Ayu', text: 'Hi', done: false } as never);
    applyStageStream({ message_id: 'm1', sender_name: 'GM', text: 'Nebel.', done: true } as never);
    expect(useAppStore.getState().stageLive.map((m) => [m.message_id, m.text, m.done])).toEqual([
      ['m1', 'Der Nebel.', true],
      ['m2', 'Hi', false],
    ]);
  });

  it('a player turn ends auto-play, continuing is ignored while a turn runs', async () => {
    useAppStore.setState({ stageAutoPlay: true });
    vi.mocked(api.runStageTurn).mockResolvedValue(scene);
    await useAppStore.getState().runStageTurn('Stopp mal.');
    expect(useAppStore.getState().stageAutoPlay).toBe(false);

    useAppStore.setState({ isProcessingStageTurn: true });
    vi.mocked(api.runStageTurn).mockClear();
    await useAppStore.getState().continueStagePlot();
    expect(api.runStageTurn).not.toHaveBeenCalled();
  });

  it('auto-play runs a limited number of continue turns and then switches off', async () => {
    vi.useFakeTimers();
    vi.mocked(api.runStageTurn).mockResolvedValue(scene);
    useAppStore.getState().setStageAutoPlay(true);
    await vi.runAllTimersAsync();
    expect(api.runStageTurn).toHaveBeenCalledTimes(5);
    expect(vi.mocked(api.runStageTurn).mock.calls.every(([req]) => req.turn_mode === 'continue' && req.user_input === '')).toBe(true);
    expect(useAppStore.getState().stageAutoPlay).toBe(false);
  });

  it('auto-play stops after a failed turn', async () => {
    vi.useFakeTimers();
    vi.mocked(api.runStageTurn).mockRejectedValue(new Error('kaputt'));
    useAppStore.getState().setStageAutoPlay(true);
    await vi.runAllTimersAsync();
    expect(api.runStageTurn).toHaveBeenCalledOnce();
    expect(useAppStore.getState().stageAutoPlay).toBe(false);
  });

  it('refuses to change the scene definition during a turn', async () => {
    useAppStore.setState({ isProcessingStageTurn: true });
    await expect(useAppStore.getState().updateStageSceneDefinition(scene.definition)).rejects.toThrow('backend.stage.editorBusy');
    expect(api.updateStageSceneDefinition).not.toHaveBeenCalled();
  });
});
