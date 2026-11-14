import { describe, expect, it } from 'vitest';
import { DEFAULT_IMAGE_DRAFT, fromImageRequest, pickImageModel, sizeForAspect, toImageRequest } from '../components/studio/imageDraft';
import type { ImageStudioModel } from '../types';

const model = (id: string): ImageStudioModel => ({
  id,
  name: id,
  family: 'sdxl',
  license: 'MIT',
  width: 832,
  height: 1216,
  steps: 28,
  cfg_scale: 5,
});

describe('Bild-Studio-Formular', () => {
  it('rechnet Formate wie das Backend (Pixelzahl des Modells, 64er-Schritte)', () => {
    expect(sizeForAspect([832, 1216], '')).toEqual([832, 1216]);
    expect(sizeForAspect([832, 1216], '1:1')).toEqual([1024, 1024]);
    expect(sizeForAspect([832, 1216], '16:9')).toEqual([1344, 768]);
    expect(sizeForAspect([832, 1216], '9:16')).toEqual([768, 1344]);
    expect(sizeForAspect([512, 768], '1:1')).toEqual([640, 640]);
    expect(sizeForAspect([832, 1216], '10:1')).toEqual([832, 1216]);
  });

  it('wählt das Modell: Studio-Wahl, dann Bild-Einstellungen, dann das erste', () => {
    const models = [model('a'), model('b'), model('c')];
    expect(pickImageModel(models, 'c', 'b')?.id).toBe('c');
    expect(pickImageModel(models, 'weg', 'b')?.id).toBe('b');
    expect(pickImageModel(models, null, 'weg')?.id).toBe('a');
    expect(pickImageModel([], 'a', 'b')).toBeNull();
  });

  it('baut die Anfrage und lädt sie zurück', () => {
    const request = toImageRequest({ ...DEFAULT_IMAGE_DRAFT, prompt: ' sunset ', aspect: '16:9', seed: '12', count: 20 }, 'animagine');
    expect(request).toMatchObject({ prompt: 'sunset', aspect: '16:9', seed: 12, count: 8, model_id: 'animagine', negative: '' });
    expect(toImageRequest({ ...DEFAULT_IMAGE_DRAFT, count: 0 }, 'x').count).toBe(1);
    const draft = fromImageRequest({ ...request, negative: 'blurry' }, 13);
    expect(draft).toMatchObject({ prompt: 'sunset', aspect: '16:9', seed: '13', count: 1, negative: 'blurry' });
    expect(fromImageRequest(request, null).negative).toBeNull();
  });

  it('nimmt die LoRAs der Bild-Einstellungen, bis das Studio eigene hat', () => {
    const settings = [{ file: 'pastel.safetensors', weight: 0.8 }];
    expect(toImageRequest({ ...DEFAULT_IMAGE_DRAFT, prompt: 'x' }, 'm', settings).loras).toEqual(settings);
    const own = [{ file: 'mein-stil.safetensors', weight: 1 }];
    expect(toImageRequest({ ...DEFAULT_IMAGE_DRAFT, prompt: 'x', loras: own }, 'm', settings).loras).toEqual(own);
    // No LoRAs on purpose is a choice of its own, not "use the settings".
    expect(toImageRequest({ ...DEFAULT_IMAGE_DRAFT, prompt: 'x', loras: [] }, 'm', settings).loras).toEqual([]);
    expect(fromImageRequest({ ...toImageRequest(DEFAULT_IMAGE_DRAFT, 'm'), loras: null }, null).loras).toBeNull();
  });
});
