import { useEffect, useRef } from 'react';
import { useAppStore, type AppTab } from '../store/useAppStore';

const TABS: readonly AppTab[] = ['chat', 'characters', 'lorebooks', 'stage', 'companion', 'settings', 'hub', 'integrations'];
const isAppTab = (value: unknown): value is AppTab => TABS.includes(value as AppTab);

/**
 * Makes "back" and "forward" move between the main views: every tab change becomes a history
 * entry, so the browser back/forward actions, mouse buttons 4/5 and Alt+←/→ return to the
 * previous view. Uses the History API only, the URL stays the same.
 */
export function useTabHistory(enabled = true) {
  const activeTab = useAppStore((state) => state.activeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const restoring = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const onPopState = (event: PopStateEvent) => {
      const tab: unknown = (event.state as { tab?: unknown } | null)?.tab;
      if (!isAppTab(tab)) return;
      restoring.current = true;
      setActiveTab(tab);
    };
    // WebKitGTK does not map the side mouse buttons to navigation on its own.
    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 3) window.history.back();
      if (event.button === 4) window.history.forward();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === 'ArrowLeft') window.history.back();
      else if (event.key === 'ArrowRight') window.history.forward();
      else return;
      event.preventDefault();
    };
    window.addEventListener('popstate', onPopState);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, setActiveTab]);

  useEffect(() => {
    if (!enabled) return;
    const current: unknown = (window.history.state as { tab?: unknown } | null)?.tab;
    if (restoring.current) {
      // This change came from back/forward, which already moved through the history.
      restoring.current = false;
    } else if (!isAppTab(current)) {
      window.history.replaceState({ tab: activeTab }, '');
    } else if (current !== activeTab) {
      window.history.pushState({ tab: activeTab }, '');
    }
  }, [enabled, activeTab]);
}
