import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

afterEach(async () => {
  if (typeof document === 'undefined') return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});

// Mock react-virtual for unit tests since jsdom has no layout engine
import { vi } from 'vitest';
vi.mock('@tanstack/react-virtual', () => ({
  // oxlint-disable-next-line typescript/no-explicit-any
  useVirtualizer: (config: any) => ({
    getVirtualItems: () => Array.from({ length: config.count }, (_, i) => ({ index: i, start: i * 100 })),
    getTotalSize: () => config.count * 100,
    measureElement: () => {},
  }),
}));

// Mock ResizeObserver
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof window !== 'undefined') window.ResizeObserver = ResizeObserver;
