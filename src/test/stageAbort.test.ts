import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../services/stageVoice', () => ({ stopStageVoice: vi.fn(), speakStageMessages: vi.fn() }));
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { stopStageVoice } from '../services/stageVoice';
import { resetApiMocks } from './mockApi';
const initial = useAppStore.getState();
beforeEach(() => {
  resetApiMocks();
  vi.clearAllMocks();
  useAppStore.setState({ ...initial, stageAutoPlay: true }, true);
});
it('stops Stage playback and only requests Stage cancellation', async () => {
  await useAppStore.getState().stopStageTurn();
  expect(useAppStore.getState().stageAutoPlay).toBe(false);
  expect(stopStageVoice).toHaveBeenCalledOnce();
  expect(api.abortStageTurn).toHaveBeenCalledOnce();
  expect(api.abortChatGeneration).not.toHaveBeenCalled();
});
it('keeps autoplay off and surfaces a failed Stage stop without cancelling chat', async () => {
  vi.mocked(api.abortStageTurn).mockRejectedValueOnce(new Error('Stage stop failed'));
  await expect(useAppStore.getState().stopStageTurn()).rejects.toThrow('Stage stop failed');
  expect(useAppStore.getState().stageAutoPlay).toBe(false);
  expect(api.abortChatGeneration).not.toHaveBeenCalled();
});
