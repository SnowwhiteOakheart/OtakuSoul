import { api } from '../../services/api';
import { soundFx } from '../../services/soundFx';
import { fillCardMacros, languageCode, localizeCard } from '../../utils/cardI18n';
import type {
  BackupGroupSelection,
  BackupEntryInfo,
  ImageGenConfig,
  CharacterReference,
  GeneratedImageResult,
  GeneratedImageInfo,
  DiscordBotConfig,
  DiscordBotStatus,
  WebServerConfig,
  WebServerStatus,
} from '../../types';
import type { SliceCreator } from '../storeTypes';
import { trackTask } from './taskSlice';
import { translate } from '../../i18n';
import { reportFailure } from '../reportFailure';
import { DEFAULT_CHAT_STYLE } from '../../utils/settingDefaults';

/** Profile backups, image generation, Discord and the mobile web server. */
export interface EcosystemSlice {
  backups: BackupEntryInfo[];
  fetchBackups: () => Promise<void>;
  createBackup: (selection: BackupGroupSelection, description?: string) => Promise<BackupEntryInfo | null>;
  restoreBackup: (filename: string, groups?: BackupGroupSelection) => Promise<string | null>;
  deleteBackup: (filename: string) => Promise<boolean>;
  imageGenConfig: ImageGenConfig | null;
  generatedImages: GeneratedImageInfo[];
  fetchImageGenConfig: () => Promise<void>;
  saveImageGenConfig: (config: ImageGenConfig) => Promise<void>;
  buildCharacterImagePrompt: (
    characterName: string,
    characterDescription?: string | null,
    emotion?: string | null,
    sceneContext?: string | null,
    userPrompt?: string | null
  ) => Promise<string>;
  /** Generates an image and refreshes the gallery; throws when generation fails. */
  generateImageAction: (
    prompt: string,
    negative?: string | null,
    customConfig?: ImageGenConfig | null,
    characterReference?: CharacterReference | null,
  ) => Promise<GeneratedImageResult | null>;
  /** Latest scene image per chat session id. */
  chatSceneImages: Record<string, GeneratedImageResult>;
  isGeneratingSceneImage: boolean;
  /**
   * Lets the chat model write a prompt from the active character (chat) or scene (stage) and the
   * recent story, then generates the image. In the stage it becomes the scene background. In the
   * chat `kind` picks a portrait (default) or the moment of the story; `upToMessageId` ends the
   * story at that message ("this moment as a picture"); `selfie` is a picture the character
   * sends and `dream` one of a dream they told (`story` = its text); both go into the chat as a
   * message (see `sendPicture`), not onto the scene card. In the chat the character's picture
   * keeps their look.
   */
  generateSceneImage: (
    target: 'chat' | 'stage',
    options?: { kind?: 'portrait' | 'moment' | 'selfie' | 'dream'; upToMessageId?: string; story?: string[] },
  ) => Promise<GeneratedImageResult | null>;
  /** Makes a chat scene image the chat's background (copied into the Stage backgrounds). */
  setSceneImageAsBackground: (chatId: string) => Promise<void>;
  dismissChatSceneImage: (chatId: string) => void;
  fetchGeneratedImages: () => Promise<void>;
  discordRpcEnabled: boolean;
  discordBotConfig: DiscordBotConfig | null;
  discordBotStatus: DiscordBotStatus | null;
  setDiscordRpcEnabled: (enabled: boolean) => Promise<void>;
  fetchDiscordStatus: () => Promise<void>;
  saveDiscordBotConfig: (config: DiscordBotConfig) => Promise<void>;
  startDiscordBot: () => Promise<void>;
  stopDiscordBot: () => Promise<void>;
  webServerConfig: WebServerConfig | null;
  webServerStatus: WebServerStatus | null;
  fetchWebServerStatus: () => Promise<void>;
  saveWebServerConfig: (config: WebServerConfig) => Promise<void>;
  startWebServer: () => Promise<void>;
  stopWebServer: () => Promise<void>;
  regenerateWebServerToken: () => Promise<string | null>;
}

export const createEcosystemSlice: SliceCreator<EcosystemSlice> = (set, get) => ({
  backups: [],

  fetchBackups: async () => {
    try {
      const list = await api.listProfileBackups();
      set({ backups: list });
    } catch (e) {
      console.error('Failed to list backups:', e);
    }
  },

  createBackup: async (selection, description) => {
    try {
      const entry = await api.createProfileBackup(selection, description);
      await get().fetchBackups();
      soundFx.playSave();
      return entry;
    } catch (e) {
      console.error('Failed to create backup:', e);
      throw e;
    }
  },

  // Errors propagate so the caller can report them instead of claiming success.
  restoreBackup: async (filename, groups) => {
    const msg = await api.restoreProfileBackup(filename, groups);
    await get().fetchBackups();
    await get().refreshCharacters();
    await get().refreshLorebooks();
    soundFx.playLevelUp();
    return msg;
  },

  deleteBackup: async (filename) => {
    try {
      const ok = await api.deleteProfileBackup(filename);
      await get().fetchBackups();
      return ok;
    } catch (e) {
      console.error('Failed to delete backup:', e);
      throw e;
    }
  },

  imageGenConfig: null,

  generatedImages: [],

  fetchImageGenConfig: async () => {
    try {
      const config = await api.getImageGenConfig();
      set({ imageGenConfig: config });
    } catch (e) {
      console.error('Failed to get image gen config:', e);
    }
  },

  saveImageGenConfig: async (config) => {
    try {
      await api.saveImageGenConfig(config);
      set({ imageGenConfig: config });
      soundFx.playSave();
    } catch (e) {
      console.error('Failed to save image gen config:', e);
      throw e;
    }
  },

  buildCharacterImagePrompt: async (charName, charDesc, emotion, sceneCtx, userPrompt) => {
    try {
      return await api.buildCharacterImagePrompt(charName, charDesc, emotion, sceneCtx, userPrompt);
    } catch (e) {
      console.error('Failed to build image prompt:', e);
      return `masterpiece, 1girl, ${charName}`;
    }
  },

  generateImageAction: async (prompt, negative, customConfig, characterReference) => {
    // Retrying puts the picture into the gallery; the original caller is gone by then.
    const retry = () => void get().generateImageAction(prompt, negative, customConfig, characterReference).catch(() => undefined);
    const task = { kind: 'image' as const, title: translate('task.image', { prompt: prompt.slice(0, 60) }), retry };
    const res = await trackTask(get(), task, () => api.generateImageAction(prompt, negative, customConfig, characterReference));
    await get().fetchGeneratedImages();
    soundFx.playDiceRoll();
    return res;
  },

  chatSceneImages: {},

  isGeneratingSceneImage: false,

  dismissChatSceneImage: (chatId) =>
    set((state) => {
      const next = { ...state.chatSceneImages };
      delete next[chatId];
      return { chatSceneImages: next };
    }),

  generateSceneImage: async (target, options = {}) => {
    const state = get();
    if (state.isGeneratingSceneImage) return null;
    set({ isGeneratingSceneImage: true });
    try {
      const config = state.imageGenConfig ?? (await api.getImageGenConfig());
      const provider = config.provider.toLowerCase();
      let style: 'tags' | 'natural' = 'tags';
      if (provider === 'local') {
        const models = await api.listImageModels().catch(() => []);
        const family = models.find((m) => m.id === config.local_model_id)?.family;
        if (family && family !== 'sdxl') style = 'natural';
      }

      const replyLang = languageCode(state.replyLanguage || 'Deutsch');
      const character = state.activeCharacter ? localizeCard(state.activeCharacter.card.data, replyLang) : null;
      let subject: string;
      let description: string;
      let context: string[];
      if (target === 'stage') {
        const scene = state.stageState;
        if (!scene) return null;
        subject = scene.world.location || scene.definition.title;
        description = [scene.definition.world_context, scene.definition.description, `${scene.world.time_of_day}, ${scene.world.weather}`]
          .filter(Boolean)
          .join('\n');
        context = scene.chat_log.slice(-6).map((m) => `${m.sender_name}: ${m.content}`);
      } else {
        if (!character) return null;
        const userName = state.activePersona.name;
        subject = character.name;
        description = fillCardMacros(character.description, character.name, userName);
        // The last six turns, up to the chosen message ("this moment") or the end of the chat;
        // a dream brings its own text instead.
        const end = options.upToMessageId ? state.storedMessages.findIndex((m) => m.id === options.upToMessageId) + 1 : 0;
        context = options.story ?? (end > 0 ? state.storedMessages.slice(0, end) : state.messages)
          .filter((m) => m.role !== 'system')
          .slice(-6)
          .map((m) => `${m.role === 'user' ? userName : character.name}: ${fillCardMacros(m.content, character.name, userName)}`);
      }

      // The chat model writes the prompt while it is still loaded (before any VRAM swap).
      const endpoint =
        state.selectedBackend === 'local'
          ? `http://127.0.0.1:${state.serverConfig.port}/v1/chat/completions`
          : state.cloudEndpoint;
      const llmAvailable = state.selectedBackend === 'cloud' || state.serverStatus.state === 'running';
      let prompt = '';
      if (llmAvailable) {
        prompt = await api
          .writeImagePrompt({
            endpoint_url: endpoint,
            api_key: state.selectedBackend === 'cloud' ? state.cloudApiKey : null,
            model: state.selectedBackend === 'cloud' ? state.cloudModel : null,
            provider: state.selectedBackend === 'cloud' ? state.cloudProvider : 'local_llama',
            kind: target === 'stage' ? 'scene' : (options.kind ?? 'portrait'),
            style,
            subject,
            description,
            context,
          })
          .catch((e: unknown) => {
            console.warn('Image prompt from the chat model failed, using the template:', e);
            return '';
          });
      }
      if (!prompt) {
        prompt = await api.buildCharacterImagePrompt(
          target === 'stage' ? subject : (character?.name ?? subject),
          description,
          target === 'chat' ? state.currentEmotion?.emotion : null,
          target === 'stage' ? subject : null,
          options.kind === 'selfie' ? 'selfie, holding a phone, looking at the camera' : null
        );
      }

      // The character's picture keeps their look; a moment keeps its own composition.
      const kind = options.kind ?? 'portrait';
      const reference = target === 'chat' && state.activeCharacter
        ? { character_id: state.activeCharacter.id, portrait: kind === 'portrait' || kind === 'selfie' }
        : null;
      const res = await get().generateImageAction(prompt, null, config, reference);
      if (!res) return null;
      // Selfies and dream pictures go into the chat as messages, not onto the scene card.
      if (kind === 'selfie' || kind === 'dream') return res;
      if (target === 'stage' && state.stageState) {
        const name = await api.saveStageBackground(res.file_path);
        const current = get().stageState ?? state.stageState;
        await get().saveStageScene({ ...current, current_bg: name });
      } else if (state.activeChatId) {
        set((s) => ({ chatSceneImages: { ...s.chatSceneImages, [state.activeChatId as string]: res } }));
      }
      return res;
    } finally {
      set({ isGeneratingSceneImage: false });
    }
  },

  setSceneImageAsBackground: async (chatId) => {
    const image = get().chatSceneImages[chatId];
    if (!image) return;
    const name = await api.saveStageBackground(image.file_path);
    const style = get().chatSessions.find((s) => s.id === chatId)?.style;
    await get().updateChatStyle(chatId, { ...DEFAULT_CHAT_STYLE, ...style, background: name });
  },

  fetchGeneratedImages: async () => {
    try {
      const list = await api.listGeneratedImages();
      set({ generatedImages: list });
    } catch (e) {
      console.error('Failed to list generated images:', e);
    }
  },

  discordRpcEnabled: false,

  discordBotConfig: null,

  discordBotStatus: null,

  setDiscordRpcEnabled: async (enabled) => {
    try {
      await api.setDiscordRpcEnabled(enabled);
      set({ discordRpcEnabled: enabled });
    } catch (e) {
      reportFailure('Failed to set discord rpc:', e);
    }
  },

  fetchDiscordStatus: async () => {
    try {
      const [rpcEnabled, botCfg, botStat] = await Promise.all([
        api.getDiscordRpcEnabled(),
        api.getDiscordBotConfig(),
        api.getDiscordBotStatus(),
      ]);
      set({
        discordRpcEnabled: rpcEnabled,
        discordBotConfig: botCfg,
        discordBotStatus: botStat,
      });
    } catch (e) {
      console.error('Failed to fetch discord status:', e);
    }
  },

  saveDiscordBotConfig: async (config) => {
    try {
      await api.saveDiscordBotConfig(config);
      set({ discordBotConfig: config });
      soundFx.playSave();
    } catch (e) {
      console.error('Failed to save discord bot config:', e);
      throw e;
    }
  },

  startDiscordBot: async () => {
    try {
      await api.startDiscordBot();
      await get().fetchDiscordStatus();
      soundFx.playStart();
    } catch (e) {
      reportFailure('Failed to start discord bot:', e);
    }
  },

  stopDiscordBot: async () => {
    try {
      await api.stopDiscordBot();
      await get().fetchDiscordStatus();
    } catch (e) {
      reportFailure('Failed to stop discord bot:', e);
    }
  },

  webServerConfig: null,

  webServerStatus: null,

  fetchWebServerStatus: async () => {
    try {
      const [cfg, stat] = await Promise.all([
        api.getWebServerConfig(),
        api.getWebServerStatus(),
      ]);
      set({ webServerConfig: cfg, webServerStatus: stat });
    } catch (e) {
      console.error('Failed to fetch web server status:', e);
    }
  },

  saveWebServerConfig: async (config) => {
    try {
      await api.saveWebServerConfig(config);
      set({ webServerConfig: config });
      await get().fetchWebServerStatus();
      soundFx.playSave();
    } catch (e) {
      console.error('Failed to save web server config:', e);
      throw e;
    }
  },

  startWebServer: async () => {
    try {
      await api.startWebServer();
      await get().fetchWebServerStatus();
      soundFx.playStart();
    } catch (e) {
      reportFailure('Failed to start web server:', e);
    }
  },

  stopWebServer: async () => {
    try {
      await api.stopWebServer();
      await get().fetchWebServerStatus();
    } catch (e) {
      reportFailure('Failed to stop web server:', e);
    }
  },

  regenerateWebServerToken: async () => {
    try {
      const token = await api.regenerateWebServerToken();
      await get().fetchWebServerStatus();
      return token;
    } catch (e) {
      reportFailure('Failed to regenerate token:', e);
      return null;
    }
  },
});
