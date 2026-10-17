/**
 * Preview pictures of avatars. A WebGL canvas keeps its picture only until the frame is shown, so
 * the viewer renders once more and hands the canvas over in the same call: the manager sends an
 * event to the canvas, the viewer answers it synchronously (`answerSnapshots`).
 */
const SNAPSHOT_EVENT = 'otakusoul-avatar-snapshot';

interface SnapshotDetail {
  done: (canvas: HTMLCanvasElement) => void;
}

/** Size of the pictures in the avatar overview (4:3 like its cards). */
export const THUMBNAIL_WIDTH = 320;
export const THUMBNAIL_HEIGHT = 240;
/** Below this share of visible pixels nothing was drawn yet (model still loading). */
const MIN_COVERAGE = 0.02;

/** Lets the manager take a picture of `canvas`; `render` draws the current frame. Returns the cleanup. */
export function answerSnapshots(canvas: HTMLCanvasElement, render: () => void): () => void {
  const handler = (event: Event) => {
    render();
    (event as CustomEvent<SnapshotDetail>).detail.done(canvas);
  };
  canvas.addEventListener(SNAPSHOT_EVENT, handler);
  return () => canvas.removeEventListener(SNAPSHOT_EVENT, handler);
}

/** Longest side the frame is examined at (finding the model's outline needs no full resolution). */
const SCAN_SIZE = 512;

/**
 * Crops the frame to the model (its visible pixels), upper part first: head and upper body fill the
 * 4:3 picture also when the viewer shows a small full-length figure. `null` while (almost) nothing
 * is drawn.
 */
function toThumbnail(source: HTMLCanvasElement): string | null {
  if (source.width === 0 || source.height === 0) return null;
  const factor = Math.min(1, SCAN_SIZE / Math.max(source.width, source.height));
  const scan = document.createElement('canvas');
  scan.width = Math.max(1, Math.round(source.width * factor));
  scan.height = Math.max(1, Math.round(source.height * factor));
  const scanCtx = scan.getContext('2d', { willReadFrequently: true });
  if (!scanCtx) return null;
  scanCtx.drawImage(source, 0, 0, scan.width, scan.height);
  const alpha = scanCtx.getImageData(0, 0, scan.width, scan.height).data;
  let [left, top, right, bottom, visible] = [scan.width, scan.height, -1, -1, 0];
  for (let y = 0; y < scan.height; y += 1) {
    for (let x = 0; x < scan.width; x += 1) {
      if (alpha[(y * scan.width + x) * 4 + 3]! <= 16) continue;
      visible += 1;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (visible / (scan.width * scan.height) < MIN_COVERAGE) return null;
  const boxWidth = right - left + 1;
  const boxHeight = bottom - top + 1;
  // Wide enough for the whole figure's width, at least half its height (a slim figure shows head
  // and shoulders); 4:3 from just above the top.
  const width = Math.max(boxWidth * 1.1, boxHeight * 0.5);
  const height = (width * THUMBNAIL_HEIGHT) / THUMBNAIL_WIDTH;
  const x = left + boxWidth / 2 - width / 2;
  const y = top - height * 0.04;
  const out = document.createElement('canvas');
  out.width = THUMBNAIL_WIDTH;
  out.height = THUMBNAIL_HEIGHT;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  // Cut from the full-size frame for a sharp picture.
  ctx.drawImage(source, x / factor, y / factor, width / factor, height / factor, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
  // WebP where the engine can write it, else PNG (both accepted by the backend).
  return out.toDataURL('image/webp', 0.85);
}

/** A picture of the avatar viewer inside `container`, or `null` if there is none (yet). */
export function takeSnapshot(container: HTMLElement): string | null {
  const canvases = [...container.querySelectorAll('canvas')];
  const canvas = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!canvas) return null;
  let picture: string | null = null;
  const detail: SnapshotDetail = { done: (source) => (picture = toThumbnail(source)) };
  canvas.dispatchEvent(new CustomEvent(SNAPSHOT_EVENT, { detail }));
  return picture;
}
