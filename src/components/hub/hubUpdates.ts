import { useState } from 'react';
import { translate, useTranslation } from '../../i18n';
import { useAppStore } from '../../store/useAppStore';
import { errorMessage } from '../../utils/errors';
import { toast } from '../ui/feedback';
import { installCharacter, installLorebook, installScene } from './hubInstall';
import { useHubStore } from './hubStore';
import type { GatewayCharacterEntry, GatewayLorebookEntry, GatewaySceneEntry } from '../../types';

export interface OutdatedEntries {
  characters?: GatewayCharacterEntry[];
  lorebooks?: GatewayLorebookEntry[];
  scenes?: GatewaySceneEntry[];
}

/** Installs the newer revision of every given entry; returns how many were updated. */
async function updateEntries({ characters = [], lorebooks = [], scenes = [] }: OutdatedEntries): Promise<number> {
  let done = 0;
  const attempt = async (name: string, task: () => Promise<boolean>) => {
    try {
      if (await task()) done += 1;
    } catch (e) {
      toast.error(translate('hub.importFailed', { error: `${name}: ${errorMessage(e)}` }));
    }
  };
  // Characters first: scenes cast them by name.
  for (const char of characters) await attempt(char.name, async () => (await installCharacter(char, 'update')) !== null);
  for (const lb of lorebooks) await attempt(lb.name, async () => Boolean(await installLorebook(lb)));
  for (const scene of scenes) await attempt(scene.title, async () => (await installScene(scene), true));
  const app = useAppStore.getState();
  await Promise.all([
    characters.length ? app.refreshCharacters() : null,
    lorebooks.length ? app.refreshLorebooks() : null,
    scenes.length ? app.fetchStageScenes() : null,
    useHubStore.getState().loadInstalled(),
  ]);
  return done;
}

/** State and action of the "update all" bar above a hub list. */
export const useUpdateAll = (outdated: OutdatedEntries) => {
  const { tPlural } = useTranslation();
  const [busy, setBusy] = useState(false);
  const count = (outdated.characters?.length ?? 0) + (outdated.lorebooks?.length ?? 0) + (outdated.scenes?.length ?? 0);
  const run = async () => {
    setBusy(true);
    const done = await updateEntries(outdated);
    setBusy(false);
    if (done) toast.success(tPlural('hub.updatedCount', done));
  };
  return { count, busy, run };
};
