// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyColorMode, normalizeColorMode, resolveColorMode, syncColorMode } from '../services/theme';

afterEach(() => {
  document.documentElement.removeAttribute('data-color-mode');
  document.documentElement.removeAttribute('data-color-mode-preference');
  vi.restoreAllMocks();
});

describe('colour mode', () => {
  it('resolves explicit and system preferences', () => {
    expect(normalizeColorMode('broken')).toBe('system');
    expect(resolveColorMode('light', false)).toBe('light');
    expect(resolveColorMode('dark', true)).toBe('dark');
    expect(resolveColorMode('system', true)).toBe('light');
    expect(resolveColorMode('system', false)).toBe('dark');
  });

  it('writes the resolved and requested modes to the document', () => {
    applyColorMode('light');
    expect(document.documentElement.dataset.colorMode).toBe('light');
    expect(document.documentElement.dataset.colorModePreference).toBe('light');
  });

  it('tracks operating-system changes in system mode', () => {
    let matches = false;
    let changeHandler: (() => void) | undefined;
    const mediaQuery = {
      get matches() {
        return matches;
      },
      media: '(prefers-color-scheme: light)',
      onchange: null,
      addEventListener: vi.fn((_event: string, handler: () => void) => {
        changeHandler = handler;
      }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as MediaQueryList;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue(mediaQuery),
    });

    syncColorMode('system');
    expect(document.documentElement.dataset.colorMode).toBe('dark');

    matches = true;
    changeHandler?.();
    expect(document.documentElement.dataset.colorMode).toBe('light');
  });
});
