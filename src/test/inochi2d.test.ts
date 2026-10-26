import { describe, expect, it } from 'vitest';
import { cleanText, decodePng, decodeTga, InpError, isInpFile, parseInp } from '../services/inochi2d/inp';
import { axisRange, Puppet } from '../services/inochi2d/puppet';
import { findChannels, poseFor, PuppetAnimator } from '../services/inochi2d/controls';
import { resolveInochi2dPath, usesInochi2d } from '../components/avatars/avatarMatch';
import type { CharacterProfile } from '../types';

/** Builds an `.inp` file: header, JSON and textures (encoding code, bytes). */
function inp(json: unknown, textures: [number, Uint8Array][] = []): Uint8Array {
  const enc = new TextEncoder();
  const payload = enc.encode(JSON.stringify(json));
  const parts: number[] = [...enc.encode('TRNSRTS\0')];
  const u32 = (n: number) => parts.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  u32(payload.length);
  parts.push(...payload, ...enc.encode('TEX_SECT'));
  u32(textures.length);
  for (const [code, data] of textures) {
    u32(data.length);
    parts.push(code, ...data);
  }
  return Uint8Array.from(parts);
}

const transform = (x = 0, y = 0) => ({ trans: [x, y, 0], rot: [0, 0, 0], scale: [1, 1] });
const node = (uuid: number, type: string, extra: Record<string, unknown> = {}) => ({
  uuid, name: `n${uuid}\u0000`, type, enabled: true, zsort: 0, lockToRoot: false, transform: transform(), children: [], ...extra,
});
const quad = { verts: [0, 0, 10, 0, 0, 10, 10, 10], uvs: [0, 0, 1, 0, 0, 1, 1, 1], indices: [0, 1, 2, 2, 1, 3], origin: [0, 0] };
const part = (uuid: number, extra: Record<string, unknown> = {}) =>
  node(uuid, 'Part', { mesh: quad, textures: [0, 4294967295, 4294967295], blend_mode: 'Normal', opacity: 1, ...extra });

/** A puppet with one part moved by a 1D parameter "Move" (0…1 → x 0…100) and one 2D "Head:: Yaw-Pitch". */
function samplePuppet(): Puppet {
  const json = {
    meta: { name: 'Test\u0000', version: '1', thumbnailId: 4294967295, preservePixels: false },
    physics: { pixelsPerMeter: 1000, gravity: 9.8 },
    nodes: node(1, 'Node', {
      children: [
        part(2, { zsort: 1 }),
        part(3, { zsort: -1, masks: [{ source: 4, mode: 'Mask' }] }),
        node(4, 'Mask', { mesh: quad }),
      ],
    }),
    param: [
      {
        uuid: 10, name: 'Move', is_vec2: false, min: [0, 0], max: [1, 1], defaults: [0, 0], axis_points: [[0, 1], [0]],
        bindings: [{ node: 2, param_name: 'transform.t.x', interpolate_mode: 'Linear', isSet: [[true], [true]], values: [[0], [100]] }],
      },
      {
        uuid: 11, name: 'Head:: Yaw-Pitch', is_vec2: true, min: [-1, -1], max: [1, 1], defaults: [0, 0],
        axis_points: [[0, 0.5, 1], [0, 1]],
        bindings: [{
          node: 3, param_name: 'deform', interpolate_mode: 'Linear', isSet: [[true, true], [true, true], [true, true]],
          values: [
            [Array(4).fill([-4, 0]), Array(4).fill([-4, 2])],
            [Array(4).fill([0, 0]), Array(4).fill([0, 2])],
            [Array(4).fill([4, 0]), Array(4).fill([4, 2])],
          ],
        }],
      },
    ],
  };
  return new Puppet(parseInp(inp(json, [[1, new Uint8Array(0)]])));
}

describe('Inochi2D file format', () => {
  it('reads the description, the textures and refuses other files', () => {
    const file = parseInp(inp({ nodes: {} }, [[0, Uint8Array.of(1, 2)], [1, Uint8Array.of(3)]]));
    expect(file.textures.map((t) => [t.encoding, [...t.data]])).toEqual([['png', [1, 2]], ['tga', [3]]]);
    expect(isInpFile(Uint8Array.of(80, 75, 3, 4))).toBe(false);
    expect(() => parseInp(Uint8Array.of(1, 2, 3))).toThrow(InpError);
    const cut = inp({ nodes: {} }, [[0, Uint8Array.of(1, 2, 3, 4)]]);
    expect(() => parseInp(cut.subarray(0, cut.length - 2))).toThrow(InpError);
    expect(cleanText('seagetch\u0000\u0000')).toBe('seagetch');
  });

  it('decodes raw and run-length TGA, bottom-up rows flipped', () => {
    const header = (type: number, descriptor: number) => [0, 0, type, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1, 0, 32, descriptor];
    // BGRA: blue then red pixel, stored bottom-up (one row, so order stays).
    const raw = decodeTga(Uint8Array.from([...header(2, 8), 255, 0, 0, 255, 0, 0, 255, 128]));
    expect([...raw.pixels]).toEqual([0, 0, 255, 255, 255, 0, 0, 128]);
    // Run of two identical pixels.
    const rle = decodeTga(Uint8Array.from([...header(10, 0x28), 0x81, 0, 255, 0, 255]));
    expect([...rle.pixels]).toEqual([0, 255, 0, 255, 0, 255, 0, 255]);
    expect(() => decodeTga(Uint8Array.from(header(1, 0)))).toThrow(InpError);
  });
});

/** A PNG with the given filtered rows (each starting with its filter byte); CRCs are not checked. */
async function png(width: number, height: number, colorType: number, rows: number[]): Promise<Uint8Array> {
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length);
    new DataView(out.buffer).setUint32(0, body.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(body, 8);
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, width);
  new DataView(ihdr.buffer).setUint32(4, height);
  ihdr.set([8, colorType, 0, 0, 0], 8);
  const stream = new Blob([Uint8Array.from(rows)]).stream().pipeThrough(new CompressionStream('deflate'));
  const idat = new Uint8Array(await new Response(stream).arrayBuffer());
  return Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', ihdr), ...chunk('IDAT', idat), ...chunk('IEND', new Uint8Array())]);
}

describe('Inochi2D PNG textures', () => {
  it('keeps the stored (premultiplied) bytes and undoes the row filters', async () => {
    // Two RGBA pixels per row: row 1 unfiltered, row 2 "sub" and row 3 "up".
    const image = await decodePng(await png(2, 3, 6, [
      0, 62, 62, 62, 63, 10, 20, 30, 40,
      1, 1, 2, 3, 4, 1, 1, 1, 1,
      2, 5, 5, 5, 5, 0, 0, 0, 0,
    ]));
    expect([...image.pixels]).toEqual([
      62, 62, 62, 63, 10, 20, 30, 40,
      1, 2, 3, 4, 2, 3, 4, 5,
      6, 7, 8, 9, 2, 3, 4, 5,
    ]);
    const rgb = await decodePng(await png(1, 1, 2, [0, 9, 8, 7]));
    expect([...rgb.pixels]).toEqual([9, 8, 7, 255]);
    await expect(decodePng(Uint8Array.of(1, 2, 3))).rejects.toThrow(InpError);
  });
});

describe('Inochi2D puppet', () => {
  it('finds the neighbouring axis points', () => {
    expect(axisRange([0, 0.5, 1], 0.25)).toEqual([0, 1]);
    expect(axisRange([0, 0.5, 1], 0.5)).toEqual([1, 2]);
    expect(axisRange([0, 0.5, 1], 1)).toEqual([1, 2]);
    expect(axisRange([0], 0)).toEqual([0, 0]);
  });

  it('moves parts by parameters, interpolating between keys', () => {
    const p = samplePuppet();
    expect(p.meta.name).toBe('Test');
    p.setParam('Move', 0.25);
    p.update(0);
    expect(p.node(2)!.abs[12]).toBeCloseTo(25);
    p.setParam('Move', 5); // clamped to the range
    p.update(0);
    expect(p.node(2)!.abs[12]).toBeCloseTo(100);
  });

  it('deforms meshes bilinearly over a 2D parameter', () => {
    const p = samplePuppet();
    p.setParam('Head:: Yaw-Pitch', 0.5, 0); // x halfway to the right, y in the middle
    p.update(0);
    const deform = p.node(3)!.part!.deform;
    expect(deform[0]).toBeCloseTo(2);
    expect(deform[1]).toBeCloseTo(1);
  });

  it('draws back to front and never draws mask nodes', () => {
    const p = samplePuppet();
    expect(p.drawList.map((n) => n.uuid)).toEqual([2, 3]);
    expect(p.node(4)!.maskOnly).toBe(true);
    // The 2D parameter's default (middle) already deforms part 3 one unit down.
    expect(p.bounds()).toEqual([0, 0, 10, 11]);
  });

  it('keeps the pendulum physics finite over long, uneven frames', () => {
    const json = {
      meta: {}, physics: { pixelsPerMeter: 1000, gravity: 9.8 },
      nodes: node(1, 'Node', {
        children: [part(2), node(5, 'SimplePhysics', {
          param: 12, model_type: 'SpringPendulum', map_mode: 'XY', gravity: 1, length: 50, frequency: 1,
          angle_damping: 0.5, length_damping: 0.5, output_scale: [1, 1],
        })],
      }),
      param: [{
        uuid: 12, name: 'Hair:: Physics', is_vec2: true, min: [-1, -1], max: [1, 1], defaults: [0, 0], axis_points: [[0, 1], [0, 1]],
        bindings: [{ node: 2, param_name: 'transform.t.x', interpolate_mode: 'Linear', isSet: [[true, true], [true, true]], values: [[-10, -10], [10, 10]] }],
      }],
    };
    const p = new Puppet(parseInp(inp(json)));
    for (let i = 0; i < 400; i += 1) p.update(i % 7 === 0 ? 0.3 : 1 / 60);
    const value = p.getParam('Hair:: Physics')!;
    expect(value.every(Number.isFinite)).toBe(true);
    expect(p.params.get('Hair:: Physics')!.driven).toBe(true);
    expect(Number.isFinite(p.node(2)!.abs[12])).toBe(true);
  });
});

describe('Inochi2D controls', () => {
  const withParams = (names: [string, boolean, [number, number], [number, number]][]) =>
    new Puppet(parseInp(inp({
      meta: {}, physics: {}, nodes: node(1, 'Node'),
      param: names.map(([name, isVec2, min, max], i) => ({
        uuid: 100 + i, name, is_vec2: isVec2, min, max, defaults: [0, 0], axis_points: [[0, 1], [0, 1]], bindings: [],
      })),
    })));

  it('finds Inochi2D, own and Live2D-style names', () => {
    const inochi = findChannels(withParams([
      ['Head:: Yaw-Pitch', true, [-1, -1], [1, 1]], ['Eye:: Left:: Blink', false, [0, 0], [1, 1]],
      ['Mouth:: Shape', true, [0, 0], [1, 1]], ['Breath', false, [0, 0], [1, 1]],
    ]));
    expect(inochi.headYaw?.param.name).toBe('Head:: Yaw-Pitch');
    expect(inochi.headPitch?.axis).toBe(1);
    expect(inochi.blinkLeft?.inverted).toBe(false);
    expect([inochi.smile?.axis, inochi.mouthOpen?.axis]).toEqual([0, 1]);

    const own = findChannels(withParams([
      ['Head::Turn', false, [-1, 0], [1, 1]], ['Head::Nod', false, [-1, 0], [1, 1]], ['Head::Tilt', false, [-1, 0], [1, 1]],
      ['Eye::L::Open', false, [0, 0], [1, 1]], ['Eyes::LookX', false, [-1, 0], [1, 1]], ['Eyes::LookY', false, [-1, 0], [1, 1]],
      ['Mouth::Open', false, [0, 0], [1, 1]], ['Expression::Brows', false, [-1, 0], [1, 1]], ['Cheeks::Blush', false, [0, 0], [1, 1]],
    ]));
    expect([own.headYaw?.param.name, own.headPitch?.param.name, own.headRoll?.param.name]).toEqual(['Head::Turn', 'Head::Nod', 'Head::Tilt']);
    expect(own.blinkLeft?.inverted).toBe(true);
    expect(own.eyeX?.map((a) => a.param.name)).toEqual(['Eyes::LookX']);
    expect(own.eyeY?.map((a) => a.param.name)).toEqual(['Eyes::LookY']);
    expect([own.mouthOpen?.param.name, own.brows?.param.name, own.cheek?.param.name]).toEqual(['Mouth::Open', 'Expression::Brows', 'Cheeks::Blush']);

    const live2d = findChannels(withParams([['ParamAngleX', false, [-30, 0], [30, 1]], ['ParamMouthOpenY', false, [0, 0], [1, 1]], ['ParamEyeLOpen', false, [0, 0], [1, 1]]]));
    expect(live2d.headYaw?.param.name).toBe('ParamAngleX');
    expect(live2d.mouthOpen?.param.name).toBe('ParamMouthOpenY');
    expect(live2d.blinkLeft?.inverted).toBe(true);
  });

  it('opens the mouth with the voice and smiles with joy', () => {
    const p = withParams([['Mouth:: Shape', true, [0, 0], [1, 1]], ['Eye::L::Open', false, [0, 0], [1, 1]]]);
    const animator = new PuppetAnimator(p);
    animator.level = 0.5;
    animator.emotion = 'joy';
    for (let i = 0; i < 60; i += 1) animator.update(1 / 60);
    const [smile, open] = p.getParam('Mouth:: Shape')!;
    expect(open).toBeGreaterThan(0.9);
    expect(smile).toBeGreaterThan(0.9);
    // Open eyes mean 1 on an "Open" parameter.
    expect(p.getParam('Eye::L::Open')![0]).toBeGreaterThan(0.5);
    animator.level = 0;
    animator.emotion = 'sadness';
    for (let i = 0; i < 120; i += 1) animator.update(1 / 60);
    expect(p.getParam('Mouth:: Shape')![0]).toBeLessThan(0.15);
    expect(poseFor('unknown-mood')).toEqual(poseFor('neutral'));
  });
});

describe('Inochi2D character match', () => {
  const character = (extensions: Record<string, unknown>) =>
    ({ id: 'c', card: { data: { name: 'C', extensions } } }) as unknown as CharacterProfile;
  const models = [
    { id: 'Aka.inx', model_path: '/data/inochi2d/Aka.inx' },
    { id: 'nagatoro.inp', model_path: '/data/inochi2d/nagatoro.inp' },
  ];

  it('takes the card’s puppet, else the default, else the first', () => {
    expect(usesInochi2d(character({ custom_inochi2d: 'aka.inx' }), models[0]!)).toBe(true);
    expect(resolveInochi2dPath(character({ custom_inochi2d: 'Nagatoro.inp' }), models, null)).toBe('/data/inochi2d/nagatoro.inp');
    expect(resolveInochi2dPath(character({}), models, '/data/inochi2d/nagatoro.inp')).toBe('/data/inochi2d/nagatoro.inp');
    expect(resolveInochi2dPath(character({ custom_inochi2d: 'gone.inp' }), models, null)).toBe('/data/inochi2d/Aka.inx');
    expect(resolveInochi2dPath(null, [], null)).toBe('');
  });
});
