import { avatarTimer } from './avatarTiming';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { api } from '../../services/api';

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ktx2: 'image/ktx2',
  bin: 'application/octet-stream',
};

const dirname = (path: string) => path.replace(/[\\/][^\\/]*$/, '');
const normalise = (uri: string) => {
  let plain = uri;
  try {
    plain = decodeURIComponent(uri);
  } catch {
    // Not percent-encoded after all.
  }
  return plain.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
};

/**
 * Reads a glTF avatar: a `.glb` as it is, a `.gltf` together with the `.bin` buffers and textures it
 * names. Those are read through the app (any case of the file names, as packs come from Windows) and
 * handed to three.js as blob URLs, which also works on the dev server where WebKitGTK refuses
 * `asset://` images.
 */
export async function loadGltfAvatar(modelPath: string): Promise<GLTF> {
  const lap = avatarTimer(modelPath);
  const bytes = await api.readFileBinary(modelPath);
  if (!/\.gltf$/i.test(modelPath)) {
    lap('read');
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer as ArrayBuffer, '');
    lap('parse');
    return gltf;
  }

  const text = new TextDecoder().decode(bytes);
  const json = JSON.parse(text) as { buffers?: { uri?: string }[]; images?: { uri?: string }[] };
  const uris = [...(json.buffers ?? []), ...(json.images ?? [])]
    .map((entry) => entry.uri)
    .filter((uri): uri is string => !!uri && !/^(data|blob|https?):/i.test(uri));
  const files = await api.listAvatarModelFiles(modelPath);
  const byLowerCase = new Map(files.map((file) => [file.toLowerCase(), file]));
  const folder = dirname(modelPath);
  const blobs = new Map<string, string>();
  for (const uri of new Set(uris)) {
    const relative = byLowerCase.get(normalise(uri)) ?? normalise(uri);
    const data = await api.readFileBinary(`${folder}/${relative}`);
    const type = MIME[relative.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
    blobs.set(normalise(uri), URL.createObjectURL(new Blob([data as BlobPart], { type })));
  }
  lap('read');
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => blobs.get(normalise(url)) ?? url);
  try {
    const gltf = await new GLTFLoader(manager).parseAsync(text, '');
    lap('parse');
    return gltf;
  } finally {
    for (const url of blobs.values()) URL.revokeObjectURL(url);
  }
}
