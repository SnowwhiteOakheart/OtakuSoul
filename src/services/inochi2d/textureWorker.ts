/*
 * Decodes Inochi2D textures (TGA, PNG) off the main thread, so a large puppet does not stall the
 * interface while it loads. Answers each request with the raw RGBA bytes (transferred, not copied).
 */
import { decodePng, decodeTga } from './inp';

interface Request {
  id: number;
  encoding: 'png' | 'tga';
  data: Uint8Array;
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, encoding, data } = event.data;
  try {
    const image = encoding === 'tga' ? decodeTga(data) : await decodePng(data);
    (self as unknown as Worker).postMessage({ id, image }, [image.pixels.buffer]);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  }
};
