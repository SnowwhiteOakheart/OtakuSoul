/**
 * Scrolls an option into view once its (lazy) view has rendered and highlights it briefly,
 * so a jump from the command palette lands on the option itself, not just its page.
 * The first visit loads the settings view, so it waits up to `timeoutMs` for the element.
 */
export function revealSetting(id: string, timeoutMs = 5000) {
  const started = Date.now();
  const attempt = () => {
    const element = document.getElementById(id);
    if (!element) {
      if (Date.now() - started < timeoutMs) window.setTimeout(attempt, 50);
      return;
    }
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    element.classList.add('setting-highlight');
    window.setTimeout(() => element.classList.remove('setting-highlight'), 1800);
  };
  attempt();
}
