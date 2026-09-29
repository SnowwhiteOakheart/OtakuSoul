import { translate, type TranslationKey } from '../i18n';

interface CodedError {
  code: string;
  params?: Record<string, string>;
}

/** Backend errors arrive as `{"code":"backend.…","params":{…}}` (see `modules/error.rs`). */
const parseCodedError = (text: string): CodedError | null => {
  if (!text.startsWith('{"code":')) return null;
  try {
    const parsed = JSON.parse(text) as CodedError;
    return typeof parsed.code === 'string' ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Readable, translated message for anything thrown by Tauri commands, fetch or JS code.
 * Coded backend errors are translated; plain strings are shown as they are.
 */
export const errorMessage = (error: unknown): string => {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
  const coded = parseCodedError(text);
  if (!coded) return text;
  const message = translate(coded.code as TranslationKey, coded.params);
  // Unknown code (older frontend than backend): show the code and its details instead of nothing.
  return message === coded.code
    ? [coded.code, ...Object.values(coded.params ?? {})].join(' – ')
    : message;
};

/** Same translation for coded success messages from the backend (e.g. a backup restore summary). */
export const backendMessage = errorMessage;
