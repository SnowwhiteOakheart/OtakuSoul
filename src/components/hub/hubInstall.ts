import { api } from '../../services/api';
import { translate } from '../../i18n';
import { useAppStore } from '../../store/useAppStore';
import { importWithOverwrite } from '../../services/characterImport';
import { confirmDialog, type ToastAction } from '../ui/feedback';
import { errorCode } from '../../utils/errors';
import { characterImported } from './hubParts';
import type { HubStatus } from './hubStore';
import type { GatewayCharacterEntry, GatewayLorebookEntry, GatewaySceneEntry } from '../../types';

/** Success toast of an import; `null` = the user cancelled. */
export type ImportOutcome = { message: string; action?: ToastAction } | null;

/** Registry key of a scene (older registries have no id). */
export const sceneHubId = (scene: GatewaySceneEntry) => scene.id || scene.title;

/**
 * Installs or updates a gateway lorebook. When the user changed the installed copy (or has an own
 * lorebook of that name), they decide whether the update goes ahead with their version kept as a
 * copy; `null` = cancelled.
 */
export async function installLorebook(lb: GatewayLorebookEntry) {
  const run = (keepCopy: boolean) =>
    api.importLorebookFromGateway(lb.download_url, lb.name, lb.revision, lb.updated, keepCopy);
  try {
    return await run(false);
  } catch (e) {
    if (errorCode(e)?.code !== 'backend.hub.lorebookModified') throw e;
    const confirmed = await confirmDialog({
      title: translate('hub.lorebookModifiedTitle', { name: lb.name }),
      message: translate('hub.lorebookModifiedText'),
      confirmLabel: translate('hub.lorebookKeepCopy'),
    });
    return confirmed ? await run(true) : null;
  }
}

/** Installs a gateway scene or updates the installed copy (progress stays). */
export const installScene = (scene: GatewaySceneEntry) =>
  api.importSceneFromGateway(scene.download_url, scene.title, sceneHubId(scene), scene.revision, scene.updated);

/**
 * Installs a gateway character. An update replaces the installed card (the old one goes to the
 * trash, chats and memories stay); a new one asks before replacing an own card of that name.
 */
export const installCharacter = (char: GatewayCharacterEntry, status: HubStatus) => {
  const run = (overwrite: boolean) =>
    api.importSoulGatewayCharacter(char.name, char.author, char.download_url, overwrite, char.revision, char.updated);
  return status === 'update' ? run(true) : importWithOverwrite(run);
};

/** Lorebook import with library refresh and toast. */
export async function importLorebookTask(lb: GatewayLorebookEntry, status: HubStatus): Promise<ImportOutcome> {
  const res = await installLorebook(lb);
  await useAppStore.getState().refreshLorebooks();
  if (!res) return null;
  return {
    message: translate(status !== 'new' ? 'hub.updatedLorebook' : 'hub.importedLorebook', { name: res.name, count: res.entries.length }),
    action: { label: translate('hub.viewLorebooks'), onClick: () => useAppStore.getState().setActiveTab('lorebooks') },
  };
}

/** Scene import with library refresh and a toast that starts it in Stage. */
export async function importSceneTask(scene: GatewaySceneEntry, status: HubStatus): Promise<ImportOutcome> {
  const res = await installScene(scene);
  await useAppStore.getState().fetchStageScenes();
  return {
    message: translate(status !== 'new' ? 'hub.updatedScene' : 'hub.importedScene', { name: res.definition.title }),
    action: {
      label: translate('hub.startInStage'),
      onClick: async () => {
        await useAppStore.getState().loadStageScene(res.definition.id);
        useAppStore.getState().setActiveTab('stage');
      },
    },
  };
}

/** Character import with library refresh and an "open in chat" toast. */
export async function importCharacterTask(char: GatewayCharacterEntry, status: HubStatus): Promise<ImportOutcome> {
  const res = await installCharacter(char, status);
  return res && characterImported(res);
}
