import type { StateCreator } from 'zustand';
import type { AppSlice } from './slices/appSlice';
import type { AvatarSlice } from './slices/avatarSlice';
import type { LlmSlice } from './slices/llmSlice';
import type { CharacterSlice } from './slices/characterSlice';
import type { LorebookSlice } from './slices/lorebookSlice';
import type { MemorySlice } from './slices/memorySlice';
import type { StageSlice } from './slices/stageSlice';
import type { CompanionSlice } from './slices/companionSlice';
import type { ChatSlice } from './slices/chatSlice';
import type { EcosystemSlice } from './slices/ecosystemSlice';

export type AppStoreState = AppSlice &
  AvatarSlice &
  LlmSlice &
  CharacterSlice &
  LorebookSlice &
  MemorySlice &
  StageSlice &
  CompanionSlice &
  ChatSlice &
  EcosystemSlice;

/** A slice sees (and may update) the whole store. */
export type SliceCreator<T> = StateCreator<AppStoreState, [], [], T>;
