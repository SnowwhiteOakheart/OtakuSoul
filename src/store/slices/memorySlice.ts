import { api } from '../../services/api';
import { translate } from '../../i18n';
import type {
  CognitiveOverview,
  PsychologyState,
  RelationshipState,
  DiaryEntry,
  MemoryBackupInfo,
  SoulMemoryPipelineResult,
} from '../../types';
import type { SliceCreator } from '../storeTypes';

/** Cognitive soul memory: psychology, relationship, diary, reflection and memory backups. */
export interface MemorySlice {
  cognitiveOverview: CognitiveOverview | null;
  isMemoryLoading: boolean;
  isReflecting: boolean;
  lastReflectionResult: SoulMemoryPipelineResult | null;
  characterMarkdown: string;
  userMarkdown: string;
  memoryBackups: MemoryBackupInfo[];
  isLoadingBackups: boolean;
  autoReflectionEnabled: boolean;
  autoReflectionThreshold: number;
  setAutoReflectionEnabled: (enabled: boolean) => void;
  setAutoReflectionThreshold: (count: number) => void;
  fetchCognitiveOverview: (charId?: string, userName?: string) => Promise<void>;
  updatePsychology: (psych: PsychologyState) => Promise<void>;
  updateRelationship: (rel: RelationshipState) => Promise<void>;
  addManualMemory: (category: string, content: string, significance: number) => Promise<void>;
  addManualDiary: (title: string, entryText: string, mood: string) => Promise<void>;
  triggerEmotionalDecay: () => Promise<void>;
  triggerMemoryPipeline: (recentTurns?: number) => Promise<SoulMemoryPipelineResult | null>;
  fetchMemoryMarkdown: () => Promise<{ charMd: string; userMd: string }>;
  saveCharacterMarkdown: (markdown: string) => Promise<void>;
  saveUserMarkdown: (markdown: string) => Promise<void>;
  generateManualDiary: () => Promise<DiaryEntry | null>;
  fetchMemoryBackups: () => Promise<void>;
  createMemoryBackup: () => Promise<MemoryBackupInfo | null>;
  restoreMemoryBackup: (backupFilePath: string) => Promise<void>;
  importSowFolder: (folderPath: string) => Promise<number>;
}

export const createMemorySlice: SliceCreator<MemorySlice> = (set, get) => ({
  cognitiveOverview: null,

  isMemoryLoading: false,

  isReflecting: false,

  lastReflectionResult: null,

  characterMarkdown: '',

  userMarkdown: '',

  memoryBackups: [],

  isLoadingBackups: false,

  autoReflectionEnabled: true,

  autoReflectionThreshold: 5,

  setAutoReflectionEnabled: (enabled) => set({ autoReflectionEnabled: enabled }),

  setAutoReflectionThreshold: (count) => set({ autoReflectionThreshold: count }),

  fetchCognitiveOverview: async (charId, userName) => {
    const activeChar = get().activeCharacter;
    const cid = charId || activeChar?.id;
    const uid = userName || get().activePersona.name;

    if (!cid) return;

    set({ isMemoryLoading: true });
    try {
      const overview = await api.getCognitiveOverview(cid, uid);
      set({ cognitiveOverview: overview, isMemoryLoading: false });
    } catch (e) {
      console.error('Failed to fetch cognitive overview:', e);
      set({ isMemoryLoading: false });
    }
  },

  updatePsychology: async (psych) => {
    const cid = get().activeCharacter?.id;
    if (!cid) return;
    try {
      await api.updatePsychology(cid, psych);
      await get().fetchCognitiveOverview();
    } catch (e) {
      console.error('Failed to update psychology:', e);
    }
  },

  updateRelationship: async (rel) => {
    const cid = get().activeCharacter?.id;
    if (!cid) return;
    try {
      await api.updateRelationship(cid, rel);
      await get().fetchCognitiveOverview();
    } catch (e) {
      console.error('Failed to update relationship:', e);
    }
  },

  addManualMemory: async (category, content, significance) => {
    const cid = get().activeCharacter?.id;
    if (!cid) throw new Error(translate('int.noCharacter'));
    try {
      await api.addEpisodicMemory(cid, category, content, significance);
      await get().fetchCognitiveOverview();
    } catch (e) {
      console.error('Failed to add episodic memory:', e);
      throw e;
    }
  },

  addManualDiary: async (title, entryText, mood) => {
    const cid = get().activeCharacter?.id;
    if (!cid) throw new Error(translate('int.noCharacter'));
    try {
      await api.addDiaryEntry(cid, title, entryText, mood);
      await get().fetchCognitiveOverview();
    } catch (e) {
      console.error('Failed to add diary entry:', e);
      throw e;
    }
  },

  triggerEmotionalDecay: async () => {
    const cid = get().activeCharacter?.id;
    if (!cid) return;
    try {
      const log = await api.applyEmotionalDecay(cid);
      if (log) {
        console.info('Emotional decay tick applied:', log);
      }
      await get().fetchCognitiveOverview();
    } catch (e) {
      console.error('Failed to apply emotional decay:', e);
    }
  },

  triggerMemoryPipeline: async (recentTurns) => {
    const {
      activeCharacter,
      activePersona,
      activeChatId,
      selectedBackend,
      serverConfig,
      cloudEndpoint,
      cloudApiKey,
      cloudModel,
      cloudProvider,
    } = get();

    if (!activeCharacter) return null;
    const cid = activeCharacter.id;
    const userName = activePersona.name;

    const endpoint =
      selectedBackend === 'local'
        ? `http://127.0.0.1:${serverConfig.port}/v1/chat/completions`
        : cloudEndpoint;

    set({ isReflecting: true });
    try {
      const res = await api.triggerMemoryPipeline({
        character_id: cid,
        user_name: userName,
        chat_id: activeChatId || undefined,
        endpoint_url: endpoint,
        api_key: selectedBackend === 'cloud' ? cloudApiKey : undefined,
        model: selectedBackend === 'cloud' ? cloudModel : undefined,
        provider: selectedBackend === 'cloud' ? cloudProvider : 'local_llama',
        recent_turn_count: recentTurns || 8,
        include_diary: true,
      });

      set({
        isReflecting: false,
        lastReflectionResult: res,
      });

      await get().fetchCognitiveOverview();
      await get().fetchMemoryMarkdown();
      await get().fetchMemoryBackups();
      return res;
    } catch (e) {
      console.error('Memory pipeline error:', e);
      set({ isReflecting: false });
      return null;
    }
  },

  fetchMemoryMarkdown: async () => {
    const cid = get().activeCharacter?.id;
    const userName = get().activePersona.name;
    if (!cid) return { charMd: '', userMd: '' };

    try {
      const charMd = await api.getCharacterMemoryMarkdown(cid);
      const userMd = await api.getUserMemoryMarkdown(cid, userName);
      set({ characterMarkdown: charMd, userMarkdown: userMd });
      return { charMd, userMd };
    } catch (e) {
      console.error('Failed to fetch memory markdown:', e);
      return { charMd: '', userMd: '' };
    }
  },

  saveCharacterMarkdown: async (markdown: string) => {
    const cid = get().activeCharacter?.id;
    if (!cid) return;
    try {
      await api.saveCharacterMemoryMarkdown(cid, markdown);
      set({ characterMarkdown: markdown });
      await get().fetchCognitiveOverview();
    } catch (e) {
      console.error('Failed to save character markdown:', e);
      throw e;
    }
  },

  saveUserMarkdown: async (markdown: string) => {
    const cid = get().activeCharacter?.id;
    const userName = get().activePersona.name;
    if (!cid) return;
    try {
      await api.saveUserMemoryMarkdown(cid, userName, markdown);
      set({ userMarkdown: markdown });
      await get().fetchCognitiveOverview();
    } catch (e) {
      console.error('Failed to save user markdown:', e);
      throw e;
    }
  },

  generateManualDiary: async () => {
    const {
      activeCharacter,
      activePersona,
      activeChatId,
      selectedBackend,
      serverConfig,
      cloudEndpoint,
      cloudApiKey,
      cloudModel,
      cloudProvider,
    } = get();

    if (!activeCharacter) throw new Error(translate('int.noCharacter'));
    const endpoint =
      selectedBackend === 'local'
        ? `http://127.0.0.1:${serverConfig.port}/v1/chat/completions`
        : cloudEndpoint;

    try {
      const entry = await api.generateManualDiaryEntry({
        character_id: activeCharacter.id,
        user_name: activePersona.name,
        chat_id: activeChatId || undefined,
        endpoint_url: endpoint,
        api_key: selectedBackend === 'cloud' ? cloudApiKey : undefined,
        model: selectedBackend === 'cloud' ? cloudModel : undefined,
        provider: selectedBackend === 'cloud' ? cloudProvider : 'local_llama',
      });
      await get().fetchCognitiveOverview();
      return entry;
    } catch (e) {
      console.error('Failed to generate diary entry:', e);
      throw e;
    }
  },

  fetchMemoryBackups: async () => {
    const cid = get().activeCharacter?.id;
    if (!cid) return;
    set({ isLoadingBackups: true });
    try {
      const backups = await api.listMemoryBackups(cid);
      set({ memoryBackups: backups, isLoadingBackups: false });
    } catch (e) {
      console.error('Failed to fetch memory backups:', e);
      set({ isLoadingBackups: false });
    }
  },

  createMemoryBackup: async () => {
    const cid = get().activeCharacter?.id;
    const userName = get().activePersona.name;
    if (!cid) throw new Error(translate('int.noCharacter'));
    try {
      const info = await api.backupMemoryState(cid, userName);
      await get().fetchMemoryBackups();
      return info;
    } catch (e) {
      console.error('Failed to create memory backup:', e);
      throw e;
    }
  },

  restoreMemoryBackup: async (backupFilePath: string) => {
    try {
      await api.restoreMemoryBackup(backupFilePath);
      await get().fetchCognitiveOverview();
      await get().fetchMemoryMarkdown();
      await get().fetchMemoryBackups();
    } catch (e) {
      console.error('Failed to restore memory backup:', e);
      throw e;
    }
  },

  importSowFolder: async (folderPath: string) => {
    const cid = get().activeCharacter?.id;
    const userName = get().activePersona.name;
    if (!cid) return 0;
    try {
      const count = await api.importSowMemoryFiles(cid, folderPath, userName);
      await get().fetchCognitiveOverview();
      await get().fetchMemoryMarkdown();
      await get().fetchMemoryBackups();
      return count;
    } catch (e) {
      console.error('Failed to import SoW folder:', e);
      throw e;
    }
  },
});
