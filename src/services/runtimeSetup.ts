import { api } from './api';
import { errorCode } from '../utils/errors';
import type { RuntimeKind } from '../types';

/** Installs the recommended build of a runtime unless one is installed. */
export async function ensureRuntime(kind: RuntimeKind): Promise<void> {
  if (await api.getRuntime(kind).catch(() => null)) return;
  const variants = await api.listRuntimeVariants(kind);
  const variant = variants.find((v) => v.recommended) ?? variants[0];
  if (!variant) throw new Error(`no ${kind} runtime for this system`);
  await api.installRuntime(kind, variant.backend);
}

/**
 * The chat runtime a failed server start is missing, if that is why it failed: a model copied
 * into the folder (or a starter whose runtime install was skipped) has no llama-server yet.
 */
export function missingChatRuntime(error: unknown): Extract<RuntimeKind, 'llama' | 'prism'> | null {
  switch (errorCode(error)?.code) {
    case 'backend.server.binaryMissing':
      return 'llama';
    case 'backend.server.prismRequired':
      return 'prism';
    default:
      return null;
  }
}
