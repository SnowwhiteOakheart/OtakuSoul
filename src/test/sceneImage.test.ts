// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, GeneratedImageResult, ImageGenConfig, SceneState } from '../types';

const initialState = useAppStore.getState();

const config: ImageGenConfig = {
  provider: 'local',
  api_url: '',
  api_key: null,
  positive_prompt_prefix: '',
  negative_prompt: '',
  width: 832,
  height: 1216,
  steps: 20,
  cfg_scale: 1,
  sampler_name: 'euler',
  seed: -1,
  local_model_id: 'flux1-dev-q5',
  vram_strategy: 'auto',
};

const image: GeneratedImageResult = {
  file_name: 'gen_1.png',
  file_path: '/data/generated_images/gen_1.png',
  base64_data_url: 'data:image/png;base64,AAAA',
  prompt_used: 'a girl in a library',
  negative_used: '',
  width: 832,
  height: 1216,
  created_at: '2026-09-30T19:00:00Z',
};

const character = {
  id: 'ayu',
  card: {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: 'Ayu',
      description: '{{char}} ist ein Idol.',
      personality: '',
      scenario: '',
      first_mes: '',
      mes_example: '',
      alternate_greetings: [],
      tags: [],
      extensions: {
        otakusoul_i18n: { source_language: 'de', translations: { en: { description: '{{char}} is an idol.' } } },
      },
    },
  },
} as unknown as CharacterProfile;

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState(initialState, true);
  useAppStore.setState({
    imageGenConfig: config,
    activeCharacter: character,
    activeChatId: 'chat-1',
    replyLanguage: 'English',
    selectedBackend: 'local',
    serverStatus: { state: 'running', port: 48596, pid: 1, model_name: null, error_message: null, recent_logs: [] },
    messages: [
      { role: 'user', content: 'Shall we go to the library?' },
      { role: 'assistant', content: '*{{char}} nods* Sure!' },
    ],
  });
  vi.mocked(api.listImageModels).mockResolvedValue([
    { id: 'flux1-dev-q5', name: 'FLUX.1', family: 'flux', vram_mb: 10_000, download_bytes: 1, missing_bytes: 0, installed: true, license: '', recommended: true, fits_gpu: true },
  ]);
  vi.mocked(api.generateImageAction).mockResolvedValue(image);
  vi.mocked(api.listGeneratedImages).mockResolvedValue([]);
});

describe('generateSceneImage', () => {
  it('lets the chat model write a natural-language prompt for FLUX and keeps the image with the chat', async () => {
    vi.mocked(api.writeImagePrompt).mockResolvedValue('Ayu walking into a library, anime illustration, detailed.');

    await useAppStore.getState().generateSceneImage('chat');

    const request = vi.mocked(api.writeImagePrompt).mock.calls[0]![0];
    expect(request).toMatchObject({ kind: 'portrait', style: 'natural', subject: 'Ayu', description: 'Ayu is an idol.' });
    expect(request.context).toEqual(['User: Shall we go to the library?', 'Ayu: *Ayu nods* Sure!']);
    expect(api.generateImageAction).toHaveBeenCalledWith('Ayu walking into a library, anime illustration, detailed.', null, config);
    expect(useAppStore.getState().chatSceneImages['chat-1']).toEqual(image);
    expect(useAppStore.getState().isGeneratingSceneImage).toBe(false);
  });

  it('falls back to the template prompt when the chat model is not available', async () => {
    useAppStore.setState({ serverStatus: { ...useAppStore.getState().serverStatus, state: 'stopped' } });
    vi.mocked(api.buildCharacterImagePrompt).mockResolvedValue('1girl, Ayu');

    await useAppStore.getState().generateSceneImage('chat');

    expect(api.writeImagePrompt).not.toHaveBeenCalled();
    expect(api.generateImageAction).toHaveBeenCalledWith('1girl, Ayu', null, config);
  });

  it('sets the generated image as the stage background', async () => {
    vi.mocked(api.writeImagePrompt).mockResolvedValue('an old library at dusk');
    vi.mocked(api.saveStageBackground).mockResolvedValue('gen_1.png');
    vi.mocked(api.saveStageScene).mockResolvedValue(undefined);
    const scene = {
      definition: { title: 'Zuflucht', description: '', world_context: 'Ein Orden' },
      world: { location: 'Bibliothek', time_of_day: 'Dusk', weather: 'Clear' },
      chat_log: [{ sender_name: 'Game Master', content: 'Dust dances in the light.' }],
      current_bg: null,
    } as unknown as SceneState;
    useAppStore.setState({ stageState: scene });

    await useAppStore.getState().generateSceneImage('stage');

    expect(vi.mocked(api.writeImagePrompt).mock.calls[0]![0]).toMatchObject({ kind: 'scene', subject: 'Bibliothek' });
    expect(api.saveStageBackground).toHaveBeenCalledWith('/data/generated_images/gen_1.png');
    expect(api.saveStageScene).toHaveBeenCalledWith(expect.objectContaining({ current_bg: 'gen_1.png' }));
  });

  it('reports generation errors to the caller', async () => {
    vi.mocked(api.writeImagePrompt).mockResolvedValue('prompt');
    vi.mocked(api.generateImageAction).mockRejectedValue('{"code":"backend.localImage.noModel","params":{}}');
    await expect(useAppStore.getState().generateSceneImage('chat')).rejects.toBeDefined();
    expect(useAppStore.getState().isGeneratingSceneImage).toBe(false);
  });
});
