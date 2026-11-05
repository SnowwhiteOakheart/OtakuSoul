import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { TEXT_MENU_EVENT, type TextMenuRequest } from '../../services/browserChrome';

/** Right-click menu for selected text (chat messages, logs …), in place of the webview's own. */
export function TextContextMenu() {
  const { t } = useTranslation();
  const [request, setRequest] = useState<TextMenuRequest | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const open = (event: Event) => setRequest((event as CustomEvent<TextMenuRequest>).detail);
    window.addEventListener(TEXT_MENU_EVENT, open);
    return () => window.removeEventListener(TEXT_MENU_EVENT, open);
  }, []);

  useEffect(() => {
    if (!request) return;
    const close = () => setRequest(null);
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [request]);

  // Keep the menu inside the window, flipping it left/up near the edges.
  useLayoutEffect(() => {
    if (!request || !menuRef.current) {
      setPosition(null);
      return;
    }
    const { width, height } = menuRef.current.getBoundingClientRect();
    const left = request.x + width > window.innerWidth ? Math.max(4, request.x - width) : request.x;
    const top = request.y + height > window.innerHeight ? Math.max(4, request.y - height) : request.y;
    setPosition({ left, top });
    copyRef.current?.focus({ preventScroll: true });
  }, [request]);

  if (!request) return null;

  const copy = () => {
    void navigator.clipboard.writeText(request.text);
    setRequest(null);
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      aria-label={t('common.copy')}
      onContextMenu={(event) => event.preventDefault()}
      style={{ left: position?.left ?? request.x, top: position?.top ?? request.y, visibility: position ? 'visible' : 'hidden' }}
      className="fixed z-[200] min-w-40 rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-2xl"
    >
      <button
        ref={copyRef}
        type="button"
        role="menuitem"
        // Keep the text selection while clicking the menu.
        onMouseDown={(event) => event.preventDefault()}
        onClick={copy}
        className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-300 outline-hidden hover:bg-slate-800 hover:text-slate-100 focus-visible:bg-slate-800 focus-visible:text-slate-100"
      >
        <Copy className="w-4 h-4 shrink-0 text-slate-400" />
        <span className="flex-1">{t('common.copy')}</span>
      </button>
    </div>
  );
}
