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
  PsychologyState,
  RelationshipState,
  DiaryEntry,
  MemoryBackupInfo,
  SoulMemoryPipelineRequest,
  SoulMemoryPipelineResult,
  DiceRollResult,
  StageState,
  ScenePreview,
  SceneDefinition,
  SceneState,
  StageTurnRequest,
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
  ScannedVrm,
  AppSettings,
  UserPersona,
  ChatSession,
  StoredChatMessage,
  OpenRouterModelInfo,
  LlmPreset,
  HfModelSummary,
  HfGgufFile,
  DownloadProgressEvent,
  ScannedVoice,
  SttConfig,
  VoiceConfig,
  KokoroDownloadProgress,
  KokoroInstallResult,
  ScannedLive2d,
  Live2dCatalogItem,
  EmotionResult,
  GatewayCharacterEntry,
  GatewayLorebookEntry,
  GatewaySceneEntry,
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
  sendChatMessage: async (request: ChatRequest): Promise<DoneEvent> => {
    return await invoke<DoneEvent>('send_chat_message', { request });
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

  assemblePrompt: async (context: PromptContext): Promise<string> => {
    return await invoke<string>('assemble_prompt', { context });
  },

  readFileBinary: async (filePath: string): Promise<Uint8Array> => {
    const bytes = await invoke<number[]>('read_file_binary', { filePath });
    return new Uint8Array(bytes);
  },

  // Phase 5: Cognitive Soul Memory
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

  addEpisodicMemory: async (
    charId: string,
    category: string,
    content: string,
    significance: number
  ): Promise<number> => {
    return await invoke<number>('add_episodic_memory', {
      charId,
      category,
      content,
      significance,
    });
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

  // Phase 11: Soul Memory 2.0 Cognitive Pipeline & Markdown Sync
  triggerMemoryPipeline: async (
    req: SoulMemoryPipelineRequest
  ): Promise<SoulMemoryPipelineResult> => {
    return await invoke<SoulMemoryPipelineResult>('trigger_memory_pipeline', {
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
    req: SoulMemoryPipelineRequest
  ): Promise<DiaryEntry> => {
    return await invoke<DiaryEntry>('generate_manual_diary_entry', { req });
  },

  importSowMemoryFiles: async (
    charId: string,
    folderPath: string,
    userName: string
  ): Promise<number> => {
    return await invoke<number>('import_sow_memory_files', {
      charId,
      folderPath,
      userName,
    });
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

  restoreMemoryBackup: async (backupFilePath: string): Promise<void> => {
    return await invoke<void>('restore_memory_backup', { backupFilePath });
  },

  // Phase 6: Soul Stage Tabletop RPG
  rollStageDice: async (
    formula: string,
    targetDc?: number
  ): Promise<DiceRollResult> => {
    return await invoke<DiceRollResult>('roll_stage_dice', {
      formula,
      targetDc,
    });
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

  toggleCompanionOverlay: async (enable: boolean, clickThrough: boolean = false): Promise<boolean> => {
    return await invoke<boolean>('toggle_companion_overlay', { enable, clickThrough });
  },

  evaluateCompanionProactive: async (): Promise<[string, string] | null> => {
    return await invoke<[string, string] | null>('evaluate_companion_proactive');
  },

  // Technical Debt & Phase 8: Data Foundation, Settings & Character Library
  getAppPaths: async (): Promise<AppPaths> => {
    return await invoke<AppPaths>('get_app_paths');
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

  scanVrmModels: async (): Promise<ScannedVrm[]> => {
    return await invoke<ScannedVrm[]>('scan_vrm_models');
  },

  loadSettings: async (): Promise<AppSettings> => {
    return await invoke<AppSettings>('load_settings');
  },

  saveSettings: async (settings: AppSettings): Promise<void> => {
    return await invoke<void>('save_settings', { settings });
  },

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
  createChatSession: async (characterId: string, title: string): Promise<ChatSession> => {
    return await invoke<ChatSession>('create_chat_session', { characterId, title });
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

  getChatMessages: async (chatId: string): Promise<StoredChatMessage[]> => {
    return await invoke<StoredChatMessage[]>('get_chat_messages', { chatId });
  },

  addChatMessage: async (
    chatId: string,
    role: string,
    content: string,
    thought?: string | null
  ): Promise<StoredChatMessage> => {
    return await invoke<StoredChatMessage>('add_chat_message', {
      chatId,
      role,
      content,
      thought: thought ?? null,
    });
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

  exportChatJsonl: async (
    chatId: string,
    charName: string,
    userName: string
  ): Promise<string> => {
    return await invoke<string>('export_chat_jsonl', {
      chatId,
      charName,
      userName,
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

  downloadGgufModel: async (
    downloadUrl: string,
    filename: string
  ): Promise<string> => {
    return await invoke<string>('download_gguf_model', {
      downloadUrl,
      filename,
    });
  },

  onModelDownloadProgress: async (
    callback: (data: DownloadProgressEvent) => void
  ): Promise<UnlistenFn> => {
    return await listen<DownloadProgressEvent>('model-download-progress', (event) => {
      callback(event.payload);
    });
  },

  // Streaming Listeners
  onLlmToken: async (callback: (text: string) => void): Promise<UnlistenFn> => {
    return await listen<{ text: string }>('llm-token', (event) => {
      callback(event.payload.text);
    });
  },

  onLlmThought: async (callback: (text: string) => void): Promise<UnlistenFn> => {
    return await listen<{ text: string }>('llm-thought', (event) => {
      callback(event.payload.text);
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

  importSowLive2dModels: async (): Promise<number> => {
    return await invoke<number>('import_sow_live2d_models');
  },

  // Soul Hub (Soul Gateway, Chub AI, World Lorebooks, Stage Scenarios)
  fetchSoulGatewayRegistry: async (): Promise<GatewayCharacterEntry[]> => {
    return await invoke<GatewayCharacterEntry[]>('fetch_soul_gateway_registry');
  },

  importSoulGatewayCharacter: async (
    name: string,
    author: string,
    downloadUrl: string
  ): Promise<CharacterImportResult> => {
    return await invoke<CharacterImportResult>('import_soul_gateway_character', {
      name,
      author,
      downloadUrl,
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

  importChubCharacter: async (fullPath: string): Promise<CharacterImportResult> => {
    return await invoke<CharacterImportResult>('import_chub_character', { fullPath });
  },

  importCharacterFromUrl: async (url: string): Promise<CharacterImportResult> => {
    return await invoke<CharacterImportResult>('import_character_from_url', { url });
  },

  fetchLorebooksGatewayRegistry: async (): Promise<GatewayLorebookEntry[]> => {
    return await invoke<GatewayLorebookEntry[]>('fetch_lorebooks_gateway_registry');
  },

  importLorebookFromGateway: async (
    downloadUrl: string,
    fallbackName: string
  ): Promise<Lorebook> => {
    return await invoke<Lorebook>('import_lorebook_from_gateway', {
      downloadUrl,
      fallbackName,
    });
  },

  fetchStagesGatewayRegistry: async (): Promise<GatewaySceneEntry[]> => {
    return await invoke<GatewaySceneEntry[]>('fetch_stages_gateway_registry');
  },

  importSceneFromGateway: async (
    downloadUrl: string,
    fallbackTitle: string
  ): Promise<SceneState> => {
    return await invoke<SceneState>('import_scene_from_gateway', {
      downloadUrl,
      fallbackTitle,
    });
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

  generateImageAction: async (
    prompt: string,
    negative?: string | null,
    customConfig?: ImageGenConfig | null
  ): Promise<GeneratedImageResult> => {
    return await invoke<GeneratedImageResult>('generate_image_action', {
      prompt,
      negative: negative || null,
      customConfig: customConfig || null,
    });
  },

  listGeneratedImages: async (): Promise<GeneratedImageInfo[]> => {
    return await invoke<GeneratedImageInfo[]>('list_generated_images');
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
