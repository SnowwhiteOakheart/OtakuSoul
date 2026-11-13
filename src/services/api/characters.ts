import { invoke } from '@tauri-apps/api/core';
import { bumpAvatarRevision, forBackend, withAvatarUrl } from '../../utils/characterAvatar';
import type {
  CharacterDraft,
  CharacterProfile,
  CharacterWizardInput,
  EvaluatedLoreResult,
  Lorebook,
  LorebookEntry,
} from '../../types';

export const charactersApi = {
  loadCharacterCard: async (filePath: string): Promise<CharacterProfile> => {
    return withAvatarUrl(await invoke<CharacterProfile>('load_character_card', { filePath }));
  },

  loadLorebook: async (filePath: string): Promise<Lorebook> => {
    return await invoke<Lorebook>('load_lorebook', { filePath });
  },

  listAllLorebooks: async (): Promise<Lorebook[]> => {
    return await invoke<Lorebook[]>('list_all_lorebooks');
  },

  saveLorebook: async (lorebook: Lorebook): Promise<string> => {
    return await invoke<string>('save_lorebook', { lorebook });
  },

  deleteLorebook: async (filePath: string): Promise<void> => {
    return await invoke<void>('delete_lorebook', { filePath });
  },

  importLorebookFile: async (sourcePath: string): Promise<Lorebook> => {
    return await invoke<Lorebook>('import_lorebook_file', { sourcePath });
  },

  exportLorebookFile: async (lorebook: Lorebook, targetPath: string): Promise<void> => {
    return await invoke<void>('export_lorebook_file', { lorebook, targetPath });
  },

  evaluateLorebookContext: async (
    lorebook: Lorebook,
    context: string
  ): Promise<LorebookEntry[]> => {
    return await invoke<LorebookEntry[]>('evaluate_lorebook_context', {
      lorebook,
      context,
    });
  },

  evaluateMultiLorebooks: async (
    lorebooks: Lorebook[],
    context: string,
    currentTension: number
  ): Promise<EvaluatedLoreResult> => {
    return await invoke<EvaluatedLoreResult>('evaluate_multi_lorebooks', {
      lorebooks,
      context,
      currentTension,
    });
  },

  scanCharacters: async (): Promise<CharacterProfile[]> => {
    return (await invoke<CharacterProfile[]>('scan_characters')).map(withAvatarUrl);
  },

  saveCharacterCard: async (
    profile: CharacterProfile
  ): Promise<CharacterProfile> => {
    const saved = await invoke<CharacterProfile>('save_character_card', { profile: forBackend(profile) });
    bumpAvatarRevision();
    return withAvatarUrl(saved);
  },

  exportCharacterCard: async (
    profile: CharacterProfile,
    targetPath: string,
    exportAsPng: boolean
  ): Promise<void> => {
    return await invoke<void>('export_character_card', {
      profile: forBackend(profile),
      targetPath,
      exportAsPng,
    });
  },

  deleteCharacter: async (charId: string): Promise<void> => {
    return await invoke<void>('delete_character', { charId });
  },

  restoreHiddenCharacters: async (): Promise<void> => {
    return await invoke<void>('restore_hidden_characters');
  },

  // AI Character Assistant
  buildCharacterWizardPrompt: async (input: CharacterWizardInput): Promise<string> => {
    return await invoke<string>('build_character_wizard_prompt_cmd', { input });
  },

  parseCharacterWizardDraft: async (rawText: string): Promise<CharacterDraft> => {
    return await invoke<CharacterDraft>('parse_character_wizard_draft_cmd', { rawText });
  },

  createCharacterFromDraft: async (draft: CharacterDraft): Promise<CharacterProfile> => {
    bumpAvatarRevision();
    return withAvatarUrl(await invoke<CharacterProfile>('create_character_from_draft', { draft }));
  },

  generateCharacterDraftLlm: async (
    input: CharacterWizardInput,
    endpointUrl: string,
    apiKey?: string,
    model?: string,
    provider?: string
  ): Promise<CharacterDraft> => {
    return await invoke<CharacterDraft>('generate_character_draft_llm', {
      input,
      endpointUrl,
      apiKey: apiKey || null,
      model: model || null,
      provider: provider || null,
    });
  },
};
