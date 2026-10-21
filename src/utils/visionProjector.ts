/** File name of a path, either separator. */
const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** Projectors the app downloaded for a model are saved as `<model file>-mmproj-….gguf`. */
const OWNED = /^(.+)-mmproj[^/\\]*\.gguf$/i;

/**
 * Which vision projector goes with `modelPath`: its own downloaded one (`<model>-mmproj-…`), or
 * none when the current one was downloaded for another model (it would not load with this one).
 * `undefined` keeps the current choice (a projector the user picked by hand, or none at all).
 */
export function projectorFor(modelPath: string, current: string | null | undefined, projectors: string[]): string | null | undefined {
  const stem = baseName(modelPath).replace(/\.gguf$/i, '');
  const own = projectors.find((path) => OWNED.exec(baseName(path))?.[1] === stem);
  if (own) return own;
  const owner = current ? OWNED.exec(baseName(current))?.[1] : undefined;
  if (owner && owner !== stem) return null;
  return undefined;
}
