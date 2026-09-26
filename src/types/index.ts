export interface GpuInfo {
  name: string;
  vendor: string;
  total_vram_mb: number;
  free_vram_mb: number;
}

export interface HardwareInfo {
  os_name: string;
  os_version: string;
  cpu_name: string;
  cpu_cores: number;
  total_ram_mb: number;
  available_ram_mb: number;
  gpus: GpuInfo[];
}

export interface LayerRecommendation {
  recommended_layers: number;
  fits_entirely_in_vram: boolean;
  estimated_vram_usage_mb: number;
  available_vram_mb: number;
  advice: string;
}

export type ServerState = 'stopped' | 'starting' | 'running' | 'failed';

export interface ServerStatus {
  state: ServerState;
  port: number;
  pid: number | null;
  model_name: string | null;
  error_message: string | null;
  recent_logs: string[];
}

export interface LlamaServerConfig {
  binary_path?: string;
  model_path: string;
  port: number;
  context_size: number;
  gpu_layers: number;
  threads?: number;
  flash_attn: boolean;
  reasoning_mode?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thought?: string;
}

export interface SamplingParams {
  temperature?: number;
  top_p?: number;
  min_p?: number;
  max_tokens?: number;
}

export interface ChatRequest {
  endpoint_url: string;
  api_key?: string;
  model?: string;
  messages: ChatMessage[];
  sampling?: SamplingParams;
  reasoning_mode?: boolean;
}

export interface DoneEvent {
  full_text: string;
  full_thought: string;
}

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
  extensions: {
    sow_title?: string;
    sow_avatar?: string;
    sow_live2d?: string;
    sow_vrm?: string;
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
  uid?: number;
  name: string;
  key: string[];
  exclude_key: string[];
  content: string;
  trigger_type: string;
  probability?: number;
  injection_behavior?: string;
}

export interface Lorebook {
  name: string;
  description: string;
  entries: LorebookEntry[];
}

export interface StateVariable {
  name: string;
  value: string;
  var_type: 'int' | 'str' | 'bool' | 'progress';
  max_value?: number;
}

// Phase 5: Cognitive Soul Memory
export interface PsychologyState {
  primary_emotion: string;
  intensity: number; // 1..5
  psychological_tension: string;
  emotional_decay_counter: number;
  active_agenda: string;
  immediate_focus: string;
  updated_at: number;
}

export interface RelationshipState {
  user_name: string;
  trust_level: string;
  unspoken_tension: string;
  preferences_habits: string[];
  shared_milestones: string[];
  updated_at: number;
}

export interface EpisodicMemory {
  id: number;
  category: string; // 'event' | 'fact' | 'location' | 'secret' | 'promise'
  content: string;
  significance: number; // 1..5
  created_at: number;
  last_accessed_at: number;
}

export interface DiaryEntry {
  id: number;
  title: string;
  entry_text: string;
  mood: string;
  created_at: number;
}

export interface HealingLogEntry {
  id: number;
  action: string;
  details: string;
  created_at: number;
}

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
  state_variables: StateVariable[];
  cognitive?: CognitiveOverview;
  reply_language?: string;
  allow_reasoning?: boolean;
  author_note?: string;
  author_note_depth?: number;
}

// Phase 6: Soul Stage Tabletop RPG
export interface DcCheckResult {
  target_dc: number;
  passed: boolean;
  margin: number;
}

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

export interface WorldState {
  time_of_day: string;
  weather: string;
  location: string;
  danger_level: number;
  active_quest: string;
}

export interface CampaignClock {
  id: string;
  name: string;
  current: number;
  max: number;
  clock_type: string;
}

export interface CombatCondition {
  name: string;
  rounds_remaining: number;
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
}

export interface EncounterState {
  is_active: boolean;
  round: number;
  current_turn_index: number;
  combatants: Combatant[];
  combat_log: string[];
}

export interface StageState {
  world: WorldState;
  clocks: CampaignClock[];
  encounter: EncounterState;
}

// Phase 7: Soul Companion & Tool Calling
export interface Neurohormones {
  dopamine: number;
  cortisol: number;
  oxytocin: number;
  fatigue: number;
  mood_label: string;
  energy_level: number;
}

export interface ToolCallRequest {
  id: string;
  tool_name: string;
  arguments: Record<string, any>;
  requires_confirmation: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  created_at: number;
}

export interface ToolExecutionResult {
  call_id: string;
  tool_name: string;
  success: boolean;
  output: string;
  executed_at: number;
}

export interface CompanionSettings {
  auto_approve_safe_tools: boolean;
  countdown_seconds: number;
  enable_neurohormones: boolean;
}

export interface CompanionState {
  hormones: Neurohormones;
  pending_tool_calls: ToolCallRequest[];
  tool_history: ToolExecutionResult[];
  settings: CompanionSettings;
}

// Phase 8: Paths, Settings, Scans & Personas
export interface AppPaths {
  config_dir: string;
  data_dir: string;
  characters_dir: string;
  lorebooks_dir: string;
  personas_dir: string;
  scenes_dir: string;
  trash_dir: string;
  bundled_presets_dir: string;
  bundled_models_dir: string;
  bundled_vrm_dir: string;
  bundled_bin_dir: string;
}

export interface ScannedModel {
  name: string;
  path: string;
  size_mb: number;
}

export interface ScannedVrm {
  name: string;
  path: string;
  size_mb: number;
}

export interface AppSettings {
  server_config: LlamaServerConfig;
  sampling: SamplingParams;
  selected_backend: 'local' | 'cloud';
  cloud_endpoint: string;
  cloud_api_key: string;
  cloud_model: string;
  reply_language: string;
  lorebook_scan_depth: number;
  active_character_id: string | null;
  active_persona_id: string | null;
  active_vrm_path: string | null;
}

export interface UserPersona {
  id: string;
  name: string;
  description: string;
  avatar_data_url?: string | null;
}

// Phase 9: Vollwertiger Chat, Swipes & HUD Presets
export interface ChatSession {
  id: string;
  character_id: string;
  title: string;
  created_at: number;
  updated_at: number;
  author_note: string;
  author_note_depth: number;
  message_count: number;
}

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

