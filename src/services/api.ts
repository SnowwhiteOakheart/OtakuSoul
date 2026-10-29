import type { TokenEvent } from '../types/generated/TokenEvent';
import type { ThoughtEvent } from '../types/generated/ThoughtEvent';
import type { UiLanguage } from '../types/generated/UiLanguage';
import type { OpenRouterLogin } from '../types/generated/OpenRouterLogin';
import type { MotionPackItem } from '../types/generated/MotionPackItem';
import type { HubAvatar } from '../types/generated/HubAvatar';
import type { HeadPlacement } from '../types/generated/HeadPlacement';
import type { TalkingPortraitStatus } from '../types/generated/TalkingPortraitStatus';
import type { TalkingSet } from '../types/generated/TalkingSet';
import type { HubAvatarInstalled } from '../types/generated/HubAvatarInstalled';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import {
  HardwareInfo,
  LayerRecommendation,
  ServerStatus,
  LlamaServerConfig,
  ChatRequest,
  DoneEvent,
  CharacterProfile,
  Lorebook,
  LorebookEntry,
  EvaluatedLoreResult,
  PromptContext,
  CognitiveOverview,
  PromptMemories,
  EpisodicMemory,
  IntentionEntry,
  IntentionDraft,
  CleanupGroup,
  CleanupProposal,
  MemoryCleanupRequest,
  PsychologyState,
  RelationshipState,
  DiaryEntry,
  MemoryBackupInfo,
  MemoryPipelineRequest,
  MemoryPipelineResult,
  DiceRollResult,
  StageState,
  ScenePreview,
  SceneDefinition,
  SceneState,
  StageTurnRequest,
  StageNpcDraft,
  StageNpcPromotion,
  WorldState,
  CampaignClock,
  CombatCondition,
  Neurohormones,
  ToolCallRequest,
  ToolExecutionResult,
  CompanionSettings,
  CompanionState,
  Goal,
  EnvironmentSnapshot,
  McpServerConfig,
  McpToolInfo,
  CompanionPlugin,
  AppPaths,
  ScannedModel,
  BattleMap,
  SpellData,
  ItemData,
  CombatOptions,
  ScannedVrm,
  AvatarMotion,
  ModelClip,
  ModelFace,
  ModelFaceInfo,
  AppSettings,
  UserPersona,
  ChatSession,
  ChatSummaryRequest,
  StageStreamEvent,
  TranslateRequest,
  ReplyIdeasRequest,
  MacroInput,
  GroupRouteRequest,
  Attachment,
  AssembledPrompt,
  BuiltinPromptTemplate,
  StoredChatMessage,
  OpenRouterModelInfo,
  LlmPreset,
  HfModelSummary,
  HfGgufFile,
  ModelDefaults,
  DownloadProgressEvent,
  ScannedVoice,
  SttConfig,
  VoiceConfig,
  KokoroDownloadProgress,
  KokoroInstallResult,
  ScannedLive2d,
  Live2dCatalogItem,
  ScannedInochi2d,
  Inochi2dCatalogItem,
  Inochi2dMapping,
  AvatarKind,
  EmotionResult,
  GatewayCharacterEntry,
  GatewayLorebookEntry,
  GatewaySceneEntry,
  GatewayCollectionEntry,
  InstalledHubItem,
  ChubSearchResult,
  ChubCharacterDetail,
  CharacterImportResult,
  BackupGroupSelection,
  BackupEntryInfo,
  ImageGenConfig,
  GeneratedImageResult,
  GeneratedImageInfo,
  DiscordRpcActivity,
  DiscordBotConfig,
  DiscordBotStatus,
  WebServerConfig,
  WebServerStatus,
  CharacterWizardInput,
  CharacterDraft,
  LogEntry,
  UpdateInfo,
  JsonObject,
  RuntimeInfo,
  RuntimeKind,
  ImageModelInfo,
  ImageModelProgress,
  ImagePromptRequest,
  CharacterReference,
  LoraInfo,
  QuickReplyRequest,
  StarterModel,
  ChatLora,
  BenchmarkResult,
  DiskSpace,
  TtsModelInfo,
  TtsModelProgress,
  TtsLocalSettings,
  ClonedVoice,
  LocalImageStatus,
  RuntimeProgress,
  RuntimeVariant,
  MemoryChange,
  PromptLog,
  ChatStyle,
} from '../types';

export const api = {
  // Hardware
  getHardwareInfo: async (): Promise<HardwareInfo> => {
    return await invoke<HardwareInfo>('get_hardware_info');
  },

  getLayerRecommendation: async (
    modelSizeMb: number,
    totalLayers: number,
    contextSize: number,
    modelPath?: string,
    cacheTypeK?: string,
    cacheTypeV?: string
  ): Promise<LayerRecommendation> => {
    return await invoke<LayerRecommendation>('get_layer_recommendation', {
      modelSizeMb,
      totalLayers,
      contextSize,
      modelPath,
      cacheTypeK,
      cacheTypeV,
    });
  },

  // Llama Server
  startLlamaServer: async (config: LlamaServerConfig): Promise<void> => {
    return await invoke<void>('start_llama_server', { config });
  },

  stopLlamaServer: async (): Promise<void> => {
    return await invoke<void>('stop_llama_server');
  },

  getLlamaServerStatus: async (): Promise<ServerStatus> => {
    return await invoke<ServerStatus>('get_llama_server_status');
  },

  // Chat & Inference
  /** `contextTokens`: context window of a cloud model; a local server reports its own. */
  /** `tools`: the model may call the chat tools (date/time, calculator, web search). */
  sendChatMessage: async (request: ChatRequest, generationId: string, contextTokens?: number, tools = false): Promise<DoneEvent> => {
    return await invoke<DoneEvent>('send_chat_message', { request, generationId, contextTokens: contextTokens ?? null, tools });
  },

  /** After a long pause a companion tells what happened between the sessions; null when nothing is due. */
  stageTellOffscreen: async (sceneId: string): Promise<SceneState | null> => {
    return await invoke<SceneState | null>('stage_tell_offscreen', { sceneId });
  },

  abortStageTurn: async (): Promise<void> => {
    return await invoke<void>('abort_stage_turn');
  },

  abortChatGeneration: async (): Promise<void> => {
    return await invoke<void>('abort_chat_generation');
  },

  // Character Cards & Lorebooks (Phase 3)
  loadCharacterCard: async (filePath: string): Promise<CharacterProfile> => {
    return await invoke<CharacterProfile>('load_character_card', { filePath });
  },

  loadLorebook: async (filePath: string): Promise<Lorebook> => {
    return await invoke<Lorebook>('load_lorebook', { filePath });
  },

  listAllLorebooks: async (): Promise<Lorebook[]> => {
    return await invoke<Lorebook[]>('list_all_lorebooks');
  },

  saveLorebook: async (lorebook: Lorebook): Promise<string> => {
    return await invoke<string>('save_lorebook', { lorebook });
  },

  deleteLorebook: async (filePath: string): Promise<void> => {
    return await invoke<void>('delete_lorebook', { filePath });
  },

  importLorebookFile: async (sourcePath: string): Promise<Lorebook> => {
    return await invoke<Lorebook>('import_lorebook_file', { sourcePath });
  },

  exportLorebookFile: async (lorebook: Lorebook, targetPath: string): Promise<void> => {
    return await invoke<void>('export_lorebook_file', { lorebook, targetPath });
  },

  evaluateLorebookContext: async (
    lorebook: Lorebook,
    context: string
  ): Promise<LorebookEntry[]> => {
    return await invoke<LorebookEntry[]>('evaluate_lorebook_context', {
      lorebook,
      context,
    });
  },

  evaluateMultiLorebooks: async (
    lorebooks: Lorebook[],
    context: string,
    currentTension: number
  ): Promise<EvaluatedLoreResult> => {
    return await invoke<EvaluatedLoreResult>('evaluate_multi_lorebooks', {
      lorebooks,
      context,
      currentTension,
    });
  },

  /** System prompt plus the instruction sent after the chat history. */
  assemblePrompt: async (context: PromptContext): Promise<AssembledPrompt> => {
    return await invoke<AssembledPrompt>('assemble_prompt', { context });
  },

  /** "Sign in with OpenRouter" in the browser; resolves with the account's key once signed in. */
  openRouterLogin: async (language: string): Promise<OpenRouterLogin> => {
    return await invoke<OpenRouterLogin>('openrouter_login', { language });
  },

  openRouterLoginCancel: async (): Promise<void> => {
    await invoke('openrouter_login_cancel');
  },

  listPromptTemplates: async (): Promise<BuiltinPromptTemplate[]> => {
    return await invoke<BuiltinPromptTemplate[]>('list_prompt_templates');
  },

  readFileBinary: async (filePath: string): Promise<Uint8Array> => {
    // Raw bytes over IPC (an ArrayBuffer), not a JSON number list.
    return new Uint8Array(await invoke<ArrayBuffer>('read_file_binary', { filePath }));
  },

  // Phase 5: Cognitive Soul Memory
  /** Memories for the next reply: a stable core and the ones that fit `query` (recent messages). */
  getPromptMemories: async (charId: string, userName: string, query: string): Promise<PromptMemories> => {
    return await invoke<PromptMemories>('get_prompt_memories', { charId, userName, query });
  },

  /** Plans and promises of a character towards one persona; open ones first. */
  getIntentions: async (charId: string, userName: string, includeResolved: boolean): Promise<IntentionEntry[]> => {
    return await invoke<IntentionEntry[]>('get_intentions', { charId, userName, includeResolved });
  },

  addIntention: async (charId: string, userName: string, draft: IntentionDraft): Promise<number | null> => {
    return await invoke<number | null>('add_intention', { charId, userName, draft });
  },

  updateIntention: async (charId: string, id: number, draft: IntentionDraft): Promise<void> => {
    await invoke('update_intention', { charId, id, draft });
  },

  /** `fulfilled` or `abandoned`: the intention becomes an episodic memory. */
  setIntentionStatus: async (charId: string, id: number, status: 'fulfilled' | 'abandoned'): Promise<boolean> => {
    return await invoke<boolean>('set_intention_status', { charId, id, status });
  },

  deleteIntention: async (charId: string, id: number): Promise<void> => {
    await invoke('delete_intention', { charId, id });
  },

  searchEpisodicMemories: async (charId: string, query: string): Promise<EpisodicMemory[]> => {
    return await invoke<EpisodicMemory[]>('search_episodic_memories', { charId, query });
  },

  /** Outdated memories of a character (newest first); never part of a prompt. */
  getSupersededMemories: async (charId: string): Promise<EpisodicMemory[]> => {
    return await invoke<EpisodicMemory[]>('get_superseded_memories', { charId });
  },

  restoreSupersededMemory: async (charId: string, id: number): Promise<void> => {
    await invoke('restore_superseded_memory', { charId, id });
  },

  /** Asks the model which memories could be merged; writes nothing. */
  proposeMemoryCleanup: async (req: MemoryCleanupRequest): Promise<CleanupProposal> => {
    return await invoke<CleanupProposal>('propose_memory_cleanup', { req });
  },

  /** Merges the confirmed groups after a snapshot; returns how many were merged. */
  applyMemoryCleanup: async (charId: string, userName: string, groups: CleanupGroup[]): Promise<number> => {
    return await invoke<number>('apply_memory_cleanup', { charId, userName, groups });
  },

  getCognitiveOverview: async (
    charId: string,
    userName: string
  ): Promise<CognitiveOverview> => {
    return await invoke<CognitiveOverview>('get_cognitive_overview', {
      charId,
      userName,
    });
  },

  updatePsychology: async (
    charId: string,
    psychology: PsychologyState
  ): Promise<void> => {
    return await invoke<void>('update_psychology', { charId, psychology });
  },

  updateRelationship: async (
    charId: string,
    relationship: RelationshipState
  ): Promise<void> => {
    return await invoke<void>('update_relationship', { charId, relationship });
  },

  /** `source` names the chat message the memory was taken from ("Remember this message"). */
  addEpisodicMemory: async (
    charId: string,
    category: string,
    content: string,
    significance: number,
    source?: { chatId: string; messageIds: string[] },
  ): Promise<number> => {
    return await invoke<number>('add_episodic_memory', {
      charId,
      category,
      content,
      significance,
      chatId: source?.chatId ?? null,
      messageIds: source?.messageIds ?? null,
    });
  },

  updateEpisodicMemory: async (charId: string, id: number, category: string, content: string, significance: number): Promise<void> => {
    await invoke('update_episodic_memory', { charId, id, category, content, significance });
  },

  forgetEpisodicMemory: async (charId: string, id: number): Promise<void> => {
    await invoke('forget_episodic_memory', { charId, id });
  },

  setEpisodicMemoryPinned: async (charId: string, id: number, pinned: boolean): Promise<void> => {
    await invoke('set_episodic_memory_pinned', { charId, id, pinned });
  },

  confirmEpisodicMemory: async (charId: string, id: number): Promise<void> => {
    await invoke('confirm_episodic_memory', { charId, id });
  },

  getMemoryHistory: async (charId: string, id: number): Promise<MemoryChange[]> => {
    return await invoke<MemoryChange[]>('get_memory_history', { charId, id });
  },

  /** How many memories were learned from this message. */
  countMemoriesFromMessage: async (chatId: string, messageId: string): Promise<number> => {
    return await invoke<number>('count_memories_from_message', { chatId, messageId });
  },

  /** Random older memories of a character, woven into a dream told on start. */
  getDreamMemories: async (charId: string, limit: number): Promise<EpisodicMemory[]> => {
    return await invoke<EpisodicMemory[]>('get_dream_memories', { charId, limit });
  },

  addDiaryEntry: async (
    charId: string,
    title: string,
    entryText: string,
    mood: string
  ): Promise<number> => {
    return await invoke<number>('add_diary_entry', {
      charId,
      title,
      entryText,
      mood,
    });
  },

  applyEmotionalDecay: async (charId: string): Promise<string | null> => {
    return await invoke<string | null>('apply_emotional_decay', { charId });
  },

  // Cognitive Pipeline & Markdown Sync
  triggerMemoryPipeline: async (
    req: MemoryPipelineRequest
  ): Promise<MemoryPipelineResult> => {
    return await invoke<MemoryPipelineResult>('trigger_memory_pipeline', {
      req,
    });
  },

  getCharacterMemoryMarkdown: async (charId: string): Promise<string> => {
    return await invoke<string>('get_character_memory_markdown', { charId });
  },

  saveCharacterMemoryMarkdown: async (
    charId: string,
    markdown: string
  ): Promise<void> => {
    return await invoke<void>('save_character_memory_markdown', {
      charId,
      markdown,
    });
  },

  getUserMemoryMarkdown: async (
    charId: string,
    userName: string
  ): Promise<string> => {
    return await invoke<string>('get_user_memory_markdown', {
      charId,
      userName,
    });
  },

  saveUserMemoryMarkdown: async (
    charId: string,
    userName: string,
    markdown: string
  ): Promise<void> => {
    return await invoke<void>('save_user_memory_markdown', {
      charId,
      userName,
      markdown,
    });
  },

  generateManualDiaryEntry: async (
    req: MemoryPipelineRequest
  ): Promise<DiaryEntry> => {
    return await invoke<DiaryEntry>('generate_manual_diary_entry', { req });
  },

  backupMemoryState: async (
    charId: string,
    userName?: string
  ): Promise<MemoryBackupInfo> => {
    return await invoke<MemoryBackupInfo>('backup_memory_state', {
      charId,
      userName,
    });
  },

  listMemoryBackups: async (charId: string): Promise<MemoryBackupInfo[]> => {
    return await invoke<MemoryBackupInfo[]>('list_memory_backups', { charId });
  },

  restoreMemoryBackup: async (backupFilePath: string, charId: string): Promise<void> => {
    return await invoke<void>('restore_memory_backup', { backupFilePath, charId });
  },

  // Phase 6: Soul Stage Tabletop RPG
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

  promoteStageNpc: (sceneId: string, npcId: string): Promise<StageNpcPromotion> =>
    invoke('stage_promote_npc', { sceneId, npcId }),

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

  /** 5e map outside fights: one exploration step (`move:x:y`, `use:x:y`, `pick:x:y`, `force:x:y`) or, without one, start exploring. */
  /** Adventure acts: the next act with the party and inventory carried over. */
  continueStageAdventure: async (sceneId: string): Promise<SceneState> => {
    return await invoke<SceneState>('continue_stage_adventure', { sceneId });
  },

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

  // Phase 7: Soul Companion & Tool Calling
  getCompanionState: async (): Promise<CompanionState> => {
    return await invoke<CompanionState>('get_companion_state');
  },

  applyHormoneInteraction: async (
    interactionType: string
  ): Promise<Neurohormones> => {
    return await invoke<Neurohormones>('apply_hormone_interaction', {
      interactionType,
    });
  },

  setHormones: async (
    dopamine: number,
    cortisol: number,
    oxytocin: number,
    fatigue: number
  ): Promise<Neurohormones> => {
    return await invoke<Neurohormones>('set_hormones', {
      dopamine,
      cortisol,
      oxytocin,
      fatigue,
    });
  },

  requestToolCall: async (
    toolName: string,
    args: JsonObject
  ): Promise<ToolCallRequest> => {
    return await invoke<ToolCallRequest>('request_tool_call', {
      toolName,
      arguments: args,
    });
  },

  resolveToolCall: async (
    callId: string,
    approved: boolean
  ): Promise<ToolExecutionResult> => {
    return await invoke<ToolExecutionResult>('resolve_tool_call', {
      callId,
      approved,
    });
  },

  updateCompanionSettings: async (
    settings: CompanionSettings
  ): Promise<void> => {
    return await invoke<void>('update_companion_settings', { settings });
  },

  addCompanionThought: async (thought: string): Promise<void> => {
    return await invoke<void>('add_companion_thought', { thought });
  },

  clearCompanionThoughts: async (): Promise<void> => {
    return await invoke<void>('clear_companion_thoughts');
  },

  addCompanionGoal: async (summary: string, dueMinutes: number): Promise<Goal> => {
    return await invoke<Goal>('add_companion_goal', { summary, dueMinutes });
  },

  markCompanionGoalCompleted: async (goalId: string): Promise<void> => {
    return await invoke<void>('mark_companion_goal_completed', { goalId });
  },

  deleteCompanionGoal: async (goalId: string): Promise<void> => {
    return await invoke<void>('delete_companion_goal', { goalId });
  },

  getCompanionEnvironmentSnapshot: async (): Promise<EnvironmentSnapshot> => {
    return await invoke<EnvironmentSnapshot>('get_companion_environment_snapshot');
  },

  detectDesktopWindow: async (): Promise<string> => {
    return await invoke<string>('detect_desktop_window');
  },

  listMcpServers: async (): Promise<McpServerConfig[]> => {
    return await invoke<McpServerConfig[]>('list_mcp_servers');
  },

  saveMcpServers: async (servers: McpServerConfig[]): Promise<void> => {
    return await invoke<void>('save_mcp_servers', { servers });
  },

  toggleMcpServer: async (serverId: string, enabled: boolean): Promise<McpServerConfig[]> => {
    return await invoke<McpServerConfig[]>('toggle_mcp_server', { serverId, enabled });
  },

  fetchMcpServerTools: async (serverId: string): Promise<McpToolInfo[]> => {
    return await invoke<McpToolInfo[]>('fetch_mcp_server_tools', { serverId });
  },

  callMcpTool: async (
    serverId: string,
    toolName: string,
    args: JsonObject
  ): Promise<string> => {
    return await invoke<string>('call_mcp_tool', { serverId, toolName, arguments: args });
  },

  listCompanionPlugins: async (): Promise<CompanionPlugin[]> => {
    return await invoke<CompanionPlugin[]>('list_companion_plugins');
  },

  saveCompanionPlugin: async (plugin: CompanionPlugin): Promise<void> => {
    return await invoke<void>('save_companion_plugin', { plugin });
  },

  executeCompanionPlugin: async (
    pluginId: string,
    args: JsonObject
  ): Promise<string> => {
    return await invoke<string>('execute_companion_plugin', { pluginId, arguments: args });
  },

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
  prepareTalkingPortrait: async (image: string, placement: HeadPlacement): Promise<TalkingSet> => {
    return await invoke<TalkingSet>('prepare_talking_portrait', { image, placement });
  },

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

  /** Opens or hides the desktop pet; a new window starts at `placement` (physical position, logical size). */
  toggleDesktopPet: async (
    enable: boolean,
    placement?: { x?: number; y?: number; width: number; height: number },
  ): Promise<boolean> => {
    return await invoke<boolean>('toggle_desktop_pet', { enable, placement: placement ?? null });
  },

  /** The pet's global shortcut (chosen or default) and whether the system accepted it. */
  getPetShortcut: async (): Promise<{ shortcut: string; default: string; registered: boolean }> => {
    return await invoke('get_pet_shortcut');
  },

  /** Chooses the pet's shortcut ('' = default); rejects when another program holds it. */
  setPetShortcut: async (shortcut: string): Promise<{ shortcut: string; default: string; registered: boolean }> => {
    return await invoke('set_pet_shortcut', { shortcut });
  },

  showMainWindow: async (): Promise<void> => {
    await invoke('show_main_window');
  },

  /** Notification whose click opens the chat (Windows); false: not shown, use the plugin. */
  notifyChat: async (title: string, body: string, charId: string, chatId: string): Promise<boolean> => {
    return await invoke<boolean>('notify_chat', { title, body, charId, chatId });
  },

  evaluateCompanionProactive: async (): Promise<[string, string] | null> => {
    return await invoke<[string, string] | null>('evaluate_companion_proactive');
  },

  // Technical Debt & Phase 8: Data Foundation, Settings & Character Library
  getAppPaths: async (): Promise<AppPaths> => {
    return await invoke<AppPaths>('get_app_paths');
  },

  /** Interface languages from the shipped and the user folder. */
  listUiLanguages: async (): Promise<UiLanguage[]> => {
    return await invoke('list_ui_languages');
  },

  /** All texts of one interface language (shipped file plus the user's changes). */
  loadUiLanguage: async (id: string): Promise<Record<string, string>> => {
    return await invoke('load_ui_language', { id });
  },

  /** Copies a language file into the user folder; returns the language id. */
  importUiLanguage: async (path: string): Promise<string> => {
    return await invoke('import_ui_language', { path });
  },

  /** Removes the user's own file for a language (shipped and downloaded texts stay). */
  removeUiLanguage: async (id: string): Promise<void> => {
    await invoke('remove_ui_language', { id });
  },

  /** The data repository brought new or changed interface languages (start-up download). */
  onUiLanguagesChanged: async (callback: () => void): Promise<UnlistenFn> => {
    return await listen('ui-languages-changed', () => callback());
  },

  /** Opens the folder for own translations (with `_template.json` to copy). */
  openUiLocalesFolder: async (): Promise<void> => {
    await invoke('open_ui_locales_folder');
  },

  openAvatarFolder: async (): Promise<void> => {
    await invoke('open_avatar_folder');
  },

  scanCharacters: async (): Promise<CharacterProfile[]> => {
    return await invoke<CharacterProfile[]>('scan_characters');
  },

  scanModels: async (): Promise<ScannedModel[]> => {
    return await invoke<ScannedModel[]>('scan_models');
  },

  scanLoras: async (): Promise<ScannedModel[]> => {
    return await invoke<ScannedModel[]>('scan_loras');
  },

  /** `mmproj-*.gguf` files that let a local model see images. */
  scanVisionProjectors: async (): Promise<ScannedModel[]> => {
    return await invoke<ScannedModel[]>('scan_vision_projectors');
  },

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

  loadSettings: async (): Promise<AppSettings> => {
    return await invoke<AppSettings>('load_settings');
  },

  saveSettings: async (settings: AppSettings): Promise<void> => {
    return await invoke<void>('save_settings', { settings });
  },

  saveAvatarThumbnail: async (kind: AvatarKind, path: string, dataUrl: string): Promise<string> =>
    await invoke<string>('save_avatar_thumbnail', { kind, path, dataUrl }),

  saveCharacterCard: async (
    profile: CharacterProfile
  ): Promise<CharacterProfile> => {
    return await invoke<CharacterProfile>('save_character_card', { profile });
  },

  exportCharacterCard: async (
    profile: CharacterProfile,
    targetPath: string,
    exportAsPng: boolean
  ): Promise<void> => {
    return await invoke<void>('export_character_card', {
      profile,
      targetPath,
      exportAsPng,
    });
  },

  deleteCharacter: async (charId: string): Promise<void> => {
    return await invoke<void>('delete_character', { charId });
  },

  restoreHiddenCharacters: async (): Promise<void> => {
    return await invoke<void>('restore_hidden_characters');
  },

  loadPersonas: async (): Promise<UserPersona[]> => {
    return await invoke<UserPersona[]>('load_personas');
  },

  savePersona: async (persona: UserPersona): Promise<UserPersona[]> => {
    return await invoke<UserPersona[]>('save_persona', { persona });
  },

  deletePersona: async (personaId: string): Promise<UserPersona[]> => {
    return await invoke<UserPersona[]>('delete_persona', { personaId });
  },

  // Phase 9: Vollwertiger Chat & Swipes
  /** The prompt the chat model got last (null before the first message). */
  getLastPrompt: async (): Promise<PromptLog | null> => {
    return await invoke<PromptLog | null>('get_last_prompt');
  },

  /** Creates the chat and the character's greetings (first one shown, the rest as swipes) in one step. */
  createChatSession: async (characterId: string, title: string, greetings: string[] = []): Promise<ChatSession> => {
    return await invoke<ChatSession>('create_chat_session', { characterId, title, greetings });
  },

  /** Look and sound of one chat; null restores the defaults. */
  updateChatStyle: async (chatId: string, style: ChatStyle | null): Promise<void> => {
    await invoke('update_chat_style', { chatId, style });
  },

  listChatSessions: async (characterId: string): Promise<ChatSession[]> => {
    return await invoke<ChatSession[]>('list_chat_sessions', { characterId });
  },

  getChatSession: async (chatId: string): Promise<ChatSession | null> => {
    return await invoke<ChatSession | null>('get_chat_session', { chatId });
  },

  deleteChatSession: async (chatId: string): Promise<void> => {
    return await invoke<void>('delete_chat_session', { chatId });
  },

  renameChatSession: async (chatId: string, newTitle: string): Promise<void> => {
    return await invoke<void>('rename_chat_session', { chatId, newTitle });
  },

  updateChatAuthorNote: async (
    chatId: string,
    authorNote: string,
    authorNoteDepth: number
  ): Promise<void> => {
    return await invoke<void>('update_chat_author_note', {
      chatId,
      authorNote,
      authorNoteDepth,
    });
  },

  /** Folds the messages that left the context window into the chat's running summary. */
  summarizeChat: async (request: ChatSummaryRequest): Promise<ChatSession> => {
    return await invoke<ChatSession>('summarize_chat', { request });
  },

  /** A few short ideas for the user's next message, from the end of the chat. */
  suggestChatReplies: async (request: ReplyIdeasRequest): Promise<string[]> => {
    return await invoke<string[]>('suggest_chat_replies', { request });
  },

  /** Fills the macros ({{char}}, {{random:…}}, {{roll:…}}, {{time}} …) of texts stored as they are. */
  expandMacros: async (texts: string[], input: MacroInput): Promise<string[]> => {
    return await invoke<string[]>('expand_macros', { texts, input });
  },

  /** "Write for me": the user's next message, built from their notes if any. */
  draftChatReply: async (request: ReplyIdeasRequest): Promise<string> => {
    return await invoke<string>('draft_chat_reply', { request });
  },

  /** Translates one chat message with the chat model. */
  translateMessage: async (request: TranslateRequest): Promise<string> => {
    return await invoke<string>('translate_message', { request });
  },

  updateChatSummary: async (chatId: string, summary: string, summaryUntil: number): Promise<void> => {
    return await invoke<void>('update_chat_summary', { chatId, summary, summaryUntil });
  },

  getChatMessages: async (chatId: string): Promise<StoredChatMessage[]> => {
    return await invoke<StoredChatMessage[]>('get_chat_messages', { chatId });
  },

  /** `speakerId`: the character of a reply in a group chat (empty = the chat's own). */
  addChatMessage: async (
    chatId: string,
    role: string,
    content: string,
    thought?: string | null,
    attachments?: Attachment[],
    speakerId?: string | null,
  ): Promise<StoredChatMessage> => {
    return await invoke<StoredChatMessage>('add_chat_message', {
      chatId,
      role,
      content,
      thought: thought ?? null,
      attachments: attachments ?? null,
      speakerId: speakerId || null,
    });
  },

  /** Group chat: the name of who answers next, or "PLAYER" for the user's turn. */
  routeGroupChat: async (request: GroupRouteRequest): Promise<string> => {
    return await invoke<string>('route_group_chat', { request });
  },

  /** Invites characters into a chat (group chat); returns the stored guest IDs. */
  setChatMembers: async (chatId: string, members: string[]): Promise<string[]> => {
    return await invoke<string[]>('set_chat_members', { chatId, members });
  },

  /** Stores a file for the next message; `data` is base64. */
  saveAttachment: async (chatId: string, name: string, data: string): Promise<Attachment> => {
    return await invoke<Attachment>('save_attachment', { chatId, name, data });
  },

  getAttachmentDataUrl: async (attachment: Attachment): Promise<string | null> => {
    return await invoke<string | null>('get_attachment_data_url', { attachment });
  },

  updateChatMessage: async (
    msgId: string,
    content: string,
    thought?: string | null
  ): Promise<StoredChatMessage> => {
    return await invoke<StoredChatMessage>('update_chat_message', {
      msgId,
      content,
      thought: thought ?? null,
    });
  },

  addMessageSwipe: async (
    msgId: string,
    content: string,
    thought?: string | null
  ): Promise<StoredChatMessage> => {
    return await invoke<StoredChatMessage>('add_message_swipe', {
      msgId,
      content,
      thought: thought ?? null,
    });
  },

  switchMessageSwipe: async (
    msgId: string,
    swipeIndex: number
  ): Promise<StoredChatMessage> => {
    return await invoke<StoredChatMessage>('switch_message_swipe', {
      msgId,
      swipeIndex,
    });
  },

  deleteChatMessage: async (msgId: string): Promise<void> => {
    return await invoke<void>('delete_chat_message', { msgId });
  },

  deleteMessagesAfter: async (
    chatId: string,
    orderIndex: number
  ): Promise<void> => {
    return await invoke<void>('delete_messages_after', {
      chatId,
      orderIndex,
    });
  },

  /** The chat as SillyTavern JSONL; with `targetPath` the backend also writes it there. */
  exportChatJsonl: async (
    chatId: string,
    charName: string,
    userName: string,
    targetPath?: string | null,
  ): Promise<string> => {
    return await invoke<string>('export_chat_jsonl', {
      chatId,
      charName,
      userName,
      targetPath: targetPath ?? null,
    });
  },

  importChatJsonl: async (
    characterId: string,
    jsonlContent: string,
    titleOverride?: string | null
  ): Promise<ChatSession> => {
    return await invoke<ChatSession>('import_chat_jsonl', {
      characterId,
      jsonlContent,
      titleOverride: titleOverride ?? null,
    });
  },

  // Phase 10: LLM Provider, Presets & Models Hub
  fetchOpenRouterModels: async (
    apiKey?: string | null
  ): Promise<OpenRouterModelInfo[]> => {
    return await invoke<OpenRouterModelInfo[]>('fetch_openrouter_models', {
      apiKey: apiKey ?? null,
    });
  },

  loadLlmPresets: async (): Promise<LlmPreset[]> => {
    return await invoke<LlmPreset[]>('load_llm_presets');
  },

  saveLlmPreset: async (preset: LlmPreset): Promise<LlmPreset[]> => {
    return await invoke<LlmPreset[]>('save_llm_preset', { preset });
  },

  deleteLlmPreset: async (presetId: string): Promise<LlmPreset[]> => {
    return await invoke<LlmPreset[]>('delete_llm_preset', { presetId });
  },

  searchHfModels: async (query: string): Promise<HfModelSummary[]> => {
    return await invoke<HfModelSummary[]>('search_hf_models', { query });
  },

  getHfModelFiles: async (modelId: string): Promise<HfGgufFile[]> => {
    return await invoke<HfGgufFile[]>('get_hf_model_files', { modelId });
  },

  /** One short answer outside a chat (connection test, first reply in the setup wizard). */
  quickReply: async (request: QuickReplyRequest): Promise<string> => {
    return await invoke<string>('quick_reply', { request });
  },

  /** Server and sampler values families of local models need (from the model catalog). */
  getModelDefaults: async (): Promise<ModelDefaults[]> => {
    return await invoke<ModelDefaults[]>('get_model_defaults');
  },

  /** Free disk space where models are downloaded to (MB). */
  diskSpace: async (): Promise<DiskSpace> => {
    return await invoke<DiskSpace>('disk_space');
  },

  /** Speed test of the running local chat model (kept with the earlier results). */
  runLlmBenchmark: async (): Promise<BenchmarkResult> => {
    return await invoke<BenchmarkResult>('run_llm_benchmark');
  },

  /** Kept speed test results, newest first. */
  listLlmBenchmarks: async (): Promise<BenchmarkResult[]> => {
    return await invoke<BenchmarkResult[]>('list_llm_benchmarks');
  },

  clearLlmBenchmarks: async (): Promise<void> => {
    await invoke('clear_llm_benchmarks');
  },

  /** LoRA adapters for chat models from the catalog (adult ones only while 18+ is on). */
  listChatLoras: async (): Promise<ChatLora[]> => {
    return await invoke<ChatLora[]>('list_chat_loras');
  },

  /** Whether the adapter at `path` is one for adults kept off while 18+ is off. */
  chatLoraHidden: async (path: string): Promise<boolean> => {
    return await invoke<boolean>('chat_lora_hidden', { path });
  },

  /** Downloads the catalog adapter `id` (SHA-256 checked) and returns its path. */
  downloadChatLora: async (id: string): Promise<string> => {
    return await invoke<string>('download_chat_lora', { id });
  },

  /** Chat models for getting started, with the recommendation for this GPU. */
  listStarterModels: async (): Promise<StarterModel[]> => {
    return await invoke<StarterModel[]>('list_starter_models');
  },

  /** New chat with the history up to and including `messageId`. */
  branchChat: async (chatId: string, messageId: string, title: string): Promise<ChatSession> => {
    return await invoke<ChatSession>('branch_chat', { chatId, messageId, title });
  },

  listChatBookmarks: async (chatId: string): Promise<string[]> => {
    return await invoke<string[]>('list_chat_bookmarks', { chatId });
  },

  setChatBookmark: async (chatId: string, messageId: string, bookmarked: boolean): Promise<void> => {
    await invoke('set_chat_bookmark', { chatId, messageId, bookmarked });
  },

  downloadGgufModel: async (file: HfGgufFile): Promise<string> => {
    return await invoke<string>('download_gguf_model', {
      downloadUrl: file.download_url,
      filename: file.filename,
      expectedSize: file.size_bytes,
      expectedSha256: file.sha256,
      parts: file.parts?.length ? file.parts : null,
    });
  },

  /** Stops the running GGUF download of `filename`; it then fails with `downloadCancelled`. */
  cancelGgufDownload: async (filename: string): Promise<void> => {
    await invoke('cancel_gguf_download', { filename });
  },

  getRuntime: async (kind: RuntimeKind): Promise<RuntimeInfo | null> => {
    return await invoke<RuntimeInfo | null>('get_runtime', { kind });
  },

  /** The build kept from before the last update (for a rollback). */
  getPreviousRuntime: async (kind: RuntimeKind): Promise<RuntimeInfo | null> => {
    return await invoke<RuntimeInfo | null>('get_previous_runtime', { kind });
  },

  rollbackRuntime: async (kind: RuntimeKind): Promise<RuntimeInfo> => {
    return await invoke<RuntimeInfo>('rollback_runtime', { kind });
  },

  listRuntimeVariants: async (kind: RuntimeKind): Promise<RuntimeVariant[]> => {
    return await invoke<RuntimeVariant[]>('list_runtime_variants', { kind });
  },

  installRuntime: async (kind: RuntimeKind, backend: string): Promise<RuntimeInfo> => {
    return await invoke<RuntimeInfo>('install_runtime', { kind, backend });
  },

  hideMainWindow: async (): Promise<void> => {
    await invoke('hide_main_window');
  },

  quitApp: async (): Promise<void> => {
    await invoke('quit_app');
  },

  /** Close with "keep running in the tray" and no remembered choice: the interface asks first. */
  onCloseToTrayHint: async (callback: () => void): Promise<UnlistenFn> => {
    return await listen('close-to-tray-hint', () => callback());
  },

  onRuntimeProgress: async (callback: (data: RuntimeProgress) => void): Promise<UnlistenFn> => {
    return await listen<RuntimeProgress>('runtime-progress', (event) => callback(event.payload));
  },

  onModelDownloadProgress: async (
    callback: (data: DownloadProgressEvent) => void
  ): Promise<UnlistenFn> => {
    return await listen<DownloadProgressEvent>('model-download-progress', (event) => {
      callback(event.payload);
    });
  },

  // Streaming Listeners
  /** Live text of a running Soul Stage turn. */
  onStageStream: async (callback: (event: StageStreamEvent) => void): Promise<UnlistenFn> => {
    return await listen<StageStreamEvent>('stage-stream', (event) => callback(event.payload));
  },

  onLlmToken: async (callback: (data: TokenEvent) => void): Promise<UnlistenFn> => {
    return await listen<TokenEvent>('llm-token', (event) => {
      callback(event.payload);
    });
  },

  onLlmThought: async (callback: (data: ThoughtEvent) => void): Promise<UnlistenFn> => {
    return await listen<ThoughtEvent>('llm-thought', (event) => {
      callback(event.payload);
    });
  },

  onLlmDone: async (callback: (data: DoneEvent) => void): Promise<UnlistenFn> => {
    return await listen<DoneEvent>('llm-done', (event) => {
      callback(event.payload);
    });
  },
  // Phase 13: Voice/TTS
  listAvailableVoices: async (
    engine: string,
    elevenlabsApiKey = '',
    kokoroVoicesPath = '',
  ): Promise<ScannedVoice[]> => {
    return await invoke<ScannedVoice[]>('list_available_voices', {
      engine,
      elevenlabsApiKey,
      kokoroVoicesPath,
    });
  },

  getKokoroInstallation: async (): Promise<KokoroInstallResult | null> => {
    return await invoke<KokoroInstallResult | null>('get_kokoro_installation');
  },

  installKokoroModel: async (): Promise<KokoroInstallResult> => {
    return await invoke<KokoroInstallResult>('install_kokoro_model');
  },

  onKokoroDownloadProgress: async (
    callback: (data: KokoroDownloadProgress) => void,
  ): Promise<UnlistenFn> => {
    return await listen<KokoroDownloadProgress>('kokoro-download-progress', (event) => {
      callback(event.payload);
    });
  },
  
  synthesizeSpeech: async (text: string, config: VoiceConfig): Promise<string> => {
    return await invoke<string>('synthesize_speech', { text, config });
  },

  listTtsModels: async (): Promise<TtsModelInfo[]> => {
    return await invoke<TtsModelInfo[]>('list_tts_models');
  },

  downloadTtsModel: async (modelId: string): Promise<void> => {
    await invoke('download_tts_model', { modelId });
  },

  cancelTtsModelDownload: async (): Promise<void> => {
    await invoke('cancel_tts_model_download');
  },

  deleteTtsModel: async (modelId: string): Promise<void> => {
    await invoke('delete_tts_model', { modelId });
  },

  getTtsLocalSettings: async (): Promise<TtsLocalSettings> => {
    return await invoke<TtsLocalSettings>('get_tts_local_settings');
  },

  saveTtsLocalSettings: async (settings: TtsLocalSettings): Promise<void> => {
    await invoke('save_tts_local_settings', { settings });
  },

  listClonedVoices: async (): Promise<ClonedVoice[]> => {
    return await invoke<ClonedVoice[]>('list_cloned_voices');
  },

  createClonedVoice: async (voice: {
    name: string;
    samplesBase64: string;
    sampleRate: number;
    refText: string;
    language: string;
    consent: boolean;
  }): Promise<ClonedVoice> => {
    return await invoke<ClonedVoice>('create_cloned_voice', voice);
  },

  deleteClonedVoice: async (voiceId: string): Promise<void> => {
    await invoke('delete_cloned_voice', { voiceId });
  },

  onTtsModelProgress: async (callback: (data: TtsModelProgress) => void): Promise<UnlistenFn> => {
    return await listen<TtsModelProgress>('tts-model-progress', (event) => callback(event.payload));
  },

  transcribeSpeech: async (audioBase64: string, config: SttConfig): Promise<string> => {
    return await invoke<string>('transcribe_speech', { audioBase64, config });
  },
  
  getCharacterVoiceConfig: async (charId: string): Promise<VoiceConfig> => {
    return await invoke<VoiceConfig>('get_character_voice_config', { charId });
  },
  
  saveCharacterVoiceConfig: async (charId: string, config: VoiceConfig): Promise<void> => {
    return await invoke<void>('save_character_voice_config', { charId, config });
  },

  // Phase 14: Live2D & Emotion Classification
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

  importLive2dModel: async (sourcePath: string): Promise<ScannedLive2d> => {
    return await invoke<ScannedLive2d>('import_live2d_model', { sourcePath });
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

  // Soul Hub (Soul Gateway, Chub AI, World Lorebooks, Stage Scenarios)
  fetchSoulGatewayRegistry: async (): Promise<GatewayCharacterEntry[]> => {
    return await invoke<GatewayCharacterEntry[]>('fetch_soul_gateway_registry');
  },

  importSoulGatewayCharacter: async (
    name: string,
    author: string,
    downloadUrl: string,
    overwrite = false,
    revision = 1,
    updated = ''
  ): Promise<CharacterImportResult> => {
    return await invoke<CharacterImportResult>('import_soul_gateway_character', {
      name,
      author,
      downloadUrl,
      overwrite,
      revision,
      updated,
    });
  },

  searchChubCharacters: async (
    query: string,
    page: number = 1,
    first: number = 24,
    sort: string = 'trending',
    topics?: string[],
    nsfw: boolean = false
  ): Promise<ChubSearchResult> => {
    return await invoke<ChubSearchResult>('search_chub_characters', {
      query,
      page,
      first,
      sort,
      topics: topics && topics.length > 0 ? topics : null,
      nsfw,
    });
  },

  getChubCharacterDetails: async (fullPath: string): Promise<ChubCharacterDetail> => {
    return await invoke<ChubCharacterDetail>('get_chub_character_details', { fullPath });
  },

  importChubCharacter: async (fullPath: string, overwrite = false): Promise<CharacterImportResult> => {
    return await invoke<CharacterImportResult>('import_chub_character', { fullPath, overwrite });
  },

  importCharacterFromUrl: async (url: string, overwrite = false): Promise<CharacterImportResult> => {
    return await invoke<CharacterImportResult>('import_character_from_url', { url, overwrite });
  },

  /** Imports a card file; a character of the same name is only replaced with `overwrite`. */
  importCharacterFile: async (filePath: string, overwrite = false): Promise<CharacterImportResult> => {
    return await invoke<CharacterImportResult>('import_character_file', { filePath, overwrite });
  },

  fetchLorebooksGatewayRegistry: async (): Promise<GatewayLorebookEntry[]> => {
    return await invoke<GatewayLorebookEntry[]>('fetch_lorebooks_gateway_registry');
  },

  /** Installs or updates a gateway lorebook; an own version is only kept as copy with `keepCopy`. */
  importLorebookFromGateway: async (
    downloadUrl: string,
    fallbackName: string,
    revision = 1,
    updated = '',
    keepCopy = false
  ): Promise<Lorebook> => {
    return await invoke<Lorebook>('import_lorebook_from_gateway', {
      downloadUrl,
      fallbackName,
      revision,
      updated,
      keepCopy,
    });
  },

  /** Story collections (lorebooks, scenes and characters of one series); none without a registry. */
  fetchCollectionsGatewayRegistry: async (): Promise<GatewayCollectionEntry[]> => {
    return await invoke<GatewayCollectionEntry[]>('fetch_collections_gateway_registry');
  },

  fetchStagesGatewayRegistry: async (): Promise<GatewaySceneEntry[]> => {
    return await invoke<GatewaySceneEntry[]>('fetch_stages_gateway_registry');
  },

  /** Installs a gateway scene or updates the installed copy (progress stays). */
  importSceneFromGateway: async (
    downloadUrl: string,
    fallbackTitle: string,
    hubId = '',
    revision = 1,
    updated = ''
  ): Promise<SceneState> => {
    return await invoke<SceneState>('import_scene_from_gateway', {
      downloadUrl,
      fallbackTitle,
      hubId,
      revision,
      updated,
    });
  },

  /** Hub contents installed so far, with their revisions. */
  listInstalledHubItems: async (): Promise<InstalledHubItem[]> => {
    return await invoke<InstalledHubItem[]>('list_installed_hub_items');
  },

  // Phase 17: Backups
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

  // Phase 17: Image Generation
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

  // Phase 17: Discord RPC & Bot
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

  // Phase 17: Web Server (Mobile Client)
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

  getWebServerStatus: async (): Promise<WebServerStatus> => {
    return await invoke<WebServerStatus>('get_web_server_status');
  },

  regenerateWebServerToken: async (): Promise<string> => {
    return await invoke<string>('regenerate_web_server_token');
  },

  // Phase 17: AI Character Assistant
  buildCharacterWizardPrompt: async (input: CharacterWizardInput): Promise<string> => {
    return await invoke<string>('build_character_wizard_prompt_cmd', { input });
  },

  parseCharacterWizardDraft: async (rawText: string): Promise<CharacterDraft> => {
    return await invoke<CharacterDraft>('parse_character_wizard_draft_cmd', { rawText });
  },

  createCharacterFromDraft: async (draft: CharacterDraft): Promise<CharacterProfile> => {
    return await invoke<CharacterProfile>('create_character_from_draft', { draft });
  },

  generateCharacterDraftLlm: async (
    input: CharacterWizardInput,
    endpointUrl: string,
    apiKey?: string,
    model?: string,
    provider?: string
  ): Promise<CharacterDraft> => {
    return await invoke<CharacterDraft>('generate_character_draft_llm', {
      input,
      endpointUrl,
      apiKey: apiKey || null,
      model: model || null,
      provider: provider || null,
    });
  },

  // Phase 18: Logging & Updater
  getAppLogs: async (maxLines?: number): Promise<LogEntry[]> => {
    return await invoke<LogEntry[]>('get_app_logs', { maxLines: maxLines || null });
  },

  clearAppLogs: async (): Promise<void> => {
    return await invoke<void>('clear_app_logs');
  },

  exportAppLogs: async (): Promise<string> => {
    return await invoke<string>('export_app_logs');
  },

  checkForUpdates: async (): Promise<UpdateInfo> => {
    return await invoke<UpdateInfo>('check_for_updates');
  },
};
