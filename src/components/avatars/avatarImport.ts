import { forgetAvatar } from '../avatar/avatarCache';
import { open } from '@tauri-apps/plugin-dialog';
import { translate } from '../../i18n';
import { api } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { errorMessage } from '../../utils/errors';
import { toast } from '../ui/feedback';

/** Above this many triangles a model loads slowly; the import suggests reducing it. */
export const HEAVY_MODEL_TRIANGLES = 500_000;

/** Picks a 3D model (VRM, glTF, MMD or a ZIP of one), imports it and reloads the list; the new path or null. */
export async function importVrmFromDialog(): Promise<string | null> {
  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: translate('settings.fileFilterVrm'), extensions: ['vrm', 'glb', 'gltf', 'pmx', 'pmd', 'zip'] }],
    });
    if (!selected || typeof selected !== 'string') return null;
    const imported = await api.importVrmModel(selected);
    // A file of the same name may have been replaced: the old parsed copy must not come back.
    forgetAvatar(imported.path);
    await useAppStore.getState().refreshVrmModels();
    toast.success(translate('settings.vrmImported', { name: imported.name }));
    if (imported.triangles > HEAVY_MODEL_TRIANGLES) {
      toast.info(translate('settings.vrmHeavy', { name: imported.name, count: imported.triangles.toLocaleString() }));
    }
    return imported.path;
  } catch (e) {
    console.error('Failed to import VRM:', e);
    toast.error(translate('settings.importFailed', { error: errorMessage(e) }));
    return null;
  }
}

/** Picks an Inochi2D puppet (.inp, .inx or a ZIP with one), imports it and reloads the list; the new path or null. */
export async function importInochi2dFromDialog(): Promise<string | null> {
  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: translate('settings.fileFilterInochi2d'), extensions: ['inp', 'inx', 'zip'] }],
    });
    if (!selected || typeof selected !== 'string') return null;
    const imported = await api.importInochi2dModel(selected);
    await useAppStore.getState().refreshInochi2dModels();
    toast.success(translate('settings.inochi2dImported', { name: imported.name }));
    return imported.model_path;
  } catch (e) {
    console.error('Failed to import Inochi2D puppet:', e);
    toast.error(translate('settings.importFailed', { error: errorMessage(e) }));
    return null;
  }
}

/** Picks a Live2D model (ZIP or model JSON), imports it and reloads the list; the new model path or null. */
export async function importLive2dFromDialog(): Promise<string | null> {
  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: translate('settings.fileFilterLive2d'), extensions: ['zip', 'json'] }],
    });
    if (!selected || typeof selected !== 'string') return null;
    const imported = await api.importLive2dModel(selected);
    await useAppStore.getState().refreshLive2dModels();
    toast.success(translate('settings.live2dImported', { name: imported.name }));
    return imported.model_path;
  } catch (e) {
    console.error('Failed to import Live2D model:', e);
    toast.error(translate('settings.importFailed', { error: errorMessage(e) }));
    return null;
  }
}
