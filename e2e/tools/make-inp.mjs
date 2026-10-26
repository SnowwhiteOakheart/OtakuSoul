// A small Inochi2D puppet (.inp) for tests: a body, a face with a mouth that opens with
// "Mouth:: Open", eyes that close with "Eye:: Left:: Blink", a hair strand on a physics pendulum and
// a `Mask` node. Textures are raw TGA, so no picture library is needed.

/** Uncompressed 32-bit TGA, one colour, rows from the top. */
function tga(width, height, [r, g, b, a]) {
  const header = [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, width & 255, width >> 8, height & 255, height >> 8, 32, 0x28];
  const pixels = [];
  for (let i = 0; i < width * height; i += 1) {
    // Premultiplied, as Inochi Creator stores textures.
    pixels.push(Math.round((b * a) / 255), Math.round((g * a) / 255), Math.round((r * a) / 255), a);
  }
  return Uint8Array.from([...header, ...pixels]);
}

const quad = (w, h) => ({
  verts: [-w / 2, -h / 2, w / 2, -h / 2, -w / 2, h / 2, w / 2, h / 2],
  uvs: [0, 0, 1, 0, 0, 1, 1, 1],
  indices: [0, 1, 2, 2, 1, 3],
  origin: [0, 0],
});
const transform = (x = 0, y = 0) => ({ trans: [x, y, 0], rot: [0, 0, 0], scale: [1, 1] });
let nextUuid = 1;
const node = (name, type, extra = {}) => ({
  uuid: nextUuid++, name, type, enabled: true, zsort: 0, lockToRoot: false, transform: transform(), children: [], ...extra,
});
const part = (name, texture, w, h, extra = {}) =>
  node(name, 'Part', { mesh: quad(w, h), textures: [texture, 4294967295, 4294967295], blend_mode: 'Normal', tint: [1, 1, 1], screenTint: [0, 0, 0], opacity: 1, mask_threshold: 0.5, ...extra });

export function makeInp({ name = 'Testpuppe' } = {}) {
  nextUuid = 1;
  const body = part('Body', 0, 300, 600, { transform: transform(0, 200), zsort: 1 });
  const face = part('Face', 1, 240, 240, { transform: transform(0, -200) });
  const mouth = part('Mouth', 2, 80, 30, { transform: transform(0, -140), zsort: -1 });
  const eye = part('Eye:: Left', 3, 40, 40, { transform: transform(-50, -230), zsort: -1 });
  const clip = node('Eye Clip', 'Mask', { mesh: quad(60, 60), transform: transform(-50, -230) });
  eye.masks = [{ source: clip.uuid, mode: 'Mask' }];
  const hair = part('Hair', 4, 30, 200, { transform: transform(110, -150), zsort: 0.5 });
  const physics = node('Hair Physics', 'SimplePhysics', {
    transform: transform(110, -250), param: 103, model_type: 'Pendulum', map_mode: 'AngleLength',
    gravity: 1, length: 100, frequency: 1, angle_damping: 0.5, length_damping: 0.5, output_scale: [1, 1],
  });
  const root = node('Root', 'Node', { children: [body, face, mouth, eye, clip, hair, physics] });
  const param = (uuid, pname, bindings, extra = {}) => ({
    uuid, name: pname, is_vec2: false, min: [0, 0], max: [1, 1], defaults: [0, 0], axis_points: [[0, 1], [0]], bindings, ...extra,
  });
  const json = {
    meta: { name, version: '0.8', rigger: 'OtakuSoul', artist: 'OtakuSoul', licenseURL: null, thumbnailId: 4294967295, preservePixels: false },
    physics: { pixelsPerMeter: 1000, gravity: 9.8 },
    nodes: root,
    param: [
      param(101, 'Mouth:: Open', [{ node: mouth.uuid, param_name: 'transform.s.y', interpolate_mode: 'Linear', isSet: [[true], [true]], values: [[1], [3]] }]),
      param(102, 'Eye:: Left:: Blink', [{ node: eye.uuid, param_name: 'opacity', interpolate_mode: 'Linear', isSet: [[true], [true]], values: [[1], [0]] }]),
      param(103, 'Hair:: Physics', [{ node: hair.uuid, param_name: 'transform.r.z', interpolate_mode: 'Linear', isSet: [[true, true], [true, true]], values: [[-0.5, -0.5], [0.5, 0.5]] }], {
        is_vec2: true, min: [-1, 0], max: [1, 2], axis_points: [[0, 1], [0, 1]],
      }),
      param(104, 'Head:: Yaw-Pitch', [{ node: face.uuid, param_name: 'transform.t.x', interpolate_mode: 'Linear', isSet: [[true, true], [true, true]], values: [[-20, -20], [20, 20]] }], {
        is_vec2: true, min: [-1, -1], max: [1, 1], axis_points: [[0, 1], [0, 1]],
      }),
    ],
  };
  const textures = [
    tga(8, 8, [240, 240, 250, 255]),
    tga(8, 8, [250, 200, 170, 255]),
    tga(8, 8, [200, 60, 80, 255]),
    tga(8, 8, [60, 40, 30, 255]),
    tga(8, 8, [40, 40, 60, 255]),
  ];
  const enc = new TextEncoder();
  const payload = enc.encode(JSON.stringify(json));
  const out = [...enc.encode('TRNSRTS\0')];
  const u32 = (n) => out.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  u32(payload.length);
  out.push(...payload, ...enc.encode('TEX_SECT'));
  u32(textures.length);
  for (const t of textures) {
    u32(t.length);
    out.push(1, ...t);
  }
  return Uint8Array.from(out);
}
