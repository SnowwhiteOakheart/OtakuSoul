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
  WorldState,
  CampaignClock,
  CombatCondition,
  Neurohormones,
  ToolCallRequest,
  ToolExecutionResult,
  CompanionSettings,
  CompanionState,
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
} from '../types';

export const api = {
  // Hardware
  getHardwareInfo: async (): Promise<HardwareInfo> => {
    return await invoke<HardwareInfo>('get_hardware_info');
  },

  getLayerRecommendation: async (
    modelSizeMb: number,
    totalLayers: number,
    contextSize: number
  ): Promise<LayerRecommendation> => {
    return await invoke<LayerRecommendation>('get_layer_recommendation', {
      modelSizeMb,
      totalLayers,
      contextSize,
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

  evaluateLorebookContext: async (
    lorebook: Lorebook,
    context: string
  ): Promise<LorebookEntry[]> => {
    return await invoke<LorebookEntry[]>('evaluate_lorebook_context', {
      lorebook,
      context,
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
    args: Record<string, any>
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

  // Technical Debt & Phase 8: Data Foundation, Settings & Character Library
  getAppPaths: async (): Promise<AppPaths> => {
    return await invoke<AppPaths>('get_app_paths');
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
};
