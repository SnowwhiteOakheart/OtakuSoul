import { beforeAll, describe, expect, it } from 'vitest';
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import { runScript, type ScriptInfo } from '../services/scriptSandbox/runner';

const reply: ScriptInfo = { role: 'assistant', stage: 'save' };
let quickjs: QuickJSWASMModule;

beforeAll(async () => {
  quickjs = await newQuickJSWASMModuleFromVariant(variant);
});

const run = (code: string, text = 'Hallo Welt', timeoutMs = 300) => runScript(quickjs, code, text, reply, timeoutMs);

describe('script sandbox', () => {
  it('applies transform(text, info) and tells role and stage', () => {
    expect(run('function transform(text, info) { return text.toUpperCase() + " (" + info.role + "/" + info.stage + ")"; }')).toEqual({
      ok: true,
      text: 'HALLO WELT (assistant/save)',
    });
  });

  it('reports errors instead of changing the text', () => {
    expect(run('function transform() { throw new Error("kaputt"); }')).toEqual({ ok: false, error: 'Error: kaputt' });
    expect(run('function transform( {')).toMatchObject({ ok: false });
    expect(run('const x = 1;')).toMatchObject({ ok: false, error: expect.stringContaining('transform') });
    expect(run('function transform() { return 42; }')).toMatchObject({ ok: false, error: expect.stringContaining('number') });
  });

  it('stops endless loops and catastrophic regular expressions', () => {
    const started = Date.now();
    expect(run('function transform(t) { while (true) {} }')).toMatchObject({ ok: false });
    expect(run('function transform(t) { return /^(a+)+$/.test("a".repeat(40) + "b") ? "x" : "y"; }')).toMatchObject({ ok: false });
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('stops scripts that eat memory or stack', async () => {
    expect(run('function f() { return f() + 1; } function transform(t) { return String(f()); }')).toMatchObject({ ok: false });
    // Running out of memory may break the whole module: the result says so, the worker loads a new one.
    const own = await newQuickJSWASMModuleFromVariant(variant);
    const eaten = runScript(own, 'function transform(t) { const a = []; for (;;) a.push("x".repeat(1e6) + a.length); }', 'x', reply, 2000);
    expect(eaten.ok).toBe(false);
  }, 20_000);

  it('has no way out: no network, modules, host objects or messages', () => {
    const probe = `function transform() {
      return [typeof fetch, typeof XMLHttpRequest, typeof require, typeof process, typeof postMessage,
        typeof globalThis.__TAURI_INTERNALS__, typeof window, typeof self, typeof WebSocket, typeof importScripts].join(",");
    }`;
    expect(run(probe)).toEqual({ ok: true, text: Array(10).fill('undefined').join(',') });
    expect(run('function transform() { import("fs"); return "x"; }')).toMatchObject({ ok: true });
    const dynamic = run('let out = "nichts"; import("https://example.org/x.js").then(() => { out = "geladen"; }, () => { out = "abgelehnt"; }); function transform() { return out; }');
    expect(dynamic).toEqual({ ok: true, text: 'nichts' });
  });

  it('starts every call fresh: nothing survives between messages', () => {
    expect(run('globalThis.count = (globalThis.count || 0) + 1; function transform() { return String(globalThis.count); }')).toEqual({ ok: true, text: '1' });
    expect(run('globalThis.count = (globalThis.count || 0) + 1; function transform() { return String(globalThis.count); }')).toEqual({ ok: true, text: '1' });
  });
});
