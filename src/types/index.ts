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
  thinking_budget?: number;
  batch_size?: number;
  ubatch_size?: number;
  cache_type_k?: string;
  cache_type_v?: string;
  mlock?: boolean;
  no_mmap?: boolean;
  cpu_moe?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thought?: string;
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
  stop?: string[];
}

export type LlmProviderType =
  | 'local_llama'
  | 'open_router'
  | 'anthropic'
  | 'open_ai'
  | 'deep_seek'
  | 'gemini'
  | 'mistral'
  | 'custom';

export interface ChatRequest {
  endpoint_url: string;
  api_key?: string;
  model?: string;
  provider?: LlmProviderType;
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

export interface MemoryBackupInfo {
  filename: string;
  timestamp: number;
  date_formatted: string;
  size_bytes: number;
}

export interface SoulMemoryPipelineRequest {
  character_id: string;
  user_name: string;
  chat_id?: string;
  endpoint_url: string;
  api_key?: string;
  model?: string;
  provider?: LlmProviderType;
  recent_turn_count?: number;
  include_diary?: boolean;
}

export interface SoulMemoryPipelineResult {
  no_change: boolean;
  character_id: string;
  psychology: PsychologyState;
  relationship: RelationshipState;
  topics_processed: string[];
  diary_entry?: DiaryEntry | null;
  healing_entries: string[];
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
  active_directives?: LorebookEntry[];
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
  cloud_provider: LlmProviderType;
  cloud_endpoint: string;
  cloud_api_key: string;
  cloud_model: string;
  active_preset_id?: string | null;
  reply_language: string;
  lorebook_scan_depth: number;
  active_character_id: string | null;
  active_persona_id: string | null;
  active_vrm_path: string | null;
  global_lorebooks?: string[];
  scene_tension_enabled?: boolean;
  avatar_mode?: '3d' | '2d';
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

// Phase 10: LLM-Provider & llama.cpp-Tuning
export interface OpenRouterModelPricing {
  prompt?: string;
  completion?: string;
  image?: string;
  request?: string;
}

export interface OpenRouterModelInfo {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing?: OpenRouterModelPricing;
}

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
  size_formatted: string;
  download_url: string;
  quantization: string;
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
export type TtsEngine = 'edge' | 'kokoro' | 'elevenlabs' | 'openai' | 'disabled';
export type TtsFilterMode = 'all' | 'dialogue_only' | 'strip_actions';
export type SttEngine = 'native_whisper' | 'openai' | 'disabled';

export interface KokoroConfig {
  model_path: string;
  voices_path: string;
}

export interface KokoroInstallResult extends KokoroConfig {
  installed_voices: ScannedVoice[];
}

export interface KokoroDownloadProgress {
  filename: string;
  file_index: number;
  total_files: number;
  downloaded_bytes: number;
  total_bytes: number;
  percent: number;
  finished: boolean;
}

export interface RvcConfig {
  enabled: boolean;
  endpoint: string;
  api_key: string;
  model: string;
  pitch: number;
  index_rate: number;
  protect: number;
}

export interface SttConfig {
  engine: SttEngine;
  whisper_model_path: string;
  endpoint: string;
  api_key: string;
  model: string;
  language: string;
  prompt: string;
  vad_threshold: number;
  vad_silence_ms: number;
  input_device_id: string;
}

export interface VoiceConfig {
  engine: TtsEngine;
  voice_id: string;
  rate: string;
  pitch: string;
  volume: string;
  filter_mode: TtsFilterMode;
  custom_regex: string;
  elevenlabs_api_key: string;
  openai_endpoint: string;
  openai_api_key: string;
  openai_model: string;
  openai_instructions: string;
  kokoro: KokoroConfig;
  output_device_id: string;
  rvc: RvcConfig;
  stt: SttConfig;
}

export interface ScannedVoice {
  id: string;
  name: string;
  locale: string;
  gender: string;
}
