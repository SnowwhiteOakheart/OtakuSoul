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
  DiceRollResult,
  StageState,
  WorldState,
  CampaignClock,
  CombatCondition,
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
