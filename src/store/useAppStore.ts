import { create } from 'zustand';
import { createAppSlice } from './slices/appSlice';
import { createAvatarSlice } from './slices/avatarSlice';
import { createLlmSlice } from './slices/llmSlice';
import { createCharacterSlice } from './slices/characterSlice';
import { createLorebookSlice } from './slices/lorebookSlice';
import { createMemorySlice } from './slices/memorySlice';
import { createStageSlice } from './slices/stageSlice';
import { createCompanionSlice } from './slices/companionSlice';
import { createChatSlice } from './slices/chatSlice';
import { createEcosystemSlice } from './slices/ecosystemSlice';
import type { AppStoreState } from './storeTypes';

export type { AppStoreState } from './storeTypes';
export { normalizeReplyLanguage, CLOUD_PROVIDER_DEFAULTS, type AppTab, type SettingsSection } from './helpers';

/** The single app store, composed of domain slices (see `./slices`). */
export const useAppStore = create<AppStoreState>()((...args) => ({
  ...createAppSlice(...args),
  ...createAvatarSlice(...args),
  ...createLlmSlice(...args),
  ...createCharacterSlice(...args),
  ...createLorebookSlice(...args),
  ...createMemorySlice(...args),
  ...createStageSlice(...args),
  ...createCompanionSlice(...args),
  ...createChatSlice(...args),
  ...createEcosystemSlice(...args),
}));
