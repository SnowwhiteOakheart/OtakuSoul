import { waitWithAbort } from './cancellation';

/** File content as plain base64 (no `data:` prefix), for sending it to the backend. */
export async function fileToBase64(file: Blob, signal?: AbortSignal): Promise<string> {
  const bytes = new Uint8Array(await waitWithAbort(() => file.arrayBuffer(), signal));
  signal?.throwIfAborted();
  let binary = '';
  // Chunks keep String.fromCharCode below the argument limit for large files.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
