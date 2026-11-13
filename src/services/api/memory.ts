import { invoke } from '@tauri-apps/api/core';
import type { JournalOutcome } from '../../types/generated/JournalOutcome';
import type { JournalRequest } from '../../types/generated/JournalRequest';
import type { MemoryAtlas } from '../../types/generated/MemoryAtlas';
import type {
  CleanupGroup,
  CleanupProposal,
  CognitiveOverview,
  DiaryEntry,
  EpisodicMemory,
  IntentionDraft,
  IntentionEntry,
  MemoryBackupInfo,
  MemoryChange,
  MemoryCleanupRequest,
  MemoryPipelineRequest,
  MemoryPipelineResult,
  PromptMemories,
  PsychologyState,
  RelationshipState,
} from '../../types';

export const memoryApi = {
  /** Memories for the next reply: a stable core and the ones that fit `query` (recent messages). */
  getPromptMemories: async (charId: string, userName: string, query: string): Promise<PromptMemories> => {
    return await invoke<PromptMemories>('get_prompt_memories', { charId, userName, query });
  },

  /** Plans and promises of a character towards one persona; open ones first. */
  getIntentions: async (charId: string, userName: string, includeResolved: boolean): Promise<IntentionEntry[]> => {
    return await invoke<IntentionEntry[]>('get_intentions', { charId, userName, includeResolved });
  },

  addIntention: async (charId: string, userName: string, draft: IntentionDraft): Promise<number | null> => {
    return await invoke<number | null>('add_intention', { charId, userName, draft });
  },

  updateIntention: async (charId: string, id: number, draft: IntentionDraft): Promise<void> => {
    await invoke('update_intention', { charId, id, draft });
  },

  /** `fulfilled` or `abandoned`: the intention becomes an episodic memory. */
  setIntentionStatus: async (charId: string, id: number, status: 'fulfilled' | 'abandoned'): Promise<boolean> => {
    return await invoke<boolean>('set_intention_status', { charId, id, status });
  },

  deleteIntention: async (charId: string, id: number): Promise<void> => {
    await invoke('delete_intention', { charId, id });
  },

  searchEpisodicMemories: async (charId: string, query: string): Promise<EpisodicMemory[]> => {
    return await invoke<EpisodicMemory[]>('search_episodic_memories', { charId, query });
  },

  /** Outdated memories of a character (newest first); never part of a prompt. */
  getSupersededMemories: async (charId: string): Promise<EpisodicMemory[]> => {
    return await invoke<EpisodicMemory[]>('get_superseded_memories', { charId });
  },

  restoreSupersededMemory: async (charId: string, id: number): Promise<void> => {
    await invoke('restore_superseded_memory', { charId, id });
  },

  /** Asks the model which memories could be merged; writes nothing. */
  proposeMemoryCleanup: async (req: MemoryCleanupRequest): Promise<CleanupProposal> => {
    return await invoke<CleanupProposal>('propose_memory_cleanup', { req });
  },

  /** Merges the confirmed groups after a snapshot; returns how many were merged. */
  applyMemoryCleanup: async (charId: string, userName: string, groups: CleanupGroup[]): Promise<number> => {
    return await invoke<number>('apply_memory_cleanup', { charId, userName, groups });
  },

  getCognitiveOverview: async (
    charId: string,
    userName: string
  ): Promise<CognitiveOverview> => {
    return await invoke<CognitiveOverview>('get_cognitive_overview', {
      charId,
      userName,
    });
  },

  updatePsychology: async (
    charId: string,
    psychology: PsychologyState
  ): Promise<void> => {
    return await invoke<void>('update_psychology', { charId, psychology });
  },

  updateRelationship: async (
    charId: string,
    relationship: RelationshipState
  ): Promise<void> => {
    return await invoke<void>('update_relationship', { charId, relationship });
  },

  /** `source` names the chat message the memory was taken from ("Remember this message"). */
  addEpisodicMemory: async (
    charId: string,
    category: string,
    content: string,
    significance: number,
    source?: { chatId: string; messageIds: string[] },
  ): Promise<number> => {
    return await invoke<number>('add_episodic_memory', {
      charId,
      category,
      content,
      significance,
      chatId: source?.chatId ?? null,
      messageIds: source?.messageIds ?? null,
    });
  },

  updateEpisodicMemory: async (charId: string, id: number, category: string, content: string, significance: number): Promise<void> => {
    await invoke('update_episodic_memory', { charId, id, category, content, significance });
  },

  forgetEpisodicMemory: async (charId: string, id: number): Promise<void> => {
    await invoke('forget_episodic_memory', { charId, id });
  },

  setEpisodicMemoryPinned: async (charId: string, id: number, pinned: boolean): Promise<void> => {
    await invoke('set_episodic_memory_pinned', { charId, id, pinned });
  },

  confirmEpisodicMemory: async (charId: string, id: number): Promise<void> => {
    await invoke('confirm_episodic_memory', { charId, id });
  },

  getMemoryHistory: async (charId: string, id: number): Promise<MemoryChange[]> => {
    return await invoke<MemoryChange[]>('get_memory_history', { charId, id });
  },

  /** How many memories were learned from this message. */
  countMemoriesFromMessage: async (chatId: string, messageId: string): Promise<number> => {
    return await invoke<number>('count_memories_from_message', { chatId, messageId });
  },

  /** Random older memories of a character, woven into a dream told on start. */
  writeJournalEntry: async (req: JournalRequest): Promise<JournalOutcome> => {
    return await invoke<JournalOutcome>('write_journal_entry', { req });
  },

  getMemoryAtlas: async (charId: string, userName: string, includeSuperseded: boolean): Promise<MemoryAtlas> => {
    return await invoke<MemoryAtlas>('get_memory_atlas', { charId, userName, includeSuperseded });
  },

  getDreamMemories: async (charId: string, limit: number): Promise<EpisodicMemory[]> => {
    return await invoke<EpisodicMemory[]>('get_dream_memories', { charId, limit });
  },

  addDiaryEntry: async (
    charId: string,
    title: string,
    entryText: string,
    mood: string
  ): Promise<number> => {
    return await invoke<number>('add_diary_entry', {
      charId,
      title,
      entryText,
      mood,
    });
  },

  applyEmotionalDecay: async (charId: string): Promise<string | null> => {
    return await invoke<string | null>('apply_emotional_decay', { charId });
  },

  // Cognitive Pipeline & Markdown Sync
  triggerMemoryPipeline: async (
    req: MemoryPipelineRequest
  ): Promise<MemoryPipelineResult> => {
    return await invoke<MemoryPipelineResult>('trigger_memory_pipeline', {
      req,
    });
  },

  getCharacterMemoryMarkdown: async (charId: string): Promise<string> => {
    return await invoke<string>('get_character_memory_markdown', { charId });
  },

  saveCharacterMemoryMarkdown: async (
    charId: string,
    markdown: string
  ): Promise<void> => {
    return await invoke<void>('save_character_memory_markdown', {
      charId,
      markdown,
    });
  },

  getUserMemoryMarkdown: async (
    charId: string,
    userName: string
  ): Promise<string> => {
    return await invoke<string>('get_user_memory_markdown', {
      charId,
      userName,
    });
  },

  saveUserMemoryMarkdown: async (
    charId: string,
    userName: string,
    markdown: string
  ): Promise<void> => {
    return await invoke<void>('save_user_memory_markdown', {
      charId,
      userName,
      markdown,
    });
  },

  generateManualDiaryEntry: async (
    req: MemoryPipelineRequest
  ): Promise<DiaryEntry> => {
    return await invoke<DiaryEntry>('generate_manual_diary_entry', { req });
  },

  backupMemoryState: async (
    charId: string,
    userName?: string
  ): Promise<MemoryBackupInfo> => {
    return await invoke<MemoryBackupInfo>('backup_memory_state', {
      charId,
      userName,
    });
  },

  listMemoryBackups: async (charId: string): Promise<MemoryBackupInfo[]> => {
    return await invoke<MemoryBackupInfo[]>('list_memory_backups', { charId });
  },

  restoreMemoryBackup: async (backupFilePath: string, charId: string): Promise<void> => {
    return await invoke<void>('restore_memory_backup', { backupFilePath, charId });
  },
};
