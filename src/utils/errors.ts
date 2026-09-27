/** Readable message for anything thrown by Tauri commands (strings), fetch or JS code. */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
