// Hides what gives the app away as a web page: the webview's own context menu
// (Back, Reload, Print, Inspect …) and, in release builds, the browser shortcuts
// for reloading, printing, finding, viewing source and opening the inspector.
// The inspector itself only exists in debug builds (no `devtools` feature in Cargo.toml).

/** Text fields keep their native menu: cut, copy, paste and spell check. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const field = target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])');
  if (!field) return false;
  if (field instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'].includes(field.type);
  }
  return !(field instanceof HTMLTextAreaElement && field.readOnly);
}

/** Browser shortcuts that would reload the app, open browser dialogs or the inspector. */
function isBrowserShortcut(e: KeyboardEvent): boolean {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const ctrl = e.ctrlKey || e.metaKey;
  if (key === 'F5' || key === 'F7' || key === 'F12' || key === 'F3') return true;
  if (key === 'BrowserBack' || key === 'BrowserForward' || key === 'BrowserRefresh') return true;
  if (e.altKey && !ctrl && (key === 'ArrowLeft' || key === 'ArrowRight')) return true;
  if (!ctrl) return false;
  if (e.shiftKey && ['i', 'j', 'c'].includes(key)) return true;
  return ['r', 'p', 'u', 's', 'f', 'g', 'h', 'j'].includes(key) && !e.altKey;
}

export function installBrowserChromeGuards(): void {
  // Bubble phase on window: React's own onContextMenu handlers (desktop pet menu) run first.
  window.addEventListener('contextmenu', (e) => {
    if (!isEditable(e.target)) e.preventDefault();
  });
  // During development, reload and the inspector stay available.
  if (import.meta.env.DEV) return;
  window.addEventListener(
    'keydown',
    (e) => {
      // Only the browser's default action is dropped; the app's own key handlers still run.
      if (isBrowserShortcut(e)) e.preventDefault();
    },
    true,
  );
}
