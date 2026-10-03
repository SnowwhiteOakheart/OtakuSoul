// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useGridCols } from '../hooks/useGridCols';

beforeEach(() => {
  // Clear any previous mocks
  vi.clearAllMocks();
});

describe('useGridCols', () => {
  it('returns default columns initially', () => {
    const { result } = renderHook(() => useGridCols({ 640: 3, 1024: 5 }, 2));
    
    expect(result.current.cols).toBe(2);
    expect(result.current.ref.current).toBe(null);
  });
});
