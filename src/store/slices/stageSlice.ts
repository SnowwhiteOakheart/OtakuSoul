import { api } from '../../services/api';
import { soundFx } from '../../services/soundFx';
import type {
  StageState,
  ScenePreview,
  SceneDefinition,
  SceneState,
  StageTurnRequest,
  WorldState,
  CampaignClock,
  CombatCondition,
  DiceRollResult,
} from '../../types';
import type { SliceCreator } from '../storeTypes';

/** Soul Stage: scenes, turns, dice, world state, clocks and encounters. */
export interface StageSlice {
  stageState: StageState | null;
  stageScenes: ScenePreview[];
  stageFolders: string[];
  selectedStageFolder: string;
  lastDiceRoll: DiceRollResult | null;
  isRollingDice: boolean;
  isProcessingStageTurn: boolean;
  stageTurnMode: 'say' | 'do' | 'think' | 'whisper' | 'direct';
  stageWhisperTarget: string;
  stageForceActor: string;
  fetchStageState: () => Promise<void>;
  fetchStageScenes: () => Promise<void>;
  fetchStageFolders: () => Promise<void>;
  setSelectedStageFolder: (folder: string) => void;
  createStageFolder: (folderName: string) => Promise<void>;
  moveStageSceneToFolder: (sceneId: string, targetFolder: string) => Promise<void>;
  deleteStageFolder: (folderName: string) => Promise<void>;
  importStageSceneJson: (jsonContent: string, targetFolder?: string) => Promise<SceneState | null>;
  exportStageSceneJson: (sceneId: string) => Promise<string | null>;
  resetStageScene: (sceneId: string) => Promise<SceneState | null>;
  editStageTurnMessage: (messageId: string, newContent: string) => Promise<void>;
  deleteStageTurnMessage: (messageId: string) => Promise<void>;
  regenerateStageTurn: () => Promise<void>;
  loadStageScene: (sceneId: string) => Promise<void>;
  saveStageScene: (state: SceneState) => Promise<void>;
  createStageScene: (definition: SceneDefinition) => Promise<SceneState>;
  deleteStageScene: (sceneId: string) => Promise<void>;
  exportStageMarkdown: (sceneId: string) => Promise<string | null>;
  runStageTurn: (userInput: string, turnMode?: string, whisperTarget?: string, forceActor?: string) => Promise<void>;
  undoStageTurn: () => Promise<void>;
  restStageParty: (restType: 'short' | 'long') => Promise<void>;
  consumeStageInventoryItem: (itemId: string) => Promise<void>;
  delayEncounterTurn: () => Promise<void>;
  setStageTurnMode: (mode: 'say' | 'do' | 'think' | 'whisper' | 'direct') => void;
  setStageWhisperTarget: (target: string) => void;
  setStageForceActor: (actor: string) => void;
  rollDice: (formula: string, targetDc?: number) => Promise<DiceRollResult | null>;
  updateWorldState: (world: WorldState) => Promise<void>;
  setClockProgress: (clockId: string, progress: number) => Promise<void>;
  addClock: (clock: CampaignClock) => Promise<void>;
  deleteClock: (clockId: string) => Promise<void>;
  startEncounter: () => Promise<void>;
  endEncounter: () => Promise<void>;
  nextEncounterTurn: () => Promise<void>;
  applyCombatantDelta: (combatantId: string, hpDelta: number, stressDelta: number) => Promise<void>;
  addCombatantCondition: (combatantId: string, condition: CombatCondition) => Promise<void>;
}

export const createStageSlice: SliceCreator<StageSlice> = (set, get) => ({
  stageState: null,

  stageScenes: [],

  stageFolders: ['Alle', 'No Game No Life', 'Sakura Succubus 3', 'Eigene Szenen'],

  selectedStageFolder: 'Alle',

  lastDiceRoll: null,

  isRollingDice: false,

  isProcessingStageTurn: false,

  stageTurnMode: 'say',

  stageWhisperTarget: '',

  stageForceActor: '',

  setSelectedStageFolder: (folder: string) => set({ selectedStageFolder: folder }),

  fetchStageFolders: async () => {
    try {
      const folders = await api.listStageFolders();
      set({ stageFolders: folders });
    } catch (e) {
      console.error('Failed to fetch stage folders:', e);
    }
  },

  createStageFolder: async (folderName: string) => {
    try {
      await api.createStageFolder(folderName);
      await get().fetchStageFolders();
    } catch (e) {
      console.error('Failed to create stage folder:', e);
      throw e;
    }
  },

  moveStageSceneToFolder: async (sceneId: string, targetFolder: string) => {
    try {
      const updated = await api.moveStageSceneToFolder(sceneId, targetFolder);
      set({ stageState: updated });
      await get().fetchStageScenes();
      await get().fetchStageFolders();
    } catch (e) {
      console.error('Failed to move scene to folder:', e);
      throw e;
    }
  },

  deleteStageFolder: async (folderName: string) => {
    try {
      await api.deleteStageFolder(folderName);
      await get().fetchStageFolders();
      await get().fetchStageScenes();
    } catch (e) {
      console.error('Failed to delete stage folder:', e);
      throw e;
    }
  },

  importStageSceneJson: async (jsonContent: string, targetFolder?: string) => {
    try {
      const imported = await api.importStageSceneJson(jsonContent, targetFolder);
      set({ stageState: imported });
      await get().fetchStageScenes();
      await get().fetchStageFolders();
      return imported;
    } catch (e) {
      console.error('Failed to import stage scene JSON:', e);
      throw e;
    }
  },

  exportStageSceneJson: async (sceneId: string) => {
    try {
      return await api.exportStageSceneJson(sceneId);
    } catch (e) {
      console.error('Failed to export stage scene JSON:', e);
      return null;
    }
  },

  resetStageScene: async (sceneId: string) => {
    try {
      const fresh = await api.resetStageScene(sceneId);
      set({ stageState: fresh });
      await get().fetchStageScenes();
      return fresh;
    } catch (e) {
      console.error('Failed to reset stage scene:', e);
      return null;
    }
  },

  editStageTurnMessage: async (messageId: string, newContent: string) => {
    const current = get().stageState;
    if (!current) return;
    try {
      const updated = await api.editStageTurnMessage(current.definition.id, messageId, newContent);
      set({ stageState: updated });
    } catch (e) {
      console.error('Failed to edit stage turn message:', e);
      throw e;
    }
  },

  deleteStageTurnMessage: async (messageId: string) => {
    const current = get().stageState;
    if (!current) return;
    try {
      const updated = await api.deleteStageTurnMessage(current.definition.id, messageId);
      set({ stageState: updated });
    } catch (e) {
      console.error('Failed to delete stage turn message:', e);
      throw e;
    }
  },

  regenerateStageTurn: async () => {
    const current = get().stageState;
    if (!current) return;
    set({ isProcessingStageTurn: true });
    try {
      const updated = await api.regenerateStageTurn(current.definition.id);
      set({ stageState: updated, isProcessingStageTurn: false });
    } catch (e) {
      console.error('Failed to regenerate stage turn:', e);
      set({ isProcessingStageTurn: false });
      throw e;
    }
  },

  fetchStageState: async () => {
    try {
      const state = await api.getStageState();
      set({ stageState: state });
    } catch (e) {
      console.error('Failed to fetch stage state:', e);
    }
  },

  fetchStageScenes: async () => {
    try {
      const scenes = await api.listStageScenes();
      set({ stageScenes: scenes });
    } catch (e) {
      console.error('Failed to fetch stage scenes:', e);
    }
  },

  loadStageScene: async (sceneId: string) => {
    try {
      const sceneState = await api.loadStageScene(sceneId);
      set({ stageState: sceneState });
      await get().fetchStageScenes();
    } catch (e) {
      console.error('Failed to load stage scene:', e);
      throw e;
    }
  },

  saveStageScene: async (sceneState: SceneState) => {
    try {
      await api.saveStageScene(sceneState);
      set({ stageState: sceneState });
    } catch (e) {
      console.error('Failed to save stage scene:', e);
    }
  },

  // Errors propagate so the create dialog can show them.
  createStageScene: async (definition: SceneDefinition) => {
    const sceneState = await api.createStageScene(definition);
    set({ stageState: sceneState });
    await get().fetchStageScenes();
    return sceneState;
  },

  deleteStageScene: async (sceneId: string) => {
    try {
      await api.deleteStageScene(sceneId);
      await get().fetchStageScenes();
    } catch (e) {
      console.error('Failed to delete stage scene:', e);
    }
  },

  exportStageMarkdown: async (sceneId: string) => {
    try {
      return await api.exportStageMarkdown(sceneId);
    } catch (e) {
      console.error('Failed to export stage markdown:', e);
      return null;
    }
  },

  runStageTurn: async (userInput: string, turnMode?: string, whisperTarget?: string, forceActor?: string) => {
    const current = get().stageState;
    if (!current) return;
    set({ isProcessingStageTurn: true });
    try {
      const mode = turnMode || get().stageTurnMode;
      const target = whisperTarget !== undefined ? whisperTarget : (get().stageWhisperTarget || undefined);
      const actor = forceActor !== undefined ? forceActor : (get().stageForceActor || undefined);
      const req: StageTurnRequest = {
        scene_id: current.definition.id,
        user_input: userInput,
        turn_mode: mode,
        whisper_target: target || undefined,
        force_next_actor: actor || undefined,
      };
      const updated = await api.runStageTurn(req);
      set({ stageState: updated, isProcessingStageTurn: false });
    } catch (e) {
      console.error('Failed to run stage turn:', e);
      set({ isProcessingStageTurn: false });
      throw e;
    }
  },

  undoStageTurn: async () => {
    const current = get().stageState;
    if (!current) return;
    try {
      const rolledBack = await api.undoStageTurn(current.definition.id);
      set({ stageState: rolledBack });
    } catch (e) {
      console.error('Failed to undo stage turn:', e);
    }
  },

  restStageParty: async (restType: 'short' | 'long') => {
    const current = get().stageState;
    if (!current) return;
    set({ isProcessingStageTurn: true });
    try {
      const rested = await api.restStageParty(current.definition.id, restType);
      set({ stageState: rested, isProcessingStageTurn: false });
      soundFx.playDiceRoll();
    } catch (e) {
      console.error('Failed to rest party:', e);
      set({ isProcessingStageTurn: false });
    }
  },

  consumeStageInventoryItem: async (itemId: string) => {
    const current = get().stageState;
    if (!current) return;
    try {
      const updated = await api.useStageInventoryItem(current.definition.id, itemId);
      set({ stageState: updated });
      soundFx.playHealChime();
    } catch (e) {
      console.error('Failed to use inventory item:', e);
    }
  },

  delayEncounterTurn: async () => {
    try {
      const updated = await api.delayEncounterTurn();
      set({ stageState: updated });
    } catch (e) {
      console.error('Failed to delay encounter turn:', e);
    }
  },

  setStageTurnMode: (mode) => set({ stageTurnMode: mode }),

  setStageWhisperTarget: (target) => set({ stageWhisperTarget: target }),

  setStageForceActor: (actor) => set({ stageForceActor: actor }),

  rollDice: async (formula, targetDc) => {
    set({ isRollingDice: true });
    soundFx.playDiceRoll();
    try {
      const res = await api.rollStageDice(formula, targetDc);
      set({ lastDiceRoll: res, isRollingDice: false });
      if (res.is_critical_success) {
        soundFx.playCriticalSuccess();
      } else if (res.is_critical_failure) {
        soundFx.playCriticalFailure();
      }
      return res;
    } catch (e) {
      console.error('Failed to roll dice:', e);
      set({ isRollingDice: false });
      return null;
    }
  },

  updateWorldState: async (world) => {
    try {
      await api.updateWorldState(world);
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to update world state:', e);
    }
  },

  setClockProgress: async (clockId, progress) => {
    try {
      await api.setClockProgress(clockId, progress);
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to set clock progress:', e);
    }
  },

  addClock: async (clock) => {
    try {
      await api.addClock(clock);
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to add clock:', e);
    }
  },

  deleteClock: async (clockId) => {
    try {
      await api.deleteClock(clockId);
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to delete clock:', e);
    }
  },

  startEncounter: async () => {
    try {
      await api.startEncounter();
      soundFx.playAttackHit();
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to start encounter:', e);
    }
  },

  endEncounter: async () => {
    try {
      await api.endEncounter();
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to end encounter:', e);
    }
  },

  nextEncounterTurn: async () => {
    try {
      await api.nextEncounterTurn();
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to advance encounter turn:', e);
    }
  },

  applyCombatantDelta: async (combatantId, hpDelta, stressDelta) => {
    try {
      await api.applyCombatantDelta(combatantId, hpDelta, stressDelta);
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to apply combatant delta:', e);
    }
  },

  addCombatantCondition: async (combatantId, condition) => {
    try {
      await api.addCombatantCondition(combatantId, condition);
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to add combatant condition:', e);
    }
  },
});
