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
