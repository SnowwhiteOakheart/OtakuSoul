// A small mesh avatar (Mesh Avatar Studio format) drawn from simple shapes: a round head with
// hair, two eyes and a body on a transparent 512×512 picture. Returns the files of a project folder
// (`files`) and the packed `.mavatar` (`archive`); both are checked with the runtime's own validator.
import { crc32, deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { packAvatar, validateAvatarFiles, validateRig } from 'mesh-avatar';

const SIZE = 512;
const SAMPLES = 24;

/** RGBA pixels → PNG bytes. */
function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A picture to paint: `paint(fn)` colours each pixel `fn(x, y)` returns (null = unchanged). */
function canvas(width, height) {
  const data = Buffer.alloc(width * height * 4);
  return {
    paint(fn) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const c = fn(x, y);
          if (c) data.set(c, (y * width + x) * 4);
        }
      }
    },
    crop([x0, y0, w, h]) {
      const out = canvas(w, h);
      out.paint((x, y) => [...data.subarray(((y + y0) * width + x + x0) * 4, ((y + y0) * width + x + x0) * 4 + 4)]);
      return out;
    },
    png: () => png(width, height, data),
  };
}

const inEllipse = (x, y, e) => ((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2 <= 1;
const round = (v) => Math.round(v * 100) / 100;
const ellipsePoints = (e, n) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.round(e.cx + Math.cos(a) * e.rx), Math.round(e.cy + Math.sin(a) * e.ry)];
  });

const SKIN = [250, 222, 200, 255];
const HAIR = [120, 90, 200, 255];
const CLOTH = [70, 110, 190, 255];
const LINE = [40, 30, 50, 255];
const WHITE = [255, 255, 255, 255];
const IRIS = [90, 60, 160, 255];

const head = { cx: 256, cy: 190, rx: 130, ry: 125 };
const body = { cx: 256, cy: 470, rx: 150, ry: 120 };
const eyeShapes = [
  { cx: 210, cy: 205, rx: 26, ry: 18 },
  { cx: 302, cy: 205, rx: 26, ry: 18 },
];

/** An eye of the rig: outline, region, span and the sampled lid curves. */
function rigEye(e) {
  const x0 = e.cx - e.rx + 2;
  const x1 = e.cx + e.rx - 2;
  const top = [];
  const bot = [];
  for (let i = 0; i < SAMPLES; i++) {
    const x = x0 + ((x1 - x0) * i) / (SAMPLES - 1);
    const h = e.ry * Math.sqrt(Math.max(0, 1 - ((x - e.cx) / e.rx) ** 2));
    top.push(round(e.cy - h));
    bot.push(round(e.cy + h));
  }
  return {
    opening: ellipsePoints(e, 18),
    roi: ellipsePoints({ ...e, rx: e.rx + 8, ry: e.ry + 8 }, 14),
    x0,
    x1,
    top,
    bot,
  };
}

/** Rectangle around an ellipse (with a margin), inside the picture. */
const rectOf = (e, pad = 4) => {
  const x = Math.max(0, Math.floor(e.cx - e.rx - pad));
  const y = Math.max(0, Math.floor(e.cy - e.ry - pad));
  return [x, y, Math.min(SIZE - x, Math.ceil(e.rx * 2 + pad * 2)), Math.min(SIZE - y, Math.ceil(e.ry * 2 + pad * 2))];
};

export function makeMavatarFiles(name = 'Testfigur') {
  const eyes = eyeShapes.map(rigEye);
  const rig = {
    version: 1,
    image: { width: SIZE, height: SIZE },
    head: { cx: head.cx, cy: head.cy, rx: head.rx, ry: head.ry, shiftX: 14, shiftY: 10, pivotX: 256, pivotY: 320, maxRoll: 0.12, weightBand: [300, 350], turnBand: [290, 360] },
    body: {
      pivotX: 256, pivotY: 560, maxRoll: 0.04, breathBand: [360, 500], rollBand: [360, 500],
      chest: { cx: 256, cy: 420, rx: 100, ry: 70 },
      shoulders: [{ cx: 150, cy: 380, rx: 40, ry: 36 }, { cx: 362, cy: 380, rx: 40, ry: 36 }],
    },
    face: {
      nose: { cx: 256, cy: 235, rx: 8, ry: 8 },
      mouth: { cx: 256, cy: 262, rx: 20, ry: 10 },
      eyeA: { ...eyeShapes[0] },
      eyeB: { ...eyeShapes[1] },
      earL: { cx: 130, cy: 220, rx: 10, ry: 16 },
      earR: { cx: 382, cy: 220, rx: 10, ry: 16 },
      brow: { cx: 256, cy: 178, rx: 80, ry: 10, band: [172, 186] },
      jaw: { cx: 256, cy: 280, rx: 60, ry: 22, band: [272, 292] },
    },
    eyes,
    mouth: { cx: 256, cy: 262, angle: 0, halfLen: 12, bow: -1, area: { cx: 256, cy: 262, rx: 18, ry: 10, angle: 0 } },
    cheeks: [[200, 245], [312, 245]],
    strands: [
      { name: 'side_left', nodes: [[150, 120], [130, 200], [125, 280], [130, 340]], sigma: 10, k: 1, max: 6 },
      { name: 'side_right', nodes: [[362, 120], [382, 200], [387, 280], [382, 340]], sigma: 10, k: 1, max: 6 },
    ],
    mesh: { baseCell: 10, fine: { x0: 100, x1: 412, y0: 50, y1: 320, cell: 5 }, handCell: 10, tasselCell: 6, eyeBallCell: 2, eyeCell: 2, spriteCell: 3 },
    view: { padTop: 0.06, padSide: 0.04, gazeCenter: [256, 205] },
  };

  // Base: body, head with hair cap and side locks, a mouth line; the eyes are left out (skin).
  const hairCap = (x, y) => inEllipse(x, y, { cx: 256, cy: 150, rx: 140, ry: 105 }) && y < 165;
  const sideLock = (x, y) => y > 110 && y < 340 && (Math.abs(x - 132) < 18 || Math.abs(x - 380) < 18);
  const base = canvas(SIZE, SIZE);
  base.paint((x, y) => {
    if (hairCap(x, y) || sideLock(x, y)) return HAIR;
    if (inEllipse(x, y, head)) {
      if (Math.abs(y - 262) <= 1 && Math.abs(x - 256) <= 12) return LINE;
      return SKIN;
    }
    if (inEllipse(x, y, body)) return CLOTH;
    return null;
  });
  const hairmask = canvas(SIZE, SIZE);
  hairmask.paint((x, y) => (hairCap(x, y) || sideLock(x, y) ? [255, 0, 0, 255] : [0, 0, 0, 255]));

  const layers = {};
  const files = {};
  const enc = (text) => new TextEncoder().encode(text);
  eyeShapes.forEach((e, i) => {
    const rect = rectOf(e);
    const ball = canvas(SIZE, SIZE);
    ball.paint((x, y) => (inEllipse(x, y, { cx: e.cx, cy: e.cy, rx: 10, ry: 13 }) ? IRIS : inEllipse(x, y, e) ? WHITE : null));
    const lash = canvas(SIZE, SIZE);
    lash.paint((x, y) => (Math.abs(((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2 - 1) < 0.18 && y <= e.cy ? LINE : null));
    const low = canvas(SIZE, SIZE);
    low.paint((x, y) => (Math.abs(((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2 - 1) < 0.1 && y > e.cy ? LINE : null));
    for (const [part, picture] of [['ball', ball], ['lash', lash], ['low', low], ['crease', canvas(SIZE, SIZE)]]) {
      layers[`eye${i}_${part}`] = rect;
      files[`built/eye${i}_${part}.png`] = picture.crop(rect).png();
    }
  });
  const layerMeta = {
    version: 1,
    size: [SIZE, SIZE],
    build: 'otakusoul-e2e',
    layers,
    eyes: eyes.map(({ x0, x1, top, bot }) => ({ x0, x1, top, bot })),
  };
  files['built/base.png'] = base.png();
  files['built/hairmask.png'] = hairmask.png();
  files['built/layers.json'] = enc(JSON.stringify(layerMeta));
  files['rig.json'] = enc(JSON.stringify(rig));
  files['avatar.json'] = enc(JSON.stringify({ format: 'mesh-avatar', version: 1, name, author: 'OtakuSoul E2E' }));
  for (const [key, value] of Object.entries(files)) files[key] = new Uint8Array(value);

  const errors = validateRig(rig);
  if (errors.length) throw new Error(`Test-Rig ungültig: ${errors.join('; ')}`);
  const problems = validateAvatarFiles(files);
  if (problems.length) throw new Error(`Test-Avatar ungültig: ${problems.join('; ')}`);
  return files;
}

/** The test avatar as a `.mavatar` archive. */
export function makeMavatar(name) {
  return packAvatar(makeMavatarFiles(name));
}

/** Writes the test avatar as a Studio project folder (with a work file that must stay out). */
export function writeMavatarFolder(dir, name) {
  for (const [file, bytes] of Object.entries(makeMavatarFiles(name))) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), bytes);
  }
  writeFileSync(path.join(dir, 'HANDOVER.md'), 'notes');
}
