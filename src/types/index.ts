export type { StageNpc } from './generated/StageNpc';
export type { StageNpcDraft } from './generated/StageNpcDraft';
export interface StageNpcPromotion { scene: SceneState; character: CharacterProfile; }
// Types that match the Rust side exactly come from ts-rs (src/types/generated, created by
// `cargo test`); the rest are still hand-written and checked against Rust in wireCheck.ts.
import type { AppPaths } from './generated/AppPaths';
import type { RuntimeVariant } from './generated/RuntimeVariant';
import type { RuntimeProgress } from './generated/RuntimeProgress';
import type { RuntimeInfo } from './generated/RuntimeInfo';
import type { RuntimeKind } from './generated/RuntimeKind';
import type { TtsModelInfo } from './generated/TtsModelInfo';
import type { TtsModelProgress } from './generated/TtsModelProgress';
import type { TtsVoiceInfo } from './generated/TtsVoiceInfo';
import type { TtsLocalSettings } from './generated/TtsLocalSettings';
import type { ClonedVoice } from './generated/ClonedVoice';
import type { ImageModelInfo } from './generated/ImageModelInfo';
import type { ImagePromptRequest } from './generated/ImagePromptRequest';
import type { ImageModelProgress } from './generated/ImageModelProgress';
import type { LoraInfo } from './generated/LoraInfo';
import type { QuickReplyRequest } from './generated/QuickReplyRequest';
import type { StarterModel } from './generated/StarterModel';
import type { PromptLog } from './generated/PromptLog';
import type { PromptLogMessage } from './generated/PromptLogMessage';
import type { LoraSelection } from './generated/LoraSelection';
import type { LocalImageStatus } from './generated/LocalImageStatus';
import type { VramPlan } from './generated/VramPlan';
import type { VramStrategy } from './generated/VramStrategy';
import type { OpenRouterModelInfo } from './generated/OpenRouterModelInfo';
import type { BackupGroupSelection } from './generated/BackupGroupSelection';
import type { CampaignClock } from './generated/CampaignClock';
import type { CampaignObjective } from './generated/CampaignObjective';
import type { CharacterDraft } from './generated/CharacterDraft';
import type { ChatSession } from './generated/ChatSession';
import type { ChatStyle } from './generated/ChatStyle';
import type { ChubCharacterDetail } from './generated/ChubCharacterDetail';
import type { CombatCondition } from './generated/CombatCondition';
import type { ContextUsage } from './generated/ContextUsage';
import type { ArchivedArc } from './generated/ArchivedArc';
import type { CharacterOverlay } from './generated/CharacterOverlay';
import type { StageLoreCard } from './generated/StageLoreCard';
import type { StageStreamEvent } from './generated/StageStreamEvent';
import type { Attachment } from './generated/Attachment';
import type { TranslateRequest } from './generated/TranslateRequest';
import type { PromptTemplate } from './generated/PromptTemplate';
import type { BuiltinPromptTemplate } from './generated/BuiltinPromptTemplate';
import type { AssembledPrompt } from './generated/AssembledPrompt';
import type { ChatSummaryRequest } from './generated/ChatSummaryRequest';
import type { ConsequenceEntry } from './generated/ConsequenceEntry';
import type { DcCheckResult } from './generated/DcCheckResult';
import type { DiaryEntry } from './generated/DiaryEntry';
import type { DiscordBotConfig } from './generated/DiscordBotConfig';
import type { DoneEvent } from './generated/DoneEvent';
import type { EmotionState } from './generated/EmotionState';
import type { EpisodicMemory } from './generated/EpisodicMemory';
import type { MemoryChange } from './generated/MemoryChange';
import type { GatewayCharacterEntry } from './generated/GatewayCharacterEntry';
import type { GatewayLorebookEntry } from './generated/GatewayLorebookEntry';
import type { GatewaySceneEntry } from './generated/GatewaySceneEntry';
import type { GeneratedImageInfo } from './generated/GeneratedImageInfo';
import type { GeneratedImageResult } from './generated/GeneratedImageResult';
import type { GpuInfo } from './generated/GpuInfo';
import type { HardwareInfo } from './generated/HardwareInfo';
import type { HealingLogEntry } from './generated/HealingLogEntry';
import type { KokoroConfig } from './generated/KokoroConfig';
import type { KokoroDownloadProgress } from './generated/KokoroDownloadProgress';
import type { KokoroInstallResult } from './generated/KokoroInstallResult';
import type { LayerRecommendation } from './generated/LayerRecommendation';
import type { Live2dCatalogItem } from './generated/Live2dCatalogItem';
import type { LlmProviderType } from './generated/LlmProviderType';
import type { LogEntry } from './generated/LogEntry';
import type { MemoryBackupInfo } from './generated/MemoryBackupInfo';
import type { Neurohormones } from './generated/Neurohormones';
import type { RvcConfig } from './generated/RvcConfig';
import type { ScannedVoice } from './generated/ScannedVoice';
import type { ScannedVrm } from './generated/ScannedVrm';
import type { AvatarMotion } from './generated/AvatarMotion';
import type { ScratchpadEntry } from './generated/ScratchpadEntry';
import type { ServerState } from './generated/ServerState';
import type { ServerStatus } from './generated/ServerStatus';
import type { StageRelationship } from './generated/StageRelationship';
import type { StoryArc } from './generated/StoryArc';
import type { SttConfig } from './generated/SttConfig';
import type { SttEngine } from './generated/SttEngine';
import type { ToolExecutionResult } from './generated/ToolExecutionResult';
import type { TtsEngine } from './generated/TtsEngine';
import type { TtsFilterMode } from './generated/TtsFilterMode';
import type { VoiceConfig } from './generated/VoiceConfig';
import type { VoiceEffects } from './generated/VoiceEffects';
import type { WebServerConfig } from './generated/WebServerConfig';
import type { WebServerStatus } from './generated/WebServerStatus';
import type { WorldState } from './generated/WorldState';
import type { Stats5e } from './generated/Stats5e';
import type { CombatEvent } from './generated/CombatEvent';
import type { GridPos } from './generated/GridPos';
import type { TurnBudget } from './generated/TurnBudget';
import type { BattleMap } from './generated/BattleMap';
import type { ExploreEvent } from './generated/ExploreEvent';
import type { CombatOptions } from './generated/CombatOptions';
import type { SpellOption } from './generated/SpellOption';
import type { SpellData } from './generated/SpellData';
import type { ItemData } from './generated/ItemData';
import type { Area } from './generated/Area';
import type { SceneRules } from './generated/SceneRules';
export type {
  Stats5e,
  GridPos,
  TurnBudget,
  BattleMap,
  ExploreEvent,
  CombatOptions,
  SpellOption,
  SpellData,
  ItemData,
  Area,
  CombatEvent,
  SceneRules,
  AppPaths,
  RuntimeKind,
  ImageModelInfo,
  ImageModelProgress,
  LoraInfo,
  LoraSelection,
  QuickReplyRequest,
  StarterModel,
  PromptLog,
  PromptLogMessage,
  ImagePromptRequest,
  TtsModelInfo,
  TtsModelProgress,
  TtsVoiceInfo,
  TtsLocalSettings,
  ClonedVoice,
  LocalImageStatus,
  VramPlan,
  VramStrategy,
  RuntimeVariant,
  RuntimeProgress,
  RuntimeInfo,
  OpenRouterModelInfo,
  BackupGroupSelection,
  CampaignClock,
  CampaignObjective,
  CharacterDraft,
  ChatSession,
  ChatStyle,
  ChatSummaryRequest,
  ChubCharacterDetail,
  CombatCondition,
  ConsequenceEntry,
  ContextUsage,
  ArchivedArc,
  CharacterOverlay,
  StageLoreCard,
  StageStreamEvent,
  Attachment,
  TranslateRequest,
  PromptTemplate,
  BuiltinPromptTemplate,
  AssembledPrompt,
  DcCheckResult,
  DiaryEntry,
  DiscordBotConfig,
  DoneEvent,
  EmotionState,
  EpisodicMemory,
  MemoryChange,
  GatewayCharacterEntry,
  GatewayLorebookEntry,
  GatewaySceneEntry,
  GeneratedImageInfo,
  GeneratedImageResult,
  GpuInfo,
  HardwareInfo,
  HealingLogEntry,
  KokoroConfig,
  KokoroDownloadProgress,
  KokoroInstallResult,
  LayerRecommendation,
  Live2dCatalogItem,
  LlmProviderType,
  LogEntry,
  MemoryBackupInfo,
  Neurohormones,
  RvcConfig,
  ScannedVoice,
  ScannedVrm,
  AvatarMotion,
  ScratchpadEntry,
  ServerState,
  ServerStatus,
  StageRelationship,
  StoryArc,
  SttConfig,
  SttEngine,
  ToolExecutionResult,
  TtsEngine,
  TtsFilterMode,
  VoiceConfig,
  VoiceEffects,
  WebServerConfig,
  WebServerStatus,
  WorldState,
};

export interface LlamaServerConfig {
  binary_path?: string;
  model_path: string;
  port: number;
  context_size: number;
  gpu_layers: number;
  threads?: number;
  flash_attn: boolean;
  reasoning_mode?: boolean;
  thinking_budget?: number;
  batch_size?: number;
  ubatch_size?: number;
  cache_type_k?: string;
  cache_type_v?: string;
  mlock?: boolean;
  no_mmap?: boolean;
  cpu_moe?: boolean;
  mmproj_path?: string | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thought?: string;
  attachments?: Attachment[];
}

export interface SamplingParams {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  min_p?: number;
  max_tokens?: number;
  repeat_penalty?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  dynatemp_range?: number;
  dynatemp_exponent?: number;
  dry_multiplier?: number;
  dry_base?: number;
  dry_allowed_length?: number;
  dry_penalty_last_n?: number;
  xtc_threshold?: number;
  xtc_probability?: number;
  stop_strings?: string[];
}

export interface ChatRequest {
  endpoint_url: string;
  api_key?: string;
  model?: string;
  provider?: LlmProviderType;
  messages: ChatMessage[];
  sampling?: SamplingParams;
  reasoning_mode?: boolean;
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = Record<string, JsonValue>;

// Phase 3: Character Cards, Lorebooks & State Variables
export interface CharacterData {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  alternate_greetings: string[];
  system_prompt?: string;
  post_history_instructions?: string;
  creator_notes?: string;
  character_version?: string;
  tags: string[];
  creator?: string;
  character_book?: JsonValue;
  extensions: {
    custom_title?: string;
    custom_avatar?: string;
    custom_live2d?: string;
    custom_vrm?: string;
    custom_expressions?: Record<string, string>;
    custom_i18n?: {
      source_language?: string;
      translations?: Record<string, Partial<Record<'description' | 'personality' | 'scenario' | 'first_mes' | 'mes_example' | 'system_prompt' | 'post_history_instructions' | 'custom_title' | 'sow_title', string>> & { alternate_greetings?: string[] }>;
    };
    sow_title?: string;
    sow_avatar?: string;
    sow_live2d?: string;
    sow_vrm?: string;
    expressions?: Record<string, string>;
    sow_expressions?: Record<string, string>;
    sow_i18n?: {
      source_language?: string;
      translations?: Record<string, Partial<Record<'description' | 'personality' | 'scenario' | 'first_mes' | 'mes_example' | 'system_prompt' | 'post_history_instructions' | 'custom_title' | 'sow_title', string>> & { alternate_greetings?: string[] }>;
    };
    [key: string]: unknown;
  };
}

export interface CharacterCardV2 {
  spec: string;
  spec_version: string;
  data: CharacterData;
}

export interface CharacterProfile {
  id: string;
  card: CharacterCardV2;
  avatar_data_url?: string;
  source_path?: string;
  bound_lorebooks: string[];
}

export interface LorebookEntry {
    extensions?: Record<string, unknown>;
  uid?: number;
  name: string;
  key: string[];
  secondary_keys?: string[];
  exclude_key: string[];
  regex_keys?: string[];
  content: string;
  trigger_type: string; // 'keyword' | 'regex' | 'always_on' | 'tension'
  probability?: number;
  priority?: number;
  enabled?: boolean;
  injection_behavior?: string; // 'passive' | 'active'
  case_sensitive?: boolean;
  match_whole_words?: boolean;
  chain_requires?: string[];
  chain_activates?: string[];
  tension_threshold?: number;
}

export interface Lorebook {
    extensions?: Record<string, unknown>;
  id?: string;
  name: string;
  description: string;
  scan_depth?: number;
  is_global?: boolean;
  file_path?: string;
  entries: LorebookEntry[];
}

export interface EvaluatedLoreResult {
  passive_entries: LorebookEntry[];
  active_entries: LorebookEntry[];
  activated_entry_names: string[];
  triggered_tension_events: string[];
  new_tension: number;
}

export interface StateVariable {
  name: string;
  value: string;
  var_type: 'int' | 'str' | 'bool' | 'progress';
  max_value?: number;
}

// Phase 5 & 11: Cognitive Soul Memory
export interface PsychologyState {
  primary_emotion: string;
  intensity: number; // 1..5
  psychological_tension: string;
  emotional_decay_counter: number;
  active_agenda: string;
  immediate_focus: string;
  core_identity?: string[];
  cognitive_dissonance?: string;
  updated_at: number;
}

export interface RelationshipState {
  user_name: string;
  role_in_story?: string;
  known_attributes?: string;
  trust_level: string;
  dynamic_description?: string;
  unspoken_tension: string;
  preferences_habits: string[];
  shared_milestones: string[];
  updated_at: number;
}

export interface MemoryPipelineRequest {
  character_id: string;
  user_name: string;
  chat_id?: string;
  endpoint_url: string;
  api_key?: string;
  model?: string;
  provider?: LlmProviderType;
  recent_turn_count?: number;
  include_diary?: boolean;
  /** Dialogue to learn from instead of the chat (Stage). */
  transcript?: string;
}
export type SoulMemoryPipelineRequest = MemoryPipelineRequest;

export interface MemoryPipelineResult {
  no_change: boolean;
  character_id: string;
  psychology: PsychologyState;
  relationship: RelationshipState;
  topics_processed: string[];
  diary_entry?: DiaryEntry | null;
  healing_entries: string[];
}
export type SoulMemoryPipelineResult = MemoryPipelineResult;

export interface CognitiveOverview {
  psychology: PsychologyState;
  relationship: RelationshipState;
  recent_memories: EpisodicMemory[];
  recent_diary: DiaryEntry[];
  healing_logs: HealingLogEntry[];
}

export interface PromptContext {
  char_name: string;
  user_name: string;
  character: CharacterData;
  active_lore: LorebookEntry[];
  active_directives?: LorebookEntry[];
  state_variables: StateVariable[];
  cognitive?: CognitiveOverview;
  reply_language?: string;
  allow_reasoning?: boolean;
  author_note?: string;
  author_note_depth?: number;
  chat_summary?: string;
  template?: PromptTemplate;
}

// Phase 6: Soul Stage Tabletop RPG

export interface DiceRollResult {
  formula: string;
  dice_count: number;
  die_faces: number;
  modifier: number;
  individual_rolls: number[];
  sum: number;
  is_critical_success: boolean;
  is_critical_failure: boolean;
  dc_check?: DcCheckResult | null;
}

export interface Combatant {
  id: string;
  name: string;
  role: 'player' | 'companion' | 'enemy' | 'boss';
  hp: number;
  max_hp: number;
  stress: number;
  max_stress: number;
  initiative: number;
  conditions: CombatCondition[];
  skills: Record<string, number>;
  /** Rules values in 5e scenes. */
  stats5e?: Stats5e | null;
  /** Square on the battle map. */
  position?: GridPos | null;
}

export interface EncounterState {
  is_active: boolean;
  round: number;
  current_turn_index: number;
  combatants: Combatant[];
  combat_log: string[];
  /** Rules events of the current fight (5e scenes). */
  events?: CombatEvent[];
  /** What the current combatant has left this turn (5e). */
  turn?: TurnBudget;
  reactions_used?: string[];
  /** Ongoing spell effects (concentration, repeated saves). */
  effects?: import('./generated/ActiveEffect').ActiveEffect[];
  /** How hard the fight is for the party (5e, XP budget). */
  difficulty?: import('./generated/Difficulty').Difficulty;
}

// Phase 15: Soul Stage (KI-Game-Master Orchestrator)
export interface ScenePreview {
  id: string;
  title: string;
  description: string;
  party: string[];
  location: string;
  time_of_day: string;
  gm_tone: string;
  folder: string;
  is_preset: boolean;
  starting_bg: string;
  last_played?: string | null;
  has_progress?: boolean;
  turn_count?: number;
  rules_5e?: boolean;
}

export interface SceneDefinition {
    extensions?: Record<string, unknown>;
  id: string;
  title: string;
  description: string;
  world_context: string;
  starting_location: string;
  time_of_day: string;
  opening_narration: string;
  first_message: string;
  party: string[];
  gm_tone: string;
  narrator_style: string;
  persona: string;
  lorebook: string[];
  folder?: string;
  lock_bg?: boolean;
  disable_ambient?: boolean;
  solo_mode: boolean;
  max_actor_depth: number;
  dice_rolls_enabled: boolean;
  starting_bg: string;
  starting_ambient: string;
  created_at: string;
  last_played?: string | null;
  /** 5e rules engine; absent = narrative scene. */
  rules?: SceneRules | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  quantity: number;
  item_type: string;
  hp_restore?: number;
  stress_restore?: number;
  clears_condition?: string | null;
  /** SRD equipment id for 5e gear and loot. */
  srd_id?: string;
}

export interface TaggedChoice {
  text: string;
  badge?: string | null;
  action_type?: string;
}

export interface DiceEventData {
  type: 'dice_roll';
  formula: string;
  rolls: number[];
  modifier: number;
  total: number;
  target_dc?: number | null;
  passed?: boolean | null;
  is_crit_success: boolean;
  is_crit_fail: boolean;
}

export interface ClockUpdateData {
  type: 'clock_update';
  clock_id: string;
  clock_name: string;
  delta: number;
  current: number;
  max: number;
}

export interface RestEventData {
  type: 'rest';
  rest_type: string;
  recovered_hp: number;
  recovered_stress: number;
  campfire_note: string;
}

export interface DiscoveryEventData {
  type: 'discovery';
  text: string;
}

export interface ConsequenceEventData {
  type: 'consequence';
  text: string;
}

export interface ItemUseEventData {
  type: 'item_use';
  item_name: string;
  hp_recovered: number;
  stress_recovered: number;
  cleared_condition?: string | null;
}

export interface BondMilestoneEventData {
  type: 'bond_milestone';
  companion: string;
  affinity: number;
  milestone: number;
}

export interface CombatEventData {
  type: 'combat';
  action: 'started' | 'reinforcement' | 'ended' | string;
  text: string;
}

export type StageEventCard =
  | DiceEventData
  | ClockUpdateData
  | RestEventData
  | DiscoveryEventData
  | ConsequenceEventData
  | ItemUseEventData
  | BondMilestoneEventData
  | CombatEventData;

export interface SceneTurnMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: 'gm' | 'player' | 'companion' | 'npc' | string;
  avatar_url?: string | null;
  content: string;
  turn_mode: 'say' | 'do' | 'think' | 'whisper' | 'direct' | string;
  whisper_target?: string | null;
  event_card?: StageEventCard | null;
  timestamp: number;
}

export interface SceneState {
  definition: SceneDefinition;
  world: WorldState;
  clocks: CampaignClock[];
  combat: EncounterState;
  arcs: StoryArc[];
  inventory: InventoryItem[];
  objectives: CampaignObjective[];
  relationships: StageRelationship[];
  consequence_ledger: ConsequenceEntry[];
  chat_log: SceneTurnMessage[];
  pending_choices: TaggedChoice[];
  current_turn_actor: string;
  current_bg?: string | null;
  /** Ambient sound playing now (file name). */
  current_ambient?: string | null;
  /** Summaries of resolved story arcs. */
  arc_archive?: ArchivedArc[];
  turns_since_audit?: number;
  overlays?: CharacterOverlay[];
  lore_cards?: StageLoreCard[];
  memory_sync?: Record<string, number>;
  /** What each character was told in private (whispers). */
  private_knowledge?: Record<string, string[]>;
  npcs?: import('./generated/StageNpc').StageNpc[];
  history_summaries?: Record<string, import('./generated/StageHistorySummary').StageHistorySummary>;
  /** Battle map of the current or last fight (5e scenes); while exploring with fog of war. */
  map?: BattleMap | null;
  /** What happened while exploring the map (5e scenes). */
  exploration?: ExploreEvent[];
}

export type StageState = SceneState;

export interface StageTurnRequest {
  scene_id: string;
  user_input: string;
  turn_mode: 'say' | 'do' | 'think' | 'whisper' | 'direct' | string;
  whisper_target?: string | null;
  force_next_actor?: string | null;
}

// Phase 7 & 16: Soul Companion, Neurohormones, Goals, Scratchpad, MCP & Desktop Agent

export interface Goal {
  id: string;
  summary: string;
  due_at: string;
  status: 'pending' | 'completed';
  created_at: string;
  completed_at?: string | null;
}

export interface ToolCallRequest {
  id: string;
  tool_name: string;
  arguments: JsonObject;
  requires_confirmation: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  created_at: number;
}

export interface CompanionSettings {
  auto_approve_safe_tools: boolean;
  countdown_seconds: number;
  enable_neurohormones: boolean;
  proactive_interval_seconds?: number;
  enable_proactive_speaking?: boolean;
  /** `execute_code` is allowed (off by default, not kept across restarts). */
  allow_code_execution?: boolean;
}

export interface CompanionState {
  hormones: Neurohormones;
  emotion?: EmotionState;
  scratchpad?: ScratchpadEntry[];
  goals?: Goal[];
  pending_tool_calls: ToolCallRequest[];
  tool_history: ToolExecutionResult[];
  settings: CompanionSettings;
  active_window_title?: string;
  is_afk?: boolean;
  overlay_active?: boolean;
  last_spoke_at?: number;
}

export interface EnvironmentSnapshot {
  cpu_usage_percent: number;
  ram_used_mb: number;
  ram_total_mb: number;
  ram_percent: number;
  disk_free_gb: number;
  disk_total_gb: number;
  disk_percent: number;
  battery_percent?: number | null;
  battery_charging?: boolean | null;
  gpu_name?: string | null;
  gpu_temp_c?: number | null;
  gpu_util_percent?: number | null;
  gpu_vram_used_mb?: number | null;
  gpu_vram_total_mb?: number | null;
  uptime_seconds: number;
  active_processes_count: number;
}

export interface McpServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'http' | 'sse';
  command?: string | null;
  args?: string[] | null;
  env?: Record<string, string> | null;
  url?: string | null;
  enabled: boolean;
}

export interface McpToolInfo {
  server_id: string;
  name: string;
  description: string;
  input_schema: JsonObject;
}

export interface CompanionPlugin {
  id: string;
  name: string;
  description: string;
  command: string;
  args: string[];
  requires_approval: boolean;
  parameters_schema: JsonObject;
}

// Phase 8: Paths, Settings, Scans & Personas

export interface ScannedModel {
  name: string;
  path: string;
  size_mb: number;
  runtime: 'standard' | 'prism' | 'sd-server' | string;
  recommended_context: number;
  compatibility_note: string;
}

export interface AppSettings {
  server_config: LlamaServerConfig;
  sampling: SamplingParams;
  selected_backend: 'local' | 'cloud';
  cloud_provider: LlmProviderType;
  cloud_endpoint: string;
  cloud_api_key: string;
  cloud_model: string;
  cloud_context_tokens: number;
  active_preset_id?: string | null;
  reply_language: string;
  lorebook_scan_depth: number;
  active_character_id: string | null;
  active_persona_id: string | null;
  active_vrm_path: string | null;
  active_live2d_path?: string | null;
  global_lorebooks?: string[];
  scene_tension_enabled?: boolean;
  avatar_mode?: '3d' | 'live2d' | '2d';
  app_language?: 'de' | 'en' | 'ru';
  theme?: 'obsidian' | 'cyberpunk' | 'sakura' | 'midnight' | 'emerald' | string;
  color_mode?: 'system' | 'light' | 'dark';
  onboarding_completed?: boolean;
  /** Closing the window keeps the app running in the tray. */
  close_to_tray?: boolean;
  tray_hint_shown?: boolean;
  /** The chat model may use tools (date/time, calculator, web search). */
  chat_tools?: boolean;
  prompt_template?: PromptTemplate;
}

// Phase 14: Live2D & Emotion Classification
export interface ScannedLive2d {
  id: string;
  name: string;
  model_path: string;
  preview_image?: string | null;
  version: string;
}

export interface EmotionResult {
  emotion: string;
  vrm_expression: 'happy' | 'angry' | 'sad' | 'surprised' | 'relaxed' | 'neutral';
  live2d_expression: string;
  confidence: number;
  intensity: number;
}

export interface UserPersona {
  id: string;
  name: string;
  description: string;
  avatar_data_url?: string | null;
}

// Phase 9: Vollwertiger Chat, Swipes & HUD Presets

export interface SwipeVariant {
  content: string;
  thought?: string | null;
}

export interface StoredChatMessage {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thought?: string | null;
  order_index: number;
  swipe_index: number;
  swipes: SwipeVariant[];
  created_at: number;
  attachments: Attachment[];
}

export interface HudPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  color: string;
  defaultVariables: StateVariable[];
}

// Phase 10: LLM-Provider & llama.cpp-Tuning
export interface LlmPreset {
  id: string;
  name: string;
  description: string;
  is_builtin: boolean;
  sampling: SamplingParams;
}

export interface HfModelSummary {
  id: string;
  author: string;
  downloads: number;
  likes: number;
  pipeline_tag?: string | null;
  last_modified?: string | null;
}

export interface HfGgufFile {
  filename: string;
  size_bytes: number;
  sha256: string | null;
  size_formatted: string;
  download_url: string;
  quantization: string;
  runtime: 'standard' | 'prism' | 'legacy';
  recommended: boolean;
  compatibility_note: string;
}

export interface DownloadProgressEvent {
  filename: string;
  downloaded_bytes: number;
  total_bytes: number;
  percent: number;
  speed_mbps: number;
  eta_seconds?: number | null;
  finished: boolean;
  error?: string | null;
}

// Phase 13: Voice & TTS

// Soul Hub Types (Soul Gateway, Chub AI, World Lorebooks, Stage Scenarios)

export interface ChubSearchItem {
  id: number;
  name: string;
  full_path: string;
  description?: string | null;
  tagline?: string | null;
  avatar_url?: string | null;
  star_count: number;
  n_favorites: number;
  n_tokens: number;
  n_chats: number;
  topics: string[];
  nsfw_image: boolean;
}

export interface ChubSearchResult {
  items: ChubSearchItem[];
  total_count?: number | null;
  has_more: boolean;
}

export interface CharacterImportResult {
  profile: CharacterProfile;
  imported_lorebook?: string | null;
}

// --- Phase 17: Ecosystem, Backups, Image Generation, Discord & Web Client ---

export interface BackupManifest {
  schema_version: number;
  app_version: string;
  created_at: string;
  groups: BackupGroupSelection;
  files_count: number;
  description?: string | null;
}

export interface BackupEntryInfo {
  id: string;
  filename: string;
  file_path: string;
  size_bytes: number;
  created_at: string;
  is_safety_snapshot: boolean;
  manifest?: BackupManifest | null;
}

export interface ImageGenConfig {
  provider: string;
  api_url: string;
  api_key?: string | null;
  positive_prompt_prefix: string;
  negative_prompt: string;
  width: number;
  height: number;
  steps: number;
  cfg_scale: number;
  sampler_name: string;
  seed: number;
  /** Catalog id of the local image model (provider `local`). */
  local_model_id?: string | null;
  vram_strategy?: VramStrategy;
  /** LoRAs for the local image model; each applies only to its own model family. */
  local_loras?: LoraSelection[];
}

export interface DiscordRpcActivity {
  details: string;
  state: string;
  character_name?: string | null;
  start_timestamp?: number | null;
}

export interface DiscordBotStatus {
  is_running: boolean;
  bot_user?: string | null;
  connected_guilds: number;
  uptime_secs: number;
}

export interface CharacterWizardInput {
  name: string;
  concept: string;
  archetype: string;
  visual_style: string;
  personality_traits: string;
  world_background: string;
  relationship_to_user: string;
  greeting_scenario: string;
  target_language?: string | null;
}

// Phase 18: Logging & Updater

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  release_notes?: string | null;
  release_url: string;
  published_at?: string | null;
}
