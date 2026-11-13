import { invoke } from '@tauri-apps/api/core';
import { importResult } from './shared';
import type { ContributionResult } from '../../types/generated/ContributionResult';
import type { Finding } from '../../types/generated/Finding';
import type { SubmissionInfo } from '../../types/generated/SubmissionInfo';
import type {
  CharacterImportResult,
  CharacterProfile,
  ChubCharacterDetail,
  ChubSearchResult,
  GatewayCharacterEntry,
  GatewayCollectionEntry,
  GatewayLorebookEntry,
  GatewaySceneEntry,
  InstalledHubItem,
  Lorebook,
  SceneState,
} from '../../types';

export const hubApi = {
  /** Reload button in the hub: lists then come from the data repositories' newest commits. */
  refreshHubSources: async (): Promise<void> => {
    return await invoke<void>('refresh_hub_sources');
  },

  fetchSoulGatewayRegistry: async (): Promise<GatewayCharacterEntry[]> => {
    return await invoke<GatewayCharacterEntry[]>('fetch_soul_gateway_registry');
  },

  importSoulGatewayCharacter: async (
    name: string,
    author: string,
    downloadUrl: string,
    overwrite = false,
    revision = 1,
    updated = ''
  ): Promise<CharacterImportResult> => {
    return importResult(await invoke<CharacterImportResult>('import_soul_gateway_character', {
      name,
      author,
      downloadUrl,
      overwrite,
      revision,
      updated,
    }));
  },

  searchChubCharacters: async (
    query: string,
    page: number = 1,
    first: number = 24,
    sort: string = 'trending',
    topics?: string[],
    nsfw: boolean = false
  ): Promise<ChubSearchResult> => {
    return await invoke<ChubSearchResult>('search_chub_characters', {
      query,
      page,
      first,
      sort,
      topics: topics && topics.length > 0 ? topics : null,
      nsfw,
    });
  },

  getChubCharacterDetails: async (fullPath: string): Promise<ChubCharacterDetail> => {
    return await invoke<ChubCharacterDetail>('get_chub_character_details', { fullPath });
  },

  importChubCharacter: async (fullPath: string, overwrite = false): Promise<CharacterImportResult> => {
    return importResult(await invoke<CharacterImportResult>('import_chub_character', { fullPath, overwrite }));
  },

  importCharacterFromUrl: async (url: string, overwrite = false): Promise<CharacterImportResult> => {
    return importResult(await invoke<CharacterImportResult>('import_character_from_url', { url, overwrite }));
  },

  /** Imports a card file; a character of the same name is only replaced with `overwrite`. */
  importCharacterFile: async (filePath: string, overwrite = false): Promise<CharacterImportResult> => {
    return importResult(await invoke<CharacterImportResult>('import_character_file', { filePath, overwrite }));
  },

  fetchLorebooksGatewayRegistry: async (): Promise<GatewayLorebookEntry[]> => {
    return await invoke<GatewayLorebookEntry[]>('fetch_lorebooks_gateway_registry');
  },

  /** Installs or updates a gateway lorebook; an own version is only kept as copy with `keepCopy`. */
  importLorebookFromGateway: async (
    downloadUrl: string,
    fallbackName: string,
    revision = 1,
    updated = '',
    keepCopy = false
  ): Promise<Lorebook> => {
    return await invoke<Lorebook>('import_lorebook_from_gateway', {
      downloadUrl,
      fallbackName,
      revision,
      updated,
      keepCopy,
    });
  },

  /** Story collections (lorebooks, scenes and characters of one series); none without a registry. */
  fetchCollectionsGatewayRegistry: async (): Promise<GatewayCollectionEntry[]> => {
    return await invoke<GatewayCollectionEntry[]>('fetch_collections_gateway_registry');
  },

  fetchStagesGatewayRegistry: async (): Promise<GatewaySceneEntry[]> => {
    return await invoke<GatewaySceneEntry[]>('fetch_stages_gateway_registry');
  },

  /** Installs a gateway scene or updates the installed copy (progress stays). */
  importSceneFromGateway: async (
    downloadUrl: string,
    fallbackTitle: string,
    hubId = '',
    revision = 1,
    updated = ''
  ): Promise<SceneState> => {
    return await invoke<SceneState>('import_scene_from_gateway', {
      downloadUrl,
      fallbackTitle,
      hubId,
      revision,
      updated,
    });
  },

  /** Hub contents installed so far, with their revisions. */
  listInstalledHubItems: async (): Promise<InstalledHubItem[]> => {
    return await invoke<InstalledHubItem[]>('list_installed_hub_items');
  },

  // Hub Contributions (B4)
  /** What the hub needs of a character before it is contributed. */
  checkCharacterContribution: async (profile: CharacterProfile): Promise<Finding[]> => {
    return await invoke<Finding[]>('check_character_contribution', { profile });
  },

  checkStoryContribution: async (sceneId: string): Promise<Finding[]> => {
    return await invoke<Finding[]>('check_story_contribution', { sceneId });
  },

  /** Writes the contribution package (ZIP) of a character to `targetPath`; the result has the issue address. */
  exportCharacterContribution: async (
    profile: CharacterProfile,
    info: SubmissionInfo,
    targetPath: string,
  ): Promise<ContributionResult> => {
    return await invoke<ContributionResult>('export_character_contribution', { profile, info, targetPath });
  },

  exportStoryContribution: async (sceneId: string, info: SubmissionInfo, targetPath: string): Promise<ContributionResult> => {
    return await invoke<ContributionResult>('export_story_contribution', { sceneId, info, targetPath });
  },
};
