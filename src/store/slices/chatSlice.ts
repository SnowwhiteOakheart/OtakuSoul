import type { SliceCreator } from '../storeTypes';
import { createChatRuntime } from './chat/runtime';
import { createChatSessionsSlice } from './chat/sessions';
import { createChatMessagesSlice } from './chat/messages';
import { createChatTurnsSlice } from './chat/turns';
import { createChatAutonomousSlice } from './chat/autonomous';
import type { ChatSlice } from './chat/types';

export type { ChatSlice, GenerationFailure } from './chat/types';

export const createChatSlice: SliceCreator<ChatSlice> = (set, get) => {
  const runtime = createChatRuntime(set, get);
  return {
    ...createChatSessionsSlice(runtime, set, get),
    ...createChatMessagesSlice(runtime, set, get),
    ...createChatTurnsSlice(runtime, set, get),
    ...createChatAutonomousSlice(runtime, set, get),
  };
};
