// A tiny MMD model (PMX 2.0) and motion (VMD) for tests, made here so no third-party model is
// needed: boxes for body, head and arms on the standard bones (センター, 上半身, 首, 頭, 左右腕,
// 左右ひじ), morphs あ and まばたき, and one texture named in a different case than the file.

class Writer {
  parts = [];
  bytes(buffer) { this.parts.push(Buffer.from(buffer)); return this; }
  u8(v) { return this.bytes([v & 0xff]); }
  i8(v) { const b = Buffer.alloc(1); b.writeInt8(v); return this.bytes(b); }
  i16(v) { const b = Buffer.alloc(2); b.writeInt16LE(v); return this.bytes(b); }
  u16(v) { const b = Buffer.alloc(2); b.writeUInt16LE(v); return this.bytes(b); }
  i32(v) { const b = Buffer.alloc(4); b.writeInt32LE(v); return this.bytes(b); }
  f32(...values) { for (const v of values) { const b = Buffer.alloc(4); b.writeFloatLE(v); this.bytes(b); } return this; }
  text(s) { const b = Buffer.from(s, 'utf16le'); this.i32(b.length); return this.bytes(b); }
  build() { return Buffer.concat(this.parts); }
}

const BONES = [
  // name, position, parent
  ['センター', [0, 8, 0], -1],
  ['上半身', [0, 10, 0], 0],
  ['首', [0, 15, 0], 1],
  ['頭', [0, 16, 0], 2],
  ['左腕', [1.5, 14.5, 0], 1],
  ['左ひじ', [5, 14.5, 0], 4],
  ['右腕', [-1.5, 14.5, 0], 1],
  ['右ひじ', [-5, 14.5, 0], 6],
];

/** A box between two corners, weighted fully to one bone. */
function box(vertices, faces, [x0, y0, z0], [x1, y1, z1], bone) {
  const base = vertices.length;
  for (const z of [z0, z1]) for (const y of [y0, y1]) for (const x of [x0, x1]) vertices.push({ p: [x, y, z], bone });
  const quads = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  for (const [a, b, c, d] of quads) faces.push(base + a, base + b, base + c, base + a, base + c, base + d);
  return base;
}

export function makePmx() {
  const vertices = [];
  const faces = [];
  box(vertices, faces, [-1.5, 8, -1], [1.5, 15, 1], 1); // body
  const head = box(vertices, faces, [-1.6, 15.5, -1.6], [1.6, 19, 1.6], 3); // head
  box(vertices, faces, [1.5, 14, -0.5], [5, 15, 0.5], 4); // left upper arm (straight out: T-pose)
  box(vertices, faces, [5, 14, -0.5], [8, 15, 0.5], 5);
  box(vertices, faces, [-5, 14, -0.5], [-1.5, 15, 0.5], 6);
  box(vertices, faces, [-8, 14, -0.5], [-5, 15, 0.5], 7);

  const w = new Writer();
  w.bytes(Buffer.from('PMX ')).f32(2.0).u8(8).bytes([0, 0, 4, 1, 1, 2, 1, 1]);
  w.text('テスト').text('Test').text('').text('');
  w.i32(vertices.length);
  for (const { p, bone } of vertices) w.f32(...p, 0, 1, 0, 0, 0).u8(0).i16(bone).f32(1);
  w.i32(faces.length);
  for (const index of faces) w.i32(index);
  w.i32(1).text('tex\\Skin.PNG');
  w.i32(1).text('材質').text('material').f32(1, 1, 1, 1, 0, 0, 0, 1, 0.5, 0.5, 0.5).u8(0).f32(0, 0, 0, 1, 1)
    .i8(0).i8(-1).u8(0).u8(1).u8(0).text('').i32(faces.length);
  w.i32(BONES.length);
  for (const [name, position, parent] of BONES) w.text(name).text('').f32(...position).i16(parent).i32(0).u16(0x001e).f32(0, 1, 0);
  // Morphs: あ opens the "mouth" (front of the head drops), まばたき moves it slightly.
  const front = [0, 1, 2, 3].map((i) => head + 4 + i);
  w.i32(2);
  w.text('あ').text('a').u8(3).u8(1).i32(front.length);
  for (const v of front) w.i32(v).f32(0, -0.5, 0);
  w.text('まばたき').text('blink').u8(1).u8(1).i32(1).i32(head + 4).f32(0, -0.1, 0);
  w.i32(0); // display frames
  w.i32(0); // rigid bodies
  w.i32(0); // joints
  return w.build();
}

/** Shift_JIS bytes of the bone names used (Node cannot encode Shift_JIS itself). */
const SJIS = { 右腕: [137, 69, 152, 114], 左腕: [141, 182, 152, 114] };

/** A VMD motion (30 fps) that raises the right arm and lowers it again over `seconds`. */
export function makeVmd(seconds = 2) {
  const fixed = (bytes, length) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(length - bytes.length)]);
  const frames = Math.round(seconds * 30);
  const keys = [[0, 0], [Math.round(frames / 4), -1.1], [Math.round(frames / 2), -0.7], [Math.round((3 * frames) / 4), -1.1], [frames, 0]];
  const w = new Writer();
  w.bytes(fixed(Buffer.from('Vocaloid Motion Data 0002'), 30)).bytes(fixed(Buffer.from('test'), 20));
  w.i32(keys.length);
  for (const [frame, angle] of keys) {
    // Rotation about Z; in the left-handed MMD space a negative angle lifts the right arm.
    w.bytes(fixed(SJIS['右腕'], 15)).i32(frame).f32(0, 0, 0, 0, 0, Math.sin(angle / 2), Math.cos(angle / 2));
    w.bytes(Buffer.alloc(64, 20));
  }
  w.i32(0).i32(0).i32(0).i32(0); // morphs, camera, light, shadow
  return w.build();
}

/** A 2×2 PNG for the texture. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4cGLfhxP7GCAUAEW+Cdkl5c+GAAAAAElFTkSuQmCC',
  'base64',
);
