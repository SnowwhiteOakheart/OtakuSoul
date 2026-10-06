// Builds a tiny VRM animation (.vrma, binary glTF with VRMC_vrm_animation) for tests: the right
// arm swings up and back down, like a wave. Made here so no third-party motion file is needed.
const quatZ = (angle) => [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];

export function makeWaveVrma(seconds = 2) {
  const times = [0, seconds * 0.25, seconds * 0.5, seconds * 0.75, seconds];
  // Negative about +Z lifts the right arm (it points along -X in the VRM rest pose).
  const angles = [0, -1.2, -0.8, -1.2, 0];
  const input = new Float32Array(times);
  const output = new Float32Array(angles.flatMap(quatZ));
  const binary = Buffer.concat([Buffer.from(input.buffer), Buffer.from(output.buffer)]);
  const json = {
    asset: { version: '2.0', generator: 'OtakuSoul e2e' },
    extensionsUsed: ['VRMC_vrm_animation'],
    extensions: {
      VRMC_vrm_animation: {
        specVersion: '1.0',
        humanoid: { humanBones: { hips: { node: 0 }, spine: { node: 1 }, rightUpperArm: { node: 2 } } },
      },
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: 'hips', translation: [0, 1, 0], children: [1] },
      { name: 'spine', translation: [0, 0.1, 0], children: [2] },
      { name: 'rightUpperArm', translation: [-0.2, 0.3, 0] },
    ],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: input.byteLength },
      { buffer: 0, byteOffset: input.byteLength, byteLength: output.byteLength },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: times.length, type: 'SCALAR', min: [0], max: [seconds] },
      { bufferView: 1, componentType: 5126, count: times.length, type: 'VEC4' },
    ],
    animations: [{ channels: [{ sampler: 0, target: { node: 2, path: 'rotation' } }], samplers: [{ input: 0, output: 1, interpolation: 'LINEAR' }] }],
  };
  const pad = (buffer, fill) => Buffer.concat([buffer, Buffer.alloc((4 - (buffer.length % 4)) % 4, fill)]);
  const jsonChunk = pad(Buffer.from(JSON.stringify(json)), 0x20);
  const binChunk = pad(binary, 0);
  const header = Buffer.alloc(12);
  header.write('glTF', 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const chunk = (data, type) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.write(type, 4);
    return Buffer.concat([head, data]);
  };
  return Buffer.concat([header, chunk(jsonChunk, 'JSON'), chunk(binChunk, 'BIN\0')]);
}
