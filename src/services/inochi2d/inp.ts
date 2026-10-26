/*
 * Inochi2D puppet files (.inp, .inx): a JSON payload followed by the textures.
 * Port of Inox2D's `formats/inp.rs` (BSD-2-Clause, © Speykious and the Inochi2D Project,
 * see LICENSE-inox2d.txt next to this file).
 *
 * Layout (big endian): "TRNSRTS\0", u32 JSON length, JSON, "TEX_SECT", u32 count, per texture
 * u32 length + u8 encoding (0 PNG, 1 TGA, 2 BC7) + data, optionally "EXT_SECT" with vendor data.
 */

const MAGIC = 'TRNSRTS\0';
const TEX_SECT = 'TEX_SECT';
const EXT_SECT = 'EXT_SECT';

export type TextureEncoding = 'png' | 'tga' | 'bc7';

export interface InpTexture {
  encoding: TextureEncoding;
  data: Uint8Array;
}

export interface InpFile {
  /** The puppet description (meta, physics, nodes, param …). */
  puppet: Record<string, unknown>;
  textures: InpTexture[];
  vendors: { name: string; payload: unknown }[];
}

export class InpError extends Error {}

const ascii = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.subarray(at, at + length));

/** Removes the zero bytes some exporters leave at the end of names. */
export const cleanText = (text: string) => text.replace(/\0/g, '').trim();

/** Whether `bytes` start like an Inochi2D puppet file. */
export const isInpFile = (bytes: Uint8Array) => bytes.length >= 12 && ascii(bytes, 0, 8) === MAGIC;

export function parseInp(bytes: Uint8Array): InpFile {
  if (!isInpFile(bytes)) throw new InpError('not an Inochi2D puppet (magic bytes missing)');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  const need = (n: number) => {
    if (at + n > bytes.length) throw new InpError('file ends too early');
  };
  const u32 = () => {
    need(4);
    const value = view.getUint32(at, false);
    at += 4;
    return value;
  };
  const take = (n: number) => {
    need(n);
    const slice = bytes.subarray(at, at + n);
    at += n;
    return slice;
  };

  const jsonLength = u32();
  const decoder = new TextDecoder();
  let puppet: Record<string, unknown>;
  try {
    puppet = JSON.parse(decoder.decode(take(jsonLength))) as Record<string, unknown>;
  } catch (e) {
    if (e instanceof InpError) throw e;
    throw new InpError(`invalid puppet description: ${(e as Error).message}`);
  }
  if (!puppet || typeof puppet !== 'object' || !puppet.nodes) throw new InpError('puppet without nodes');

  need(8);
  if (ascii(bytes, at, 8) !== TEX_SECT) throw new InpError('texture section missing');
  at += 8;
  const count = u32();
  const textures: InpTexture[] = [];
  for (let i = 0; i < count; i += 1) {
    const length = u32();
    need(1);
    const code = bytes[at]!;
    at += 1;
    const encoding: TextureEncoding | undefined = code === 0 ? 'png' : code === 1 ? 'tga' : code === 2 ? 'bc7' : undefined;
    if (!encoding) throw new InpError(`unknown texture encoding ${code}`);
    textures.push({ encoding, data: take(length) });
  }

  const vendors: InpFile['vendors'] = [];
  if (at + 12 <= bytes.length && ascii(bytes, at, 8) === EXT_SECT) {
    at += 8;
    const n = u32();
    for (let i = 0; i < n; i += 1) {
      const name = decoder.decode(take(u32()));
      const raw = decoder.decode(take(u32()));
      let payload: unknown = raw;
      try {
        payload = JSON.parse(raw);
      } catch {
        // Vendor data does not have to be JSON for us to load the puppet.
      }
      vendors.push({ name: cleanText(name), payload });
    }
  }
  return { puppet, textures, vendors };
}

export interface RawImage {
  width: number;
  height: number;
  /** RGBA, 8 bit per channel, rows from the top, not premultiplied. */
  pixels: Uint8Array;
}

/**
 * Decodes a PNG to raw RGBA bytes exactly as stored. Inochi2D textures already carry premultiplied
 * alpha; going through the browser's image decoding would treat the alpha differently per engine
 * (WebKit un-premultiplies an ImageBitmap on upload). Supports 8/16-bit grey, RGB, palette (with
 * tRNS) and their alpha variants; interlaced pictures are refused (the caller falls back).
 */
export async function decodePng(data: Uint8Array): Promise<RawImage> {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (data.length < 33 || sig.some((b, i) => data[i] !== b)) throw new InpError('not a PNG');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let width = 0;
  let height = 0;
  let depth = 8;
  let colorType = 6;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  for (let at = 8; at + 8 <= data.length; ) {
    const length = view.getUint32(at);
    const type = ascii(data, at + 4, 4);
    const body = data.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      depth = body[8]!;
      colorType = body[9]!;
      interlace = body[12]!;
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') trns = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels || interlace !== 0 || !width || !height || ![8, 16].includes(depth) || (colorType === 3 && depth !== 8)) {
    throw new InpError(`PNG variant not supported (type ${colorType}, depth ${depth}, interlace ${interlace})`);
  }
  const stream = new Blob(idat as BlobPart[]).stream().pipeThrough(new DecompressionStream('deflate'));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  const bpp = channels * (depth / 8);
  const stride = width * bpp;
  if (raw.length < (stride + 1) * height) throw new InpError('PNG ends too early');
  const lines = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    const out = y * stride;
    const up = out - stride;
    // Tight loops per filter type: this runs over every byte of every texture.
    if (filter === 0 || (filter === 2 && y === 0)) {
      lines.set(raw.subarray(src, src + stride), out);
    } else if (filter === 1) {
      for (let x = 0; x < bpp; x += 1) lines[out + x] = raw[src + x]!;
      for (let x = bpp; x < stride; x += 1) lines[out + x] = (raw[src + x]! + lines[out + x - bpp]!) & 255;
    } else if (filter === 2) {
      for (let x = 0; x < stride; x += 1) lines[out + x] = (raw[src + x]! + lines[up + x]!) & 255;
    } else if (filter === 3) {
      for (let x = 0; x < stride; x += 1) {
        const a = x >= bpp ? lines[out + x - bpp]! : 0;
        const b = y > 0 ? lines[up + x]! : 0;
        lines[out + x] = (raw[src + x]! + ((a + b) >> 1)) & 255;
      }
    } else if (filter === 4) {
      for (let x = 0; x < stride; x += 1) {
        const a = x >= bpp ? lines[out + x - bpp]! : 0;
        const b = y > 0 ? lines[up + x]! : 0;
        const c = x >= bpp && y > 0 ? lines[up + x - bpp]! : 0;
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        lines[out + x] = (raw[src + x]! + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    } else {
      throw new InpError(`PNG filter ${filter} unknown`);
    }
  }
  // The usual case (RGBA, 8 bit) is already in its final layout.
  if (colorType === 6 && depth === 8) return { width, height, pixels: lines };
  const pixels = new Uint8Array(width * height * 4);
  const step = depth / 8;
  for (let i = 0; i < width * height; i += 1) {
    const s = i * bpp;
    const o = i * 4;
    const ch = (k: number) => lines[s + k * step]!;
    if (colorType === 6) {
      pixels[o] = ch(0); pixels[o + 1] = ch(1); pixels[o + 2] = ch(2); pixels[o + 3] = ch(3);
    } else if (colorType === 2) {
      pixels[o] = ch(0); pixels[o + 1] = ch(1); pixels[o + 2] = ch(2); pixels[o + 3] = 255;
    } else if (colorType === 4) {
      pixels[o] = pixels[o + 1] = pixels[o + 2] = ch(0); pixels[o + 3] = ch(1);
    } else if (colorType === 0) {
      pixels[o] = pixels[o + 1] = pixels[o + 2] = ch(0); pixels[o + 3] = 255;
    } else {
      const index = lines[s]!;
      pixels[o] = palette?.[index * 3] ?? 0;
      pixels[o + 1] = palette?.[index * 3 + 1] ?? 0;
      pixels[o + 2] = palette?.[index * 3 + 2] ?? 0;
      pixels[o + 3] = trns && index < trns.length ? trns[index]! : 255;
    }
  }
  return { width, height, pixels };
}

/**
 * Decodes a TGA picture (true colour or grey, 8/24/32 bit, raw or run-length encoded), the format
 * Inochi Creator writes. Indexed colour is not used by it and refused.
 */
export function decodeTga(data: Uint8Array): RawImage {
  if (data.length < 18) throw new InpError('TGA too short');
  const idLength = data[0]!;
  const colorMapType = data[1]!;
  const imageType = data[2]!;
  const colorMapLength = data[5]! | (data[6]! << 8);
  const colorMapEntry = data[7]!;
  const width = data[12]! | (data[13]! << 8);
  const height = data[14]! | (data[15]! << 8);
  const depth = data[16]!;
  const descriptor = data[17]!;
  const rle = imageType >= 9;
  const grey = imageType === 3 || imageType === 11;
  if (![2, 3, 10, 11].includes(imageType)) throw new InpError(`TGA type ${imageType} not supported`);
  if (grey ? depth !== 8 && depth !== 16 : depth !== 24 && depth !== 32) throw new InpError(`TGA depth ${depth} not supported`);
  if (width === 0 || height === 0) throw new InpError('TGA without pixels');
  const bpp = depth / 8;
  let at = 18 + idLength + (colorMapType ? colorMapLength * Math.ceil(colorMapEntry / 8) : 0);
  const count = width * height;
  const out = new Uint8Array(count * 4);

  const put = (index: number, src: number) => {
    const o = index * 4;
    if (grey) {
      const v = data[src]!;
      out[o] = v;
      out[o + 1] = v;
      out[o + 2] = v;
      out[o + 3] = bpp === 2 ? data[src + 1]! : 255;
    } else {
      out[o] = data[src + 2]!;
      out[o + 1] = data[src + 1]!;
      out[o + 2] = data[src]!;
      out[o + 3] = bpp === 4 ? data[src + 3]! : 255;
    }
  };

  if (!rle) {
    if (at + count * bpp > data.length) throw new InpError('TGA ends too early');
    for (let i = 0; i < count; i += 1) put(i, at + i * bpp);
  } else {
    let i = 0;
    while (i < count) {
      if (at >= data.length) throw new InpError('TGA ends too early');
      const header = data[at++]!;
      const run = (header & 0x7f) + 1;
      if (header & 0x80) {
        if (at + bpp > data.length) throw new InpError('TGA ends too early');
        for (let k = 0; k < run && i < count; k += 1) put(i++, at);
        at += bpp;
      } else {
        if (at + run * bpp > data.length) throw new InpError('TGA ends too early');
        for (let k = 0; k < run && i < count; k += 1) {
          put(i++, at);
          at += bpp;
        }
      }
    }
  }

  // Bit 5 set: rows start at the top. Otherwise the picture is stored bottom up.
  if (!(descriptor & 0x20)) {
    const row = width * 4;
    const tmp = new Uint8Array(row);
    for (let y = 0; y < height >> 1; y += 1) {
      const a = y * row;
      const b = (height - 1 - y) * row;
      tmp.set(out.subarray(a, a + row));
      out.copyWithin(a, b, b + row);
      out.set(tmp, b);
    }
  }
  return { width, height, pixels: out };
}
