import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
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

/**
 * Subscribes to just the named fields, so a component only re-renders when one of them
 * changes (instead of on every store update, e.g. each streamed token).
 *
 * `const { messages, sendMessage } = useStoreFields('messages', 'sendMessage');`
 */
export function useStoreFields<K extends keyof AppStoreState>(...keys: K[]): Pick<AppStoreState, K> {
  return useAppStore(
    useShallow((state) => {
      const picked = {} as Pick<AppStoreState, K>;
      for (const key of keys) picked[key] = state[key];
      return picked;
    })
  );
}
