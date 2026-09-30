import { open } from '@tauri-apps/plugin-dialog';
import { api } from '../services/api';
import { translate } from '../i18n';

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** Reads an image file from disk as a data URL. */
export const fileToDataUrl = async (filePath: string): Promise<string> => {
  const bytes = await api.readFileBinary(filePath);
  let binaryString = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binaryString += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  const extension = filePath.toLowerCase().split('.').pop() ?? '';
  const mime = MIME_BY_EXTENSION[extension] ?? 'image/jpeg';
  return `data:${mime};base64,${btoa(binaryString)}`;
};

/** Scales an image down so its longer side is at most `maxSize` pixels (keeps small images as they are). */
export const downscaleDataUrl = (dataUrl: string, maxSize: number): Promise<string> =>
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      if (scale === 1) {
        resolve(dataUrl);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext('2d');
      if (!context) {
        resolve(dataUrl);
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/webp', 0.9));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });

/** Lets the user pick an image and returns it as a data URL, or null when cancelled. */
export const pickImageAsDataUrl = async (options: { maxSize?: number } = {}): Promise<string | null> => {
  const selected = await open({
    multiple: false,
    filters: [{ name: translate('common.imageFilter'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  });
  if (!selected || typeof selected !== 'string') return null;
  const dataUrl = await fileToDataUrl(selected);
  return options.maxSize ? downscaleDataUrl(dataUrl, options.maxSize) : dataUrl;
};
