import { invoke } from '@tauri-apps/api/core';
import type {
  CompanionPlugin,
  CompanionSettings,
  CompanionState,
  EnvironmentSnapshot,
  Goal,
  JsonObject,
  McpServerConfig,
  McpToolInfo,
  Neurohormones,
  ToolCallRequest,
  ToolExecutionResult,
} from '../../types';

export const companionApi = {
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
};
