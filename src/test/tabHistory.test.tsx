// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { useAppStore } from '../store/useAppStore';
import { useTabHistory } from '../hooks/useTabHistory';

const Harness = () => {
  useTabHistory();
  return null;
};

/** jsdom fires popstate asynchronously after history.back()/forward(). */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

beforeEach(() => {
  window.history.replaceState(null, '');
  useAppStore.setState({ activeTab: 'chat' });
});

describe('useTabHistory', () => {
  it('goes back and forward through the visited views', async () => {
    render(<Harness />);
    act(() => useAppStore.getState().setActiveTab('settings'));
    act(() => useAppStore.getState().setActiveTab('hub'));

    window.history.back();
    await settle();
    expect(useAppStore.getState().activeTab).toBe('settings');

    window.history.back();
    await settle();
    expect(useAppStore.getState().activeTab).toBe('chat');

    window.history.forward();
    await settle();
    expect(useAppStore.getState().activeTab).toBe('settings');
  });

  it('supports Alt+Left and the side mouse button', async () => {
    render(<Harness />);
    act(() => useAppStore.getState().setActiveTab('stage'));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true }));
    });
    await settle();
    expect(useAppStore.getState().activeTab).toBe('chat');

    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { button: 4 }));
    });
    await settle();
    expect(useAppStore.getState().activeTab).toBe('stage');
  });
});
