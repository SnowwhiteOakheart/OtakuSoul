import { avatarsApi } from './api/avatars';
import { charactersApi } from './api/characters';
import { chatApi } from './api/chat';
import { companionApi } from './api/companion';
import { hubApi } from './api/hub';
import { integrationsApi } from './api/integrations';
import { memoryApi } from './api/memory';
import { musicApi } from './api/music';
import { stageApi } from './api/stage';
import { systemApi } from './api/system';
import { voiceApi } from './api/voice';

/** Typsichere Tauri-IPC-Brücke, aufgeteilt in Domänen-Module unter `./api/`. */
export const api = {
  ...systemApi,
  ...chatApi,
  ...charactersApi,
  ...memoryApi,
  ...stageApi,
  ...musicApi,
  ...avatarsApi,
  ...voiceApi,
  ...companionApi,
  ...hubApi,
  ...integrationsApi,
};

export {
  avatarsApi,
  charactersApi,
  chatApi,
  companionApi,
  hubApi,
  integrationsApi,
  memoryApi,
  musicApi,
  stageApi,
  systemApi,
  voiceApi,
};
