import { api } from './api';
import { useAppStore } from '../store/useAppStore';
import { trackTask } from '../store/slices/taskSlice';
import { translate } from '../i18n';

/**
 * Model downloads outside the GGUF hub, shown in the task list with progress (by model id),
 * cancel and retry. Errors are passed on to the caller.
 */
const download = (modelId: string, name: string, run: () => Promise<void>, cancel: () => Promise<void>): Promise<void> =>
  trackTask(
    useAppStore.getState(),
    {
      kind: 'download',
      title: translate('task.download', { name }),
      progressKey: modelId,
      cancel: () => void cancel(),
      retry: () => void download(modelId, name, run, cancel).catch(() => undefined),
    },
    run,
  );

export const downloadImageModelTask = (modelId: string, name: string) =>
  download(modelId, name, () => api.downloadImageModel(modelId), api.cancelImageModelDownload);

/** LoRAs share the image download (and its cancel); progress uses the LoRA id. */
export const downloadImageLoraTask = (loraId: string, name: string) =>
  download(loraId, name, () => api.downloadImageLora(loraId), api.cancelImageModelDownload);

export const downloadTtsModelTask = (modelId: string, name: string) =>
  download(modelId, name, () => api.downloadTtsModel(modelId), api.cancelTtsModelDownload);
