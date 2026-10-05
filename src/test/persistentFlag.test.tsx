// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePersistentFlag } from '../hooks/usePersistentFlag';

describe('usePersistentFlag', () => {
  beforeEach(() => localStorage.clear());

  it('starts with the default and remembers changes for the next mount', () => {
    const first = renderHook(() => usePersistentFlag('test.flag', true));
    expect(first.result.current[0]).toBe(true);
    act(() => first.result.current[1](false));
    expect(first.result.current[0]).toBe(false);
    first.unmount();

    const second = renderHook(() => usePersistentFlag('test.flag', true));
    expect(second.result.current[0]).toBe(false);
  });
});
