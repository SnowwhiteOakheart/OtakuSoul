import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { withAvatarUrl } from '../../utils/characterAvatar';
import type { WebtoonScript } from '../../types/generated/WebtoonScript';
import type {
  BattleMap,
  CampaignClock,
  CombatCondition,
  CombatOptions,
  DiceRollResult,
  ItemData,
  MusicGenProgress,
  MusicModelInfo,
  MusicModelProgress,
  MusicPackInfo,
  SceneDefinition,
  SceneMusicPlan,
  ScenePreview,
  SceneState,
  SpellData,
  StageMusicTrack,
  StageNpcDraft,
  StageNpcPromotion,
  StageState,
  StageStreamEvent,
  StageTurnRequest,
  WorldState,
} from '../../types';

export const stageApi = {
  /** After a long pause a companion tells what happened between the sessions; null when nothing is due. */
  stageTellOffscreen: async (sceneId: string): Promise<SceneState | null> => {
    return await invoke<SceneState | null>('stage_tell_offscreen', { sceneId });
  },

  abortStageTurn: async (): Promise<void> => {
    return await invoke<void>('abort_stage_turn');
  },

  /** Live text of a running Soul Stage turn. */
  onStageStream: async (callback: (event: StageStreamEvent) => void): Promise<UnlistenFn> => {
    return await listen<StageStreamEvent>('stage-stream', (event) => callback(event.payload));
  },

  rollStageDice: async (
    formula: string,
    targetDc?: number,
    combatantId?: string
  ): Promise<DiceRollResult> => {
    return await invoke<DiceRollResult>('roll_stage_dice', {
      formula,
      targetDc,
      combatantId,
    });
  },

  upsertStageNpc: (sceneId: string, draft: StageNpcDraft): Promise<SceneState> =>
    invoke('stage_upsert_npc', { sceneId, draft }),

  setStageNpcActive: (sceneId: string, npcId: string, active: boolean): Promise<SceneState> =>
    invoke('stage_set_npc_active', { sceneId, npcId, active }),

  promoteStageNpc: async (sceneId: string, npcId: string): Promise<StageNpcPromotion> => {
    const promotion = await invoke<StageNpcPromotion>('stage_promote_npc', { sceneId, npcId });
    return { ...promotion, character: withAvatarUrl(promotion.character) };
  },

  getStageState: async (): Promise<StageState> => {
    return await invoke<StageState>('get_stage_state');
  },

  listStageScenes: async (): Promise<ScenePreview[]> => {
    return await invoke<ScenePreview[]>('list_stage_scenes');
  },

  loadStageScene: async (sceneId: string): Promise<SceneState> => {
    return await invoke<SceneState>('load_stage_scene', { sceneId });
  },

  saveStageScene: async (sceneState: SceneState): Promise<void> => {
    return await invoke<void>('save_stage_scene', { sceneState });
  },

  updateStageSceneDefinition: async (definition: SceneDefinition): Promise<SceneState> => {
    return await invoke<SceneState>('update_stage_scene_definition', { definition });
  },

  listStageAssets: async (): Promise<{ backgrounds: string[]; ambient: string[] }> => {
    return await invoke('list_stage_assets');
  },

  /** The scene's ambient sound file as `data:` URL. */
  getStageAmbientAudio: async (name: string): Promise<string> => {
    return await invoke<string>('get_stage_ambient_audio', { name });
  },

  /** The Stage's music files per mood: the story's set first, then the general pool. */
  listStageMusic: async (set?: string | null): Promise<StageMusicTrack[]> => {
    return await invoke<StageMusicTrack[]>('list_stage_music', { set: set ?? null });
  },

  /** The music a scene asks for (moods, captions, vocals) and what is downloaded of it. */
  getSceneMusicPlan: async (definition: SceneDefinition): Promise<SceneMusicPlan> => {
    return await invoke<SceneMusicPlan>('get_scene_music_plan', { definition });
  },

  /** ACE-Step model sets for music generation with their download state. */
  listMusicModels: async (): Promise<MusicModelInfo[]> => {
    return await invoke<MusicModelInfo[]>('list_music_models');
  },

  downloadMusicModel: async (modelId: string): Promise<void> => {
    return await invoke<void>('download_music_model', { modelId });
  },

  cancelMusicModelDownload: async (): Promise<void> => {
    return await invoke<void>('cancel_music_model_download');
  },

  deleteMusicModel: async (modelId: string): Promise<void> => {
    return await invoke<void>('delete_music_model', { modelId });
  },

  onMusicModelProgress: async (callback: (data: MusicModelProgress) => void): Promise<UnlistenFn> => {
    return await listen<MusicModelProgress>('music-model-progress', (event) => callback(event.payload));
  },

  /** Generates the missing tracks of the scene's music plan (`moods`: only these); returns how many. */
  generateSceneMusic: async (definition: SceneDefinition, modelId: string, moods?: string[]): Promise<number> => {
    return await invoke<number>('generate_scene_music', { definition, modelId, moods: moods ?? null });
  },

  cancelMusicGeneration: async (): Promise<void> => {
    return await invoke<void>('cancel_music_generation');
  },

  onMusicGenProgress: async (callback: (data: MusicGenProgress) => void): Promise<UnlistenFn> => {
    return await listen<MusicGenProgress>('music-gen-progress', (event) => callback(event.payload));
  },

  /** Downloads the tracks `otakusoul-data` ships for the scene's story; returns how many. */
  ensureSceneMusic: async (definition: SceneDefinition): Promise<number> => {
    return await invoke<number>('ensure_scene_music', { definition });
  },

  /** Opens the music folder (with one subfolder per mood). */
  openStageMusicFolder: async (): Promise<void> => {
    return await invoke<void>('open_stage_music_folder');
  },

  /** Music packs of the data repository with their download state. */
  getMusicPacks: async (lang: string): Promise<MusicPackInfo[]> => {
    return await invoke<MusicPackInfo[]>('get_music_packs', { lang });
  },

  /** Downloads a music pack's missing tracks (SHA-256 checked); returns how many. */
  downloadMusicPack: async (packId: string): Promise<number> => {
    return await invoke<number>('download_music_pack', { packId });
  },

  importStageAsset: async (filePath: string, kind: 'backgrounds' | 'ambient'): Promise<string> => {
    return await invoke<string>('import_stage_asset', { filePath, kind });
  },

  createStageScene: async (definition: SceneDefinition): Promise<SceneState> => {
    return await invoke<SceneState>('create_stage_scene', { definition });
  },

  deleteStageScene: async (sceneId: string): Promise<void> => {
    return await invoke<void>('delete_stage_scene', { sceneId });
  },

  exportStageMarkdown: async (sceneId: string): Promise<string> => {
    return await invoke<string>('export_stage_markdown', { sceneId });
  },

  listStageFolders: async (): Promise<string[]> => {
    return await invoke<string[]>('stage_list_folders');
  },

  createStageFolder: async (folderName: string): Promise<void> => {
    return await invoke<void>('stage_create_folder', { folderName });
  },

  moveStageSceneToFolder: async (sceneId: string, targetFolder: string): Promise<SceneState> => {
    return await invoke<SceneState>('stage_move_scene_to_folder', { sceneId, targetFolder });
  },

  deleteStageFolder: async (folderName: string): Promise<void> => {
    return await invoke<void>('stage_delete_folder', { folderName });
  },

  importStageSceneJson: async (jsonContent: string, targetFolder?: string): Promise<SceneState> => {
    return await invoke<SceneState>('stage_import_scene_json', { jsonContent, targetFolder });
  },

  /** The act as an HTML replay, written to `targetPath` by the backend (the webview cannot download files). */
  exportStageHtml: async (sceneId: string, targetPath: string): Promise<void> => {
    await invoke<void>('export_stage_html', { sceneId, targetPath });
  },

  /** The act as webtoon panels with their pictures (data URLs), for `renderWebtoon`. */
  exportStageWebtoonScript: (sceneId: string): Promise<WebtoonScript> =>
    invoke<WebtoonScript>('export_stage_webtoon_script', { sceneId }),

  /** Writes drawn webtoon pages (PNG data URLs); several pages get `_01`, `_02` … Returns the files. */
  saveWebtoonPages: (targetPath: string, pages: string[]): Promise<string[]> =>
    invoke<string[]>('save_webtoon_pages', { targetPath, pages }),

  exportStageSceneJson: async (sceneId: string): Promise<string> => {
    return await invoke<string>('stage_export_scene_json', { sceneId });
  },

  resetStageScene: async (sceneId: string): Promise<SceneState> => {
    return await invoke<SceneState>('stage_reset_scene', { sceneId });
  },

  editStageTurnMessage: async (sceneId: string, messageId: string, newContent: string): Promise<SceneState> => {
    return await invoke<SceneState>('stage_edit_message', { sceneId, messageId, newContent });
  },

  deleteStageTurnMessage: async (sceneId: string, messageId: string): Promise<SceneState> => {
    return await invoke<SceneState>('stage_delete_message', { sceneId, messageId });
  },

  regenerateStageTurn: async (sceneId: string): Promise<SceneState> => {
    return await invoke<SceneState>('stage_regenerate_turn', { sceneId });
  },

  getStageBackgroundImage: async (name: string): Promise<string> => {
    return await invoke<string>('stage_get_background_image', { name });
  },

  /** 5e fight: the player's action id, or none to let the engine play the other turns. */
  runStageCombat: async (sceneId: string, action?: string): Promise<SceneState> => {
    return await invoke<SceneState>('run_stage_combat', { sceneId, action: action ?? null });
  },

  /** Adventure acts: the next act with the party and inventory carried over. */
  continueStageAdventure: async (sceneId: string): Promise<SceneState> => {
    return await invoke<SceneState>('continue_stage_adventure', { sceneId });
  },

  /** 5e map outside fights: one exploration step (`move:x:y`, `use:x:y`, `pick:x:y`, `force:x:y`) or, without one, start exploring. */
  runStageExploration: async (sceneId: string, action?: string): Promise<SceneState> => {
    return await invoke<SceneState>('run_stage_exploration', { sceneId, action: action ?? null });
  },

  /** 5e fight: squares the current combatant can move to and the actions it has. */
  getStageCombatOptions: async (): Promise<CombatOptions> => {
    return await invoke<CombatOptions>('get_stage_combat_options');
  },

  listBattleMaps: async (): Promise<BattleMap[]> => {
    return await invoke<BattleMap[]>('list_battle_maps');
  },

  listSrdSpells: async (): Promise<SpellData[]> => {
    return await invoke<SpellData[]>('list_srd_spells');
  },

  listSrdItems: async (): Promise<ItemData[]> => {
    return await invoke<ItemData[]>('list_srd_items');
  },

  /** 5e: a party member puts on gear from the inventory. */
  equipStageItem: async (sceneId: string, memberId: string, itemId: string): Promise<SceneState> => {
    return await invoke<SceneState>('equip_stage_item', { sceneId, memberId, itemId });
  },

  /** 5e: a party member takes gear off into the inventory. */
  unequipStageItem: async (sceneId: string, memberId: string, srdId: string): Promise<SceneState> => {
    return await invoke<SceneState>('unequip_stage_item', { sceneId, memberId, srdId });
  },

  runStageTurn: async (request: StageTurnRequest): Promise<SceneState> => {
    return await invoke<SceneState>('run_stage_turn', { request });
  },

  undoStageTurn: async (sceneId: string): Promise<SceneState> => {
    return await invoke<SceneState>('undo_stage_turn', { sceneId });
  },

  restStageParty: async (
    sceneId: string,
    restType: string
  ): Promise<SceneState> => {
    return await invoke<SceneState>('rest_stage_party', { sceneId, restType });
  },

  useStageInventoryItem: async (sceneId: string, itemId: string): Promise<SceneState> => {
    return await invoke<SceneState>('use_stage_inventory_item', { sceneId, itemId });
  },

  delayEncounterTurn: async (): Promise<SceneState> => {
    return await invoke<SceneState>('delay_encounter_turn');
  },

  updateWorldState: async (world: WorldState): Promise<void> => {
    return await invoke<void>('update_world_state', { world });
  },

  setClockProgress: async (
    clockId: string,
    progress: number
  ): Promise<void> => {
    return await invoke<void>('set_clock_progress', { clockId, progress });
  },

  addClock: async (clock: CampaignClock): Promise<void> => {
    return await invoke<void>('add_clock', { clock });
  },

  deleteClock: async (clockId: string): Promise<void> => {
    return await invoke<void>('delete_clock', { clockId });
  },

  startEncounter: async (): Promise<void> => {
    return await invoke<void>('start_encounter');
  },

  endEncounter: async (): Promise<void> => {
    return await invoke<void>('end_encounter');
  },

  nextEncounterTurn: async (): Promise<void> => {
    return await invoke<void>('next_encounter_turn');
  },

  applyCombatantDelta: async (
    combatantId: string,
    hpDelta: number,
    stressDelta: number
  ): Promise<void> => {
    return await invoke<void>('apply_combatant_delta', {
      combatantId,
      hpDelta,
      stressDelta,
    });
  },

  stageSetCombatantSkill: async (
    combatantId: string,
    skillName: string,
    value: number
  ): Promise<void> => {
    return await invoke<void>('stage_set_combatant_skill', {
      combatantId,
      skillName,
      value,
    });
  },

  addCombatantCondition: async (
    combatantId: string,
    condition: CombatCondition
  ): Promise<void> => {
    return await invoke<void>('add_combatant_condition', {
      combatantId,
      condition,
    });
  },
};
