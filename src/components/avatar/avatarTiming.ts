/**
 * Load phases of a 3D avatar as `performance.measure` entries (`avatar:read`, `avatar:parse`,
 * `avatar:setup`, `avatar:firstFrame`, detail = model path): free when nobody looks, read by
 * `e2e/local-avatars.mjs` to see where loading a large model spends its time.
 */
export function avatarTimer(modelPath: string) {
  let last = performance.now();
  return (phase: string) => {
    const now = performance.now();
    try {
      performance.measure(`avatar:${phase}`, { start: last, end: now, detail: modelPath });
    } catch {
      // Older engines without measure options: timing is only a diagnostic.
    }
    last = now;
  };
}
