import { invoke } from '@tauri-apps/api/core';

export type ForwardLevel = 'warn' | 'error';

/** At most this many entries per minute reach the backend log, so an error loop cannot flood it. */
const MAX_PER_MINUTE = 60;
const MAX_LENGTH = 4000;

/** Turns console arguments into one log line; errors keep their stack. */
export const formatLogArgs = (args: unknown[]): string =>
  args
    .map((arg) => {
      if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`;
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ')
    .slice(0, MAX_LENGTH);

/**
 * Returns a function that sends log entries through `send`, rate-limited per minute. Entries
 * produced while sending (e.g. a failing send that logs again) are dropped instead of looping.
 */
export const createForwarder = (send: (level: ForwardLevel, message: string) => void, now = () => Date.now()) => {
  let windowStart = now();
  let sentInWindow = 0;
  let sending = false;

  return (level: ForwardLevel, args: unknown[]) => {
    if (sending) return;
    if (now() - windowStart >= 60_000) {
      windowStart = now();
      sentInWindow = 0;
    }
    if (sentInWindow >= MAX_PER_MINUTE) return;
    sentInWindow++;
    sending = true;
    try {
      send(level, formatLogArgs(args));
    } finally {
      sending = false;
    }
  };
};

/**
 * Mirrors console warnings/errors and uncaught errors into the app log (log viewer and
 * otakusoul.log). Does nothing outside Tauri, e.g. in the browser preview or tests.
 */
export function installFrontendLogForwarding() {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;

  const forward = createForwarder((level, message) => {
    // Failures are ignored on purpose: logging them would recurse.
    invoke('log_frontend', { level, message }).catch(() => {});
  });

  for (const level of ['warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      forward(level, args);
    };
  }

  window.addEventListener('error', (event) => {
    forward('error', [event.error ?? event.message, `(${event.filename}:${event.lineno})`]);
  });
  window.addEventListener('unhandledrejection', (event) => {
    forward('error', ['Unhandled promise rejection:', event.reason]);
  });
}
