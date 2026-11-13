import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type {
  BackupEntryInfo,
  BackupGroupSelection,
  CharacterReference,
  DiscordBotConfig,
  DiscordBotStatus,
  DiscordRpcActivity,
  GeneratedImageInfo,
  GeneratedImageResult,
  ImageGenConfig,
  ImageModelInfo,
  ImageModelProgress,
  ImagePromptRequest,
  LocalImageStatus,
  LoraInfo,
  SyncConfig,
  SyncSnapshot,
  WebServerConfig,
  WebServerStatus,
} from '../../types';

export const integrationsApi = {
  // Backups & Device Sync
  createProfileBackup: async (
    selection: BackupGroupSelection,
    description?: string
  ): Promise<BackupEntryInfo> => {
    return await invoke<BackupEntryInfo>('create_profile_backup', { selection, description: description || null });
  },

  listProfileBackups: async (): Promise<BackupEntryInfo[]> => {
    return await invoke<BackupEntryInfo[]>('list_profile_backups');
  },

  restoreProfileBackup: async (
    filename: string,
    groups?: BackupGroupSelection
  ): Promise<string> => {
    return await invoke<string>('restore_profile_backup', { filename, groups: groups || null });
  },

  deleteProfileBackup: async (filename: string): Promise<boolean> => {
    return await invoke<boolean>('delete_profile_backup', { filename });
  },

  /** Sync between devices (shared folder or WebDAV): settings of this device. */
  getSyncConfig: async (): Promise<SyncConfig> => {
    return await invoke<SyncConfig>('get_sync_config');
  },

  saveSyncConfig: async (config: SyncConfig): Promise<SyncConfig> => {
    return await invoke<SyncConfig>('save_sync_config', { config });
  },

  /** Checks a target before saving it; the number of states found there. */
  testSyncTarget: async (config: SyncConfig): Promise<number> => {
    return await invoke<number>('test_sync_target', { config });
  },

  listSyncSnapshots: async (): Promise<SyncSnapshot[]> => {
    return await invoke<SyncSnapshot[]>('list_sync_snapshots');
  },

  /** The newest state of another device not uploaded or restored here yet. */
  checkSyncUpdates: async (): Promise<SyncSnapshot | null> => {
    return await invoke<SyncSnapshot | null>('check_sync_updates');
  },

  /** Backs up the chosen groups and uploads them as this device's newest state. */
  uploadSyncSnapshot: async (): Promise<SyncSnapshot> => {
    return await invoke<SyncSnapshot>('upload_sync_snapshot');
  },

  restoreSyncSnapshot: async (deviceId: string, filename: string, groups?: BackupGroupSelection): Promise<string> => {
    return await invoke<string>('restore_sync_snapshot', { deviceId, filename, groups });
  },

  deleteSyncSnapshot: async (deviceId: string, filename: string): Promise<void> => {
    return await invoke<void>('delete_sync_snapshot', { deviceId, filename });
  },

  // Image Generation
  getImageGenConfig: async (): Promise<ImageGenConfig> => {
    return await invoke<ImageGenConfig>('get_image_gen_config');
  },

  saveImageGenConfig: async (config: ImageGenConfig): Promise<void> => {
    return await invoke<void>('save_image_gen_config', { config });
  },

  buildCharacterImagePrompt: async (
    characterName: string,
    characterDescription?: string | null,
    emotion?: string | null,
    sceneContext?: string | null,
    userPrompt?: string | null
  ): Promise<string> => {
    return await invoke<string>('build_character_image_prompt', {
      characterName,
      characterDescription: characterDescription || null,
      emotion: emotion || null,
      sceneContext: sceneContext || null,
      userPrompt: userPrompt || null,
    });
  },

  /** `characterReference`: the character's picture keeps their look (local image engine). */
  generateImageAction: async (
    prompt: string,
    negative?: string | null,
    customConfig?: ImageGenConfig | null,
    characterReference?: CharacterReference | null,
  ): Promise<GeneratedImageResult> => {
    return await invoke<GeneratedImageResult>('generate_image_action', {
      prompt,
      negative: negative || null,
      customConfig: customConfig || null,
      characterReference: characterReference || null,
    });
  },

  listGeneratedImages: async (): Promise<GeneratedImageInfo[]> => {
    return await invoke<GeneratedImageInfo[]>('list_generated_images');
  },

  writeImagePrompt: async (request: ImagePromptRequest): Promise<string> => {
    return await invoke<string>('write_image_prompt', { request });
  },

  saveStageBackground: async (filePath: string): Promise<string> => {
    return await invoke<string>('save_stage_background', { filePath });
  },

  /** `withExtras`: count optional files (vision weights) as the form shows it; default as saved. */
  listImageModels: async (withExtras?: boolean): Promise<ImageModelInfo[]> => {
    return await invoke<ImageModelInfo[]>('list_image_models', { withExtras: withExtras ?? null });
  },

  downloadImageModel: async (modelId: string, withExtras?: boolean): Promise<void> => {
    await invoke('download_image_model', { modelId, withExtras: withExtras ?? null });
  },

  cancelImageModelDownload: async (): Promise<void> => {
    await invoke('cancel_image_model_download');
  },

  deleteImageModel: async (modelId: string): Promise<void> => {
    await invoke('delete_image_model', { modelId });
  },

  listImageLoras: async (): Promise<LoraInfo[]> => {
    return await invoke<LoraInfo[]>('list_image_loras');
  },

  /** Progress arrives as `image-model-progress` with the LoRA id as `model_id`. */
  downloadImageLora: async (loraId: string): Promise<void> => {
    await invoke('download_image_lora', { loraId });
  },

  deleteImageLora: async (file: string): Promise<void> => {
    await invoke('delete_image_lora', { file });
  },

  stopLocalImageServer: async (): Promise<void> => {
    await invoke('stop_local_image_server');
  },

  onImageModelProgress: async (callback: (data: ImageModelProgress) => void): Promise<UnlistenFn> => {
    return await listen<ImageModelProgress>('image-model-progress', (event) => callback(event.payload));
  },

  onLocalImageStatus: async (callback: (data: LocalImageStatus) => void): Promise<UnlistenFn> => {
    return await listen<LocalImageStatus>('local-image-status', (event) => callback(event.payload));
  },

  // Discord RPC & Bot
  setDiscordRpcEnabled: async (enabled: boolean): Promise<void> => {
    return await invoke<void>('set_discord_rpc_enabled', { enabled });
  },

  getDiscordRpcEnabled: async (): Promise<boolean> => {
    return await invoke<boolean>('get_discord_rpc_enabled');
  },

  updateDiscordRpcActivity: async (activity: DiscordRpcActivity): Promise<void> => {
    return await invoke<void>('update_discord_rpc_activity', { activity });
  },

  getDiscordBotConfig: async (): Promise<DiscordBotConfig> => {
    return await invoke<DiscordBotConfig>('get_discord_bot_config');
  },

  saveDiscordBotConfig: async (config: DiscordBotConfig): Promise<void> => {
    return await invoke<void>('save_discord_bot_config', { config });
  },

  startDiscordBot: async (): Promise<void> => {
    return await invoke<void>('start_discord_bot');
  },

  stopDiscordBot: async (): Promise<void> => {
    return await invoke<void>('stop_discord_bot');
  },

  getDiscordBotStatus: async (): Promise<DiscordBotStatus> => {
    return await invoke<DiscordBotStatus>('get_discord_bot_status');
  },

  // Web Server (Mobile Client) & OBS Overlay
  getWebServerConfig: async (): Promise<WebServerConfig> => {
    return await invoke<WebServerConfig>('get_web_server_config');
  },

  saveWebServerConfig: async (config: WebServerConfig): Promise<void> => {
    return await invoke<void>('save_web_server_config', { config });
  },

  startWebServer: async (): Promise<void> => {
    return await invoke<void>('start_web_server');
  },

  stopWebServer: async (): Promise<void> => {
    return await invoke<void>('stop_web_server');
  },

  /** Tells the streaming overlay (OBS browser source) what the figure does; returns how many pages are open. */
  overlayPush: async (message: Record<string, unknown>): Promise<number> => {
    return await invoke<number>('overlay_push', { message });
  },

  /** Tells the phone's web client (LAN) state, history or a notice; returns how many pages are open. */
  mobilePush: async (message: Record<string, unknown>): Promise<number> => {
    return await invoke<number>('mobile_push', { message });
  },

  getWebServerStatus: async (): Promise<WebServerStatus> => {
    return await invoke<WebServerStatus>('get_web_server_status');
  },

  regenerateWebServerToken: async (): Promise<string> => {
    return await invoke<string>('regenerate_web_server_token');
  },

  /** New read-only token for the OBS overlay; open overlay pages are cut off. */
  regenerateOverlayToken: async (): Promise<string> => {
    return await invoke<string>('regenerate_overlay_token');
  },
};
