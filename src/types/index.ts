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
}

