import { api } from '../../services/api';
import type {
  ToolCallRequest,
  ToolExecutionResult,
  CompanionSettings,
  CompanionState,
  Goal,
  EnvironmentSnapshot,
  McpServerConfig,
  CompanionPlugin,
  JsonObject,
} from '../../types';
import type { SliceCreator } from '../storeTypes';
import { reportFailure } from '../reportFailure';

/** Desktop companion: hormones, tools, goals, MCP servers, plugins and overlay. */
export interface CompanionSlice {
  companionState: CompanionState | null;
  fetchCompanionState: () => Promise<void>;
  applyHormoneInteraction: (interactionType: string) => Promise<void>;
  setHormones: (dopamine: number, cortisol: number, oxytocin: number, fatigue: number) => Promise<void>;
  requestToolCall: (toolName: string, args: JsonObject) => Promise<ToolCallRequest | null>;
  resolveToolCall: (callId: string, approved: boolean) => Promise<ToolExecutionResult | null>;
  updateCompanionSettings: (settings: CompanionSettings) => Promise<void>;
  addCompanionThought: (thought: string) => Promise<void>;
  clearCompanionThoughts: () => Promise<void>;
  addCompanionGoal: (summary: string, dueMinutes: number) => Promise<Goal | null>;
  markCompanionGoalCompleted: (goalId: string) => Promise<void>;
  deleteCompanionGoal: (goalId: string) => Promise<void>;
  environmentSnapshot: EnvironmentSnapshot | null;
  fetchEnvironmentSnapshot: () => Promise<void>;
  mcpServers: McpServerConfig[];
  fetchMcpServers: () => Promise<void>;
  toggleMcpServer: (serverId: string, enabled: boolean) => Promise<void>;
  saveMcpServers: (servers: McpServerConfig[]) => Promise<void>;
  companionPlugins: CompanionPlugin[];
  fetchCompanionPlugins: () => Promise<void>;
  saveCompanionPlugin: (plugin: CompanionPlugin) => Promise<void>;
  executeCompanionPlugin: (pluginId: string, args: JsonObject) => Promise<string | null>;
  toggleCompanionOverlay: (enable: boolean, clickThrough?: boolean) => Promise<boolean>;
  detectDesktopWindow: () => Promise<string>;
}

export const createCompanionSlice: SliceCreator<CompanionSlice> = (set, get) => ({
  companionState: null,

  fetchCompanionState: async () => {
    try {
      const state = await api.getCompanionState();
      set({ companionState: state });
    } catch (e) {
      console.error('Failed to fetch companion state:', e);
    }
  },

  applyHormoneInteraction: async (interactionType) => {
    try {
      const updatedHormones = await api.applyHormoneInteraction(interactionType);
      set((state) => ({
        companionState: state.companionState
          ? { ...state.companionState, hormones: updatedHormones }
          : null,
      }));
    } catch (e) {
      reportFailure('Failed to apply hormone interaction:', e);
    }
  },

  setHormones: async (dopamine, cortisol, oxytocin, fatigue) => {
    try {
      const updatedHormones = await api.setHormones(dopamine, cortisol, oxytocin, fatigue);
      set((state) => ({
        companionState: state.companionState
          ? { ...state.companionState, hormones: updatedHormones }
          : null,
      }));
    } catch (e) {
      reportFailure('Failed to set hormones directly:', e);
    }
  },

  requestToolCall: async (toolName, args) => {
    try {
      const req = await api.requestToolCall(toolName, args);
      await get().fetchCompanionState();
      return req;
    } catch (e) {
      reportFailure('Failed to request tool call:', e);
      return null;
    }
  },

  resolveToolCall: async (callId, approved) => {
    try {
      const res = await api.resolveToolCall(callId, approved);
      await get().fetchCompanionState();
      return res;
    } catch (e) {
      reportFailure('Failed to resolve tool call:', e);
      return null;
    }
  },

  updateCompanionSettings: async (settings) => {
    try {
      await api.updateCompanionSettings(settings);
      await get().fetchCompanionState();
    } catch (e) {
      reportFailure('Failed to update companion settings:', e);
    }
  },

  addCompanionThought: async (thought) => {
    try {
      await api.addCompanionThought(thought);
      await get().fetchCompanionState();
    } catch (e) {
      reportFailure('Failed to add companion thought:', e);
    }
  },

  clearCompanionThoughts: async () => {
    try {
      await api.clearCompanionThoughts();
      await get().fetchCompanionState();
    } catch (e) {
      reportFailure('Failed to clear companion thoughts:', e);
    }
  },

  addCompanionGoal: async (summary, dueMinutes) => {
    try {
      const goal = await api.addCompanionGoal(summary, dueMinutes);
      await get().fetchCompanionState();
      return goal;
    } catch (e) {
      reportFailure('Failed to add companion goal:', e);
      return null;
    }
  },

  markCompanionGoalCompleted: async (goalId) => {
    try {
      await api.markCompanionGoalCompleted(goalId);
      await get().fetchCompanionState();
    } catch (e) {
      reportFailure('Failed to mark goal completed:', e);
    }
  },

  deleteCompanionGoal: async (goalId) => {
    try {
      await api.deleteCompanionGoal(goalId);
      await get().fetchCompanionState();
    } catch (e) {
      reportFailure('Failed to delete companion goal:', e);
    }
  },

  environmentSnapshot: null,

  fetchEnvironmentSnapshot: async () => {
    try {
      const snap = await api.getCompanionEnvironmentSnapshot();
      set({ environmentSnapshot: snap });
    } catch (e) {
      console.error('Failed to fetch environment snapshot:', e);
    }
  },

  mcpServers: [],

  fetchMcpServers: async () => {
    try {
      const servers = await api.listMcpServers();
      set({ mcpServers: servers });
    } catch (e) {
      console.error('Failed to fetch MCP servers:', e);
    }
  },

  toggleMcpServer: async (serverId, enabled) => {
    try {
      const updated = await api.toggleMcpServer(serverId, enabled);
      set({ mcpServers: updated });
    } catch (e) {
      reportFailure('Failed to toggle MCP server:', e);
    }
  },

  saveMcpServers: async (servers) => {
    try {
      await api.saveMcpServers(servers);
      set({ mcpServers: servers });
    } catch (e) {
      reportFailure('Failed to save MCP servers:', e);
    }
  },

  companionPlugins: [],

  fetchCompanionPlugins: async () => {
    try {
      const plugins = await api.listCompanionPlugins();
      set({ companionPlugins: plugins });
    } catch (e) {
      console.error('Failed to fetch companion plugins:', e);
    }
  },

  saveCompanionPlugin: async (plugin) => {
    try {
      await api.saveCompanionPlugin(plugin);
      await get().fetchCompanionPlugins();
    } catch (e) {
      reportFailure('Failed to save companion plugin:', e);
    }
  },

  executeCompanionPlugin: async (pluginId, args) => {
    try {
      return await api.executeCompanionPlugin(pluginId, args);
    } catch (e) {
      reportFailure('Failed to execute companion plugin:', e);
      return null;
    }
  },

  toggleCompanionOverlay: async (enable, clickThrough = false) => {
    try {
      const res = await api.toggleCompanionOverlay(enable, clickThrough);
      await get().fetchCompanionState();
      return res;
    } catch (e) {
      reportFailure('Failed to toggle companion overlay:', e);
      return false;
    }
  },

  detectDesktopWindow: async () => {
    try {
      const title = await api.detectDesktopWindow();
      await get().fetchCompanionState();
      return title;
    } catch (e) {
      reportFailure('Failed to detect desktop window:', e);
      return '';
    }
  },
});
