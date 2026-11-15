/**
 * Runs one user script (C9) in QuickJS compiled to WebAssembly: a fresh runtime per call, no
 * host functions at all (no network, no files, no app, no `console`), limits on memory, stack and
 * time. The script defines `transform(text, info)` and returns the new text.
 *
 * Pure and environment-free, so it runs in the sandbox worker (`worker.ts`) and in unit tests.
 */
import { shouldInterruptAfterDeadline, type QuickJSWASMModule } from 'quickjs-emscripten-core';

/** What the script learns about the text (nothing about characters, memories or settings). */
export interface ScriptInfo {
  /** `user` (your message) or `assistant` (the figure's reply). */
  role: 'user' | 'assistant';
  /** `save`: the stored text; `prompt`: only what the model reads. */
  stage: 'save' | 'prompt';
}

/** `broken`: the WebAssembly module aborted (e.g. after running out of memory); load a new one. */
export type ScriptResult = { ok: true; text: string } | { ok: false; error: string; broken?: boolean };

export const SCRIPT_LIMITS = {
  /** Longest script (characters). */
  codeChars: 20_000,
  /** Longest text handed in or taken back (characters). */
  textChars: 200_000,
  memoryBytes: 32 * 1024 * 1024,
  stackBytes: 512 * 1024,
  /** Run time of one call, script setup included. */
  timeoutMs: 1000,
} as const;

/** Applies `code` to `text`; any failure leaves the text to the caller (it keeps the original). */
export function runScript(quickjs: QuickJSWASMModule, code: string, text: string, info: ScriptInfo, timeoutMs: number = SCRIPT_LIMITS.timeoutMs): ScriptResult {
  try {
    return run(quickjs, code, text, info, timeoutMs);
  } catch (e) {
    // The module itself aborted (WebAssembly trap): nothing of it can be trusted any more.
    return { ok: false, error: e instanceof Error ? e.message : String(e), broken: true };
  }
}

function run(quickjs: QuickJSWASMModule, code: string, text: string, info: ScriptInfo, timeoutMs: number): ScriptResult {
  if (code.length > SCRIPT_LIMITS.codeChars) return { ok: false, error: `script longer than ${SCRIPT_LIMITS.codeChars} characters` };
  if (text.length > SCRIPT_LIMITS.textChars) return { ok: false, error: 'text too long for scripts' };
  const runtime = quickjs.newRuntime();
  runtime.setMemoryLimit(SCRIPT_LIMITS.memoryBytes);
  runtime.setMaxStackSize(SCRIPT_LIMITS.stackBytes);
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + timeoutMs));
  const vm = runtime.newContext();
  try {
    const loaded = vm.evalCode(code, 'script.js');
    if (loaded.error) {
      const error = vm.dump(loaded.error);
      loaded.error.dispose();
      return { ok: false, error: describe(error) };
    }
    loaded.value.dispose();
    const transform = vm.getProp(vm.global, 'transform');
    try {
      if (vm.typeof(transform) !== 'function') return { ok: false, error: 'the script defines no function transform(text, info)' };
      const textHandle = vm.newString(text);
      const infoHandle = vm.newObject();
      vm.setProp(infoHandle, 'role', vm.newString(info.role));
      vm.setProp(infoHandle, 'stage', vm.newString(info.stage));
      const called = vm.callFunction(transform, vm.undefined, textHandle, infoHandle);
      textHandle.dispose();
      infoHandle.dispose();
      if (called.error) {
        const error = vm.dump(called.error);
        called.error.dispose();
        return { ok: false, error: describe(error) };
      }
      const kind = vm.typeof(called.value);
      const out = kind === 'string' ? vm.getString(called.value) : null;
      called.value.dispose();
      if (out === null) return { ok: false, error: `transform returned ${kind}, not a string` };
      if (out.length > SCRIPT_LIMITS.textChars) return { ok: false, error: 'result too long' };
      return { ok: true, text: out };
    } finally {
      transform.dispose();
    }
  } catch (e) {
    // Out of memory and similar end up here as host exceptions.
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    try {
      vm.dispose();
      runtime.dispose();
    } catch (e) {
      // After running out of memory QuickJS may abort while freeing; the caller drops the module.
      // eslint-disable-next-line no-unsafe-finally
      return { ok: false, error: `script stopped: ${e instanceof Error ? e.message : String(e)}`, broken: true };
    }
  }
}

function describe(error: unknown): string {
  // QuickJS's interrupt handler: the deadline passed (an endless loop or a very slow pattern).
  if (error && typeof error === 'object' && (error as { message?: unknown }).message === 'interrupted') {
    return `took longer than ${SCRIPT_LIMITS.timeoutMs} ms (endless loop?)`;
  }
  if (error && typeof error === 'object') {
    const { name, message } = error as { name?: unknown; message?: unknown };
    if (typeof message === 'string') return typeof name === 'string' && name ? `${name}: ${message}` : message;
  }
  return String(error);
}
