/**
 * User scripts (C9) for the chat: JavaScript rules run in a worker with QuickJS/WebAssembly
 * (`worker.ts`, `runner.ts`). The worker starts only when a script rule runs. Calls go one at a
 * time; if one does not come back in time, the worker is terminated and the next call starts a
 * new one. A failed script never changes the text: the caller keeps the original.
 */
import { SCRIPT_LIMITS, type ScriptInfo, type ScriptResult } from './runner';
import type { SandboxRequest, SandboxResponse } from './worker';

export type { ScriptInfo, ScriptResult } from './runner';

/** Margin over the script's own limit for messaging; the first call also loads the module. */
const REPLY_MARGIN_MS = 1500;
const FIRST_LOAD_MS = 8000;

let worker: Worker | null = null;
let warm = false;
let nextId = 1;
const pending = new Map<number, { resolve: (result: ScriptResult) => void; timer: ReturnType<typeof setTimeout> }>();
/** Calls run one after another, so a slow one cannot pile up others behind the deadline. */
let queue: Promise<unknown> = Promise.resolve();

function stop(error: string) {
  worker?.terminate();
  worker = null;
  warm = false;
  for (const [id, call] of pending) {
    clearTimeout(call.timer);
    call.resolve({ ok: false, error });
    pending.delete(id);
  }
}

function start(): Worker {
  const created = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  created.onmessage = (event: MessageEvent<SandboxResponse>) => {
    const { id, ...result } = event.data;
    const call = pending.get(id);
    if (!call) return;
    pending.delete(id);
    clearTimeout(call.timer);
    warm = true;
    call.resolve(result as ScriptResult);
  };
  created.onerror = (event) => stop(event.message || 'script sandbox failed');
  return created;
}

function call(code: string, text: string, info: ScriptInfo): Promise<ScriptResult> {
  return new Promise((resolve) => {
    worker ??= start();
    const id = nextId++;
    const limit = SCRIPT_LIMITS.timeoutMs + REPLY_MARGIN_MS + (warm ? 0 : FIRST_LOAD_MS);
    const timer = setTimeout(() => stop('script took too long'), limit);
    pending.set(id, { resolve, timer });
    worker.postMessage({ id, code, text, info } satisfies SandboxRequest);
  });
}

/** Runs `code`'s `transform(text, info)` in the sandbox. */
export function runUserScript(code: string, text: string, info: ScriptInfo): Promise<ScriptResult> {
  const result = queue.then(() => call(code, text, info));
  queue = result.catch(() => undefined);
  return result;
}
