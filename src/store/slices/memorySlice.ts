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
import { toast } from '../../components/ui/feedback';
import { reportFailure } from '../reportFailure';

/** A forgotten memory can be restored this long (as long as the undo toast stays). */
const UNDO_FORGET_MS = 8000;
/** Memories forgotten but still restorable; overviews leave them out until then. */
const pendingForgets = new Set<number>();
const withoutPending = (overview: CognitiveOverview): CognitiveOverview =>
  pendingForgets.size === 0
    ? overview
    : { ...overview, recent_memories: overview.recent_memories.filter((m) => !pendingForgets.has(m.id)) };
import { trackTask } from './taskSlice';
import { chatSpeakers, memoryCharacter, presentedAs } from '../../utils/groupChat';

/** Cognitive soul memory: psychology, relationship, diary, reflection and memory backups. */
export interface MemorySlice {
  /** The memory of the character `memoryCharacter` names (the active one, or a guest the drawer shows). */
  cognitiveOverview: CognitiveOverview | null;
  /** A guest of the open group chat whose memory the drawer shows; null = the active character. */
  memoryCharacterId: string | null;
  /** Shows another character's memory in the drawer (null = the active character) and loads it. */
  setMemoryCharacter: (id: string | null) => void;
  isMemoryLoading: boolean;
  memoryOverviewError: string | null;
  isReflecting: boolean;
  memoryReflectionError: string | null;
  memoryOperation: 'backup' | 'restore' | null;
  lastReflectionResult: SoulMemoryPipelineResult | null;
  characterMarkdown: string;
  userMarkdown: string;
  memoryBackups: MemoryBackupInfo[];
  isLoadingBackups: boolean;
  memoryBackupsError: string | null;
  memoryMarkdownError: string | null;
  isMemoryMarkdownLoading: boolean;
  autoReflectionEnabled: boolean;
  autoReflectionThreshold: number;
  setAutoReflectionEnabled: (enabled: boolean) => void;
  setAutoReflectionThreshold: (count: number) => void;
  fetchCognitiveOverview: (charId?: string, userName?: string) => Promise<void>;
  updatePsychology: (psych: PsychologyState) => Promise<void>;
  updateRelationship: (rel: RelationshipState) => Promise<void>;
  /** Adds a memory; `source` = the chat message it was taken from. Throws on failure. */
  addManualMemory: (category: string, content: string, significance: number, source?: { chatId: string; messageIds: string[] }) => Promise<void>;
  /** Corrects a memory; it counts as confirmed afterwards. */
  editMemory: (id: number, category: string, content: string, significance: number) => Promise<void>;
  forgetMemory: (id: number) => Promise<void>;
  setMemoryPinned: (id: number, pinned: boolean) => Promise<void>;
  /** Keeps a memory whose source message changed. */
  confirmMemory: (id: number) => Promise<void>;
  /** The memory drawer of the chat HUD; in the store so a hint elsewhere can open it. */
  isMemoryDrawerOpen: boolean;
  setMemoryDrawerOpen: (open: boolean) => void;
  addManualDiary: (title: string, entryText: string, mood: string) => Promise<void>;
  triggerEmotionalDecay: () => Promise<void>;
  /** Reflects on the open chat; `characterId` = a guest of a group chat learning into their own memory. */
  triggerMemoryPipeline: (recentTurns?: number, characterId?: string) => Promise<SoulMemoryPipelineResult | null>;
  fetchMemoryMarkdown: () => Promise<{ charMd: string; userMd: string }>;
  saveCharacterMarkdown: (markdown: string) => Promise<void>;
  saveUserMarkdown: (markdown: string) => Promise<void>;
  generateManualDiary: () => Promise<DiaryEntry | null>;
  fetchMemoryBackups: () => Promise<void>;
  createMemoryBackup: () => Promise<MemoryBackupInfo | null>;
  restoreMemoryBackup: (backupFilePath: string) => Promise<void>;
}

export const createMemorySlice: SliceCreator<MemorySlice> = (set, get) => {
  let overviewRequest = 0;
  let backupsRequest = 0;
  let markdownRequest = 0;
  /** Whose memory the drawer shows: a guest of the open group chat, else the active character. */
  const memoryCid = () => memoryCharacter(get())?.id;
  const refreshContext = async (cid: string, userName: string) => {
    const isCurrent = () => memoryCid() === cid && get().activePersona.name === userName;
    if (!isCurrent()) return;
    await get().fetchCognitiveOverview(cid, userName);
    if (!isCurrent()) return;
    await get().fetchMemoryMarkdown().catch(() => {});
    if (!isCurrent()) return;
    await get().fetchMemoryBackups();
  };
  return {
    cognitiveOverview: null,

    memoryCharacterId: null,

    setMemoryCharacter: (id) => {
      const shown = memoryCid();
      set({ memoryCharacterId: id });
      if (memoryCid() === shown) return;
      // Another character's memory: clear what belongs to the previous one, then load.
      set({ cognitiveOverview: null, memoryOverviewError: null, characterMarkdown: '', userMarkdown: '', memoryMarkdownError: null,
        memoryBackups: [], memoryBackupsError: null, lastReflectionResult: null, memoryReflectionError: null });
      void get().fetchCognitiveOverview();
      void get().fetchMemoryMarkdown().catch(() => {});
      void get().fetchMemoryBackups();
    },

    isMemoryLoading: false,

    memoryOverviewError: null,

    isReflecting: false,
    memoryReflectionError: null,
    memoryOperation: null,

    lastReflectionResult: null,

    characterMarkdown: '',

    userMarkdown: '',

    memoryBackups: [],

    isLoadingBackups: false,

    memoryBackupsError: null,
    memoryMarkdownError: null,
    isMemoryMarkdownLoading: false,

    autoReflectionEnabled: true,

    autoReflectionThreshold: 5,

    setAutoReflectionEnabled: (enabled) => set({ autoReflectionEnabled: enabled }),

    setAutoReflectionThreshold: (count) => set({ autoReflectionThreshold: count }),

    fetchCognitiveOverview: async (charId, userName) => {
      const cid = charId || memoryCid();
      const uid = userName || get().activePersona.name;

      if (!cid || memoryCid() !== cid || get().activePersona.name !== uid) return;
      const request = ++overviewRequest;
      const isCurrent = () => request === overviewRequest && memoryCid() === cid && get().activePersona.name === uid;
      set({ isMemoryLoading: true });
      try {
        const overview = await api.getCognitiveOverview(cid, uid);
        if (isCurrent()) set({ cognitiveOverview: withoutPending(overview), memoryOverviewError: null });
      } catch (e) {
        console.error('Failed to fetch cognitive overview:', e);
        if (isCurrent()) set({ memoryOverviewError: errorMessage(e) });
      } finally {
        if (isCurrent()) set({ isMemoryLoading: false });
      }
    },

    updatePsychology: async (psych) => {
      const cid = memoryCid();
      const uid = get().activePersona.name;
      if (!cid) throw new Error(translate('int.noCharacter'));
      try {
        await api.updatePsychology(cid, psych);
        if (memoryCid() === cid && get().activePersona.name === uid) {
          set((state) => ({ cognitiveOverview: state.cognitiveOverview ? { ...state.cognitiveOverview, psychology: psych } : null }));
          await get().fetchCognitiveOverview(cid, uid);
        }
      } catch (e) {
        console.error('Failed to update psychology:', e);
        throw e;
      }
    },

    updateRelationship: async (rel) => {
      const cid = memoryCid();
      const uid = get().activePersona.name;
      if (!cid) throw new Error(translate('int.noCharacter'));
      try {
        await api.updateRelationship(cid, rel);
        if (memoryCid() === cid && get().activePersona.name === uid) {
          set((state) => ({ cognitiveOverview: state.cognitiveOverview ? { ...state.cognitiveOverview, relationship: rel } : null }));
          await get().fetchCognitiveOverview(cid, uid);
        }
      } catch (e) {
        console.error('Failed to update relationship:', e);
        throw e;
      }
    },

    addManualMemory: async (category, content, significance, source) => {
      const cid = memoryCid();
      if (!cid) throw new Error(translate('int.noCharacter'));
      try {
        await api.addEpisodicMemory(cid, category, content, significance, source);
        await get().fetchCognitiveOverview();
      } catch (e) {
        console.error('Failed to add episodic memory:', e);
        throw e;
      }
    },

    editMemory: async (id, category, content, significance) => {
      const cid = memoryCid();
      if (!cid) throw new Error(translate('int.noCharacter'));
      await api.updateEpisodicMemory(cid, id, category, content, significance);
      await get().fetchCognitiveOverview();
    },

    forgetMemory: async (id) => {
      // Hidden at once, forgotten after the undo window (the toast offers "Undo").
      const cid = memoryCid();
      if (!cid) throw new Error(translate('int.noCharacter'));
      if (pendingForgets.has(id)) return;
      pendingForgets.add(id);
      const overview = get().cognitiveOverview;
      if (overview) set({ cognitiveOverview: withoutPending(overview) });
      const commit = async () => {
        try {
          await api.forgetEpisodicMemory(cid, id);
        } catch (e) {
          reportFailure('Failed to forget memory:', e);
        } finally {
          pendingForgets.delete(id);
          if (memoryCid() === cid) await get().fetchCognitiveOverview();
        }
      };
      const timer = setTimeout(() => void commit(), UNDO_FORGET_MS);
      toast.info(translate('memory.memoryForgotten'), {
        label: translate('common.undo'),
        onClick: () => {
          clearTimeout(timer);
          pendingForgets.delete(id);
          if (memoryCid() === cid) void get().fetchCognitiveOverview();
        },
      });
    },

    setMemoryPinned: async (id, pinned) => {
      const cid = memoryCid();
      if (!cid) throw new Error(translate('int.noCharacter'));
      await api.setEpisodicMemoryPinned(cid, id, pinned);
      await get().fetchCognitiveOverview();
    },

    confirmMemory: async (id) => {
      const cid = memoryCid();
      if (!cid) throw new Error(translate('int.noCharacter'));
      await api.confirmEpisodicMemory(cid, id);
      await get().fetchCognitiveOverview();
    },

    isMemoryDrawerOpen: false,

    setMemoryDrawerOpen: (isMemoryDrawerOpen) => set({ isMemoryDrawerOpen }),

    addManualDiary: async (title, entryText, mood) => {
      const cid = memoryCid();
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
      const cid = memoryCid();
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

    triggerMemoryPipeline: async (recentTurns, characterId) => {
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
      if (get().isReflecting || get().memoryOperation) throw new Error(translate('memory.busy'));
      // In a group chat a guest learns from the same chat into their own memory.
      const cid = characterId ?? activeCharacter.id;
      const learner = cid === activeCharacter.id ? activeCharacter : get().availableCharacters.find((c) => c.id === cid);
      if (!learner) throw new Error(translate('int.noCharacter'));
      const userName = activePersona.name;
      const session = get().chatSessions.find((s) => s.id === activeChatId);
      const speakers = chatSpeakers(activeCharacter, session, get().availableCharacters);
      const speakerNames = speakers.length > 1
        ? Object.fromEntries(speakers.map((s) => [s.id, presentedAs(s.character, get().replyLanguage).name]))
        : undefined;

      const endpoint =
        selectedBackend === 'local'
          ? `http://127.0.0.1:${serverConfig.port}/v1/chat/completions`
          : cloudEndpoint;

      set({ isReflecting: true, memoryReflectionError: null });
      try {
        const retry = () => {
          if (get().activeCharacter?.id === activeCharacter.id) void get().triggerMemoryPipeline(recentTurns, characterId).catch(() => undefined);
        };
        const task = { kind: 'reflection' as const, title: translate('task.reflection', { name: learner.card.data.name }), retry };
        const res = await trackTask(get(), task, () => api.triggerMemoryPipeline({
          character_id: cid,
          user_name: userName,
          chat_id: activeChatId || undefined,
          endpoint_url: endpoint,
          api_key: selectedBackend === 'cloud' ? cloudApiKey : undefined,
          model: selectedBackend === 'cloud' ? cloudModel : undefined,
          provider: selectedBackend === 'cloud' ? cloudProvider : 'local_llama',
          recent_turn_count: recentTurns || 8,
          include_diary: true,
          speaker_names: speakerNames,
        }));

        if (memoryCid() === cid && get().activePersona.name === userName) {
          set({ lastReflectionResult: res });
          await refreshContext(cid, userName);
        }
        return res;
      } catch (e) {
        console.error('Memory pipeline error:', e);
        if (memoryCid() === cid && get().activePersona.name === userName) {
          set({ memoryReflectionError: errorMessage(e) });
          await refreshContext(cid, userName);
        }
        throw e;
      } finally {
        set({ isReflecting: false });
      }
    },

    fetchMemoryMarkdown: async () => {
      const cid = memoryCid();
      const userName = get().activePersona.name;
      if (!cid) throw new Error(translate('int.noCharacter'));

      const request = ++markdownRequest;
      const isCurrent = () => request === markdownRequest && memoryCid() === cid && get().activePersona.name === userName;
      set({ isMemoryMarkdownLoading: true });
      try {
        const [charMd, userMd] = await Promise.all([
          api.getCharacterMemoryMarkdown(cid), api.getUserMemoryMarkdown(cid, userName),
        ]);
        if (isCurrent()) set({ characterMarkdown: charMd, userMarkdown: userMd, memoryMarkdownError: null });
        return { charMd, userMd };
      } catch (e) {
        console.error('Failed to fetch memory markdown:', e);
        if (isCurrent()) set({ memoryMarkdownError: errorMessage(e) });
        throw e;
      } finally {
        if (isCurrent()) set({ isMemoryMarkdownLoading: false });
      }
    },

    saveCharacterMarkdown: async (markdown: string) => {
      const cid = memoryCid();
      if (!cid) throw new Error(translate('int.noCharacter'));
      try {
        await api.saveCharacterMemoryMarkdown(cid, markdown);
        if (memoryCid() === cid) {
          set({ characterMarkdown: markdown });
          await get().fetchCognitiveOverview();
        }
      } catch (e) {
        console.error('Failed to save character markdown:', e);
        throw e;
      }
    },

    saveUserMarkdown: async (markdown: string) => {
      const cid = memoryCid();
      const userName = get().activePersona.name;
      if (!cid) throw new Error(translate('int.noCharacter'));
      try {
        await api.saveUserMemoryMarkdown(cid, userName, markdown);
        if (memoryCid() === cid && get().activePersona.name === userName) {
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
          character_id: memoryCid() ?? activeCharacter.id,
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
      const cid = memoryCid();
      if (!cid) return;
      const request = ++backupsRequest;
      const isCurrent = () => request === backupsRequest && memoryCid() === cid;
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
      const cid = memoryCid();
      const userName = get().activePersona.name;
      if (!cid) throw new Error(translate('int.noCharacter'));
      if (get().memoryOperation || get().isReflecting) throw new Error(translate('memory.busy'));
      set({ memoryOperation: 'backup' });
      try {
        const info = await api.backupMemoryState(cid, userName);
        if (memoryCid() === cid) await get().fetchMemoryBackups();
        return info;
      } catch (e) {
        console.error('Failed to create memory backup:', e);
        throw e;
      } finally {
        set({ memoryOperation: null });
      }
    },

    restoreMemoryBackup: async (backupFilePath: string) => {
      const cid = memoryCid();
      const userName = get().activePersona.name;
      if (!cid) throw new Error(translate('int.noCharacter'));
      if (get().memoryOperation || get().isReflecting) throw new Error(translate('memory.busy'));
      set({ memoryOperation: 'restore' });
      try {
        await api.restoreMemoryBackup(backupFilePath, cid);
        if (memoryCid() === cid && get().activePersona.name === userName) {
          await refreshContext(cid, userName);
        }
      } catch (e) {
        console.error('Failed to restore memory backup:', e);
        throw e;
      } finally {
        set({ memoryOperation: null });
      }
    },
  };
};
