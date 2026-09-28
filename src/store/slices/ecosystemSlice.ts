import { api } from '../../services/api';
import { soundFx } from '../../services/soundFx';
import type {
  BackupGroupSelection,
  BackupEntryInfo,
  ImageGenConfig,
  GeneratedImageResult,
  GeneratedImageInfo,
  DiscordBotConfig,
  DiscordBotStatus,
  WebServerConfig,
  WebServerStatus,
} from '../../types';
import type { SliceCreator } from '../storeTypes';

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
  generateImageAction: (prompt: string, negative?: string | null, customConfig?: ImageGenConfig | null) => Promise<GeneratedImageResult | null>;
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
      return null;
    }
  },

  restoreBackup: async (filename, groups) => {
    try {
      const msg = await api.restoreProfileBackup(filename, groups);
      await get().fetchBackups();
      await get().refreshCharacters();
      await get().refreshLorebooks();
      soundFx.playLevelUp();
      return msg;
    } catch (e) {
      console.error('Failed to restore backup:', e);
      return null;
    }
  },

  deleteBackup: async (filename) => {
    try {
      const ok = await api.deleteProfileBackup(filename);
      await get().fetchBackups();
      return ok;
    } catch (e) {
      console.error('Failed to delete backup:', e);
      return false;
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

  generateImageAction: async (prompt, negative, customConfig) => {
    try {
      const res = await api.generateImageAction(prompt, negative, customConfig);
      await get().fetchGeneratedImages();
      soundFx.playDiceRoll();
      return res;
    } catch (e) {
      console.error('Failed to generate image:', e);
      return null;
    }
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
      console.error('Failed to set discord rpc:', e);
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
    }
  },

  startDiscordBot: async () => {
    try {
      await api.startDiscordBot();
      await get().fetchDiscordStatus();
      soundFx.playStart();
    } catch (e) {
      console.error('Failed to start discord bot:', e);
    }
  },

  stopDiscordBot: async () => {
    try {
      await api.stopDiscordBot();
      await get().fetchDiscordStatus();
    } catch (e) {
      console.error('Failed to stop discord bot:', e);
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
    }
  },

  startWebServer: async () => {
    try {
      await api.startWebServer();
      await get().fetchWebServerStatus();
      soundFx.playStart();
    } catch (e) {
      console.error('Failed to start web server:', e);
    }
  },

  stopWebServer: async () => {
    try {
      await api.stopWebServer();
      await get().fetchWebServerStatus();
    } catch (e) {
      console.error('Failed to stop web server:', e);
    }
  },

  regenerateWebServerToken: async () => {
    try {
      const token = await api.regenerateWebServerToken();
      await get().fetchWebServerStatus();
      return token;
    } catch (e) {
      console.error('Failed to regenerate token:', e);
      return null;
    }
  },
});
