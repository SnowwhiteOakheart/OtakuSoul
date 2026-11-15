/// <reference lib="webworker" />
/**
 * The sandbox worker: loads QuickJS (WebAssembly) once and runs scripts with `runScript`. A
 * module that aborted (out of memory) is dropped and loaded anew for the next call. Endless
 * code is stopped inside QuickJS; should that ever fail, the page terminates this worker.
 */
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import { runScript, type ScriptInfo, type ScriptResult } from './runner';

export interface SandboxRequest {
  id: number;
  code: string;
  text: string;
  info: ScriptInfo;
}

export type SandboxResponse = ScriptResult & { id: number };

let quickjs: Promise<QuickJSWASMModule> | null = null;

self.onmessage = async (event: MessageEvent<SandboxRequest>) => {
  const { id, code, text, info } = event.data;
  let result: ScriptResult;
  try {
    quickjs ??= newQuickJSWASMModuleFromVariant(variant);
    result = runScript(await quickjs, code, text, info);
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : String(e), broken: true };
  }
  if (!result.ok && result.broken) quickjs = null;
  (self as DedicatedWorkerGlobalScope).postMessage({ ...result, id } satisfies SandboxResponse);
};
