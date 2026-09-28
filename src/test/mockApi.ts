import { vi } from 'vitest';

/**
 * Stand-in for `services/api`: every method is a lazily created `vi.fn()` resolving to
 * `undefined`, so store actions can run without Tauri. Use with
 * `vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);`
 * and override single calls via `vi.mocked(api.someCall).mockResolvedValue(...)`.
 */
const fns = new Map<string | symbol, ReturnType<typeof vi.fn>>();

export const apiModule = {
  api: new Proxy(
    {},
    {
      get: (_target, key) => {
        if (!fns.has(key)) fns.set(key, vi.fn().mockResolvedValue(undefined));
        return fns.get(key);
      },
    }
  ),
};

export const resetApiMocks = () => fns.forEach((fn) => fn.mockReset().mockResolvedValue(undefined));
