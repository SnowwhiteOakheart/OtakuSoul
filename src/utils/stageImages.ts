import type { SceneTurnMessage } from '../types';

/**
 * Hangs a Stage picture on the line it was made at (the last one when it started; searched from
 * the end, since a turn may have added lines meanwhile), so exports such as the webtoon show it
 * there. Without that line (the log was rewound) the log stays as it is.
 */
export function attachStageImage(log: SceneTurnMessage[], anchorId: string | undefined, image: string): SceneTurnMessage[] {
  if (!anchorId) return log;
  let index = log.length - 1;
  while (index >= 0 && log[index]!.id !== anchorId) index--;
  if (index < 0) return log;
  const next = [...log];
  const line = next[index]!;
  next[index] = { ...line, images: [...(line.images ?? []), image] };
  return next;
}
