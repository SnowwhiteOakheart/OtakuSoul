import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, type LucideIcon } from 'lucide-react';

export interface DropdownMenuItem {
  label: string;
  icon?: LucideIcon;
  /** Custom leading visual (e.g. an avatar) instead of an icon. */
  leading?: React.ReactNode;
  /** Secondary line under the label. */
  description?: string;
  onSelect: () => void;
  hint?: string;
  /** Set on every item to make the menu a single-choice list (menuitemradio). */
  checked?: boolean;
}

interface DropdownMenuProps {
  /** Content of the trigger button (icon and/or text). */
  trigger: React.ReactNode;
  triggerLabel: string;
  triggerClassName?: string;
  items: DropdownMenuItem[];
  align?: 'left' | 'right';
  /** Optional heading shown above the items. */
  heading?: string;
  menuClassName?: string;
  /** Open above the trigger, e.g. for menus near the bottom of a card. */
  placement?: 'bottom' | 'top';
}

/** Small accessible menu: arrow keys move, Escape/outside click close, focus returns to the trigger. */
export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  trigger,
  triggerLabel,
  triggerClassName,
  items,
  align = 'right',
  heading,
  menuClassName = '',
  placement = 'bottom',
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const itemsRef = useRef(items);
  const menuId = useId();

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return;
    menu.style.left = '';
    menu.style.right = '';
    menu.style.top = '';
    menu.style.bottom = '';
    menu.style.marginTop = '';
    menu.style.marginBottom = '';

    // Clip against the viewport and any overflow-clipping ancestor so wrapped toolbars don't hide menus.
    let minLeft = 4;
    let maxRight = window.innerWidth - 4;
    let minTop = 4;
    let maxBottom = window.innerHeight - 4;
    for (let ancestor = menu.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      const style = window.getComputedStyle(ancestor);
      const clipsX = ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX);
      const clipsY = ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY);
      if (!clipsX && !clipsY) continue;
      const aRect = ancestor.getBoundingClientRect();
      if (clipsX) {
        minLeft = Math.max(minLeft, aRect.left + 4);
        maxRight = Math.min(maxRight, aRect.right - 4);
      }
      if (clipsY) {
        minTop = Math.max(minTop, aRect.top + 4);
        maxBottom = Math.min(maxBottom, aRect.bottom - 4);
      }
    }

    let rect = menu.getBoundingClientRect();
    const overflowsX = (r: DOMRect) => Math.max(0, minLeft - r.left) + Math.max(0, r.right - maxRight);
    if (overflowsX(rect) > 0) {
      if (align === 'right') {
        menu.style.right = 'auto';
        menu.style.left = '0';
      } else {
        menu.style.left = 'auto';
        menu.style.right = '0';
      }
      const flipped = menu.getBoundingClientRect();
      if (overflowsX(flipped) > overflowsX(rect)) {
        menu.style.left = '';
        menu.style.right = '';
      } else {
        rect = flipped;
      }
      if (overflowsX(rect) > 0 && rootRef.current) {
        const parentRect = rootRef.current.getBoundingClientRect();
        const clampedLeft = Math.max(minLeft, Math.min(rect.left, maxRight - rect.width));
        menu.style.right = 'auto';
        menu.style.left = `${clampedLeft - parentRect.left}px`;
      }
    }

    rect = menu.getBoundingClientRect();
    const overflowsY = (r: DOMRect) => Math.max(0, minTop - r.top) + Math.max(0, r.bottom - maxBottom);
    if (overflowsY(rect) > 0) {
      if (placement === 'bottom') {
        menu.style.top = 'auto';
        menu.style.bottom = '100%';
        menu.style.marginTop = '0';
        menu.style.marginBottom = '0.375rem';
      } else {
        menu.style.bottom = 'auto';
        menu.style.top = '100%';
        menu.style.marginBottom = '0';
        menu.style.marginTop = '0.375rem';
      }
      const flipped = menu.getBoundingClientRect();
      if (overflowsY(flipped) >= overflowsY(rect)) {
        menu.style.top = '';
        menu.style.bottom = '';
        menu.style.marginTop = '';
        menu.style.marginBottom = '';
      }
    }
  }, [open, align, placement]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const checkedIndex = itemsRef.current.findIndex((item) => item.checked);
    itemRefs.current[Math.max(checkedIndex, 0)]?.focus();
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const handleMenuKeyDown = (event: React.KeyboardEvent) => {
    const focusable = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const index = focusable.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusable[(index + 1) % focusable.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusable[(index - 1 + focusable.length) % focusable.length]?.focus();
    } else if (event.key === 'Tab') {
      close(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        title={triggerLabel}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          tabIndex={-1}
          onKeyDown={handleMenuKeyDown}
          onClick={(event) => event.stopPropagation()}
          aria-label={heading ?? triggerLabel}
          className={`absolute ${placement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} z-50 min-w-56 rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-2xl ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${menuClassName}`}
        >
          {heading && (
            <div className="px-3 pt-1.5 pb-1 mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
              {heading}
            </div>
          )}
          {items.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                type="button"
                role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={item.checked}
                title={item.hint}
                onClick={() => {
                  close(true);
                  item.onSelect();
                }}
                className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-300 outline-hidden hover:bg-slate-800 hover:text-slate-100 focus-visible:bg-slate-800 focus-visible:text-slate-100"
              >
                {item.leading ?? (Icon && <Icon className="w-4 h-4 shrink-0 text-slate-400" />)}
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{item.label}</span>
                  {item.description && <span className="block truncate text-xs text-slate-400">{item.description}</span>}
                </span>
                {item.checked && <Check className="w-3.5 h-3.5 shrink-0 text-accent-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
