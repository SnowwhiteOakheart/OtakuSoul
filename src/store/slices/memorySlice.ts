import { api } from '../../services/api';
import { errorMessage } from '../../utils/errors';
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
  memoryOverviewError: string | null;
  isReflecting: boolean;
  lastReflectionResult: SoulMemoryPipelineResult | null;
  characterMarkdown: string;
  userMarkdown: string;
  memoryBackups: MemoryBackupInfo[];
  isLoadingBackups: boolean;
  memoryBackupsError: string | null;
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

export const createMemorySlice: SliceCreator<MemorySlice> = (set, get) => {
  let overviewRequest = 0;
  let backupsRequest = 0;
  return {
    cognitiveOverview: null,

    isMemoryLoading: false,

    memoryOverviewError: null,

    isReflecting: false,

    lastReflectionResult: null,

    characterMarkdown: '',

    userMarkdown: '',

    memoryBackups: [],

    isLoadingBackups: false,

    memoryBackupsError: null,

    autoReflectionEnabled: true,

    autoReflectionThreshold: 5,

    setAutoReflectionEnabled: (enabled) => set({ autoReflectionEnabled: enabled }),

    setAutoReflectionThreshold: (count) => set({ autoReflectionThreshold: count }),

    fetchCognitiveOverview: async (charId, userName) => {
      const activeChar = get().activeCharacter;
      const cid = charId || activeChar?.id;
      const uid = userName || get().activePersona.name;

      if (!cid || get().activeCharacter?.id !== cid || get().activePersona.name !== uid) return;
      const request = ++overviewRequest;
      const isCurrent = () => request === overviewRequest && get().activeCharacter?.id === cid && get().activePersona.name === uid;
      set({ isMemoryLoading: true });
      try {
        const overview = await api.getCognitiveOverview(cid, uid);
        if (isCurrent()) set({ cognitiveOverview: overview, memoryOverviewError: null });
      } catch (e) {
        console.error('Failed to fetch cognitive overview:', e);
        if (isCurrent()) set({ memoryOverviewError: errorMessage(e) });
      } finally {
        if (isCurrent()) set({ isMemoryLoading: false });
      }
    },

    updatePsychology: async (psych) => {
      const cid = get().activeCharacter?.id;
      const uid = get().activePersona.name;
      if (!cid) throw new Error(translate('int.noCharacter'));
      try {
        await api.updatePsychology(cid, psych);
        if (get().activeCharacter?.id === cid && get().activePersona.name === uid) {
          set((state) => ({ cognitiveOverview: state.cognitiveOverview ? { ...state.cognitiveOverview, psychology: psych } : null }));
          await get().fetchCognitiveOverview(cid, uid);
        }
      } catch (e) {
        console.error('Failed to update psychology:', e);
        throw e;
      }
    },

    updateRelationship: async (rel) => {
      const cid = get().activeCharacter?.id;
      const uid = get().activePersona.name;
      if (!cid) throw new Error(translate('int.noCharacter'));
      try {
        await api.updateRelationship(cid, rel);
        if (get().activeCharacter?.id === cid && get().activePersona.name === uid) {
          set((state) => ({ cognitiveOverview: state.cognitiveOverview ? { ...state.cognitiveOverview, relationship: rel } : null }));
          await get().fetchCognitiveOverview(cid, uid);
        }
      } catch (e) {
        console.error('Failed to update relationship:', e);
        throw e;
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
      if (!cid) throw new Error(translate('int.noCharacter'));
      try {
        const log = await api.applyEmotionalDecay(cid);
        if (log) {
          console.info('Emotional decay tick applied:', log);
        }
        await get().fetchCognitiveOverview();
      } catch (e) {
        console.error('Failed to apply emotional decay:', e);
        throw e;
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
        await get().fetchMemoryMarkdown().catch(() => {});
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
      if (!cid) throw new Error(translate('int.noCharacter'));

      try {
        const [charMd, userMd] = await Promise.all([
          api.getCharacterMemoryMarkdown(cid), api.getUserMemoryMarkdown(cid, userName),
        ]);
        if (get().activeCharacter?.id === cid && get().activePersona.name === userName) {
          set({ characterMarkdown: charMd, userMarkdown: userMd });
        }
        return { charMd, userMd };
      } catch (e) {
        console.error('Failed to fetch memory markdown:', e);
        throw e;
      }
    },

    saveCharacterMarkdown: async (markdown: string) => {
      const cid = get().activeCharacter?.id;
      if (!cid) throw new Error(translate('int.noCharacter'));
      try {
        await api.saveCharacterMemoryMarkdown(cid, markdown);
        if (get().activeCharacter?.id === cid) {
          set({ characterMarkdown: markdown });
          await get().fetchCognitiveOverview();
        }
      } catch (e) {
        console.error('Failed to save character markdown:', e);
        throw e;
      }
    },

    saveUserMarkdown: async (markdown: string) => {
      const cid = get().activeCharacter?.id;
      const userName = get().activePersona.name;
      if (!cid) throw new Error(translate('int.noCharacter'));
      try {
        await api.saveUserMemoryMarkdown(cid, userName, markdown);
        if (get().activeCharacter?.id === cid && get().activePersona.name === userName) {
          set({ userMarkdown: markdown });
          await get().fetchCognitiveOverview();
        }
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
      const request = ++backupsRequest;
      const isCurrent = () => request === backupsRequest && get().activeCharacter?.id === cid;
      set({ isLoadingBackups: true });
      try {
        const backups = await api.listMemoryBackups(cid);
        if (isCurrent()) set({ memoryBackups: backups, memoryBackupsError: null });
      } catch (e) {
        console.error('Failed to fetch memory backups:', e);
        if (isCurrent()) set({ memoryBackupsError: errorMessage(e) });
      } finally {
        if (isCurrent()) set({ isLoadingBackups: false });
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
        await get().fetchMemoryMarkdown().catch(() => {});
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
        await get().fetchMemoryMarkdown().catch(() => {});
        await get().fetchMemoryBackups();
        return count;
      } catch (e) {
        console.error('Failed to import SoW folder:', e);
        throw e;
      }
    },
  };
};
