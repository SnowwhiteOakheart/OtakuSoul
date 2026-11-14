import { invoke } from '@tauri-apps/api/core';
import type { HeadPlacement } from '../../types/generated/HeadPlacement';
import type { HubAvatar } from '../../types/generated/HubAvatar';
import type { HubAvatarInstalled } from '../../types/generated/HubAvatarInstalled';
import type { Live2dZipCandidate } from '../../types/generated/Live2dZipCandidate';
import type { MotionPackItem } from '../../types/generated/MotionPackItem';
import type { TalkingPortraitStatus } from '../../types/generated/TalkingPortraitStatus';
import type { TalkingSet } from '../../types/generated/TalkingSet';
import type { VroidAccount } from '../../types/generated/VroidAccount';
import type { VroidModel } from '../../types/generated/VroidModel';
import type { VroidStatus } from '../../types/generated/VroidStatus';
import type {
  AvatarKind,
  AvatarMotion,
  EmotionResult,
  Inochi2dCatalogItem,
  Inochi2dMapping,
  Live2dCatalogItem,
  ModelClip,
  ModelFace,
  ModelFaceInfo,
  ScannedInochi2d,
  ScannedLive2d,
  ScannedVrm,
} from '../../types';

export const avatarsApi = {
  // Talking Portraits
  /** Whether the models for speaking portraits (THA3, anime-seg) are there. */
  talkingPortraitStatus: async (): Promise<TalkingPortraitStatus> => {
    return await invoke<TalkingPortraitStatus>('talking_portrait_status');
  },

  /** Loads the models for speaking portraits (progress as `talking-portrait-download`). */
  downloadTalkingPortraitModels: async (): Promise<TalkingPortraitStatus> => {
    return await invoke<TalkingPortraitStatus>('download_talking_portrait_models');
  },

  getTalkingPortraitPlacement: async (characterId: string): Promise<HeadPlacement | null> => {
    return await invoke<HeadPlacement | null>('get_talking_portrait_placement', { characterId });
  },

  /** Saves a character's head placement; `null` turns the speaking portrait off. */
  setTalkingPortraitPlacement: async (characterId: string, placement: HeadPlacement | null): Promise<void> => {
    await invoke('set_talking_portrait_placement', { characterId, placement });
  },

  /** A first guess where the head of a picture (base64) is. */
  guessTalkingPortraitPlacement: async (image: string): Promise<HeadPlacement> => {
    return await invoke<HeadPlacement>('guess_talking_portrait_placement', { image });
  },

  /** The mouth-shape frames of a picture (base64); made once, then cached by the backend. */
  prepareTalkingPortrait: async (image: string, placement: HeadPlacement, emotion?: string | null): Promise<TalkingSet> => {
    return await invoke<TalkingSet>('prepare_talking_portrait', { image, placement, emotion: emotion ?? null });
  },

  // Hub Avatars & Motion Packs
  /** VRM and Live2D models of the hub (registry from the data repository). */
  getHubAvatars: async (lang: string): Promise<HubAvatar[]> => {
    return await invoke<HubAvatar[]>('get_hub_avatars', { lang });
  },

  /** Loads a hub avatar into the user's folder (SHA-256 checked); returns the file to open. */
  downloadHubAvatar: async (avatarId: string): Promise<HubAvatarInstalled> => {
    return await invoke<HubAvatarInstalled>('download_hub_avatar', { avatarId });
  },

  /** Ready-made motion sets for 3D avatars (from the data repository). */
  getMotionPacks: async (lang: string): Promise<MotionPackItem[]> => {
    return await invoke<MotionPackItem[]>('get_motion_packs', { lang });
  },

  /** Downloads a motion set (SHA-256 checked) and gives its motions their uses. */
  downloadMotionPack: async (packId: string): Promise<AvatarMotion[]> => {
    return await invoke<AvatarMotion[]>('download_motion_pack', { packId });
  },

  // 3D Avatars (VRM, glTF, MMD) & Library
  scanVrmModels: async (): Promise<ScannedVrm[]> => {
    return await invoke<ScannedVrm[]>('scan_vrm_models');
  },

  scanAvatarMotions: async (): Promise<AvatarMotion[]> => {
    return await invoke<AvatarMotion[]>('scan_avatar_motions');
  },

  importAvatarMotion: async (sourcePath: string): Promise<AvatarMotion> => {
    return await invoke<AvatarMotion>('import_avatar_motion', { sourcePath });
  },

  setAvatarMotionRole: async (file: string, role: string): Promise<void> => {
    await invoke('set_avatar_motion_role', { file, role });
  },

  setAvatarMotionMood: async (file: string, mood: string): Promise<void> => {
    await invoke('set_avatar_motion_mood', { file, mood });
  },

  deleteAvatarMotion: async (file: string): Promise<void> => {
    await invoke('delete_avatar_motion', { file });
  },

  /** Animations stored inside a glTF avatar, with their use (saved or guessed from the name). */
  listModelClips: async (modelPath: string): Promise<ModelClip[]> => {
    return await invoke<ModelClip[]>('list_model_clips', { modelPath });
  },

  setModelClipRole: async (modelPath: string, clip: string, role: string): Promise<void> => {
    await invoke('set_model_clip_role', { modelPath, clip, role });
  },

  setModelClipMood: async (modelPath: string, clip: string, mood: string): Promise<void> => {
    await invoke('set_model_clip_mood', { modelPath, clip, mood });
  },

  /** The face set up for a glTF avatar and the morph targets its file offers. */
  getModelFace: async (modelPath: string): Promise<ModelFaceInfo> => {
    return await invoke<ModelFaceInfo>('get_model_face', { modelPath });
  },

  setModelFace: async (modelPath: string, face: ModelFace): Promise<void> => {
    await invoke('set_model_face', { modelPath, face });
  },

  /** Files next to a 3D model (relative, forward slashes), for textures in other cases. */
  listAvatarModelFiles: async (modelPath: string): Promise<string[]> => {
    return await invoke<string[]>('list_avatar_model_files', { modelPath });
  },

  importVrmModel: async (sourcePath: string): Promise<ScannedVrm> => {
    return await invoke<ScannedVrm>('import_vrm_model', { sourcePath });
  },

  /** Own name for an avatar; an empty name restores the original. */
  renameAvatar: async (kind: AvatarKind, path: string, name: string): Promise<void> => {
    await invoke('rename_avatar', { kind, path, name });
  },

  /** Moves an imported avatar with its folder to the app's trash. */
  deleteAvatar: async (kind: AvatarKind, path: string): Promise<void> => {
    await invoke('delete_avatar', { kind, path });
  },

  saveAvatarThumbnail: async (kind: AvatarKind, path: string, dataUrl: string): Promise<string> =>
    await invoke<string>('save_avatar_thumbnail', { kind, path, dataUrl }),

  // VRoid Hub
  /** Whether this build can use VRoid Hub and who is signed in. */
  vroidStatus: async (): Promise<VroidStatus> => {
    return await invoke<VroidStatus>('vroid_status');
  },

  /** "Sign in with VRoid Hub" in the browser; resolves once VRoid Hub sent the user back. */
  vroidLogin: async (language: string): Promise<VroidAccount> => {
    return await invoke<VroidAccount>('vroid_login', { language });
  },

  vroidLoginCancel: async (): Promise<void> => {
    await invoke('vroid_login_cancel');
  },

  /** Signs out and removes every stored VRoid Hub model. */
  vroidLogout: async (): Promise<void> => {
    await invoke('vroid_logout');
  },

  /** The signed-in user's own and liked models. */
  vroidModels: async (): Promise<VroidModel[]> => {
    return await invoke<VroidModel[]>('vroid_models');
  },

  /** Adds a VRoid Hub model to the 3D avatars (stored encrypted). */
  vroidAddModel: async (id: string): Promise<ScannedVrm> => {
    return await invoke<ScannedVrm>('vroid_add_model', { id });
  },

  vroidRemoveModel: async (id: string): Promise<void> => {
    await invoke('vroid_remove_model', { id });
  },

  /** Conditions of use and author of an added VRoid Hub model. */
  vroidModelInfo: async (id: string): Promise<VroidModel | null> => {
    return await invoke<VroidModel | null>('vroid_model_info', { id });
  },

  // Live2D & Emotion Classification
  scanLive2dModels: async (): Promise<ScannedLive2d[]> => {
    return await invoke<ScannedLive2d[]>('scan_live2d_models');
  },

  getLive2dCatalog: async (): Promise<Live2dCatalogItem[]> => {
    return await invoke<Live2dCatalogItem[]>('get_live2d_catalog');
  },

  downloadLive2dModel: async (modelId: string): Promise<string> => {
    return await invoke<string>('download_live2d_model', { modelId });
  },

  classifyTextEmotion: async (text: string): Promise<EmotionResult> => {
    return await invoke<EmotionResult>('classify_text_emotion', { text });
  },

  inspectLive2dZip: async (sourcePath: string): Promise<Live2dZipCandidate[]> => {
    return await invoke<Live2dZipCandidate[]>('inspect_live2d_zip', { sourcePath });
  },

  importLive2dModel: async (sourcePath: string, entryPath?: string): Promise<ScannedLive2d> => {
    return await invoke<ScannedLive2d>('import_live2d_model', { sourcePath, entryPath: entryPath ?? null });
  },

  // Inochi2D puppets (.inp/.inx), rendered by `services/inochi2d`.
  scanInochi2dModels: async (): Promise<ScannedInochi2d[]> => await invoke<ScannedInochi2d[]>('scan_inochi2d_models'),

  /** Puppets to download (registry from the data repository), descriptions in `lang`. */
  getInochi2dCatalog: async (lang?: string): Promise<Inochi2dCatalogItem[]> =>
    await invoke<Inochi2dCatalogItem[]>('get_inochi2d_catalog', { lang }),

  /** Downloads an official example puppet (SHA-256 checked). */
  downloadInochi2dModel: async (modelId: string): Promise<ScannedInochi2d> =>
    await invoke<ScannedInochi2d>('download_inochi2d_model', { modelId }),

  importInochi2dModel: async (sourcePath: string): Promise<ScannedInochi2d> =>
    await invoke<ScannedInochi2d>('import_inochi2d_model', { sourcePath }),

  /** Hand-made channels and emotion clips of a puppet (empty = all found by name). */
  getInochi2dMapping: async (modelPath: string): Promise<Inochi2dMapping> =>
    await invoke<Inochi2dMapping>('get_inochi2d_mapping', { modelPath }),

  setInochi2dMapping: async (modelPath: string, mapping: Inochi2dMapping): Promise<void> =>
    await invoke<void>('set_inochi2d_mapping', { modelPath, mapping }),
};
